import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BALL_INITIAL_SPEED,
  BALL_SIZE,
  PADDLE_HEIGHT,
  PADDLE_MARGIN,
  PADDLE_SPEED,
  TICK_INTERVAL_MS,
  WALL_INSET,
  WIN_SCORE,
} from "../../../config";
import type {
  BallState,
  GameEvent,
  PaddleDirection,
  PlayerUpgrades,
  ScoreState,
} from "../../../shared";
import { checkPaddleCollision, checkWallCollisions } from "./collision";

const HALF_W = ARENA_WIDTH / 2;
const HALF_H = ARENA_HEIGHT / 2;

export interface SimulationState {
  ball: BallState;
  leftPaddleY: number;
  rightPaddleY: number;
  score: ScoreState;
  leftInput: PaddleDirection;
  rightInput: PaddleDirection;
  // Per-player stats
  leftPaddleSpeed: number;
  rightPaddleSpeed: number;
  leftPaddleHeight: number;
  rightPaddleHeight: number;
  ballInitialSpeed: number;
}

export interface TickResult {
  events: GameEvent[];
  gameOver: boolean;
  winner: "Left" | "Right" | null;
}

function computeStats(upgrades: PlayerUpgrades | null) {
  const u = upgrades ?? {
    paddleSpeedLevel: 0,
    paddleSizeLevel: 0,
    ballSpeedLevel: 0,
  };
  return {
    paddleSpeed: PADDLE_SPEED + u.paddleSpeedLevel * 50,
    paddleHeight: PADDLE_HEIGHT + u.paddleSizeLevel * 15,
    ballSpeedContrib: BALL_INITIAL_SPEED + u.ballSpeedLevel * 30,
  };
}

export function createInitialState(
  leftUpgrades: PlayerUpgrades | null,
  rightUpgrades: PlayerUpgrades | null,
): SimulationState {
  const left = computeStats(leftUpgrades);
  const right = computeStats(rightUpgrades);
  const ballInitialSpeed = Math.round(
    (left.ballSpeedContrib + right.ballSpeedContrib) / 2,
  );

  return {
    ball: { x: 0, y: 0, vx: ballInitialSpeed, vy: ballInitialSpeed * 0.5 },
    leftPaddleY: 0,
    rightPaddleY: 0,
    score: { left: 0, right: 0 },
    leftInput: "Idle",
    rightInput: "Idle",
    leftPaddleSpeed: left.paddleSpeed,
    rightPaddleSpeed: right.paddleSpeed,
    leftPaddleHeight: left.paddleHeight,
    rightPaddleHeight: right.paddleHeight,
    ballInitialSpeed,
  };
}

export function tick(state: SimulationState): TickResult {
  const dt = TICK_INTERVAL_MS / 1000;
  const events: GameEvent[] = [];

  // Move paddles
  movePaddle(state, "left", dt);
  movePaddle(state, "right", dt);

  // Move ball
  state.ball.x += state.ball.vx * dt;
  state.ball.y += state.ball.vy * dt;

  // Wall collisions
  if (checkWallCollisions(state.ball)) {
    events.push({ type: "BallHitWall" });
  }

  // Paddle collisions
  const leftPaddleX = -HALF_W + PADDLE_MARGIN;
  const rightPaddleX = HALF_W - PADDLE_MARGIN;

  if (
    checkPaddleCollision(
      state.ball,
      state.leftPaddleY,
      leftPaddleX,
      state.leftPaddleHeight,
    )
  ) {
    events.push({ type: "BallHitPaddle" });
  }
  if (
    checkPaddleCollision(
      state.ball,
      state.rightPaddleY,
      rightPaddleX,
      state.rightPaddleHeight,
    )
  ) {
    events.push({ type: "BallHitPaddle" });
  }

  // Scoring
  let gameOver = false;
  let winner: "Left" | "Right" | null = null;

  if (state.ball.x < -HALF_W - BALL_SIZE) {
    state.score.right += 1;
    events.push({ type: "PlayerScored", side: "Right" });
    resetBall(state, false);
  } else if (state.ball.x > HALF_W + BALL_SIZE) {
    state.score.left += 1;
    events.push({ type: "PlayerScored", side: "Left" });
    resetBall(state, true);
  }

  // Check game over
  if (state.score.left >= WIN_SCORE) {
    gameOver = true;
    winner = "Left";
  } else if (state.score.right >= WIN_SCORE) {
    gameOver = true;
    winner = "Right";
  }

  return { events, gameOver, winner };
}

function movePaddle(
  state: SimulationState,
  side: "left" | "right",
  dt: number,
): void {
  const input = side === "left" ? state.leftInput : state.rightInput;
  const speed =
    side === "left" ? state.leftPaddleSpeed : state.rightPaddleSpeed;
  const height =
    side === "left" ? state.leftPaddleHeight : state.rightPaddleHeight;
  const bound = HALF_H - WALL_INSET - height / 2;

  let direction = 0;
  if (input === "Up") direction = 1;
  if (input === "Down") direction = -1;

  if (side === "left") {
    state.leftPaddleY += direction * speed * dt;
    state.leftPaddleY = Math.max(-bound, Math.min(bound, state.leftPaddleY));
  } else {
    state.rightPaddleY += direction * speed * dt;
    state.rightPaddleY = Math.max(-bound, Math.min(bound, state.rightPaddleY));
  }
}

function resetBall(state: SimulationState, goRight: boolean): void {
  state.ball.x = 0;
  state.ball.y = 0;
  const dir = goRight ? 1 : -1;
  state.ball.vx = dir * state.ballInitialSpeed;
  state.ball.vy = state.ballInitialSpeed * 0.3;
}
