import type { ServerWebSocket } from "bun";
import { TICK_INTERVAL_MS } from "../../config";
import type {
  PaddleDirection,
  PlayerCosmetics,
  PlayerSide,
  PlayerUpgrades,
  QuickChatId,
  ServerMessage,
} from "../../shared";
import { settleGame } from "../db";
import { type SimulationState, createInitialState, tick } from "./parts";

export interface PlayerConnection {
  ws: ServerWebSocket<PlayerData>;
  side: PlayerSide;
}

export interface PlayerData {
  sessionId: string | null;
  playerId: string;
  playerName: string;
  authenticated: boolean;
  cosmetics: PlayerCosmetics | null;
  upgrades: PlayerUpgrades | null;
  coins: number;
  mmr: number;
  /** True while STAKE coins are reserved (in queue or in match) */
  stakeReserved: boolean;
}

export const STAKE = 10;
export const STAKE_COMMISSION = 0.1;

// --- ELO ---
const K_FACTOR = 32;

function calcElo(
  winnerMmr: number,
  loserMmr: number,
): { winnerNew: number; loserNew: number; change: number } {
  const expected = 1 / (1 + 10 ** ((loserMmr - winnerMmr) / 400));
  const change = Math.round(K_FACTOR * (1 - expected));
  return {
    winnerNew: winnerMmr + change,
    loserNew: Math.max(0, loserMmr - change),
    change,
  };
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

  private defaultCosmetics: PlayerCosmetics = {
    paddleColor: 0xffffff,
    trailType: null,
    ballGlow: false,
  };
  private defaultUpgrades: PlayerUpgrades = {
    paddleSpeedLevel: 0,
    paddleSizeLevel: 0,
    ballSpeedLevel: 0,
  };

  start(): void {
    const leftCos = this.rightPlayer.data.cosmetics ?? this.defaultCosmetics;
    const rightCos = this.leftPlayer.data.cosmetics ?? this.defaultCosmetics;
    const leftUpg = this.rightPlayer.data.upgrades ?? this.defaultUpgrades;
    const rightUpg = this.leftPlayer.data.upgrades ?? this.defaultUpgrades;

    const leftMmr = this.leftPlayer.data.mmr;
    const rightMmr = this.rightPlayer.data.mmr;
    this.send(this.leftPlayer, {
      type: "MatchFound",
      side: "Left",
      opponentCosmetics: leftCos,
      opponentUpgrades: leftUpg,
      opponentName: this.rightPlayer.data.playerName,
      stake: STAKE,
      mmr: leftMmr,
      opponentMmr: rightMmr,
    });
    this.send(this.rightPlayer, {
      type: "MatchFound",
      side: "Right",
      opponentCosmetics: rightCos,
      opponentUpgrades: rightUpg,
      opponentName: this.leftPlayer.data.playerName,
      stake: STAKE,
      mmr: rightMmr,
      opponentMmr: leftMmr,
    });

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
      playerId === this.leftPlayer.data.playerId
        ? this.rightPlayer
        : this.leftPlayer;
    const disconnected =
      playerId === this.leftPlayer.data.playerId
        ? this.leftPlayer
        : this.rightPlayer;

    const { winReward, winnerNewCoins } = this.rewardPlayers(
      opponent,
      disconnected,
    );

    this.send(opponent, {
      type: "OpponentDisconnected",
      reward: winReward,
      coins: winnerNewCoins,
    });
    this.stop();
  }

  relayChat(playerId: string, chatId: QuickChatId): void {
    const opponent =
      playerId === this.leftPlayer.data.playerId
        ? this.rightPlayer
        : this.leftPlayer;
    this.send(opponent, { type: "OpponentChat", chatId });
  }

  hasPlayer(playerId: string): boolean {
    return (
      this.leftPlayer.data.playerId === playerId ||
      this.rightPlayer.data.playerId === playerId
    );
  }

  private rewardPlayers(
    winnerWs: ServerWebSocket<PlayerData>,
    loserWs: ServerWebSocket<PlayerData>,
  ): {
    winReward: number;
    elo: ReturnType<typeof calcElo>;
    winnerNewCoins: number;
    loserNewCoins: number;
  } {
    const winReward = Math.floor(STAKE * 2 * (1 - STAKE_COMMISSION));
    const winnerId = winnerWs.data.playerId;
    const loserId = loserWs.data.playerId;

    const elo = calcElo(winnerWs.data.mmr, loserWs.data.mmr);

    // Stakes already deducted at queue join. Winner gets the pot; loser delta is 0.
    const settled = settleGame(
      winnerId,
      loserId,
      elo.winnerNew,
      elo.loserNew,
      winReward,
      0,
    );

    winnerWs.data.mmr = elo.winnerNew;
    loserWs.data.mmr = elo.loserNew;
    winnerWs.data.coins = settled.winnerCoins;
    loserWs.data.coins = settled.loserCoins;
    winnerWs.data.stakeReserved = false;
    loserWs.data.stakeReserved = false;

    return {
      winReward,
      elo,
      winnerNewCoins: settled.winnerCoins,
      loserNewCoins: settled.loserCoins,
    };
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
      const winnerWs =
        result.winner === "Left" ? this.leftPlayer : this.rightPlayer;
      const loserWs =
        result.winner === "Left" ? this.rightPlayer : this.leftPlayer;

      const { winReward, elo, winnerNewCoins, loserNewCoins } =
        this.rewardPlayers(winnerWs, loserWs);

      const leftReward = result.winner === "Left" ? winReward : -STAKE;
      const rightReward = result.winner === "Right" ? winReward : -STAKE;
      const leftMmr = result.winner === "Left" ? elo.winnerNew : elo.loserNew;
      const rightMmr = result.winner === "Right" ? elo.winnerNew : elo.loserNew;
      const leftMmrChange = result.winner === "Left" ? elo.change : -elo.change;
      const rightMmrChange =
        result.winner === "Right" ? elo.change : -elo.change;
      const leftCoins =
        result.winner === "Left" ? winnerNewCoins : loserNewCoins;
      const rightCoins =
        result.winner === "Right" ? winnerNewCoins : loserNewCoins;

      this.send(this.leftPlayer, {
        type: "GameOver",
        winner: result.winner,
        reward: leftReward,
        mmr: leftMmr,
        mmrChange: leftMmrChange,
        coins: leftCoins,
      });
      this.send(this.rightPlayer, {
        type: "GameOver",
        winner: result.winner,
        reward: rightReward,
        mmr: rightMmr,
        mmrChange: rightMmrChange,
        coins: rightCoins,
      });
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
