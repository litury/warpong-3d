import type { ServerWebSocket } from "bun";
import { Matchmaking } from "./modules/matchmaking";
import type { PlayerData } from "./modules/gameSession";
import { STAKE } from "./modules/gameSession";
import type { ClientMessage } from "./shared";
import { getOrCreatePlayer, getPlayer, addCoins, updateUpgrades, updateCosmetics, getLeaderboard } from "./modules/db";
import type { PlayerRecord } from "./modules/db";

const matchmaking = new Matchmaking();
const connectedSockets = new Set<ServerWebSocket<PlayerData>>();

let nextPlayerId = 1;

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

// Shared CATALOG for server-side purchase validation
const CATALOG: Record<string, { maxLevel: number; costs: number[] }> = {
  paddle_speed: { maxLevel: 3, costs: [50, 150, 400] },
  paddle_size: { maxLevel: 3, costs: [50, 150, 400] },
  ball_start_speed: { maxLevel: 2, costs: [100, 300] },
  sticky_paddle: { maxLevel: 1, costs: [500] },
  color_neon_green: { maxLevel: 1, costs: [100] },
  color_neon_blue: { maxLevel: 1, costs: [100] },
  color_hot_pink: { maxLevel: 1, costs: [100] },
  color_gold: { maxLevel: 1, costs: [250] },
  trail_simple: { maxLevel: 1, costs: [200] },
  trail_rainbow: { maxLevel: 1, costs: [500] },
  ball_glow: { maxLevel: 1, costs: [150] },
};

Bun.serve<PlayerData>({
  port: 3030,
  fetch(req, server) {
    const url = new URL(req.url, "http://localhost");
    const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

    if (url.pathname === "/online-count") {
      return Response.json({ count: connectedSockets.size }, { headers: corsHeaders });
    }

    if (url.pathname === "/leaderboard") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);
      const lb = getLeaderboard(limit);
      return Response.json(lb, { headers: corsHeaders });
    }

    const id = nextPlayerId;
    if (server.upgrade(req, { data: { sessionId: null, playerId: `p${id}`, playerName: `Player_${id}`, cosmetics: null, upgrades: null, coins: 0, mmr: 1000 } })) {
      nextPlayerId++;
      return;
    }
    return new Response("Pong WebSocket Server", { status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
  },
  websocket: {
    open(ws) {
      console.log(`Player connected: ${ws.data.playerId}`);
      connectedSockets.add(ws);
      broadcastOnlineCount();

      // Load player from DB and send sync
      const player = getOrCreatePlayer(ws.data.playerId, ws.data.playerName);
      ws.data.coins = player.coins;
      ws.data.mmr = player.mmr;
      sendPlayerSync(ws, player);
    },

    message(ws, raw) {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
      } catch {
        return;
      }

      switch (msg.type) {
        case "JoinQueue": {
          // Reload from DB to get latest state
          const player = getPlayer(ws.data.playerId);
          if (!player || player.coins < STAKE) {
            ws.send(JSON.stringify({ type: "PlayerSync", coins: player?.coins ?? 0, mmr: player?.mmr ?? 1000, upgrades: player?.upgrades ?? {}, paddleColor: player?.paddleColor ?? null, ballTrail: player?.ballTrail ?? null, totalOnlineWins: player?.totalOnlineWins ?? 0, winStreak: player?.winStreak ?? 0 }));
            return;
          }
          // Populate ws.data from DB for the game session
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
          if (session) {
            session.handleInput(ws.data.playerId, msg.direction);
          }
          break;
        }

        case "QuickChat": {
          const session = matchmaking.getSessionForPlayer(ws.data.playerId);
          if (session) {
            session.relayChat(ws.data.playerId, msg.chatId);
          }
          break;
        }

        case "BuyUpgrade": {
          const player = getPlayer(ws.data.playerId);
          if (!player) break;

          const def = CATALOG[msg.upgradeId];
          if (!def) break;

          const currentLevel = player.upgrades[msg.upgradeId] ?? 0;
          if (currentLevel >= def.maxLevel) break;

          const cost = def.costs[currentLevel] ?? 0;
          if (cost <= 0 || player.coins < cost) break;

          const newUpgrades = { ...player.upgrades, [msg.upgradeId]: currentLevel + 1 };
          const newCoins = player.coins - cost;
          updateUpgrades(ws.data.playerId, newUpgrades, newCoins);
          ws.data.coins = newCoins;

          const updated = getPlayer(ws.data.playerId)!;
          sendPlayerSync(ws, updated);
          break;
        }

        case "EquipCosmetic": {
          const player = getPlayer(ws.data.playerId);
          if (!player) break;

          let paddleColor = player.paddleColor;
          let ballTrail = player.ballTrail;

          if (msg.slot === "paddleColor") {
            // Verify ownership if equipping (not unequipping)
            if (msg.itemId && (player.upgrades[msg.itemId] ?? 0) <= 0) break;
            paddleColor = msg.itemId;
          } else if (msg.slot === "ballTrail") {
            if (msg.itemId && (player.upgrades[msg.itemId] ?? 0) <= 0) break;
            ballTrail = msg.itemId;
          }

          updateCosmetics(ws.data.playerId, paddleColor, ballTrail);
          const updated = getPlayer(ws.data.playerId)!;
          sendPlayerSync(ws, updated);
          break;
        }

        case "RewardCoins": {
          // Rewarded ad coins — cap at reasonable amount
          const amount = Math.min(Math.max(0, msg.amount), 50);
          if (amount > 0) {
            const newCoins = addCoins(ws.data.playerId, amount);
            ws.data.coins = newCoins;
            const updated = getPlayer(ws.data.playerId)!;
            sendPlayerSync(ws, updated);
          }
          break;
        }
      }
    },

    close(ws) {
      console.log(`Player disconnected: ${ws.data.playerId}`);
      connectedSockets.delete(ws);
      matchmaking.handleDisconnect(ws);
      broadcastOnlineCount();
    },
  },
});

console.log("Pong server listening on ws://localhost:3030");
