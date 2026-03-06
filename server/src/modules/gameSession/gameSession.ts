import type { ServerWebSocket } from "bun";
import { TICK_INTERVAL_MS } from "../../config";
import type { ServerMessage, PaddleDirection, PlayerSide, PlayerCosmetics, PlayerUpgrades } from "../../shared";
import { createInitialState, tick, type SimulationState } from "./parts";

export interface PlayerConnection {
  ws: ServerWebSocket<PlayerData>;
  side: PlayerSide;
}

export interface PlayerData {
  sessionId: string | null;
  playerId: string;
  cosmetics: PlayerCosmetics | null;
  upgrades: PlayerUpgrades | null;
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

    this.send(this.leftPlayer, { type: "MatchFound", side: "Left", opponentCosmetics: leftCos, opponentUpgrades: leftUpg });
    this.send(this.rightPlayer, { type: "MatchFound", side: "Right", opponentCosmetics: rightCos, opponentUpgrades: rightUpg });

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

    this.send(opponent, { type: "OpponentDisconnected" });
    this.stop();
  }

  hasPlayer(playerId: string): boolean {
    return (
      this.leftPlayer.data.playerId === playerId ||
      this.rightPlayer.data.playerId === playerId
    );
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
      this.broadcast({ type: "GameOver", winner: result.winner });
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
