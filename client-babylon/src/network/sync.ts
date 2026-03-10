import type { ServerMessage, PlayerSide } from "../shared/messages";
import type { GameLogic } from "../game/GameLogic";
import type { WsClient } from "./wsClient";

export function processServerMessages(
  ws: WsClient,
  logic: GameLogic,
  callbacks: {
    onQueueJoined?: () => void;
    onQueueStatus?: (estimatedWaitSec: number, rangeWidth: number) => void;
    onQueueTimeout?: () => void;
    onMatchFound?: (side: PlayerSide) => void;
    onGameOver?: (winner: PlayerSide) => void;
    onOpponentDisconnected?: () => void;
    onScoreUpdate?: (left: number, right: number) => void;
    onOnlineCount?: (count: number) => void;
  },
) {
  for (const msg of ws.drainInbox()) {
    switch (msg.type) {
      case "QueueJoined":
        callbacks.onQueueJoined?.();
        break;

      case "QueueStatus":
        callbacks.onQueueStatus?.(msg.estimatedWaitSec, msg.rangeWidth);
        break;

      case "QueueTimeout":
        callbacks.onQueueTimeout?.();
        break;

      case "MatchFound":
        callbacks.onMatchFound?.(msg.side);
        break;

      case "GameStateUpdate":
        logic.applyServerState(
          msg.ball.x, msg.ball.y, msg.ball.vx, msg.ball.vy,
          msg.leftPaddle.y, msg.rightPaddle.y,
          msg.score.left, msg.score.right,
        );
        callbacks.onScoreUpdate?.(msg.score.left, msg.score.right);
        break;

      case "GameOver":
        logic.gameOver = true;
        callbacks.onGameOver?.(msg.winner);
        break;

      case "OpponentDisconnected":
        logic.gameOver = true;
        callbacks.onOpponentDisconnected?.();
        break;

      case "OnlineCount":
        callbacks.onOnlineCount?.(msg.count);
        break;

      default:
        break;
    }
  }
}
