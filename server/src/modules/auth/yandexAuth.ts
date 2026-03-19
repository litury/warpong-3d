import { createHmac } from "node:crypto";

const YANDEX_SECRET = process.env.YANDEX_GAMES_SECRET;

if (!YANDEX_SECRET) {
  console.warn(
    "[auth] YANDEX_GAMES_SECRET is not set — running in trust mode, all signatures accepted",
  );
}

export function verifyYandexSignature(signature: string): {
  valid: boolean;
  playerData: unknown;
} {
  const parts = signature.split(".");
  if (parts.length !== 2) return { valid: false, playerData: null };

  const [sign, data] = parts;

  let decoded: string;
  try {
    decoded = Buffer.from(data, "base64").toString("utf8");
  } catch {
    return { valid: false, playerData: null };
  }

  let playerData: unknown;
  try {
    playerData = JSON.parse(decoded);
  } catch {
    return { valid: false, playerData: null };
  }

  // Trust mode: no secret → accept everything
  if (!YANDEX_SECRET) return { valid: true, playerData };

  const hmac = createHmac("sha256", YANDEX_SECRET)
    .update(decoded)
    .digest("base64");

  return { valid: sign === hmac, playerData };
}
