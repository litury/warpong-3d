import type { ServerWebSocket } from "bun";
import { GameSession, type PlayerData } from "../gameSession";

export class Matchmaking {
  private queue: ServerWebSocket<PlayerData>[] = [];
  private sessions = new Map<string, GameSession>();
  private playerSession = new Map<string, string>();

  addToQueue(ws: ServerWebSocket<PlayerData>): void {
    if (this.queue.includes(ws)) return;

    this.queue.push(ws);
    ws.send(JSON.stringify({ type: "QueueJoined" }));

    this.tryMatch();
  }

  removeFromQueue(ws: ServerWebSocket<PlayerData>): void {
    this.queue = this.queue.filter((w) => w !== ws);
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

  getSessionForPlayer(playerId: string): GameSession | undefined {
    const sessionId = this.playerSession.get(playerId);
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  private tryMatch(): void {
    while (this.queue.length >= 2) {
      const left = this.queue.shift()!;
      const right = this.queue.shift()!;

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
}
