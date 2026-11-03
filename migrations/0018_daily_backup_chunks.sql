-- Les sauvegardes quotidiennes sont découpées en morceaux, car une ligne D1
-- ne peut pas dépasser 2 Mo. Les anciennes sauvegardes (JSON dans
-- daily_backups.snapshot_json) restent lisibles sans modification.
CREATE TABLE IF NOT EXISTS daily_backup_chunks (
  backup_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (backup_id, chunk_index)
);
