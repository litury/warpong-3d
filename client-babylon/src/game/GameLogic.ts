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

const INTERP_SPEED = 20;

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

  // Interpolation targets for online mode
  private targetBall: BallData = { x: 0, y: 0, vx: 0, vy: 0 };
  private targetLeftY = 0;
  private targetRightY = 0;
  private hasServerState = false;

  paddleSpeed = PADDLE_SPEED;
  paddleHeight = PADDLE_HEIGHT;

  onScore?: (leftScored: boolean) => void;
  onGameOver?: (leftWon: boolean) => void;
  onPaddleHit?: (isRight: boolean, hitY: number) => void;
  onWallBounce?: () => void;

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
      this.onWallBounce?.();
    } else if (b.y - BALL_SIZE / 2 < -wallBound) {
      b.vy = Math.abs(b.vy);
      b.y = -wallBound + BALL_SIZE / 2;
      this.onWallBounce?.();
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
    // Snap on score change or first update — no lerp, instant teleport
    const scoreChanged =
      scoreLeft !== this.score.left || scoreRight !== this.score.right;

    if (!this.hasServerState || scoreChanged) {
      this.ball.x = ballX;
      this.ball.y = ballY;
      this.ball.vx = ballVx;
      this.ball.vy = ballVy;
      this.leftPaddleY = leftY;
      this.rightPaddleY = rightY;
      this.hasServerState = true;
    }

    this.targetBall.x = ballX;
    this.targetBall.y = ballY;
    this.targetBall.vx = ballVx;
    this.targetBall.vy = ballVy;
    this.targetLeftY = leftY;
    this.targetRightY = rightY;
    this.score.left = scoreLeft;
    this.score.right = scoreRight;

    // Reconciliation: if client-predicted paddle drifted far from server, gently correct
    const RECONCILE_THRESHOLD = 30;
    const RECONCILE_RATE = 0.3;
    if (Math.abs(this.leftPaddleY - leftY) > RECONCILE_THRESHOLD) {
      this.leftPaddleY += (leftY - this.leftPaddleY) * RECONCILE_RATE;
    }
    if (Math.abs(this.rightPaddleY - rightY) > RECONCILE_THRESHOLD) {
      this.rightPaddleY += (rightY - this.rightPaddleY) * RECONCILE_RATE;
    }
  }

  /**
   * Client-side prediction for own paddle in online mode.
   * Apply local input immediately, server reconciliation happens in applyServerState.
   * Call BEFORE interpolate() each frame.
   */
  predictOwnPaddle(
    dt: number,
    mySide: "Left" | "Right",
    inputDir: number,
    touchTargetY: number | null,
  ) {
    const bound = ARENA_HEIGHT / 2 - WALL_INSET - this.paddleHeight / 2;
    const apply = (current: number): number => {
      if (touchTargetY !== null) {
        const diff = touchTargetY - current;
        const maxStep = this.paddleSpeed * dt;
        const step = Math.max(-maxStep, Math.min(maxStep, diff));
        return Math.max(-bound, Math.min(bound, current + step));
      }
      if (inputDir !== 0) {
        return Math.max(
          -bound,
          Math.min(bound, current + inputDir * this.paddleSpeed * dt),
        );
      }
      return current;
    };
    if (mySide === "Right") {
      this.rightPaddleY = apply(this.rightPaddleY);
    } else {
      this.leftPaddleY = apply(this.leftPaddleY);
    }
  }

  /** Smoothly move current positions toward server targets. Call every frame in online mode.
   *  Skips own paddle (it is client-predicted via predictOwnPaddle).
   */
  interpolate(dt: number, mySide: "Left" | "Right" | null) {
    // Extrapolate target by velocity so ball doesn't lag between server ticks
    this.targetBall.x += this.targetBall.vx * dt;
    this.targetBall.y += this.targetBall.vy * dt;

    const f = 1 - Math.exp(-INTERP_SPEED * dt);
    this.ball.x += (this.targetBall.x - this.ball.x) * f;
    this.ball.y += (this.targetBall.y - this.ball.y) * f;
    this.ball.vx = this.targetBall.vx;
    this.ball.vy = this.targetBall.vy;
    // Interpolate only opponent paddle; own paddle is owned by client prediction
    if (mySide !== "Left")
      this.leftPaddleY += (this.targetLeftY - this.leftPaddleY) * f;
    if (mySide !== "Right")
      this.rightPaddleY += (this.targetRightY - this.rightPaddleY) * f;
  }

  restart() {
    this.score = { left: 0, right: 0 };
    this.leftPaddleY = 0;
    this.rightPaddleY = 0;
    this.gameOver = false;
    this.hasServerState = false;
    this.resetBall(true);
  }
}
