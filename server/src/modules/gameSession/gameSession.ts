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
  authenticated: boolean;
  cosmetics: PlayerCosmetics | null;
  upgrades: PlayerUpgrades | null;
  coins: number;
  mmr: number;
}

export const STAKE = 10;
export const STAKE_COMMISSION = 0.1;
export const GRACE_PERIOD_MS = 15_000;

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

  // Grace period state
  private leftToken: string;
  private rightToken: string;
  private disconnectedSide: PlayerSide | null = null;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private graceCountdownTimer: ReturnType<typeof setInterval> | null = null;
  private graceStartedAt = 0;

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
    this.leftToken = crypto.randomUUID();
    this.rightToken = crypto.randomUUID();
  }

  private defaultCosmetics: PlayerCosmetics = { paddleColor: 0xffffff, trailType: null, ballGlow: false };
  private defaultUpgrades: PlayerUpgrades = { paddleSpeedLevel: 0, paddleSizeLevel: 0, ballSpeedLevel: 0 };

  getTokenForPlayer(playerId: string): string | null {
    if (playerId === this.leftPlayer.data.playerId) return this.leftToken;
    if (playerId === this.rightPlayer.data.playerId) return this.rightToken;
    return null;
  }

  get isPaused(): boolean {
    return this.disconnectedSide !== null;
  }

  start(): void {
    const leftCos = this.rightPlayer.data.cosmetics ?? this.defaultCosmetics;
    const rightCos = this.leftPlayer.data.cosmetics ?? this.defaultCosmetics;
    const leftUpg = this.rightPlayer.data.upgrades ?? this.defaultUpgrades;
    const rightUpg = this.leftPlayer.data.upgrades ?? this.defaultUpgrades;

    const leftMmr = this.leftPlayer.data.mmr;
    const rightMmr = this.rightPlayer.data.mmr;
    this.send(this.leftPlayer, { type: "MatchFound", side: "Left", opponentCosmetics: leftCos, opponentUpgrades: leftUpg, opponentName: this.rightPlayer.data.playerName, stake: STAKE, mmr: leftMmr, opponentMmr: rightMmr, sessionToken: this.leftToken });
    this.send(this.rightPlayer, { type: "MatchFound", side: "Right", opponentCosmetics: rightCos, opponentUpgrades: rightUpg, opponentName: this.leftPlayer.data.playerName, stake: STAKE, mmr: rightMmr, opponentMmr: leftMmr, sessionToken: this.rightToken });

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
    // If already in grace period for the OTHER player, the remaining player
    // also disconnected — end the game immediately with no winner rewards
    if (this.disconnectedSide !== null) {
      this.clearGraceTimers();
      this.stop();
      return;
    }

    const isLeft = playerId === this.leftPlayer.data.playerId;
    this.disconnectedSide = isLeft ? "Left" : "Right";
    const opponent = isLeft ? this.rightPlayer : this.leftPlayer;

    // Pause the game tick
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    // Stop the disconnected player's paddle
    if (isLeft) {
      this.state.leftInput = "Idle";
    } else {
      this.state.rightInput = "Idle";
    }

    // Notify opponent that game is paused
    const secondsLeft = Math.ceil(GRACE_PERIOD_MS / 1000);
    this.send(opponent, { type: "GamePaused", reason: "opponent_disconnected", secondsLeft });
    this.graceStartedAt = Date.now();

    // Send countdown updates every second
    this.graceCountdownTimer = setInterval(() => {
      const elapsed = Date.now() - this.graceStartedAt;
      const remaining = Math.ceil((GRACE_PERIOD_MS - elapsed) / 1000);
      if (remaining > 0) {
        this.send(opponent, { type: "GamePaused", reason: "opponent_disconnected", secondsLeft: remaining });
      }
    }, 1000);

    // Start grace period timer
    this.graceTimer = setTimeout(() => {
      this.graceExpired();
    }, GRACE_PERIOD_MS);
  }

  handleReconnect(playerId: string, sessionToken: string, newWs: ServerWebSocket<PlayerData>): boolean {
    // Validate token matches player
    const isLeft = playerId === this.leftPlayer.data.playerId;
    const expectedToken = isLeft ? this.leftToken : this.rightToken;
    if (sessionToken !== expectedToken) return false;

    // Must be in grace period for this side
    const expectedSide = isLeft ? "Left" : "Right";
    if (this.disconnectedSide !== expectedSide) return false;

    // Swap the WebSocket reference
    if (isLeft) {
      this.leftPlayer = newWs;
    } else {
      this.rightPlayer = newWs;
    }

    // Clear grace timers
    this.clearGraceTimers();
    this.disconnectedSide = null;

    // Generate new token for security
    if (isLeft) {
      this.leftToken = crypto.randomUUID();
    } else {
      this.rightToken = crypto.randomUUID();
    }
    const newToken = isLeft ? this.leftToken : this.rightToken;

    // Update ws.data
    newWs.data.sessionId = this.id;

    // Notify reconnected player with current game state + new token
    const opponent = isLeft ? this.rightPlayer : this.leftPlayer;
    this.send(newWs, {
      type: "MatchFound",
      side: expectedSide,
      opponentCosmetics: opponent.data.cosmetics ?? this.defaultCosmetics,
      opponentUpgrades: opponent.data.upgrades ?? this.defaultUpgrades,
      opponentName: opponent.data.playerName,
      stake: STAKE,
      mmr: newWs.data.mmr,
      opponentMmr: opponent.data.mmr,
      sessionToken: newToken,
    });

    // Send current state so client syncs immediately
    this.send(newWs, {
      type: "GameStateUpdate",
      ball: { ...this.state.ball },
      leftPaddle: { y: this.state.leftPaddleY },
      rightPaddle: { y: this.state.rightPaddleY },
      score: { ...this.state.score },
    });

    // Notify opponent that game resumes
    this.send(opponent, { type: "GameResumed" });

    // Resume game ticks
    this.tickTimer = setInterval(() => this.gameTick(), TICK_INTERVAL_MS);

    console.log(`Player ${playerId} reconnected to session ${this.id}`);
    return true;
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

  private graceExpired(): void {
    this.clearGraceTimers();

    const opponent =
      this.disconnectedSide === "Left" ? this.rightPlayer : this.leftPlayer;
    const disconnected =
      this.disconnectedSide === "Left" ? this.leftPlayer : this.rightPlayer;

    const { winReward, winnerNewCoins } = this.rewardPlayers(opponent, disconnected);

    this.send(opponent, { type: "OpponentDisconnected", reward: winReward, coins: winnerNewCoins });
    this.disconnectedSide = null;
    this.stop();
  }

  private clearGraceTimers(): void {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    if (this.graceCountdownTimer) {
      clearInterval(this.graceCountdownTimer);
      this.graceCountdownTimer = null;
    }
  }

  private rewardPlayers(
    winnerWs: ServerWebSocket<PlayerData>,
    loserWs: ServerWebSocket<PlayerData>,
  ): { winReward: number; elo: ReturnType<typeof calcElo>; winnerNewCoins: number; loserNewCoins: number } {
    const winReward = Math.floor(STAKE * 2 * (1 - STAKE_COMMISSION));
    const winnerId = winnerWs.data.playerId;
    const loserId = loserWs.data.playerId;

    const elo = calcElo(winnerWs.data.mmr, loserWs.data.mmr);

    // Persist to DB (atomic transaction)
    const settled = settleGame(winnerId, loserId, elo.winnerNew, elo.loserNew, winReward, -STAKE);

    winnerWs.data.mmr = elo.winnerNew;
    loserWs.data.mmr = elo.loserNew;
    winnerWs.data.coins = settled.winnerCoins;
    loserWs.data.coins = settled.loserCoins;

    return { winReward, elo, winnerNewCoins: settled.winnerCoins, loserNewCoins: settled.loserCoins };
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
      const winnerWs = result.winner === "Left" ? this.leftPlayer : this.rightPlayer;
      const loserWs = result.winner === "Left" ? this.rightPlayer : this.leftPlayer;

      const { winReward, elo, winnerNewCoins, loserNewCoins } = this.rewardPlayers(winnerWs, loserWs);

      const leftReward = result.winner === "Left" ? winReward : -STAKE;
      const rightReward = result.winner === "Right" ? winReward : -STAKE;
      const leftMmr = result.winner === "Left" ? elo.winnerNew : elo.loserNew;
      const rightMmr = result.winner === "Right" ? elo.winnerNew : elo.loserNew;
      const leftMmrChange = result.winner === "Left" ? elo.change : -elo.change;
      const rightMmrChange = result.winner === "Right" ? elo.change : -elo.change;
      const leftCoins = result.winner === "Left" ? winnerNewCoins : loserNewCoins;
      const rightCoins = result.winner === "Right" ? winnerNewCoins : loserNewCoins;

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
    this.clearGraceTimers();
    this.disconnectedSide = null;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.leftPlayer.data.sessionId = null;
    this.rightPlayer.data.sessionId = null;
    this.onEnd(this.id);
  }
}
