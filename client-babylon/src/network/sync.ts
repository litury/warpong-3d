import type { ServerMessage, PlayerSide } from "../shared/messages";
import type { GameLogic } from "../game/GameLogic";
import type { WsClient } from "./wsClient";

export function processServerMessages(
  ws: WsClient,
  logic: GameLogic,
  playerSide: PlayerSide | null,
  callbacks: {
    onQueueJoined?: () => void;
    onMatchFound?: (side: PlayerSide) => void;
    onGameOver?: (winner: PlayerSide) => void;
    onOpponentDisconnected?: () => void;
    onScoreUpdate?: () => void;
    onOnlineCount?: (count: number) => void;
  },
) {
  const mirror = playerSide === "Right";

  for (const msg of ws.drainInbox()) {
    switch (msg.type) {
      case "QueueJoined":
        callbacks.onQueueJoined?.();
        break;

      case "MatchFound":
        callbacks.onMatchFound?.(msg.side);
        break;

      case "GameStateUpdate":
        if (mirror) {
          // Mirror X axis + swap paddles/scores so Right player sees themselves on the left (bottom)
          logic.applyServerState(
            -msg.ball.x, msg.ball.y, -msg.ball.vx, msg.ball.vy,
            msg.rightPaddle.y, msg.leftPaddle.y,
            msg.score.right, msg.score.left,
          );
        } else {
          logic.applyServerState(
            msg.ball.x, msg.ball.y, msg.ball.vx, msg.ball.vy,
            msg.leftPaddle.y, msg.rightPaddle.y,
            msg.score.left, msg.score.right,
          );
        }
        callbacks.onScoreUpdate?.();
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
