import type { ServerWebSocket } from "bun";
import { GameSession, type PlayerData } from "../gameSession";

const BASE_RANGE = 200;                // ±200 MMR initially
const RANGE_EXPAND_STEP = 100;         // +100 MMR per interval
const RANGE_EXPAND_INTERVAL = 10_000;  // every 10 seconds
const QUEUE_TIMEOUT = 5 * 60_000;      // 5 minutes
const TICK_INTERVAL = 2_000;           // check matches every 2s

interface QueueEntry {
  ws: ServerWebSocket<PlayerData>;
  mmr: number;
  joinedAt: number;
}

export class Matchmaking {
  private queue: QueueEntry[] = [];
  private sessions = new Map<string, GameSession>();
  private playerSession = new Map<string, string>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL);
  }

  addToQueue(ws: ServerWebSocket<PlayerData>): void {
    if (this.queue.some((e) => e.ws === ws)) return;

    const entry: QueueEntry = { ws, mmr: ws.data.mmr, joinedAt: Date.now() };
    this.queue.push(entry);
    ws.send(JSON.stringify({ type: "QueueJoined" }));
    this.sendQueueStatus(entry);
    this.tryMatch();
  }

  removeFromQueue(ws: ServerWebSocket<PlayerData>): void {
    this.queue = this.queue.filter((e) => e.ws !== ws);
  }

  handleDisconnect(ws: ServerWebSocket<PlayerData>): void {
    this.removeFromQueue(ws);

    const sessionId = ws.data.sessionId;
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.handleDisconnect(ws.data.playerId);
      }
    }
  }

  tryReconnect(ws: ServerWebSocket<PlayerData>, sessionToken: string): boolean {
    const sessionId = this.playerSession.get(ws.data.playerId);
    if (!sessionId) return false;

    const session = this.sessions.get(sessionId);
    if (!session || !session.isPaused) return false;

    return session.handleReconnect(ws.data.playerId, sessionToken, ws);
  }

  getSessionForPlayer(playerId: string): GameSession | undefined {
    const sessionId = this.playerSession.get(playerId);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  // --- private helpers ---

  private getAllowedRange(entry: QueueEntry): number {
    const waited = Date.now() - entry.joinedAt;
    const expansions = Math.floor(waited / RANGE_EXPAND_INTERVAL);
    return BASE_RANGE + expansions * RANGE_EXPAND_STEP;
  }

  private estimateWaitSec(entry: QueueEntry): number {
    const range = this.getAllowedRange(entry);
    const inRange = this.queue.filter(
      (o) => o !== entry && Math.abs(o.mmr - entry.mmr) <= range,
    ).length;
    if (inRange > 0) return 0;

    // Estimate seconds until range expands enough to reach closest player
    const closestDist = this.queue
      .filter((o) => o !== entry)
      .reduce((min, o) => Math.min(min, Math.abs(o.mmr - entry.mmr)), Infinity);

    if (!isFinite(closestDist)) return 30; // nobody else in queue

    const expansionsNeeded = Math.max(0, Math.ceil((closestDist - range) / RANGE_EXPAND_STEP));
    return Math.ceil((expansionsNeeded * RANGE_EXPAND_INTERVAL) / 1000);
  }

  private sendQueueStatus(entry: QueueEntry): void {
    try {
      entry.ws.send(JSON.stringify({
        type: "QueueStatus",
        estimatedWaitSec: this.estimateWaitSec(entry),
        rangeWidth: this.getAllowedRange(entry),
      }));
    } catch { /* disconnected */ }
  }

  private tick(): void {
    const now = Date.now();

    // Timeout players who waited too long
    const timedOut: QueueEntry[] = [];
    this.queue = this.queue.filter((e) => {
      if (now - e.joinedAt >= QUEUE_TIMEOUT) {
        timedOut.push(e);
        return false;
      }
      return true;
    });
    for (const e of timedOut) {
      try { e.ws.send(JSON.stringify({ type: "QueueTimeout" })); } catch { /* dc */ }
    }

    this.tryMatch();

    // Update remaining players
    for (const e of this.queue) this.sendQueueStatus(e);
  }

  private tryMatch(): void {
    // Longest-waiting players get priority
    this.queue.sort((a, b) => a.joinedAt - b.joinedAt);

    const matched = new Set<QueueEntry>();

    for (let i = 0; i < this.queue.length; i++) {
      const a = this.queue[i];
      if (matched.has(a)) continue;

      const rangeA = this.getAllowedRange(a);
      let bestMatch: QueueEntry | null = null;
      let bestDist = Infinity;

      for (let j = i + 1; j < this.queue.length; j++) {
        const b = this.queue[j];
        if (matched.has(b)) continue;

        const dist = Math.abs(a.mmr - b.mmr);
        const rangeB = this.getAllowedRange(b);

        // Both players must accept the distance
        if (dist <= rangeA && dist <= rangeB && dist < bestDist) {
          bestMatch = b;
          bestDist = dist;
        }
      }

      if (bestMatch) {
        matched.add(a);
        matched.add(bestMatch);
        this.createSession(a, bestMatch);
      }
    }

    this.queue = this.queue.filter((e) => !matched.has(e));
  }

  private createSession(a: QueueEntry, b: QueueEntry): void {
    const left = a.ws;
    const right = b.ws;

    const session = new GameSession(left, right, (id) => {
      this.sessions.delete(id);
      this.playerSession.delete(left.data.playerId);
      this.playerSession.delete(right.data.playerId);
    });
    this.sessions.set(session.id, session);
    this.playerSession.set(left.data.playerId, session.id);
    this.playerSession.set(right.data.playerId, session.id);

    left.data.sessionId = session.id;
    right.data.sessionId = session.id;

    session.start();
  }
}
