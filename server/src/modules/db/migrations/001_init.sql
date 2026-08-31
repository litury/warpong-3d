-- Baseline: current live schema. Idempotent so existing pong.db can adopt schema_migrations.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Player',
  coins INTEGER NOT NULL DEFAULT 100,
  mmr INTEGER NOT NULL DEFAULT 1000,
  upgrades_json TEXT NOT NULL DEFAULT '{}',
  paddle_color TEXT DEFAULT NULL,
  ball_trail TEXT DEFAULT NULL,
  total_online_wins INTEGER NOT NULL DEFAULT 0,
  win_streak INTEGER NOT NULL DEFAULT 0,
  gambits_json TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_stats (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  total_matches_completed INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO game_stats (id, total_matches_completed) VALUES (1, 0);
