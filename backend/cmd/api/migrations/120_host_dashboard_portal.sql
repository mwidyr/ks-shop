-- Host accounts may also open the Dashboard (their Location's numbers) and the LIVE Data Portal (view only).
INSERT INTO role_tab_access (role_name, tab_key, access_level) VALUES
  ('host', 'performance_dashboard', 'view'),
  ('host', 'panel_siaran', 'view')
ON CONFLICT (role_name, tab_key) DO NOTHING;
