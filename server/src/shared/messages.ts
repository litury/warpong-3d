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

export type QuickChatId = "gg" | "nice" | "wow" | "glhf" | "oops" | "rematch";

// Client → Server
export type ClientMessage =
  | { type: "JoinQueue" }
  | { type: "LeaveQueue" }
  | { type: "PlayerInput"; direction: PaddleDirection }
  | { type: "QuickChat"; chatId: QuickChatId }
  | { type: "BuyUpgrade"; upgradeId: string }
  | { type: "EquipCosmetic"; slot: "paddleColor" | "ballTrail"; itemId: string | null }
  | { type: "RewardCoins"; amount: number };

export type PaddleDirection = "Up" | "Down" | "Idle";

// Server → Client
export type ServerMessage =
  | { type: "PlayerSync"; coins: number; mmr: number; upgrades: Record<string, number>; paddleColor: string | null; ballTrail: string | null; totalOnlineWins: number; winStreak: number }
  | { type: "QueueJoined" }
  | { type: "MatchFound"; side: PlayerSide; opponentCosmetics: PlayerCosmetics; opponentUpgrades: PlayerUpgrades; opponentName: string; stake: number; mmr: number; opponentMmr: number; opponentCoins: number }
  | { type: "GameStateUpdate"; ball: BallState; leftPaddle: PaddleState; rightPaddle: PaddleState; score: ScoreState }
  | { type: "GameEvent"; event: GameEvent }
  | { type: "GameOver"; winner: PlayerSide; reward: number; mmr: number; mmrChange: number; coins: number }
  | { type: "OpponentDisconnected"; reward: number; coins: number }
  | { type: "OnlineCount"; count: number }
  | { type: "OpponentChat"; chatId: QuickChatId };

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
