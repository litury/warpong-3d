import type { ServerWebSocket } from "bun";
import { TICK_INTERVAL_MS } from "../../config";
import type { ServerMessage, PaddleDirection, PlayerSide, PlayerCosmetics, PlayerUpgrades, QuickChatId } from "../../shared";
import { createInitialState, tick, type SimulationState } from "./parts";
import { settleGame } from "../db";

export interface PlayerConnection {
  ws: ServerWebSocket<PlayerData>;
  side: PlayerSide;
}

export interface PlayerData {
  sessionId: string | null;
  playerId: string;
  playerName: string;
  cosmetics: PlayerCosmetics | null;
  upgrades: PlayerUpgrades | null;
  coins: number;
  mmr: number;
}

export const STAKE = 10;
export const STAKE_COMMISSION = 0.1;

// --- ELO ---
const K_FACTOR = 32;

function calcElo(winnerMmr: number, loserMmr: number): { winnerNew: number; loserNew: number; change: number } {
  const expected = 1 / (1 + Math.pow(10, (loserMmr - winnerMmr) / 400));
  const change = Math.round(K_FACTOR * (1 - expected));
  return { winnerNew: winnerMmr + change, loserNew: Math.max(0, loserMmr - change), change };
}

export class GameSession {
  readonly id: string;
  private state: SimulationState;
  private leftPlayer: ServerWebSocket<PlayerData>;
  private rightPlayer: ServerWebSocket<PlayerData>;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private onEnd: (sessionId: string) => void;

  constructor(
    left: ServerWebSocket<PlayerData>,
    right: ServerWebSocket<PlayerData>,
    onEnd: (sessionId: string) => void,
  ) {
    this.id = crypto.randomUUID();
    this.leftPlayer = left;
    this.rightPlayer = right;
    this.state = createInitialState(left.data.upgrades, right.data.upgrades);
    this.onEnd = onEnd;
  }

  private defaultCosmetics: PlayerCosmetics = { paddleColor: 0xffffff, trailType: null, ballGlow: false };
  private defaultUpgrades: PlayerUpgrades = { paddleSpeedLevel: 0, paddleSizeLevel: 0, ballSpeedLevel: 0 };

  start(): void {
    const leftCos = this.rightPlayer.data.cosmetics ?? this.defaultCosmetics;
    const rightCos = this.leftPlayer.data.cosmetics ?? this.defaultCosmetics;
    const leftUpg = this.rightPlayer.data.upgrades ?? this.defaultUpgrades;
    const rightUpg = this.leftPlayer.data.upgrades ?? this.defaultUpgrades;

    const leftMmr = this.leftPlayer.data.mmr;
    const rightMmr = this.rightPlayer.data.mmr;
    const leftCoins = this.leftPlayer.data.coins;
    const rightCoins = this.rightPlayer.data.coins;

    this.send(this.leftPlayer, { type: "MatchFound", side: "Left", opponentCosmetics: leftCos, opponentUpgrades: leftUpg, opponentName: this.rightPlayer.data.playerName, stake: STAKE, mmr: leftMmr, opponentMmr: rightMmr, opponentCoins: rightCoins });
    this.send(this.rightPlayer, { type: "MatchFound", side: "Right", opponentCosmetics: rightCos, opponentUpgrades: rightUpg, opponentName: this.leftPlayer.data.playerName, stake: STAKE, mmr: rightMmr, opponentMmr: leftMmr, opponentCoins: leftCoins });

    this.tickTimer = setInterval(() => this.gameTick(), TICK_INTERVAL_MS);
  }

  handleInput(playerId: string, direction: PaddleDirection): void {
    if (playerId === this.leftPlayer.data.playerId) {
      this.state.leftInput = direction;
    } else if (playerId === this.rightPlayer.data.playerId) {
      this.state.rightInput = direction;
    }
  }

