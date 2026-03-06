import type { ServerMessage, PlayerSide, PlayerCosmetics, PlayerUpgrades } from "../../shared/messages";
import type { Game } from "../game/game";
import { WsClient } from "./wsClient";

export interface MatchResult {
  playerSide: PlayerSide | null;
  winner: PlayerSide | null;
  opponentCosmetics: PlayerCosmetics | null;
  opponentUpgrades: PlayerUpgrades | null;
}

export function processServerMessages(
  ws: WsClient,
  game: Game | null,
  matchResult: MatchResult,
  callbacks: {
    onQueueJoined?: () => void;
    onMatchFound?: (side: PlayerSide) => void;
    onGameOver?: (winner: PlayerSide) => void;
    onOpponentDisconnected?: () => void;
    onScoreUpdate?: (left: number, right: number) => void;
  },
) {
  for (const msg of ws.drainInbox()) {
    switch (msg.type) {
      case "QueueJoined":
        callbacks.onQueueJoined?.();
        break;

      case "MatchFound":
        matchResult.playerSide = msg.side;
        matchResult.opponentCosmetics = msg.opponentCosmetics;
        matchResult.opponentUpgrades = msg.opponentUpgrades;
        callbacks.onMatchFound?.(msg.side);
        break;

      case "GameStateUpdate":
        if (game) {
          game.applyServerState(
            msg.ball.x, msg.ball.y, msg.ball.vx, msg.ball.vy,
            msg.leftPaddle.y, msg.rightPaddle.y,
            msg.score.left, msg.score.right,
          );
          callbacks.onScoreUpdate?.(msg.score.left, msg.score.right);
        }
        break;

      case "GameOver":
        matchResult.winner = msg.winner;
        callbacks.onGameOver?.(msg.winner);
        break;

      case "OpponentDisconnected":
        callbacks.onOpponentDisconnected?.();
        break;

      case "GameEvent":
        // Sound effects could go here
        break;
    }
  }
}
