import type { ServerMessage, PlayerSide, PlayerCosmetics, PlayerUpgrades, QuickChatId } from "../../shared/messages";
import type { Game } from "../game/game";
import { WsClient } from "./wsClient";

export interface MatchResult {
  playerSide: PlayerSide | null;
  winner: PlayerSide | null;
  opponentCosmetics: PlayerCosmetics | null;
  opponentUpgrades: PlayerUpgrades | null;
  opponentName: string | null;
  opponentCoins: number | null;
  stake: number | null;
  reward: number | null;
  coins: number | null;
  mmr: number | null;
  opponentMmr: number | null;
  mmrChange: number | null;
}

export interface PlayerSyncData {
  coins: number;
  mmr: number;
  upgrades: Record<string, number>;
  paddleColor: string | null;
  ballTrail: string | null;
  totalOnlineWins: number;
  winStreak: number;
}

export function processServerMessages(
  ws: WsClient,
  game: Game | null,
  matchResult: MatchResult,
  callbacks: {
    onPlayerSync?: (data: PlayerSyncData) => void;
    onQueueJoined?: () => void;
    onMatchFound?: (side: PlayerSide) => void;
    onGameOver?: (winner: PlayerSide) => void;
    onOpponentDisconnected?: () => void;
    onScoreUpdate?: (left: number, right: number) => void;
    onOnlineCount?: (count: number) => void;
    onOpponentChat?: (chatId: QuickChatId) => void;
  },
) {
  for (const msg of ws.drainInbox()) {
    switch (msg.type) {
      case "PlayerSync":
        callbacks.onPlayerSync?.(msg);
        break;

      case "QueueJoined":
        callbacks.onQueueJoined?.();
        break;

      case "MatchFound":
        matchResult.playerSide = msg.side;
        matchResult.opponentCosmetics = msg.opponentCosmetics;
        matchResult.opponentUpgrades = msg.opponentUpgrades;
        matchResult.opponentName = msg.opponentName;
        matchResult.opponentCoins = msg.opponentCoins;
        matchResult.stake = msg.stake;
        matchResult.mmr = msg.mmr;
        matchResult.opponentMmr = msg.opponentMmr;
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
        matchResult.reward = msg.reward;
        matchResult.coins = msg.coins;
        matchResult.mmr = msg.mmr;
        matchResult.mmrChange = msg.mmrChange;
        callbacks.onGameOver?.(msg.winner);
        break;

      case "OpponentDisconnected":
        matchResult.reward = msg.reward;
        matchResult.coins = msg.coins;
        callbacks.onOpponentDisconnected?.();
        break;

      case "OnlineCount":
        callbacks.onOnlineCount?.(msg.count);
        break;

      case "OpponentChat":
        callbacks.onOpponentChat?.(msg.chatId);
        break;

      case "GameEvent":
        if (game) game.handleGameEvent(msg.event);
        break;
    }
  }
}
