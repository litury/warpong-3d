export type PlayerSide = "Left" | "Right";

export type GameEvent =
  | { type: "BallHitPaddle" }
  | { type: "BallHitWall" }
  | { type: "PlayerScored"; side: PlayerSide };

export interface PlayerCosmetics {
  paddleColor: number;
  trailType: string | null;
  ballGlow: boolean;
}

export interface PlayerUpgrades {
  paddleSpeedLevel: number;
  paddleSizeLevel: number;
  ballSpeedLevel: number;
}

// Client → Server
export type ClientMessage =
  | { type: "JoinQueue"; cosmetics: PlayerCosmetics; upgrades: PlayerUpgrades }
  | { type: "LeaveQueue" }
  | { type: "PlayerInput"; direction: PaddleDirection };

export type PaddleDirection = "Up" | "Down" | "Idle";

// Server → Client
export type ServerMessage =
  | { type: "QueueJoined" }
  | { type: "MatchFound"; side: PlayerSide; opponentCosmetics: PlayerCosmetics; opponentUpgrades: PlayerUpgrades }
  | { type: "GameStateUpdate"; ball: BallState; leftPaddle: PaddleState; rightPaddle: PaddleState; score: ScoreState }
  | { type: "GameEvent"; event: GameEvent }
  | { type: "GameOver"; winner: PlayerSide }
  | { type: "OpponentDisconnected" };

export interface BallState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PaddleState {
  y: number;
}

export interface ScoreState {
  left: number;
  right: number;
}
