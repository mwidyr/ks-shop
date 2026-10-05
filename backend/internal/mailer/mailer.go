package mailer

import (
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"time"

	"ordermgmt/internal/config"
)

const dialTimeout = 10 * time.Second
const sessionTimeout = 20 * time.Second

// Send delivers a plain-text email. When cfg.SMTPHost is unset (no provider configured), it
// logs the message to stdout instead of sending - lets invite/reset flows be tested locally
// without real SMTP credentials; set SMTP_HOST etc. to send for real (e.g. Gmail's
// smtp.gmail.com:587 with an app password).
//
// The actual send runs in a background goroutine with a bounded timeout and always returns nil
// immediately - every caller (invite/reset-password/OTP) already discarded the old synchronous
// error anyway, but net/smtp.SendMail has NO timeout of its own: if the outbound SMTP port is
// blocked by the VPS's network/firewall (common on cloud providers as an anti-spam default), the
// underlying TCP dial can hang for minutes, which previously blocked the whole HTTP request
// (e.g. "Add Staff") until it hit the browser/proxy's own timeout with no server-side log at all.
// Running it in a goroutine with dialTimeout/sessionTimeout means a slow or blocked SMTP
// connection can never again stall an API response - the user row/token is already committed to
// the DB by the time this is called, so a failed send just means the email didn't go out, not
// that the action itself failed.
func Send(cfg config.Config, to, subject, body string) error {
	if cfg.SMTPHost == "" {
		log.Printf("[mailer] SMTP not configured, logging email instead:\nTo: %s\nSubject: %s\n%s\n", to, subject, body)
		return nil
	}

	go func() {
		addr := cfg.SMTPHost + ":" + cfg.SMTPPort
		if err := sendNow(cfg, addr, to, subject, body); err != nil {
			log.Printf("[mailer] failed to send to %s via %s: %v", to, addr, err)
		} else {
			log.Printf("[mailer] sent to %s via %s", to, addr)
		}
	}()
	return nil
}

func sendNow(cfg config.Config, addr, to, subject, body string) error {
	conn, err := net.DialTimeout("tcp", addr, dialTimeout)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	conn.SetDeadline(time.Now().Add(sessionTimeout))
	defer conn.Close()

	client, err := smtp.NewClient(conn, cfg.SMTPHost)
	if err != nil {
		return fmt.Errorf("handshake: %w", err)
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: cfg.SMTPHost}); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	}

	if ok, _ := client.Extension("AUTH"); ok {
		auth := smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("auth: %w", err)
		}
	}

	if err := client.Mail(cfg.SMTPFrom); err != nil {
		return fmt.Errorf("mail from: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("rcpt to: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("data: %w", err)
	}
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		cfg.SMTPFrom, to, subject, body)
	if _, err := w.Write([]byte(msg)); err != nil {
		return fmt.Errorf("write body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("close body: %w", err)
	}
	return client.Quit()
}
