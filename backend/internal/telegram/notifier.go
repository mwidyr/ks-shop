package telegram

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Jakarta has no DST, so the business day is a fixed +7 offset (same as handlers.businessTZ).
var businessTZ = time.FixedZone("WIB", 7*60*60)

const validOrder = `o.status NOT IN ('cancelled','return')`

// Notifier decides, from Ralulu Hub's own sales data, which celebration messages are due and
// sends them. It runs on a timer and can be nudged (Kick) the moment an order is created.
type Notifier struct {
	DB    *pgxpool.Pool
	Store *Store
	kick  chan struct{}

	mu     sync.Mutex
	logged map[string]struct{} // log-only mode: messages already printed, so a tick does not repeat them
}

func NewNotifier(db *pgxpool.Pool, store *Store) *Notifier {
	return &Notifier{DB: db, Store: store, kick: make(chan struct{}, 1), logged: map[string]struct{}{}}
}

// Kick asks for an immediate check (non-blocking; bursts collapse into one run).
func (n *Notifier) Kick() {
	if n == nil {
		return
	}
	select {
	case n.kick <- struct{}{}:
	default:
	}
}

// Run evaluates every interval and whenever kicked, until ctx ends.
func (n *Notifier) Run(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		case <-n.kick:
			time.Sleep(2 * time.Second) // let the order's transaction settle and merge bursts
		}
		c, cancel := context.WithTimeout(ctx, 2*time.Minute)
		if err := n.Evaluate(c); err != nil {
			log.Printf("telegram notifier: %v", err)
		}
		cancel()
	}
}

type hostDay struct {
	hostID     int
	hostName   string
	locationID int
	location   string
	chatID     string
	qty        int
}

// claim reserves a notification in the log (the unique indexes make it once-only); false means
// it was already announced. Callers release() it when the send fails so the next run retries.
func (n *Notifier) claim(ctx context.Context, typ, scope, date string, milestone int, session *int, qty int, prev *int) (int, bool) {
	var id int
	err := n.DB.QueryRow(ctx, `
		INSERT INTO telegram_notification_log (notification_type, scope, business_date, milestone, live_session_id, qty, previous_best)
		VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`, typ, scope, date, milestone, session, qty, prev).Scan(&id)
	return id, err == nil
}

func (n *Notifier) release(ctx context.Context, id int) {
	_, _ = n.DB.Exec(ctx, `DELETE FROM telegram_notification_log WHERE id=$1`, id)
}

func (n *Notifier) highest(ctx context.Context, typ, scope, date string) int {
	var m int
	_ = n.DB.QueryRow(ctx, `SELECT COALESCE(MAX(milestone),0) FROM telegram_notification_log WHERE notification_type=$1 AND scope=$2 AND business_date=$3`, typ, scope, date).Scan(&m)
	return m
}

// dispatch is the single exit for every automatic message. The text is always printed to the
// server log exactly as it goes out. With Send on it claims the notification (once-only) and
// posts it, releasing the claim on failure so the next run retries. With Send off nothing is
// sent and nothing is claimed; an in-memory key only stops the same line repeating every tick.
func (n *Notifier) dispatch(ctx context.Context, cfg Config, token, typ, scope, date string, milestone int, session *int, qty int, prev *int, chat, text string, repeat int, logKey string) {
	if !cfg.SendEnabled {
		n.mu.Lock()
		_, seen := n.logged[logKey]
		n.logged[logKey] = struct{}{}
		n.mu.Unlock()
		if !seen {
			log.Printf("telegram[LOG-ONLY] type=%s chat=%s repeat=%d\n%s", typ, chat, repeat, text)
		}
		return
	}
	id, ok := n.claim(ctx, typ, scope, date, milestone, session, qty, prev)
	if !ok {
		return
	}
	log.Printf("telegram[SEND] type=%s chat=%s repeat=%d\n%s", typ, chat, repeat, text)
	if err := SendRepeated(ctx, token, chat, text, repeat); err != nil {
		n.release(ctx, id)
		log.Printf("telegram %s %s %d: %v", typ, scope, milestone, err)
	}
}

