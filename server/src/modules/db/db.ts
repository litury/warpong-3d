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

db.run(`CREATE TABLE IF NOT EXISTS game_stats (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  total_matches_completed INTEGER NOT NULL DEFAULT 0
)`);
db.run(
  "INSERT OR IGNORE INTO game_stats (id, total_matches_completed) VALUES (1, 0)",
);

const stmtGetTotalMatches = db.prepare<{ total_matches_completed: number }, []>(
  "SELECT total_matches_completed FROM game_stats WHERE id = 1",
);
const stmtIncrementMatches = db.prepare(
  "UPDATE game_stats SET total_matches_completed = total_matches_completed + 1 WHERE id = 1",
);

export function getTotalMatchesCompleted(): number {
  return stmtGetTotalMatches.get()?.total_matches_completed ?? 0;
}

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

const stmtGet = db.prepare<PlayerRow, [string]>(
  "SELECT * FROM players WHERE id = ?",
);
const stmtInsert = db.prepare(
  "INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)",
);
const stmtUpdateCoins = db.prepare(
  "UPDATE players SET coins = MAX(0, coins + ?) WHERE id = ?",
);
const stmtSetCoins = db.prepare("UPDATE players SET coins = ? WHERE id = ?");
const stmtUpdateMmr = db.prepare("UPDATE players SET mmr = ? WHERE id = ?");
const stmtUpdateStreak = db.prepare(
  "UPDATE players SET win_streak = ?, total_online_wins = ? WHERE id = ?",
);
const stmtUpdateUpgrades = db.prepare(
  "UPDATE players SET upgrades_json = ?, coins = ? WHERE id = ?",
);
const stmtUpdateCosmetics = db.prepare(
  "UPDATE players SET paddle_color = ?, ball_trail = ? WHERE id = ?",
);
const stmtLeaderboard = db.prepare<PlayerRow, [number]>(
  "SELECT * FROM players ORDER BY mmr DESC LIMIT ?",
);

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

export function updateStreak(
  id: string,
  winStreak: number,
  totalOnlineWins: number,
): void {
  stmtUpdateStreak.run(winStreak, totalOnlineWins, id);
}

export interface SettleGameResult {
  winnerCoins: number;
  loserCoins: number;
  winnerStreak: number;
  winnerTotalWins: number;
}

const settleGameTx = db.transaction(
  (
    winnerId: string,
    loserId: string,
    winnerMmr: number,
    loserMmr: number,
    coinsDelta: number,
    loseCoinsDelta: number,
  ): SettleGameResult => {
    stmtUpdateMmr.run(Math.max(0, winnerMmr), winnerId);
    stmtUpdateMmr.run(Math.max(0, loserMmr), loserId);

    stmtUpdateCoins.run(coinsDelta, winnerId);
    stmtUpdateCoins.run(loseCoinsDelta, loserId);

    const winnerRow = stmtGet.get(winnerId)!;
    const loserRow = stmtGet.get(loserId)!;

    const newWinnerStreak = winnerRow.win_streak + 1;
    const newWinnerTotalWins = winnerRow.total_online_wins + 1;
    stmtUpdateStreak.run(newWinnerStreak, newWinnerTotalWins, winnerId);
    stmtUpdateStreak.run(0, loserRow.total_online_wins, loserId);

    stmtIncrementMatches.run();

    return {
      winnerCoins: winnerRow.coins,
      loserCoins: loserRow.coins,
      winnerStreak: newWinnerStreak,
      winnerTotalWins: newWinnerTotalWins,
    };
  },
);

export function settleGame(
  winnerId: string,
  loserId: string,
  winnerMmr: number,
  loserMmr: number,
  coinsDelta: number,
  loseCoinsDelta: number,
): SettleGameResult {
  return settleGameTx(
    winnerId,
    loserId,
    winnerMmr,
    loserMmr,
    coinsDelta,
    loseCoinsDelta,
  );
}

export function updateUpgrades(
  id: string,
  upgrades: Record<string, number>,
  newCoins: number,
): void {
  stmtUpdateUpgrades.run(JSON.stringify(upgrades), Math.max(0, newCoins), id);
}

export function updateCosmetics(
  id: string,
  paddleColor: string | null,
  ballTrail: string | null,
): void {
  stmtUpdateCosmetics.run(paddleColor, ballTrail, id);
}

/**
 * Atomically deduct STAKE coins. Returns updated coins or null if insufficient.
 */
export function reserveStake(id: string, stake: number): number | null {
  const row = stmtGet.get(id);
  if (!row || row.coins < stake) return null;
  stmtUpdateCoins.run(-stake, id);
  return row.coins - stake;
}

/**
 * Refund previously reserved stake (e.g. player left queue before match).
 */
export function releaseStake(id: string, stake: number): number {
  stmtUpdateCoins.run(stake, id);
  const row = stmtGet.get(id)!;
  return row.coins;
}

export function getLeaderboard(limit = 10): PlayerRecord[] {
  const rows = stmtLeaderboard.all(limit);
  return rows.map(rowToRecord);
}
