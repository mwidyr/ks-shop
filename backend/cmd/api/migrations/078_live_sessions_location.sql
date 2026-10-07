-- LIVE Data Upload (public wizard): store the Location on each LIVE session row directly,
-- rather than only deriving it from hosts.location_id at query time. The client's own stated
-- reason: if a host later moves to a different Location, past records should keep showing the
-- Location that was actually true at the time, not the host's current one; this also keeps two
-- hosts sharing the same name distinguishable across Locations. Nullable - existing rows and the
-- normal Panel Siaran Go-Live flow leave this unset, this is additive for the new flow only.
ALTER TABLE live_sessions ADD COLUMN location_id INT REFERENCES host_locations(id);
