const YANDEX_GAMES_SECRET = process.env.YANDEX_GAMES_SECRET ?? "";

/**
 * Verify a Yandex Games auth signature.
 * Dev mode (YANDEX_GAMES_SECRET not set): accept any uniqueId without verification.
 * Prod mode: verify HMAC-SHA256(secret, uniqueId) === signature.
 */
export async function verifyAuth(
  signature: string,
  uniqueId: string,
): Promise<boolean> {
  if (!YANDEX_GAMES_SECRET) {
    return true;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(YANDEX_GAMES_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(uniqueId),
  );
  const expected = Buffer.from(mac).toString("hex");
  return expected === signature;
}
