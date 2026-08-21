INSERT INTO settings (key, value)
VALUES ('account_name', 'Maison Jiya')
ON CONFLICT(key) DO NOTHING;

INSERT INTO settings (key, value)
VALUES ('account_email', 'maisonjya1@gmail.com')
ON CONFLICT(key) DO UPDATE SET value = 'maisonjya1@gmail.com';
