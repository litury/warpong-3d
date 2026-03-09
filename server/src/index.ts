import type { ServerWebSocket } from "bun";
import { Matchmaking } from "./modules/matchmaking";
import type { PlayerData } from "./modules/gameSession";
import { STAKE } from "./modules/gameSession";
import type { ClientMessage } from "./shared";
import { getOrCreatePlayer, getPlayer } from "./modules/db";
import type { PlayerRecord } from "./modules/db";
import { handleFetch } from "./routes/http";
import { handleBuyUpgrade, handleRewardCoins, handlePurchaseCoins, clearRewardCooldown } from "./handlers/purchase";
import { handleEquipCosmetic } from "./handlers/cosmetic";
import { validateMessage } from "./handlers/validate";

const matchmaking = new Matchmaking();
const connectedSockets = new Set<ServerWebSocket<PlayerData>>();

let onlineCountDirty = false;
let onlineCountTimer: ReturnType<typeof setTimeout> | null = null;
const ONLINE_COUNT_INTERVAL = 5_000; // ms

function broadcastOnlineCount() {
  onlineCountDirty = true;
  if (!onlineCountTimer) {
    flushOnlineCount();
    onlineCountTimer = setTimeout(onlineCountTick, ONLINE_COUNT_INTERVAL);
  }
}

function onlineCountTick() {
  if (onlineCountDirty) {
    flushOnlineCount();
    onlineCountTimer = setTimeout(onlineCountTick, ONLINE_COUNT_INTERVAL);
  } else {
    onlineCountTimer = null;
  }
}

function flushOnlineCount() {
  onlineCountDirty = false;
  const msg = JSON.stringify({ type: "OnlineCount", count: connectedSockets.size });
  for (const ws of connectedSockets) {
    try { ws.send(msg); } catch { /* disconnected */ }
  }
}

function sendPlayerSync(ws: ServerWebSocket<PlayerData>, player: PlayerRecord) {
  ws.send(JSON.stringify({
    type: "PlayerSync",
    coins: player.coins,
    mmr: player.mmr,
    upgrades: player.upgrades,
    paddleColor: player.paddleColor,
    ballTrail: player.ballTrail,
    totalOnlineWins: player.totalOnlineWins,
    winStreak: player.winStreak,
  }));
}

Bun.serve<PlayerData>({
  port: 3030,
  fetch(req, server) {
    return handleFetch(req, server, connectedSockets);
  },
  websocket: {
    open(ws) {
      console.log(`Player connected: ${ws.data.playerId}`);
      connectedSockets.add(ws);
      broadcastOnlineCount();

      const player = getOrCreatePlayer(ws.data.playerId, ws.data.playerName);
      ws.data.coins = player.coins;
      ws.data.mmr = player.mmr;
      sendPlayerSync(ws, player);
    },

    message(ws, raw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
      } catch {
        ws.send(JSON.stringify({ type: "Error", message: "invalid json" }));
        return;
      }

      const msg: ClientMessage | null = validateMessage(parsed);
      if (!msg) {
        ws.send(JSON.stringify({ type: "Error", message: "invalid message" }));
        return;
      }

      switch (msg.type) {
        case "JoinQueue": {
          const player = getPlayer(ws.data.playerId);
          if (!player || player.coins < STAKE) {
            ws.send(JSON.stringify({ type: "PlayerSync", coins: player?.coins ?? 0, mmr: player?.mmr ?? 1000, upgrades: player?.upgrades ?? {}, paddleColor: player?.paddleColor ?? null, ballTrail: player?.ballTrail ?? null, totalOnlineWins: player?.totalOnlineWins ?? 0, winStreak: player?.winStreak ?? 0 }));
            return;
          }
          ws.data.coins = player.coins;
          ws.data.mmr = player.mmr;
          ws.data.cosmetics = {
            paddleColor: player.paddleColor ? parseInt(player.paddleColor, 16) : 0xffffff,
            trailType: player.ballTrail,
            ballGlow: (player.upgrades.ball_glow ?? 0) > 0,
          };
          ws.data.upgrades = {
            paddleSpeedLevel: player.upgrades.paddle_speed ?? 0,
            paddleSizeLevel: player.upgrades.paddle_size ?? 0,
            ballSpeedLevel: player.upgrades.ball_start_speed ?? 0,
          };
          matchmaking.addToQueue(ws);
          break;
        }

        case "LeaveQueue":
          matchmaking.removeFromQueue(ws);
          break;

        case "PlayerInput": {
          const session = matchmaking.getSessionForPlayer(ws.data.playerId);
          if (session) session.handleInput(ws.data.playerId, msg.direction);
          break;
        }

        case "QuickChat": {
          const session = matchmaking.getSessionForPlayer(ws.data.playerId);
          if (session) session.relayChat(ws.data.playerId, msg.chatId);
          break;
        }

        case "BuyUpgrade":
          handleBuyUpgrade(ws, msg, sendPlayerSync);
          break;

        case "EquipCosmetic":
          handleEquipCosmetic(ws, msg, sendPlayerSync);
          break;

        case "RewardCoins":
          handleRewardCoins(ws, msg, sendPlayerSync);
          break;

        case "PurchaseCoins":
          handlePurchaseCoins(ws, msg, sendPlayerSync);
          break;
      }
    },

    close(ws) {
      console.log(`Player disconnected: ${ws.data.playerId}`);
      connectedSockets.delete(ws);
      clearRewardCooldown(ws.data.playerId);
      matchmaking.handleDisconnect(ws);
      broadcastOnlineCount();
    },
  },
});

console.log("Pong server listening on ws://localhost:3030");
