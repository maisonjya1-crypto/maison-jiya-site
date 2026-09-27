-- Smart stock thresholds and reorder coverage.
-- Existing products keep their data and receive conservative defaults.

ALTER TABLE products ADD COLUMN stock_alert_threshold INTEGER NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN reorder_cover_days INTEGER NOT NULL DEFAULT 30;
