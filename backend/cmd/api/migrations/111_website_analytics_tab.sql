-- admin tab for the Website Analytics (GA4) page: same access as the Sales analytics tab at first
INSERT INTO role_tab_access (role_name, tab_key, access_level)
SELECT role_name, 'website_analytics', access_level FROM role_tab_access WHERE tab_key = 'sales_analytics'
ON CONFLICT (role_name, tab_key) DO NOTHING;
