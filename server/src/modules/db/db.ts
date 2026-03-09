import { Database } from "bun:sqlite";

const db = new Database("pong.db");
db.run("PRAGMA journal_mode=WAL");
db.run(`CREATE TABLE IF NOT EXISTS players (
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
)`);

export interface PlayerRecord {
  id: string;
  name: string;
  coins: number;
  mmr: number;
  upgrades: Record<string, number>;
  paddleColor: string | null;
  ballTrail: string | null;
  totalOnlineWins: number;
  winStreak: number;
}

interface PlayerRow {
  id: string;
  name: string;
  coins: number;
  mmr: number;
  upgrades_json: string;
  paddle_color: string | null;
  ball_trail: string | null;
  total_online_wins: number;
  win_streak: number;
}

function rowToRecord(row: PlayerRow): PlayerRecord {
  return {
    id: row.id,
    name: row.name,
    coins: row.coins,
    mmr: row.mmr,
    upgrades: JSON.parse(row.upgrades_json),
    paddleColor: row.paddle_color,
    ballTrail: row.ball_trail,
    totalOnlineWins: row.total_online_wins,
    winStreak: row.win_streak,
  };
}

const stmtGet = db.prepare<PlayerRow, [string]>("SELECT * FROM players WHERE id = ?");
const stmtInsert = db.prepare("INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)");
const stmtUpdateCoins = db.prepare("UPDATE players SET coins = MAX(0, coins + ?) WHERE id = ?");
const stmtSetCoins = db.prepare("UPDATE players SET coins = ? WHERE id = ?");
const stmtUpdateMmr = db.prepare("UPDATE players SET mmr = ? WHERE id = ?");
const stmtUpdateStreak = db.prepare("UPDATE players SET win_streak = ?, total_online_wins = ? WHERE id = ?");
const stmtUpdateUpgrades = db.prepare("UPDATE players SET upgrades_json = ?, coins = ? WHERE id = ?");
const stmtUpdateCosmetics = db.prepare("UPDATE players SET paddle_color = ?, ball_trail = ? WHERE id = ?");
const stmtLeaderboard = db.prepare<PlayerRow, [number]>("SELECT * FROM players ORDER BY mmr DESC LIMIT ?");

export function getOrCreatePlayer(id: string, name?: string): PlayerRecord {
  stmtInsert.run(id, name ?? `Player_${id}`);
  const row = stmtGet.get(id)!;
  return rowToRecord(row);
}

export function getPlayer(id: string): PlayerRecord | null {
  const row = stmtGet.get(id);
  return row ? rowToRecord(row) : null;
}

export function addCoins(id: string, delta: number): number {
  stmtUpdateCoins.run(delta, id);
  const row = stmtGet.get(id)!;
  return row.coins;
}

export function setCoins(id: string, coins: number): void {
  stmtSetCoins.run(Math.max(0, coins), id);
}

export function updateMmr(id: string, newMmr: number): void {
  stmtUpdateMmr.run(Math.max(0, newMmr), id);
}

export function updateStreak(id: string, winStreak: number, totalOnlineWins: number): void {
  stmtUpdateStreak.run(winStreak, totalOnlineWins, id);
}

export function updateUpgrades(id: string, upgrades: Record<string, number>, newCoins: number): void {
  stmtUpdateUpgrades.run(JSON.stringify(upgrades), Math.max(0, newCoins), id);
}

export function updateCosmetics(id: string, paddleColor: string | null, ballTrail: string | null): void {
  stmtUpdateCosmetics.run(paddleColor, ballTrail, id);
}

export function getLeaderboard(limit = 10): PlayerRecord[] {
  const rows = stmtLeaderboard.all(limit);
  return rows.map(rowToRecord);
}
