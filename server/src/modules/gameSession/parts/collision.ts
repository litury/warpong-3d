import {
  ARENA_HEIGHT,
  BALL_SIZE,
  BALL_SPEED_INCREMENT,
  BALL_MAX_SPEED,
  PADDLE_WIDTH,
} from "../../../config";
import type { BallState } from "../../../shared";

const WALL_THICKNESS = 5;
const HALF_H = ARENA_HEIGHT / 2;
const HALF_BALL = BALL_SIZE / 2;

export interface CollisionResult {
  ballHitWall: boolean;
  ballHitPaddle: boolean;
}

export function checkWallCollisions(ball: BallState): boolean {
  let hit = false;

  if (ball.y + HALF_BALL > HALF_H - WALL_THICKNESS) {
    ball.vy = -Math.abs(ball.vy);
    ball.y = HALF_H - WALL_THICKNESS - HALF_BALL;
    hit = true;
  } else if (ball.y - HALF_BALL < -HALF_H + WALL_THICKNESS) {
    ball.vy = Math.abs(ball.vy);
    ball.y = -HALF_H + WALL_THICKNESS + HALF_BALL;
    hit = true;
  }

  return hit;
}

export function checkPaddleCollision(
  ball: BallState,
  paddleY: number,
  paddleX: number,
  paddleHeight: number,
): boolean {
  if (!aabbCollision(ball.x, ball.y, BALL_SIZE, paddleX, paddleY, PADDLE_WIDTH, paddleHeight)) {
    return false;
  }

  const hitOffset = (ball.y - paddleY) / (paddleHeight / 2);
  const isRightPaddle = paddleX > 0;

  applyPaddleBounce(ball, hitOffset, isRightPaddle);

  // Push ball out of paddle
  if (paddleX < 0) {
    ball.x = paddleX + PADDLE_WIDTH / 2 + HALF_BALL + 1;
  } else {
    ball.x = paddleX - PADDLE_WIDTH / 2 - HALF_BALL - 1;
  }

  return true;
}

function applyPaddleBounce(ball: BallState, hitOffset: number, isRightPaddle: boolean): void {
  const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  const speed = Math.min(currentSpeed, BALL_MAX_SPEED) + BALL_SPEED_INCREMENT;
  const angle = Math.max(-1, Math.min(1, hitOffset)) * (Math.PI / 4);

  const dirX = isRightPaddle ? -1 : 1;

  ball.vx = dirX * speed * Math.cos(angle);
  ball.vy = speed * Math.sin(angle);
}

function aabbCollision(
  ax: number, ay: number, aSize: number,
  bx: number, by: number, bWidth: number, bHeight: number,
): boolean {
  const aHalf = aSize / 2;
  const bHalfW = bWidth / 2;
  const bHalfH = bHeight / 2;

  return (
    ax - aHalf < bx + bHalfW &&
    ax + aHalf > bx - bHalfW &&
    ay - aHalf < by + bHalfH &&
    ay + aHalf > by - bHalfH
  );
}
