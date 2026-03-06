import type { ServerWebSocket } from "bun";
import { Matchmaking } from "./modules/matchmaking";
import type { PlayerData } from "./modules/gameSession";
import type { ClientMessage } from "./shared";

const matchmaking = new Matchmaking();

let nextPlayerId = 1;

Bun.serve<PlayerData>({
  port: 3030,
  fetch(req, server) {
    if (server.upgrade(req, { data: { sessionId: null, playerId: `p${nextPlayerId++}`, cosmetics: null, upgrades: null } })) {
      return;
    }
    return new Response("Pong WebSocket Server", { status: 200 });
  },
  websocket: {
    open(ws) {
      console.log(`Player connected: ${ws.data.playerId}`);
    },

    message(ws, raw) {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
      } catch {
        return;
      }

      switch (msg.type) {
        case "JoinQueue":
          ws.data.cosmetics = msg.cosmetics ?? null;
          ws.data.upgrades = msg.upgrades ?? null;
          matchmaking.addToQueue(ws);
          break;

        case "LeaveQueue":
          matchmaking.removeFromQueue(ws);
          break;

        case "PlayerInput": {
          const session = matchmaking.getSessionForPlayer(ws.data.playerId);
          if (session) {
            session.handleInput(ws.data.playerId, msg.direction);
          }
          break;
        }
      }
    },

    close(ws) {
      console.log(`Player disconnected: ${ws.data.playerId}`);
      matchmaking.handleDisconnect(ws);
    },
  },
});

console.log("Pong server listening on ws://localhost:3030");
