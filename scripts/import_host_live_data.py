#!/usr/bin/env python3
"""Turns the client's Google Sheet tab "DataFromHost" (the old LIVE Data form answers) into an SQL file that
loads them into live_sessions, so the Performance Dashboard / Host Analytics can be checked against the sheet.

  python3 scripts/import_host_live_data.py sheet.xlsx --from 2026-10-25 > import_live_data.sql
  psql "$DATABASE_URL" -f import_live_data.sql

- Only rows with Approved = 1 and a timestamp on/after --from are used (the timestamp is read in --tz, the sheet's timezone).
- The sheet has no LIVE duration: every session gets --duration-min minutes, ending at the form timestamp
  (the dashboard weights ACU by duration, so equal durations = a plain average, like the sheet).
- The host is matched by name (case-insensitive); the location comes from the host. Unknown hosts are skipped and listed.
- Safe to run again: a row already imported (same host + label) is skipped. Runs in one transaction.
"""
import argparse, csv, datetime, io, re, sys, zipfile
from xml.etree import ElementTree as ET

M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def read_sheet(path, name):
    z = zipfile.ZipFile(path)
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rid = next(s.get(R + 'id') for s in wb.iter(M + 'sheet') if s.get('name') == name)
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    target = next(r.get('Target') for r in rels if r.get('Id') == rid)
    target = target.lstrip('/')
    if not target.startswith('xl/'):
        target = 'xl/' + target
    ss = [''.join(t.text or '' for t in si.iter(M + 't')) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(M + 'si')]
    rows = []
    for _, el in ET.iterparse(z.open(target)):
        if el.tag != M + 'row':
            continue
        row = []
        for c in el:
            v = c.find(M + 'v')
            if v is None:
                is_ = c.find(M + 'is')
                val = ''.join(t.text or '' for t in is_.iter(M + 't')) if is_ is not None else ''
            else:
                val = ss[int(v.text)] if c.get('t') == 's' else v.text
            col = 0
            for ch in re.match(r'[A-Z]+', c.get('r')).group():
                col = col * 26 + ord(ch) - 64
            while len(row) < col:
                row.append('')
            row[col - 1] = val
        rows.append(row)
        el.clear()
    return rows


def awt_seconds(v):  # "m:ss" (or "h:mm:ss")
    parts = [int(p) for p in str(v).strip().split(':') if p != '']
    s = 0
    for p in parts:
        s = s * 60 + p
    return s


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('xlsx')
    ap.add_argument('--from', dest='start', default='2026-10-25')
    ap.add_argument('--tz', default='Asia/Jakarta')
    ap.add_argument('--duration-min', type=int, default=60)
    ap.add_argument('--sheet', default='DataFromHost')
    a = ap.parse_args()

    rows = read_sheet(a.xlsx, a.sheet)
    head = next(i for i, r in enumerate(rows) if len(r) > 3 and r[1].strip() == '時間戳記')
    start = datetime.datetime.strptime(a.start, '%Y-%m-%d')
    out = []
    for r in rows[head + 1:]:
        r = r + [''] * (14 - len(r))
        if not r[1] or not r[2].strip() or r[13].strip() not in ('1', '1.0'):
            continue
        ts = datetime.datetime(1899, 12, 30) + datetime.timedelta(days=float(r[1]))
        ts = ts.replace(microsecond=0)
        if ts < start:
            continue
        f = lambda x: float(x or 0)
        # Views, UV, Active, AWT (m:ss), PCU, ACU, Follows, Chats, Shares, Likes
        num = [int(f(r[3])), int(f(r[4])), int(f(r[5])), awt_seconds(r[6] or '0:00'), int(f(r[7])), f(r[8]), int(f(r[9])), int(f(r[10])), int(f(r[11])), int(f(r[12]))]
        out.append((ts, r[2].strip(), num))

    w = sys.stdout.write
    w(f"-- {len(out)} LIVE data rows from '{a.sheet}' since {a.start} (sheet timezone {a.tz}, {a.duration_min} min per session)\n")
    w('BEGIN;\nCREATE TEMP TABLE imp (ts timestamp, host text, views int, uv int, active int, awt int, pcu int, acu numeric, follows int, chats int, shares int, likes int) ON COMMIT DROP;\n')
    w('INSERT INTO imp VALUES\n')
    w(',\n'.join(f"({q(ts.isoformat(' '))},{q(h)},{n[0]},{n[1]},{n[2]},{n[3]},{n[4]},{n[5]},{n[6]},{n[7]},{n[8]},{n[9]})" for ts, h, n in out) + ';\n')
    w(f"""
SELECT 'skipped (host not found): ' || host || ' x' || count(*) AS note FROM imp i
 WHERE NOT EXISTS (SELECT 1 FROM hosts h WHERE lower(h.name) = lower(i.host)) GROUP BY host;

WITH ins AS (
  INSERT INTO live_sessions (host_id, location_id, label, status, started_at, ended_at,
                             views, uv, active_viewers, awt_seconds, pcu, acu, follows, chats, shares, likes, live_data_recorded_at)
  SELECT h.id, h.location_id,
         'LIVE ' || h.name || ' - ' || to_char(i.ts, 'FMDD Mon YYYY HH24:MI') || ' (sheet import)',
         'ended',
         (i.ts AT TIME ZONE {q(a.tz)}) - interval '{a.duration_min} minutes', (i.ts AT TIME ZONE {q(a.tz)}),
         i.views, i.uv, i.active, i.awt, i.pcu, i.acu, i.follows, i.chats, i.shares, i.likes, now()
  FROM imp i JOIN hosts h ON lower(h.name) = lower(i.host)
  WHERE NOT EXISTS (SELECT 1 FROM live_sessions s WHERE s.host_id = h.id
                    AND s.label = 'LIVE ' || h.name || ' - ' || to_char(i.ts, 'FMDD Mon YYYY HH24:MI') || ' (sheet import)')
  RETURNING 1)
SELECT 'imported: ' || count(*) FROM ins;
COMMIT;
""")


main()
