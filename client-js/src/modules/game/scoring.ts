import { ARENA_WIDTH, BALL_SIZE, BALL_INITIAL_SPEED } from "../../config";

export interface Score {
  left: number;
  right: number;
}

export interface BallData {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function checkScoring(ball: BallData, score: Score): { scored: boolean; leftScored: boolean } {
  const halfW = ARENA_WIDTH / 2;
  if (ball.x < -halfW - BALL_SIZE) {
    score.right++;
    return { scored: true, leftScored: false };
  }
  if (ball.x > halfW + BALL_SIZE) {
    score.left++;
    return { scored: true, leftScored: true };
  }
  return { scored: false, leftScored: false };
}

export function resetBall(ball: BallData, goRight: boolean, initialSpeed: number = BALL_INITIAL_SPEED) {
  ball.x = 0;
  ball.y = 0;
  const dir = goRight ? 1 : -1;
  ball.vx = dir * initialSpeed;
  ball.vy = initialSpeed * 0.3;
}
