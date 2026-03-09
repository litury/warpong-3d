import type { ServerWebSocket } from "bun";
import type { PlayerData } from "../modules/gameSession";
import type { ClientMessage } from "../shared";
import { CATALOG } from "../catalog";
import { getPlayer, addCoins, updateUpgrades } from "../modules/db";
import type { PlayerRecord } from "../modules/db";

type SendSync = (ws: ServerWebSocket<PlayerData>, player: PlayerRecord) => void;

// Anti-fraud: track last reward timestamp per player (30s cooldown)
const REWARD_COOLDOWN_MS = 30_000;
const REWARD_MAX_AMOUNT = 15;
const lastRewardTime = new Map<string, number>();

// IAP product catalog (server-authoritative)
const IAP_PRODUCTS: Record<string, number> = {
  coins_100: 100,
  coins_500: 500,
  coins_1500: 1500,
};

export function handleBuyUpgrade(
  ws: ServerWebSocket<PlayerData>,
  msg: Extract<ClientMessage, { type: "BuyUpgrade" }>,
  sendPlayerSync: SendSync,
): void {
  const player = getPlayer(ws.data.playerId);
  if (!player) return;

  const def = CATALOG[msg.upgradeId];
  if (!def) return;

  const currentLevel = player.upgrades[msg.upgradeId] ?? 0;
  if (currentLevel >= def.maxLevel) return;

  const cost = def.costs[currentLevel] ?? 0;
  if (cost <= 0 || player.coins < cost) return;

  const newUpgrades = { ...player.upgrades, [msg.upgradeId]: currentLevel + 1 };
  const newCoins = player.coins - cost;
  updateUpgrades(ws.data.playerId, newUpgrades, newCoins);
  ws.data.coins = newCoins;

  const updated = getPlayer(ws.data.playerId)!;
  sendPlayerSync(ws, updated);
}

export function handleRewardCoins(
  ws: ServerWebSocket<PlayerData>,
  msg: Extract<ClientMessage, { type: "RewardCoins" }>,
  sendPlayerSync: SendSync,
): void {
  const now = Date.now();
  const lastTime = lastRewardTime.get(ws.data.playerId) ?? 0;
  if (now - lastTime < REWARD_COOLDOWN_MS) {
    console.log(`[anti-fraud] RewardCoins cooldown for ${ws.data.playerId}, ${Math.ceil((REWARD_COOLDOWN_MS - (now - lastTime)) / 1000)}s remaining`);
    return;
  }
  const amount = Math.min(Math.max(0, msg.amount), REWARD_MAX_AMOUNT);
  if (amount > 0) {
    lastRewardTime.set(ws.data.playerId, now);
    const newCoins = addCoins(ws.data.playerId, amount);
    ws.data.coins = newCoins;
    const updated = getPlayer(ws.data.playerId)!;
    sendPlayerSync(ws, updated);
  }
}

export function handlePurchaseCoins(
  ws: ServerWebSocket<PlayerData>,
  msg: Extract<ClientMessage, { type: "PurchaseCoins" }>,
  sendPlayerSync: SendSync,
): void {
  const iapAmount = IAP_PRODUCTS[msg.productId];
  if (!iapAmount) {
    console.log(`[anti-fraud] Unknown productId: ${msg.productId} from ${ws.data.playerId}`);
    return;
  }
  const newCoins = addCoins(ws.data.playerId, iapAmount);
  ws.data.coins = newCoins;
  const updated = getPlayer(ws.data.playerId)!;
  sendPlayerSync(ws, updated);
  console.log(`[iap] ${ws.data.playerId} purchased ${msg.productId} +${iapAmount} coins`);
}

export function clearRewardCooldown(playerId: string): void {
  lastRewardTime.delete(playerId);
}