  handleDisconnect(playerId: string): void {
    const opponent =
      playerId === this.leftPlayer.data.playerId ? this.rightPlayer : this.leftPlayer;

    const winReward = Math.floor(STAKE * 2 * (1 - STAKE_COMMISSION));

    const winnerId = opponent.data.playerId;
    const loserId = playerId;
    const elo = calcElo(opponent.data.mmr, this.getPlayerMmrById(loserId));

    // Persist to DB (atomic transaction)
    const result = settleGame(winnerId, loserId, elo.winnerNew, elo.loserNew, winReward, -STAKE);
    opponent.data.mmr = elo.winnerNew;
    opponent.data.coins = result.winnerCoins;

    this.send(opponent, { type: "OpponentDisconnected", reward: winReward, coins: result.winnerCoins });
    this.stop();
  }

  relayChat(playerId: string, chatId: QuickChatId): void {
    const opponent =
      playerId === this.leftPlayer.data.playerId ? this.rightPlayer : this.leftPlayer;
    this.send(opponent, { type: "OpponentChat", chatId });
  }

  hasPlayer(playerId: string): boolean {
    return (
      this.leftPlayer.data.playerId === playerId ||
      this.rightPlayer.data.playerId === playerId
    );
  }

  private getPlayerMmrById(playerId: string): number {
    if (playerId === this.leftPlayer.data.playerId) return this.leftPlayer.data.mmr;
    if (playerId === this.rightPlayer.data.playerId) return this.rightPlayer.data.mmr;
    return 1000;
  }

  private gameTick(): void {
    const result = tick(this.state);

    // Send events
    for (const event of result.events) {
      const msg: ServerMessage = { type: "GameEvent", event };
      this.broadcast(msg);
    }

    // Send state update
    this.broadcast({
      type: "GameStateUpdate",
      ball: { ...this.state.ball },
      leftPaddle: { y: this.state.leftPaddleY },
      rightPaddle: { y: this.state.rightPaddleY },
      score: { ...this.state.score },
    });

    // Check game over
    if (result.gameOver && result.winner) {
      const winReward = Math.floor(STAKE * 2 * (1 - STAKE_COMMISSION));
      const loseReward = -STAKE;
      const leftReward = result.winner === "Left" ? winReward : loseReward;
      const rightReward = result.winner === "Right" ? winReward : loseReward;

      const winnerId = result.winner === "Left" ? this.leftPlayer.data.playerId : this.rightPlayer.data.playerId;
      const loserId = result.winner === "Left" ? this.rightPlayer.data.playerId : this.leftPlayer.data.playerId;
      const winnerWs = result.winner === "Left" ? this.leftPlayer : this.rightPlayer;
      const loserWs = result.winner === "Left" ? this.rightPlayer : this.leftPlayer;

      const elo = calcElo(winnerWs.data.mmr, loserWs.data.mmr);

      // Persist to DB (atomic transaction)
      const settled = settleGame(winnerId, loserId, elo.winnerNew, elo.loserNew, winReward, loseReward);

      const leftMmr = result.winner === "Left" ? elo.winnerNew : elo.loserNew;
      const rightMmr = result.winner === "Right" ? elo.winnerNew : elo.loserNew;
      const leftMmrChange = result.winner === "Left" ? elo.change : -elo.change;
      const rightMmrChange = result.winner === "Right" ? elo.change : -elo.change;
      const leftCoins = result.winner === "Left" ? settled.winnerCoins : settled.loserCoins;
      const rightCoins = result.winner === "Right" ? settled.winnerCoins : settled.loserCoins;

      this.send(this.leftPlayer, { type: "GameOver", winner: result.winner, reward: leftReward, mmr: leftMmr, mmrChange: leftMmrChange, coins: leftCoins });
      this.send(this.rightPlayer, { type: "GameOver", winner: result.winner, reward: rightReward, mmr: rightMmr, mmrChange: rightMmrChange, coins: rightCoins });
      this.stop();
    }
  }

  private broadcast(msg: ServerMessage): void {
    this.send(this.leftPlayer, msg);
    this.send(this.rightPlayer, msg);
  }

  private send(ws: ServerWebSocket<PlayerData>, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Player already disconnected
    }
  }

  private stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.leftPlayer.data.sessionId = null;
    this.rightPlayer.data.sessionId = null;
    this.onEnd(this.id);
  }
}
