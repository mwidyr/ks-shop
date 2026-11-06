-- EMPLOYEE section: Employee List, Shift Schedule, Payroll, Bonus Ranking.
-- Employee records are NOT linked to system logins, and their Locations (employee_locations) are completely
-- separate from Host Management's Locations. hosts is only read (optional employees.host_id) to fetch a Host's
-- sales for bonus calculation; nothing here changes hosts or the ordering system.

CREATE TABLE employee_locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO employee_locations (name, is_default) VALUES ('General', true);

CREATE TABLE employee_positions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);
INSERT INTO employee_positions (name) VALUES ('Host'), ('Supervisor'), ('Customer Service');

CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    emp_code VARCHAR(20) GENERATED ALWAYS AS ('EMP' || lpad(id::text, 3, '0')) STORED UNIQUE,
    full_name VARCHAR(200) NOT NULL,
    nickname VARCHAR(100) NOT NULL,
    mbti VARCHAR(4) NOT NULL DEFAULT '',
    birthday DATE,
    nik TEXT NOT NULL DEFAULT '',            -- text: keeps leading zeros
    address TEXT NOT NULL DEFAULT '',
    position_id INT NOT NULL REFERENCES employee_positions(id),
    location_id INT NOT NULL REFERENCES employee_locations(id),
    host_id INT REFERENCES hosts(id) ON DELETE SET NULL,   -- optional: only to read this Host's performance for bonuses
    whatsapp TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'full_time' CHECK (status IN ('full_time','probationary','resigned','fired')),
    join_date DATE,
    bank_holder TEXT NOT NULL DEFAULT '',
    bank_name TEXT NOT NULL DEFAULT '',
    bank_account TEXT NOT NULL DEFAULT '',   -- text: keeps leading zeros
    emergency_name TEXT NOT NULL DEFAULT '',
    emergency_number TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_location ON employees(location_id);

-- Attendance statuses. Paid / Unpaid (base salary) and Deduct Attendance Bonus work independently.
-- W, OFF and LV are the codes Payroll counts as Work / Off / Leave days; a code never changes once created.
CREATE TABLE attendance_statuses (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(60) NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT true,
    deduct_bonus BOOLEAN NOT NULL DEFAULT false,
    bg_color VARCHAR(20) NOT NULL DEFAULT 'gray',
    text_color VARCHAR(20) NOT NULL DEFAULT 'black',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,   -- the status a date has until someone changes it (Working)
    sort_order INT NOT NULL DEFAULT 0
);
INSERT INTO attendance_statuses (code, name, is_paid, deduct_bonus, bg_color, text_color, is_default, sort_order) VALUES
    ('W',   'Working',       true,  false, 'green',  'green',  true,  1),
    ('OFF', 'Day Off',       true,  false, 'blue',   'blue',   false, 2),
    ('LV',  'Leave',         false, true,  'red',    'red',    false, 3),
    ('MC',  'Medical Leave', true,  false, 'yellow', 'brown',  false, 4);

-- Only dates that differ from the default status are stored.
CREATE TABLE attendance_records (
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    status_id INT NOT NULL REFERENCES attendance_statuses(id),
    PRIMARY KEY (employee_id, work_date)
);

-- Payroll. All salary and bonus amounts are IDR; GMV targets are TWD.
CREATE TABLE payroll_settings (
    key VARCHAR(60) PRIMARY KEY,
    value JSONB NOT NULL
);
INSERT INTO payroll_settings (key, value) VALUES
    ('attendance_bonus', '{"amount": 500000}'),
    ('qty_tiers', '[{"min":0,"max":200,"rate":0},{"min":201,"max":499,"rate":200},{"min":500,"max":999,"rate":1000},{"min":1000,"max":1499,"rate":1500},{"min":1500,"max":1999,"rate":2000},{"min":2000,"max":2499,"rate":2500},{"min":2500,"max":2999,"rate":3000},{"min":3000,"max":null,"rate":5000}]'),
    ('gmv_tiers', '[{"min":150000,"bonus":500000},{"min":300000,"bonus":1000000},{"min":500000,"bonus":2000000},{"min":800000,"bonus":3000000},{"min":1000000,"bonus":5000000},{"min":1300000,"bonus":8000000},{"min":1500000,"bonus":12000000},{"min":1800000,"bonus":15000000},{"min":2000000,"bonus":20000000}]'),
    ('daily_bonus', '{"accumulate": false, "tiers": [{"qty":30,"bonus":100000},{"qty":100,"bonus":1000000}]}');

-- Base salary history: a salary applies from its effective month onward (carried forward automatically).
CREATE TABLE employee_base_salaries (
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    effective_month DATE NOT NULL,
    base_salary NUMERIC(14,0) NOT NULL CHECK (base_salary >= 0),
    PRIMARY KEY (employee_id, effective_month)
);

CREATE TABLE payroll_months (
    month DATE PRIMARY KEY,
    transfer_fee NUMERIC(14,0) NOT NULL DEFAULT 0 CHECK (transfer_fee >= 0)
);

-- One row per employee and month once something is entered for it. `snapshot` freezes the whole breakdown the
-- moment the salary is confirmed as paid, so later salary / bonus / attendance-rule changes never touch it.
CREATE TABLE payroll_records (
    employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    extra NUMERIC(14,0) NOT NULL DEFAULT 0,
    extra_note TEXT NOT NULL DEFAULT '',
    paid_at TIMESTAMPTZ,
    paid_by INT,
    paid_by_name VARCHAR(150),
    snapshot JSONB,
    PRIMARY KEY (employee_id, month)
);
