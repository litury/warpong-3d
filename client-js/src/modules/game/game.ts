import { Container, Graphics } from "pixi.js";
import {
  ARENA_WIDTH, ARENA_HEIGHT, PADDLE_WIDTH, PADDLE_HEIGHT,
  PADDLE_SPEED, PADDLE_MARGIN, BALL_SIZE, BALL_INITIAL_SPEED,
} from "../../config";
import { GameMode } from "../../config/states";
import { aabbCollision, applyPaddleBounce, updateAi, spawnTrailParticle, updateTrailParticles } from "./parts";
import type { TrailParticle } from "./parts";
import { checkScoring, resetBall } from "./scoring";
import type { Score, BallData } from "./scoring";
import { InputManager } from "./input";

export interface EffectiveStats {
  paddleSpeed: number;
  paddleHeight: number;
  ballInitialSpeed: number;
}

export interface PaddleColorConfig {
  color: number;
}

export class Game {
  container: Container;
  ball!: Graphics;
  leftPaddle!: Graphics;
  rightPaddle!: Graphics;
  topWall!: Graphics;
  bottomWall!: Graphics;
  centerLine!: Graphics;

  ballData: BallData = { x: 0, y: 0, vx: BALL_INITIAL_SPEED, vy: BALL_INITIAL_SPEED * 0.5 };
  leftPaddleY = 0;
  rightPaddleY = 0;
  score: Score = { left: 0, right: 0 };

  mode: GameMode = GameMode.Solo;
  playerSide: "Left" | "Right" | null = null;
  stats: EffectiveStats = { paddleSpeed: PADDLE_SPEED, paddleHeight: PADDLE_HEIGHT, ballInitialSpeed: BALL_INITIAL_SPEED };
  paddleColor = 0xffffff;
  opponentPaddleColor = 0xffffff;
  opponentPaddleHeight = PADDLE_HEIGHT;
  trailType: string | null = null;
  paddleSpeedLevel = 0;
  ballGlow = false;

  private trailParticles: TrailParticle[] = [];
  private trailContainer!: Container;
  private ballGlowGfx: Graphics | null = null;
  private input: InputManager;
  private _gameOver = false;

  onScore?: (leftScored: boolean) => void;
  onGameOver?: (leftWon: boolean) => void;

  constructor(parent: Container, input: InputManager) {
    this.container = new Container();
    parent.addChild(this.container);
    this.input = input;
  }

  setup() {
    const halfW = ARENA_WIDTH / 2;
    const halfH = ARENA_HEIGHT / 2;
    const ph = this.stats.paddleHeight;

    // Trail container (behind game objects)
    this.trailContainer = new Container();
    this.container.addChild(this.trailContainer);

    // Center line
    this.centerLine = new Graphics();
    this.centerLine.rect(-1, -halfH, 2, ARENA_HEIGHT);
    this.centerLine.fill({ color: 0x333333 });
    this.container.addChild(this.centerLine);

    // Top wall
    this.topWall = new Graphics();
    this.topWall.rect(-halfW, -halfH - 5, ARENA_WIDTH, 10);
    this.topWall.fill({ color: 0x4d4d4d });
    this.container.addChild(this.topWall);

    // Bottom wall
    this.bottomWall = new Graphics();
    this.bottomWall.rect(-halfW, halfH - 5, ARENA_WIDTH, 10);
    this.bottomWall.fill({ color: 0x4d4d4d });
    this.container.addChild(this.bottomWall);

    // Determine per-paddle color and height
    const isMyLeft = this.mode === GameMode.Solo || this.playerSide === "Left";
    const leftColor = isMyLeft ? this.paddleColor : this.opponentPaddleColor;
    const rightColor = isMyLeft ? this.opponentPaddleColor : this.paddleColor;
    const leftH = isMyLeft ? ph : this.opponentPaddleHeight;
    const rightH = isMyLeft ? this.opponentPaddleHeight : ph;

    // Left paddle
    this.leftPaddle = new Graphics();
    this.leftPaddle.rect(-PADDLE_WIDTH / 2, -leftH / 2, PADDLE_WIDTH, leftH);
    this.leftPaddle.fill({ color: leftColor });
    if (this.paddleSpeedLevel > 0 && isMyLeft) {
      this.leftPaddle.stroke({ width: 2 + this.paddleSpeedLevel, color: 0x00ccff, alpha: 0.2 + this.paddleSpeedLevel * 0.15 });
    }
    this.leftPaddle.x = -halfW + PADDLE_MARGIN;
    this.leftPaddle.y = 0;
    this.container.addChild(this.leftPaddle);

    // Right paddle
    this.rightPaddle = new Graphics();
    this.rightPaddle.rect(-PADDLE_WIDTH / 2, -rightH / 2, PADDLE_WIDTH, rightH);
    this.rightPaddle.fill({ color: rightColor });
    if (this.paddleSpeedLevel > 0 && !isMyLeft) {
      this.rightPaddle.stroke({ width: 2 + this.paddleSpeedLevel, color: 0x00ccff, alpha: 0.2 + this.paddleSpeedLevel * 0.15 });
    }
    this.rightPaddle.x = halfW - PADDLE_MARGIN;
    this.rightPaddle.y = 0;
    this.container.addChild(this.rightPaddle);

    // Ball glow (behind ball)
    if (this.ballGlow) {
      this.ballGlowGfx = new Graphics();
      this.ballGlowGfx.circle(0, 0, BALL_SIZE * 1.5);
      this.ballGlowGfx.fill({ color: 0xffffff, alpha: 0.15 });
      this.container.addChild(this.ballGlowGfx);
    }

    // Ball
    this.ball = new Graphics();
    this.ball.rect(-BALL_SIZE / 2, -BALL_SIZE / 2, BALL_SIZE, BALL_SIZE);
    this.ball.fill({ color: 0xffffff });
    this.container.addChild(this.ball);

    // Reset state
    this.score = { left: 0, right: 0 };
    this.leftPaddleY = 0;
    this.rightPaddleY = 0;
    this._gameOver = false;
    resetBall(this.ballData, true, this.stats.ballInitialSpeed);
  }

