import type { ServerWebSocket } from "bun";
import { getPlayer, updateCosmetics } from "../modules/db";
import type { PlayerRecord } from "../modules/db";
import type { PlayerData } from "../modules/gameSession";
import type { ClientMessage } from "../shared";

type SendSync = (ws: ServerWebSocket<PlayerData>, player: PlayerRecord) => void;

export function handleEquipCosmetic(
  ws: ServerWebSocket<PlayerData>,
  msg: Extract<ClientMessage, { type: "EquipCosmetic" }>,
  sendPlayerSync: SendSync,
): void {
  const player = getPlayer(ws.data.playerId);
  if (!player) return;

  let paddleColor = player.paddleColor;
  let ballTrail = player.ballTrail;

  if (msg.slot === "paddleColor") {
    if (msg.itemId && (player.upgrades[msg.itemId] ?? 0) <= 0) return;
    paddleColor = msg.itemId;
  } else if (msg.slot === "ballTrail") {
    if (msg.itemId && (player.upgrades[msg.itemId] ?? 0) <= 0) return;
    ballTrail = msg.itemId;
  }

  updateCosmetics(ws.data.playerId, paddleColor, ballTrail);
  const updated = getPlayer(ws.data.playerId)!;
  sendPlayerSync(ws, updated);
}