// Evaluate runs all four notification types once.
func (n *Notifier) Evaluate(ctx context.Context) error {
	cfg := n.Store.LoadConfig(ctx)
	if !cfg.WorkerEnabled {
		return nil
	}
	token := n.Store.Token(ctx)
	if token == "" {
		return nil
	}
	if cfg.SendEnabled { // going live: forget log-only history, the day's highest milestone still goes out
		n.mu.Lock()
		n.logged = map[string]struct{}{}
		n.mu.Unlock()
	}
	now := time.Now().In(businessTZ)
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, businessTZ)
	date := dayStart.Format("2006-01-02")

	hosts, err := n.hostTotals(ctx, dayStart, dayStart.Add(24*time.Hour))
	if err != nil {
		return fmt.Errorf("host totals: %w", err)
	}
	if cfg.HostMilestone.Enabled {
		n.hostMilestones(ctx, token, cfg, hosts, date)
	}
	if cfg.GlobalHost.Enabled {
		n.globalHostMilestones(ctx, token, cfg, hosts, date)
	}
	if cfg.LocationMilestone.Enabled {
		n.locationMilestones(ctx, token, cfg, hosts, date)
	}
	if cfg.PersonalBest.Enabled {
		n.personalBests(ctx, token, cfg, date)
	}
	return nil
}