  update(dt: number) {
    if (this._gameOver) return;
    if (this.mode === GameMode.Online) return; // Online: server controls state

    this.updateSoloInput(dt);
    this.updateBallMovement(dt);
    this.updateCollisions();
    this.updateScoring();
    this.updateTrails(dt);
    this.syncGraphics();
  }

  /** Called by network sync in online mode */
  applyServerState(ballX: number, ballY: number, ballVx: number, ballVy: number,
                    leftY: number, rightY: number, scoreLeft: number, scoreRight: number) {
    this.ballData.x = ballX;
    this.ballData.y = ballY;
    this.ballData.vx = ballVx;
    this.ballData.vy = ballVy;
    this.leftPaddleY = leftY;
    this.rightPaddleY = rightY;
    this.score.left = scoreLeft;
    this.score.right = scoreRight;
    this.syncGraphics();
    this.updateTrails(1 / 60); // Approximate dt for trails
  }

  private updateSoloInput(dt: number) {
    const halfH = ARENA_HEIGHT / 2;
    const bound = halfH - this.stats.paddleHeight / 2 - 5;

    // Keyboard
    const dir = this.input.getDirection();
    if (dir !== 0) {
      this.leftPaddleY += dir * this.stats.paddleSpeed * dt;
    }

    // Touch
    const touchY = this.input.getTouchY();
    if (touchY !== null) {
      // Convert normalized (0=top, 1=bottom) to world Y (positive = up)
      const worldY = (0.5 - touchY) * ARENA_HEIGHT;
      this.leftPaddleY = worldY;
    }

    this.leftPaddleY = Math.max(-bound, Math.min(bound, this.leftPaddleY));

    // AI for right paddle
    this.rightPaddleY = updateAi(
      this.rightPaddleY, this.stats.paddleSpeed, this.stats.paddleHeight,
      this.ballData.y, dt,
    );
  }

  private updateBallMovement(dt: number) {
    this.ballData.x += this.ballData.vx * dt;
    this.ballData.y += this.ballData.vy * dt;
  }

  private updateCollisions() {
    const halfH = ARENA_HEIGHT / 2;
    const wallThickness = 5;
    const b = this.ballData;
    const ph = this.stats.paddleHeight;

    // Wall collisions
    if (b.y + BALL_SIZE / 2 > halfH - wallThickness) {
      b.vy = -Math.abs(b.vy);
      b.y = halfH - wallThickness - BALL_SIZE / 2;
    } else if (b.y - BALL_SIZE / 2 < -halfH + wallThickness) {
      b.vy = Math.abs(b.vy);
      b.y = -halfH + wallThickness + BALL_SIZE / 2;
    }

    // Left paddle collision
    const lpX = -ARENA_WIDTH / 2 + PADDLE_MARGIN;
    if (aabbCollision(b.x, b.y, BALL_SIZE, lpX, this.leftPaddleY, PADDLE_WIDTH, ph)) {
      const hitOffset = (b.y - this.leftPaddleY) / (ph / 2);
      const bounce = applyPaddleBounce(b.vx, b.vy, hitOffset, false);
      b.vx = bounce.vx;
      b.vy = bounce.vy;
      b.x = lpX + PADDLE_WIDTH / 2 + BALL_SIZE / 2 + 1;
    }

    // Right paddle collision
    const rpX = ARENA_WIDTH / 2 - PADDLE_MARGIN;
    if (aabbCollision(b.x, b.y, BALL_SIZE, rpX, this.rightPaddleY, PADDLE_WIDTH, ph)) {
      const hitOffset = (b.y - this.rightPaddleY) / (ph / 2);
      const bounce = applyPaddleBounce(b.vx, b.vy, hitOffset, true);
      b.vx = bounce.vx;
      b.vy = bounce.vy;
      b.x = rpX - PADDLE_WIDTH / 2 - BALL_SIZE / 2 - 1;
    }
  }

  private updateScoring() {
    const result = checkScoring(this.ballData, this.score);
    if (result.scored) {
      this.onScore?.(result.leftScored);
      resetBall(this.ballData, result.leftScored, this.stats.ballInitialSpeed);

      // Check game over
      if (this.score.left >= 5 || this.score.right >= 5) {
        this._gameOver = true;
        this.onGameOver?.(this.score.left >= 5);
      }
    }
  }

  private updateTrails(dt: number) {
    if (this.trailType) {
      const p = spawnTrailParticle(this.trailContainer, this.ball.x, this.ball.y, this.trailType);
      if (p) this.trailParticles.push(p);
    }
    this.trailParticles = updateTrailParticles(this.trailParticles, dt);
  }

  private syncGraphics() {
    this.ball.x = this.ballData.x;
    this.ball.y = this.ballData.y;
    if (this.ballGlowGfx) {
      this.ballGlowGfx.x = this.ballData.x;
      this.ballGlowGfx.y = this.ballData.y;
    }
    this.leftPaddle.y = this.leftPaddleY;
    this.rightPaddle.y = this.rightPaddleY;
  }

  get isGameOver(): boolean {
    return this._gameOver;
  }

  setGameOver() {
    this._gameOver = true;
  }

  destroy() {
    for (const p of this.trailParticles) p.gfx.destroy();
    this.trailParticles = [];
    this.container.destroy({ children: true });
  }
}
