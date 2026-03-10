import type { ClientMessage, QuickChatId, PaddleDirection } from "../shared";

const VALID_TYPES = new Set([
  "Auth",
  "JoinQueue",
  "LeaveQueue",
  "PlayerInput",
  "QuickChat",
  "BuyUpgrade",
  "EquipCosmetic",
  "RewardCoins",
  "PurchaseCoins",
  "Reconnect",
]);

const VALID_DIRECTIONS = new Set<PaddleDirection>(["Up", "Down", "Idle"]);
const VALID_CHAT_IDS = new Set<QuickChatId>(["gg", "nice", "wow", "glhf", "oops", "rematch"]);
const VALID_COSMETIC_SLOTS = new Set(["paddleColor", "ballTrail"]);

export function validateMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "object" || raw === null) return null;

  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== "string" || !VALID_TYPES.has(obj.type)) return null;

  switch (obj.type) {
    case "Auth":
      if (typeof obj.signature !== "string") return null;
      if (typeof obj.uniqueId !== "string" || obj.uniqueId === "") return null;
      if (typeof obj.name !== "string" || obj.name === "") return null;
      return { type: "Auth", signature: obj.signature, uniqueId: obj.uniqueId, name: obj.name };

    case "JoinQueue":
    case "LeaveQueue":
      return { type: obj.type } as ClientMessage;

    case "PlayerInput":
      if (!VALID_DIRECTIONS.has(obj.direction as PaddleDirection)) return null;
      return { type: "PlayerInput", direction: obj.direction as PaddleDirection };

    case "QuickChat":
      if (!VALID_CHAT_IDS.has(obj.chatId as QuickChatId)) return null;
      return { type: "QuickChat", chatId: obj.chatId as QuickChatId };

    case "BuyUpgrade":
      if (typeof obj.upgradeId !== "string" || obj.upgradeId === "") return null;
      return { type: "BuyUpgrade", upgradeId: obj.upgradeId };

    case "EquipCosmetic":
      if (!VALID_COSMETIC_SLOTS.has(obj.slot as string)) return null;
      if (obj.itemId !== null && typeof obj.itemId !== "string") return null;
      if (typeof obj.itemId === "string" && obj.itemId === "") return null;
      return {
        type: "EquipCosmetic",
        slot: obj.slot as "paddleColor" | "ballTrail",
        itemId: obj.itemId as string | null,
      };

    case "RewardCoins":
      if (typeof obj.amount !== "number" || !Number.isFinite(obj.amount)) return null;
      return { type: "RewardCoins", amount: obj.amount };

    case "PurchaseCoins":
      if (typeof obj.productId !== "string" || obj.productId === "") return null;
      return { type: "PurchaseCoins", productId: obj.productId };

    case "Reconnect":
      if (typeof obj.sessionToken !== "string" || obj.sessionToken === "") return null;
      return { type: "Reconnect", sessionToken: obj.sessionToken };

    default:
      return null;
  }
}