// hostTotals: every host's valid sales QTY for the business day, with its Location + group.
func (n *Notifier) hostTotals(ctx context.Context, from, to time.Time) ([]hostDay, error) {
	rows, err := n.DB.Query(ctx, `
		SELECT h.id, h.name, hl.id, hl.name, COALESCE(hl.telegram_chat_id,''), SUM(oi.qty)
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		JOIN hosts h ON h.id = oi.host_id
		JOIN host_locations hl ON hl.id = h.location_id
		WHERE `+validOrder+` AND o.created_at >= $1 AND o.created_at < $2
		GROUP BY h.id, h.name, hl.id, hl.name, hl.telegram_chat_id`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []hostDay
	for rows.Next() {
		var d hostDay
		if rows.Scan(&d.hostID, &d.hostName, &d.locationID, &d.location, &d.chatID, &d.qty) == nil {
			out = append(out, d)
		}
	}
	return out, nil
}

func (n *Notifier) hostMilestones(ctx context.Context, token string, cfg Config, hosts []hostDay, date string) {
	c := cfg.HostMilestone
	for _, h := range hosts {
		m := CurrentMilestone(h.qty, c.StartMilestone, c.Interval)
		if m == 0 || h.chatID == "" || m <= n.highest(ctx, TypeHostMilestone, strconv.Itoa(h.hostID), date) {
			continue
		}
		scope := strconv.Itoa(h.hostID)
		text := Render(c.Template, Vars(TypeHostMilestone, c, h.hostName, h.location, m, h.qty, 0, 0, date))
		n.dispatch(ctx, cfg, token, TypeHostMilestone, scope, date, m, nil, h.qty, nil, h.chatID, text, RepeatCount(m),
			fmt.Sprintf("%s|%s|%s|%d", TypeHostMilestone, scope, date, m))
	}
}

func (n *Notifier) globalHostMilestones(ctx context.Context, token string, cfg Config, hosts []hostDay, date string) {
	c := cfg.GlobalHost
	global := cfg.GlobalChatID
	if global == "" {
		return
	}
	for _, h := range hosts {
		m := CurrentMilestone(h.qty, c.StartMilestone, c.Interval)
		if m == 0 || m <= n.highest(ctx, TypeGlobalHostMilestone, strconv.Itoa(h.hostID), date) {
			continue
		}
		scope := strconv.Itoa(h.hostID)
		text := Render(c.Template, Vars(TypeGlobalHostMilestone, c, h.hostName, h.location, m, h.qty, 0, 0, date))
		n.dispatch(ctx, cfg, token, TypeGlobalHostMilestone, scope, date, m, nil, h.qty, nil, global, text, 1,
			fmt.Sprintf("%s|%s|%s|%d", TypeGlobalHostMilestone, scope, date, m))
	}
}

func (n *Notifier) locationMilestones(ctx context.Context, token string, cfg Config, hosts []hostDay, date string) {
	c := cfg.LocationMilestone
	global := cfg.GlobalChatID
	if global == "" {
		return
	}
	type loc struct {
		name string
		qty  int
	}
	byLoc := map[int]*loc{}
	for _, h := range hosts {
		if byLoc[h.locationID] == nil {
			byLoc[h.locationID] = &loc{name: h.location}
		}
		byLoc[h.locationID].qty += h.qty
	}
	for id, l := range byLoc {
		m := CurrentMilestone(l.qty, c.StartMilestone, c.Interval)
		scope := strconv.Itoa(id)
		if m == 0 || m <= n.highest(ctx, TypeLocationMilestone, scope, date) {
			continue
		}
		text := Render(c.Template, Vars(TypeLocationMilestone, c, "", l.name, m, l.qty, 0, 0, date))
		n.dispatch(ctx, cfg, token, TypeLocationMilestone, scope, date, m, nil, l.qty, nil, global, text, 1,
			fmt.Sprintf("%s|%s|%s|%d", TypeLocationMilestone, scope, date, m))
	}
}

// personalBests: for every host currently LIVE, the QTY sold during this session (orders created
// between the session start and now) against the best of the host's earlier sessions. One message
// per session at most; the record itself never resets.
func (n *Notifier) personalBests(ctx context.Context, token string, cfg Config, date string) {
	c := cfg.PersonalBest
	sessionQty := `SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
		WHERE oi.host_id = %s AND ` + validOrder + ` AND o.created_at >= %s AND o.created_at < %s`
	rows, err := n.DB.Query(ctx, `
		SELECT ls.id, h.name, hl.name, COALESCE(hl.telegram_chat_id,''),
		  (`+fmt.Sprintf(sessionQty, "h.id", "ls.started_at", "now() + interval '1 minute'")+`) AS cur,
		  COALESCE((SELECT MAX(q) FROM (
		      SELECT (`+fmt.Sprintf(sessionQty, "h.id", "p.started_at", "p.ended_at")+`) AS q
		      FROM live_sessions p
		      WHERE p.host_id = h.id AND p.id <> ls.id AND p.started_at IS NOT NULL AND p.ended_at IS NOT NULL
		        AND p.started_at < ls.started_at) x), 0) AS prev,
		  h.id
		FROM live_sessions ls
		JOIN hosts h ON h.id = ls.host_id
		JOIN host_locations hl ON hl.id = h.location_id
		WHERE ls.status = 'live' AND ls.started_at IS NOT NULL`)
	if err != nil {
		log.Printf("telegram personal best query: %v", err)
		return
	}
	type cand struct {
		session, hostID, cur, prev int
		host, loc, chat            string
	}
	var cands []cand
	for rows.Next() {
		var k cand
		if rows.Scan(&k.session, &k.host, &k.loc, &k.chat, &k.cur, &k.prev, &k.hostID) == nil {
			cands = append(cands, k)
		}
	}
	rows.Close()
	for _, k := range cands {
		if k.chat == "" || k.cur <= k.prev || k.cur < c.MinQty {
			continue
		}
		session := k.session
		prev := k.prev
		scope := strconv.Itoa(k.hostID)
		text := Render(c.Template, Vars(TypePersonalBest, c, k.host, k.loc, 0, k.cur, k.prev, k.cur, date))
		n.dispatch(ctx, cfg, token, TypePersonalBest, scope, date, k.cur, &session, k.cur, &prev, k.chat, text, 1,
			fmt.Sprintf("%s|%s|%s|%d", TypePersonalBest, scope, date, session))
	}
}
