import type { Server, ServerWebSocket } from "bun";
import type { PlayerData } from "../modules/gameSession";
import { getLeaderboard } from "../modules/db";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export function handleFetch(
  req: Request,
  server: Server,
  connectedSockets: Set<ServerWebSocket<PlayerData>>,
): Response | undefined {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/online-count") {
    return Response.json({ count: connectedSockets.size }, { headers: CORS_HEADERS });
  }

  if (url.pathname === "/leaderboard") {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);
    const lb = getLeaderboard(limit);
    return Response.json(lb, { headers: CORS_HEADERS });
  }

  const tempId = crypto.randomUUID();
  if (server.upgrade(req, { data: { sessionId: null, playerId: tempId, playerName: "", authenticated: false, cosmetics: null, upgrades: null, coins: 0, mmr: 1000 } })) {
    return;
  }

  return new Response("Pong WebSocket Server", { status: 200, headers: { "Access-Control-Allow-Origin": "*" } });
}
