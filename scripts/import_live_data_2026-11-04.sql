-- 25 LIVE data rows from 'DataFromHost' since 2026-11-04 until 2026-11-05 (sheet timezone Asia/Jakarta, 60 min per session)
BEGIN;
CREATE TEMP TABLE imp (ts timestamp, host text, views int, uv int, active int, awt int, pcu int, acu numeric, follows int, chats int, shares int, likes int) ON COMMIT DROP;
INSERT INTO imp VALUES
('2026-11-04 10:03:55','Sepia',320,305,5,13,6,1.0,7,20,0,503),
('2026-11-04 10:05:14','Rere',1700,1400,83,60,28,11.0,41,463,7,1300),
('2026-11-04 10:05:19','Sepia',579,524,12,21,7,2.0,4,79,3,71),
('2026-11-04 10:05:35','Assyifa',1000,918,22,22,10,4.0,21,200,1,870),
('2026-11-04 10:10:00','Irene',1900,1600,54,31,16,6.0,40,293,3,1000),
('2026-11-04 10:18:54','Melani',1400,1100,40,34,14,5.0,23,264,4,720),
('2026-11-04 13:09:48','Anggi',583,494,27,42,7,2.0,8,161,1,551),
('2026-11-04 13:10:29','Rani',507,458,10,24,7,2.0,3,60,0,424),
('2026-11-04 13:12:03','Rani',207,189,5,25,6,2.0,3,41,1,1000),
('2026-11-04 13:13:21','Alya',665,574,19,45,8,3.0,10,125,2,1300),
('2026-11-04 13:16:38','Luna',879,724,37,48,13,5.0,19,250,2,1500),
('2026-11-04 13:18:47','Dinda',1900,1600,41,27,16,7.0,36,139,14,1400),
('2026-11-04 16:05:29','Assyifa',549,466,12,22,8,1.0,7,80,1,672),
('2026-11-04 16:05:34','Rere',757,610,21,41,10,5.0,8,116,1,2000),
('2026-11-04 16:06:48','Sepia',462,412,9,29,10,2.0,11,53,0,213),
('2026-11-04 16:07:45','Irene',1000,866,23,26,12,3.0,11,131,1,645),
('2026-11-04 16:08:06','Sepia',253,219,5,21,5,2.0,0,38,1,2),
('2026-11-04 16:10:27','Melani',772,665,19,37,8,2.0,12,91,1,468),
('2026-11-04 19:03:25','Alya',779,689,16,32,9,2.0,14,96,0,1900),
('2026-11-04 19:05:24','Dinda',1100,899,14,21,11,3.0,21,66,4,520),
('2026-11-04 19:06:51','Anggi',529,441,14,30,9,2.0,3,105,3,431),
('2026-11-04 19:16:09','Luna',620,515,20,32,8,2.0,8,96,1,585),
('2026-11-04 19:19:20','Rani',227,213,1,20,5,2.0,4,9,0,1000),
('2026-11-04 19:20:25','Rani',239,219,5,25,4,1.0,1,16,0,576),
('2026-11-04 19:21:31','Rani',28,27,0,3,2,1.0,0,0,0,317);

SELECT 'skipped (host not found): ' || host || ' x' || count(*) AS note FROM imp i
 WHERE NOT EXISTS (SELECT 1 FROM hosts h WHERE lower(h.name) = lower(i.host)) GROUP BY host;

WITH ins AS (
  INSERT INTO live_sessions (host_id, location_id, label, status, started_at, ended_at,
                             views, uv, active_viewers, awt_seconds, pcu, acu, follows, chats, shares, likes, live_data_recorded_at)
  SELECT h.id, h.location_id,
         'LIVE ' || h.name || ' - ' || to_char(i.ts, 'FMDD Mon YYYY HH24:MI') || ' (sheet import)',
         'ended',
         (i.ts AT TIME ZONE 'Asia/Jakarta') - interval '60 minutes', (i.ts AT TIME ZONE 'Asia/Jakarta'),
         i.views, i.uv, i.active, i.awt, i.pcu, i.acu, i.follows, i.chats, i.shares, i.likes, now()
  FROM imp i JOIN hosts h ON lower(h.name) = lower(i.host)
  WHERE NOT EXISTS (SELECT 1 FROM live_sessions s WHERE s.host_id = h.id
                    AND s.label = 'LIVE ' || h.name || ' - ' || to_char(i.ts, 'FMDD Mon YYYY HH24:MI') || ' (sheet import)')
    -- also skip a row the app's own upload already saved (same host + same numbers on the same Jakarta day)
    AND NOT EXISTS (SELECT 1 FROM live_sessions s WHERE s.host_id = h.id AND s.live_data_recorded_at IS NOT NULL
                    AND s.views = i.views AND s.uv = i.uv AND s.chats = i.chats AND s.likes = i.likes
                    AND (s.ended_at AT TIME ZONE 'Asia/Jakarta')::date = i.ts::date)
  RETURNING 1)
SELECT 'imported: ' || count(*) FROM ins;
COMMIT;
