import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BALL_INITIAL_SPEED,
  BALL_MAX_SPEED,
  BALL_SIZE,
  BALL_SPEED_INCREMENT,
  PADDLE_HEIGHT,
  PADDLE_MARGIN,
  PADDLE_SPEED,
  PADDLE_WIDTH,
  WALL_INSET,
  WIN_SCORE,
} from "../config/gameConfig";
import type { BallData, Score } from "../types";

export class GameLogic {
  ball: BallData = {
    x: 0,
    y: 0,
    vx: BALL_INITIAL_SPEED,
    vy: BALL_INITIAL_SPEED * 0.3,
  };
  leftPaddleY = 0;
  rightPaddleY = 0;
  score: Score = { left: 0, right: 0 };
  gameOver = false;

  paddleSpeed = PADDLE_SPEED;
  paddleHeight = PADDLE_HEIGHT;

  onScore?: (leftScored: boolean) => void;
  onGameOver?: (leftWon: boolean) => void;
  onPaddleHit?: (isRight: boolean, hitY: number) => void;

  update(dt: number, inputDir: number, touchWorldY: number | null) {
    if (this.gameOver) return;
    this.updateInput(dt, inputDir, touchWorldY);
    this.updateBall(dt);
    this.updateCollisions();
    this.updateScoring();
  }

  private updateInput(dt: number, dir: number, touchWorldY: number | null) {
    const bound = ARENA_HEIGHT / 2 - WALL_INSET - this.paddleHeight / 2;

    if (touchWorldY !== null) {
      this.leftPaddleY = Math.max(-bound, Math.min(bound, touchWorldY));
    } else if (dir !== 0) {
      this.leftPaddleY += dir * this.paddleSpeed * dt;
      this.leftPaddleY = Math.max(-bound, Math.min(bound, this.leftPaddleY));
    }

    // AI for right paddle
    this.rightPaddleY = this.updateAi(this.rightPaddleY, dt);
  }

  private updateAi(paddleY: number, dt: number): number {
    const bound = ARENA_HEIGHT / 2 - WALL_INSET - this.paddleHeight / 2;
    const aiSpeed = this.paddleSpeed * 0.85;
    const diff = this.ball.y - paddleY;
    const deadZone = 10;

    if (Math.abs(diff) > deadZone) {
      paddleY += Math.sign(diff) * aiSpeed * dt;
      paddleY = Math.max(-bound, Math.min(bound, paddleY));
    }
    return paddleY;
  }

  private updateBall(dt: number) {
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
  }

  private updateCollisions() {
    const wallBound = ARENA_HEIGHT / 2 - WALL_INSET;
    const b = this.ball;

    // Wall bounces
    if (b.y + BALL_SIZE / 2 > wallBound) {
      b.vy = -Math.abs(b.vy);
      b.y = wallBound - BALL_SIZE / 2;
    } else if (b.y - BALL_SIZE / 2 < -wallBound) {
      b.vy = Math.abs(b.vy);
      b.y = -wallBound + BALL_SIZE / 2;
    }

    // Left paddle
    const lpX = -ARENA_WIDTH / 2 + PADDLE_MARGIN;
    if (
      this.aabbCollision(
        b.x,
        b.y,
        BALL_SIZE,
        lpX,
        this.leftPaddleY,
        PADDLE_WIDTH,
        this.paddleHeight,
      )
    ) {
      const hitOffset = (b.y - this.leftPaddleY) / (this.paddleHeight / 2);
      const bounce = this.applyPaddleBounce(b.vx, b.vy, hitOffset, false);
      b.vx = bounce.vx;
      b.vy = bounce.vy;
      b.x = lpX + PADDLE_WIDTH / 2 + BALL_SIZE / 2 + 1;
      this.onPaddleHit?.(false, b.y);
    }

    // Right paddle
    const rpX = ARENA_WIDTH / 2 - PADDLE_MARGIN;
    if (
      this.aabbCollision(
        b.x,
        b.y,
        BALL_SIZE,
        rpX,
        this.rightPaddleY,
        PADDLE_WIDTH,
        this.paddleHeight,
      )
    ) {
      const hitOffset = (b.y - this.rightPaddleY) / (this.paddleHeight / 2);
      const bounce = this.applyPaddleBounce(b.vx, b.vy, hitOffset, true);
      b.vx = bounce.vx;
      b.vy = bounce.vy;
      b.x = rpX - PADDLE_WIDTH / 2 - BALL_SIZE / 2 - 1;
      this.onPaddleHit?.(true, b.y);
    }
  }

  private updateScoring() {
    const halfW = ARENA_WIDTH / 2;
    const b = this.ball;

    if (b.x < -halfW - BALL_SIZE) {
      this.score.right++;
      this.onScore?.(false);
      this.resetBall(false);
      this.checkGameOver();
    } else if (b.x > halfW + BALL_SIZE) {
      this.score.left++;
      this.onScore?.(true);
      this.resetBall(true);
      this.checkGameOver();
    }
  }

  checkGameOverPublic() {
    this.checkGameOver();
  }

  private checkGameOver() {
    if (this.score.left >= WIN_SCORE || this.score.right >= WIN_SCORE) {
      this.gameOver = true;
      this.onGameOver?.(this.score.left >= WIN_SCORE);
    }
  }

  private resetBall(goRight: boolean) {
    this.ball.x = 0;
    this.ball.y = 0;
    const dir = goRight ? 1 : -1;
    this.ball.vx = dir * BALL_INITIAL_SPEED;
    this.ball.vy = BALL_INITIAL_SPEED * 0.3;
  }

  private aabbCollision(
    ax: number,
    ay: number,
    aSize: number,
    bx: number,
    by: number,
    bWidth: number,
    bHeight: number,
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

  private applyPaddleBounce(
    vx: number,
    vy: number,
    hitOffset: number,
    isRightPaddle: boolean,
  ): { vx: number; vy: number } {
    const speed =
      Math.min(Math.sqrt(vx * vx + vy * vy), BALL_MAX_SPEED) +
      BALL_SPEED_INCREMENT;
    const angle = Math.max(-1, Math.min(1, hitOffset)) * (Math.PI / 4);
    const dirX = isRightPaddle ? -1 : 1;
    return {
      vx: dirX * speed * Math.cos(angle),
      vy: speed * Math.sin(angle),
    };
  }

  applyServerState(
    ballX: number,
    ballY: number,
    ballVx: number,
    ballVy: number,
    leftY: number,
    rightY: number,
    scoreLeft: number,
    scoreRight: number,
  ) {
    this.ball.x = ballX;
    this.ball.y = ballY;
    this.ball.vx = ballVx;
    this.ball.vy = ballVy;
    this.leftPaddleY = leftY;
    this.rightPaddleY = rightY;
    this.score.left = scoreLeft;
    this.score.right = scoreRight;
  }

  restart() {
    this.score = { left: 0, right: 0 };
    this.leftPaddleY = 0;
    this.rightPaddleY = 0;
    this.gameOver = false;
    this.resetBall(true);
  }
}
