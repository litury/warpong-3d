import { AnimatedSprite, Container, Graphics, Sprite } from "pixi.js";
import {
  ARENA_WIDTH, ARENA_HEIGHT, PADDLE_WIDTH, PADDLE_HEIGHT,
  PADDLE_SPEED, PADDLE_MARGIN, BALL_SIZE, BALL_INITIAL_SPEED,
  WIN_SCORE, WALL_INSET,
} from "../../config";
import { GameMode } from "../../config/states";
import type { GameEvent } from "../../shared/messages";
import { aabbCollision, applyPaddleBounce, updateAi, spawnTrailParticle, updateTrailParticles, spawnHitParticles, updateHitParticles, spawnGoalExplosion } from "./parts";
import type { TrailParticle, HitParticle } from "./parts";
import { checkScoring, resetBall } from "./scoring";
import type { Score, BallData } from "./scoring";
import { InputManager } from "./input";
import type { GameAssets } from "./assets";

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
  ball!: Sprite;
  leftPaddle!: Container;
  rightPaddle!: Container;
  leftShieldGfx!: Graphics;
  rightShieldGfx!: Graphics;
  leftShieldSprite!: Sprite;
  rightShieldSprite!: Sprite;
  leftMech!: AnimatedSprite;
  rightMech!: AnimatedSprite;
  topWall!: Graphics;
  bottomWall!: Graphics;
  centerLine!: Graphics;
  arenaBg!: Sprite;
  assets: GameAssets | null = null;

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
  private hitParticles: HitParticle[] = [];
  private trailContainer!: Container;
  private ballGlowGfx: Graphics | null = null;
  private input: InputManager;
  private _gameOver = false;

  // Screen shake
  private shakeTime = 0;
  private shakeDuration = 0;
  private shakeIntensity = 0;

  // Paddle deformation (shield bend)
  private leftBend = 0;
  private leftBendY = 0;
  private leftBendTime = 0;
  private rightBend = 0;
  private rightBendY = 0;
  private rightBendTime = 0;
  private static readonly BEND_DURATION = 0.3;

  // Mech animation
  private prevLeftPaddleY = 0;
  private prevRightPaddleY = 0;
  private leftMechWalking = false;
  private rightMechWalking = false;
  private leftWalkCooldown = 0;
  private rightWalkCooldown = 0;

  // Dust particles
  private dustParticles: { gfx: Graphics; vx: number; vy: number }[] = [];

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
    const hasAssets = this.assets != null;

    // Arena background
    if (hasAssets) {
      this.arenaBg = new Sprite(this.assets!.arenaBg);
      this.arenaBg.anchor.set(0.5);
      this.arenaBg.width = ARENA_WIDTH;
      this.arenaBg.height = ARENA_HEIGHT;
      this.arenaBg.scale.y = -Math.abs(this.arenaBg.scale.y); // fix Y-flip
      this.container.addChild(this.arenaBg);
    }

    // Trail container (behind game objects)
    this.trailContainer = new Container();
    this.container.addChild(this.trailContainer);

    // Center line
    this.centerLine = new Graphics();
    this.centerLine.rect(-1, -halfH, 2, ARENA_HEIGHT);
    this.centerLine.fill({ color: 0x333333, alpha: hasAssets ? 0 : 1 });
    this.container.addChild(this.centerLine);

    // Top & bottom walls (Graphics fallback, hidden when assets provide visual walls in arena_bg)
    this.topWall = new Graphics();
    this.topWall.rect(-halfW, -halfH, ARENA_WIDTH, WALL_INSET);
    this.topWall.fill({ color: 0x4d4d4d, alpha: hasAssets ? 0 : 1 });
    this.container.addChild(this.topWall);

    this.bottomWall = new Graphics();
    this.bottomWall.rect(-halfW, halfH - WALL_INSET, ARENA_WIDTH, WALL_INSET);
    this.bottomWall.fill({ color: 0x4d4d4d, alpha: hasAssets ? 0 : 1 });
    this.container.addChild(this.bottomWall);

    // Determine per-paddle color and height
    const isMyLeft = this.mode === GameMode.Solo || this.playerSide === "Left";
    const leftColor = isMyLeft ? this.paddleColor : this.opponentPaddleColor;
    const rightColor = isMyLeft ? this.opponentPaddleColor : this.paddleColor;
    const leftH = isMyLeft ? ph : this.opponentPaddleHeight;
    const rightH = isMyLeft ? this.opponentPaddleHeight : ph;

    const MECH_SIZE = 70;

    // Left paddle (container with mech + shield)
    this.leftPaddle = new Container();
    this.leftPaddle.x = -halfW + PADDLE_MARGIN;
    this.leftPaddle.y = 0;
    this.container.addChild(this.leftPaddle);

    if (hasAssets) {
      // Shadow under left mech
      const leftShadow = new Graphics();
      leftShadow.ellipse(0, -25, 25, 8);
      leftShadow.fill({ color: 0x000000, alpha: 0.3 });
      this.leftPaddle.addChild(leftShadow);

      this.leftMech = new AnimatedSprite(this.assets!.mechIdle);
      this.leftMech.anchor.set(0.5);
      this.leftMech.animationSpeed = 0.08;
      this.leftMech.height = MECH_SIZE;
      this.leftMech.scale.x = Math.abs(this.leftMech.scale.y); // keep proportional
      this.leftMech.scale.y = -Math.abs(this.leftMech.scale.y); // fix Y-flip
      // Left mech faces right (toward center) — default sprite orientation
      this.leftMech.x = -15;
      this.leftMech.play();
      this.leftPaddle.addChild(this.leftMech);
    }

    // Shield (sprite or graphics fallback)
    if (hasAssets) {
      this.leftShieldSprite = new Sprite(this.assets!.shieldDefault);
      this.leftShieldSprite.anchor.set(0.5);
      this.leftShieldSprite.width = PADDLE_WIDTH * 2;
      this.leftShieldSprite.height = leftH;
      this.leftShieldSprite.scale.y = -Math.abs(this.leftShieldSprite.scale.y); // fix Y-flip
      this.leftShieldSprite.x = PADDLE_WIDTH / 2;
      this.leftShieldSprite.alpha = 0.7;
      this.leftPaddle.addChild(this.leftShieldSprite);
    }
    this.leftShieldGfx = new Graphics();
    this.leftShieldGfx.rect(-PADDLE_WIDTH / 2, -leftH / 2, PADDLE_WIDTH, leftH);
    this.leftShieldGfx.fill({ color: leftColor, alpha: hasAssets ? 0 : 1 });
    this.leftPaddle.addChild(this.leftShieldGfx);

    // Right paddle (container with mech + shield)
    this.rightPaddle = new Container();
    this.rightPaddle.x = halfW - PADDLE_MARGIN;
    this.rightPaddle.y = 0;
    this.container.addChild(this.rightPaddle);

    if (hasAssets) {
      // Shadow under right mech
      const rightShadow = new Graphics();
      rightShadow.ellipse(0, -25, 25, 8);
      rightShadow.fill({ color: 0x000000, alpha: 0.3 });
      this.rightPaddle.addChild(rightShadow);

      this.rightMech = new AnimatedSprite(this.assets!.mechIdle);
      this.rightMech.anchor.set(0.5);
      this.rightMech.animationSpeed = 0.08;
      this.rightMech.height = MECH_SIZE;
      this.rightMech.scale.x = -Math.abs(this.rightMech.scale.y); // proportional + mirror
      this.rightMech.scale.y = -Math.abs(this.rightMech.scale.y); // fix Y-flip
      this.rightMech.x = 15;
      this.rightMech.play();
      this.rightPaddle.addChild(this.rightMech);
    }

    if (hasAssets) {
      this.rightShieldSprite = new Sprite(this.assets!.shieldDefault);
      this.rightShieldSprite.anchor.set(0.5);
      this.rightShieldSprite.width = PADDLE_WIDTH * 2;
      this.rightShieldSprite.height = rightH;
      this.rightShieldSprite.scale.x = -Math.abs(this.rightShieldSprite.scale.x); // mirror
      this.rightShieldSprite.scale.y = -Math.abs(this.rightShieldSprite.scale.y); // fix Y-flip
      this.rightShieldSprite.x = -PADDLE_WIDTH / 2;
      this.rightShieldSprite.alpha = 0.7;
      this.rightPaddle.addChild(this.rightShieldSprite);
    }
    this.rightShieldGfx = new Graphics();
    this.rightShieldGfx.rect(-PADDLE_WIDTH / 2, -rightH / 2, PADDLE_WIDTH, rightH);
    this.rightShieldGfx.fill({ color: rightColor, alpha: hasAssets ? 0 : 1 });
    this.rightPaddle.addChild(this.rightShieldGfx);

    // Ball glow (behind ball)
    if (this.ballGlow) {
      this.ballGlowGfx = new Graphics();
      this.ballGlowGfx.circle(0, 0, BALL_SIZE * 1.5);
      this.ballGlowGfx.fill({ color: 0xffffff, alpha: 0.15 });
      this.container.addChild(this.ballGlowGfx);
    }

    // Ball
    if (hasAssets) {
      this.ball = new Sprite(this.assets!.projectile);
      this.ball.anchor.set(0.5);
      this.ball.width = BALL_SIZE * 2;
      this.ball.height = BALL_SIZE * 2;
      this.ball.scale.y = -Math.abs(this.ball.scale.y); // fix Y-flip
    } else {
      const ballGfx = new Graphics();
      ballGfx.rect(-BALL_SIZE / 2, -BALL_SIZE / 2, BALL_SIZE, BALL_SIZE);
      ballGfx.fill({ color: 0xffffff });
      this.ball = ballGfx as unknown as Sprite;
    }
    this.container.addChild(this.ball);

    // Dust particles (atmosphere)
    if (hasAssets) {
      this.dustParticles = [];
      for (let i = 0; i < 18; i++) {
        const gfx = new Graphics();
        const size = 1.5 + Math.random() * 2;
        gfx.circle(0, 0, size);
        gfx.fill({ color: 0xc8a050, alpha: 0.1 + Math.random() * 0.2 });
        gfx.x = (Math.random() - 0.5) * ARENA_WIDTH;
        gfx.y = (Math.random() - 0.5) * ARENA_HEIGHT;
        this.container.addChild(gfx);
        this.dustParticles.push({
          gfx,
          vx: (Math.random() - 0.5) * 15,
          vy: (Math.random() - 0.5) * 10,
        });
      }
    }

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
    this.updateEffects(dt);
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
    this.updateTrails(1 / 60);
    this.updateEffects(1 / 60);
  }

  private updateSoloInput(dt: number) {
    const halfH = ARENA_HEIGHT / 2;
    const bound = halfH - WALL_INSET - this.stats.paddleHeight / 2;

    // Manual input
    let dir = this.input.getDirection();
    const touchY = this.input.getTouchY();
    if (touchY !== null) {
      const worldY = (0.5 - touchY) * ARENA_HEIGHT;
      this.leftPaddleY = worldY;
      dir = 0; // touch overrides keyboard
    }

    if (touchY === null && dir !== 0) {
      this.leftPaddleY += dir * this.stats.paddleSpeed * dt;
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
    const wallBound = halfH - WALL_INSET;
    const b = this.ballData;
    const ph = this.stats.paddleHeight;

    // Wall collisions (bounce at visual wall edge)
    if (b.y + BALL_SIZE / 2 > wallBound) {
      b.vy = -Math.abs(b.vy);
      b.y = wallBound - BALL_SIZE / 2;
    } else if (b.y - BALL_SIZE / 2 < -wallBound) {
      b.vy = Math.abs(b.vy);
      b.y = -wallBound + BALL_SIZE / 2;
    }

    // Left paddle collision
    const lpX = -ARENA_WIDTH / 2 + PADDLE_MARGIN;
    if (aabbCollision(b.x, b.y, BALL_SIZE, lpX, this.leftPaddleY, PADDLE_WIDTH, ph)) {
      const hitOffset = (b.y - this.leftPaddleY) / (ph / 2);
      const bounce = applyPaddleBounce(b.vx, b.vy, hitOffset, false);
      b.vx = bounce.vx;
      b.vy = bounce.vy;
      b.x = lpX + PADDLE_WIDTH / 2 + BALL_SIZE / 2 + 1;

      const isMyLeft = this.mode === GameMode.Solo || this.playerSide === "Left";
      const color = isMyLeft ? this.paddleColor : this.opponentPaddleColor;
      this.hitParticles.push(...spawnHitParticles(this.trailContainer, b.x, b.y, 1, color));
      this.triggerPaddleBend("left", hitOffset);
    }

    // Right paddle collision
    const rpX = ARENA_WIDTH / 2 - PADDLE_MARGIN;
    if (aabbCollision(b.x, b.y, BALL_SIZE, rpX, this.rightPaddleY, PADDLE_WIDTH, ph)) {
      const hitOffset = (b.y - this.rightPaddleY) / (ph / 2);
      const bounce = applyPaddleBounce(b.vx, b.vy, hitOffset, true);
      b.vx = bounce.vx;
      b.vy = bounce.vy;
      b.x = rpX - PADDLE_WIDTH / 2 - BALL_SIZE / 2 - 1;

      const isMyLeft = this.mode === GameMode.Solo || this.playerSide === "Left";
      const color = isMyLeft ? this.opponentPaddleColor : this.paddleColor;
      this.hitParticles.push(...spawnHitParticles(this.trailContainer, b.x, b.y, -1, color));
      this.triggerPaddleBend("right", hitOffset);
    }
  }

  private updateScoring() {
    const result = checkScoring(this.ballData, this.score);
    if (result.scored) {
      this.hitParticles.push(...spawnGoalExplosion(this.trailContainer, this.ballData.x, this.ballData.y));
      this.triggerShake();
      this.onScore?.(result.leftScored);

      resetBall(this.ballData, result.leftScored, this.stats.ballInitialSpeed);

      // Check game over
      if (this.score.left >= WIN_SCORE || this.score.right >= WIN_SCORE) {
        this._gameOver = true;
        this.onGameOver?.(this.score.left >= WIN_SCORE);
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

    // Mech walk animation
    if (this.assets) {
      this.updateMechAnimation(this.leftMech, this.leftPaddleY, this.prevLeftPaddleY, "left");
      this.updateMechAnimation(this.rightMech, this.rightPaddleY, this.prevRightPaddleY, "right");
      this.prevLeftPaddleY = this.leftPaddleY;
      this.prevRightPaddleY = this.rightPaddleY;

    }
  }

  private updateMechAnimation(mech: AnimatedSprite, currentY: number, prevY: number, side: "left" | "right") {
    const delta = Math.abs(currentY - prevY);
    const isMoving = delta > 0.5;
    const wasWalking = side === "left" ? this.leftMechWalking : this.rightMechWalking;
    const COOLDOWN = 0.1;
    const DT = 1 / 60;

    if (isMoving) {
      if (side === "left") this.leftWalkCooldown = COOLDOWN;
      else this.rightWalkCooldown = COOLDOWN;
    } else {
      if (side === "left") this.leftWalkCooldown = Math.max(0, this.leftWalkCooldown - DT);
      else this.rightWalkCooldown = Math.max(0, this.rightWalkCooldown - DT);
    }

    const cooldown = side === "left" ? this.leftWalkCooldown : this.rightWalkCooldown;
    const shouldWalk = isMoving || cooldown > 0;

    if (shouldWalk && !wasWalking) {
      const scaleX = mech.scale.x;
      const scaleY = mech.scale.y;
      mech.textures = this.assets!.mechWalk;
      mech.scale.x = scaleX;
      mech.scale.y = scaleY;
      mech.animationSpeed = Math.min(0.5, Math.max(0.2, delta * 0.08));
      mech.play();
      if (side === "left") this.leftMechWalking = true;
      else this.rightMechWalking = true;
    } else if (!shouldWalk && wasWalking) {
      const scaleX = mech.scale.x;
      const scaleY = mech.scale.y;
      mech.textures = this.assets!.mechIdle;
      mech.scale.x = scaleX;
      mech.scale.y = scaleY;
      mech.animationSpeed = 0.08;
      mech.play();
      if (side === "left") this.leftMechWalking = false;
      else this.rightMechWalking = false;
    } else if (shouldWalk && wasWalking && isMoving) {
      mech.animationSpeed = Math.min(0.5, Math.max(0.2, delta * 0.08));
    }
  }

  playGameOverAnimation(leftWon: boolean) {
    if (!this.assets) return;
    const winner = leftWon ? this.leftMech : this.rightMech;
    const loser = leftWon ? this.rightMech : this.leftMech;

    this.leftMechWalking = false;
    this.rightMechWalking = false;

    const ws = { x: winner.scale.x, y: winner.scale.y };
    winner.textures = this.assets.mechVictory;
    winner.scale.set(ws.x, ws.y);
    winner.loop = false;
    winner.animationSpeed = 0.08;
    winner.play();

    const ls = { x: loser.scale.x, y: loser.scale.y };
    loser.textures = this.assets.mechDefeat;
    loser.scale.set(ls.x, ls.y);
    loser.loop = false;
    loser.animationSpeed = 0.06;
    loser.play();
  }

  // --- Juice effects ---

  private triggerShake(intensity = 8, duration = 0.3) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTime = duration;
  }

  private triggerPaddleBend(side: "left" | "right", hitOffset: number, intensity = 6) {
    const bendDir = side === "left" ? 1 : -1;
    if (side === "left") {
      this.leftBend = bendDir * intensity;
      this.leftBendY = hitOffset;
      this.leftBendTime = Game.BEND_DURATION;
    } else {
      this.rightBend = bendDir * intensity;
      this.rightBendY = hitOffset;
      this.rightBendTime = Game.BEND_DURATION;
    }
  }

  private updateEffects(dt: number) {
    // Hit / goal particles
    this.hitParticles = updateHitParticles(this.hitParticles, dt);

    // Screen shake
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const frac = Math.max(0, this.shakeTime / this.shakeDuration);
      this.container.x = (Math.random() * 2 - 1) * this.shakeIntensity * frac;
      this.container.y = (Math.random() * 2 - 1) * this.shakeIntensity * frac;
      if (this.shakeTime <= 0) {
        this.container.x = 0;
        this.container.y = 0;
      }
    }

    // Paddle bend decay (damped spring)
    if (this.leftBendTime > 0) {
      this.leftBendTime -= dt;
      if (this.leftBendTime <= 0) this.leftBend = 0;
    }
    if (this.rightBendTime > 0) {
      this.rightBendTime -= dt;
      if (this.rightBendTime <= 0) this.rightBend = 0;
    }

    // Redraw shields if bending
    const isMyLeft = this.mode === GameMode.Solo || this.playerSide === "Left";
    const hasAssets = this.assets != null;
    if (this.leftBend !== 0 || this.leftBendTime > 0) {
      const color = isMyLeft ? this.paddleColor : this.opponentPaddleColor;
      const h = isMyLeft ? this.stats.paddleHeight : this.opponentPaddleHeight;
      const spring = this.springFactor(this.leftBendTime);
      this.redrawPaddle(this.leftShieldGfx, PADDLE_WIDTH, h, color, this.leftBend * spring, this.leftBendY, "left", hasAssets);
      // Shield sprite squeeze effect
      if (hasAssets && this.leftShieldSprite) {
        this.leftShieldSprite.scale.x = (PADDLE_WIDTH * 2 / this.assets!.shieldDefault.width) * (1 - Math.abs(spring) * 0.3);
      }
    } else if (hasAssets && this.leftShieldSprite) {
      this.leftShieldSprite.scale.x = PADDLE_WIDTH * 2 / this.assets!.shieldDefault.width;
    }
    if (this.rightBend !== 0 || this.rightBendTime > 0) {
      const color = isMyLeft ? this.opponentPaddleColor : this.paddleColor;
      const h = isMyLeft ? this.opponentPaddleHeight : this.stats.paddleHeight;
      const spring = this.springFactor(this.rightBendTime);
      this.redrawPaddle(this.rightShieldGfx, PADDLE_WIDTH, h, color, this.rightBend * spring, this.rightBendY, "right", hasAssets);
      if (hasAssets && this.rightShieldSprite) {
        this.rightShieldSprite.scale.x = -(PADDLE_WIDTH * 2 / this.assets!.shieldDefault.width) * (1 - Math.abs(spring) * 0.3);
      }
    } else if (hasAssets && this.rightShieldSprite) {
      this.rightShieldSprite.scale.x = -(PADDLE_WIDTH * 2 / this.assets!.shieldDefault.width);
    }

    // Dust particles drift
    const halfW = ARENA_WIDTH / 2;
    const halfH = ARENA_HEIGHT / 2;
    for (const dust of this.dustParticles) {
      dust.gfx.x += dust.vx * dt;
      dust.gfx.y += dust.vy * dt;
      if (dust.gfx.x < -halfW || dust.gfx.x > halfW) {
        dust.gfx.x = (Math.random() - 0.5) * ARENA_WIDTH;
        dust.gfx.y = (Math.random() - 0.5) * ARENA_HEIGHT;
      }
      if (dust.gfx.y < -halfH || dust.gfx.y > halfH) {
        dust.gfx.y = (Math.random() - 0.5) * ARENA_HEIGHT;
      }
    }
  }

  private springFactor(bendTime: number): number {
    if (bendTime <= 0) return 0;
    const t = 1 - (bendTime / Game.BEND_DURATION); // 0→1
    return Math.cos(t * Math.PI * 3) * Math.exp(-t * 4);
  }

  private redrawPaddle(gfx: Graphics, w: number, h: number, color: number, bendAmount: number, bendY: number, side: "left" | "right", hasAssets = false) {
    gfx.clear();
    const hw = w / 2;
    const hh = h / 2;
    const alpha = hasAssets ? 0 : 1;

    if (Math.abs(bendAmount) < 0.1) {
      gfx.rect(-hw, -hh, w, hh * 2);
      gfx.fill({ color, alpha });
      return;
    }

    // Inner edge = side facing ball; outer edge = side facing wall
    const innerX = side === "left" ? hw : -hw;
    const outerX = side === "left" ? -hw : hw;
    const cpY = bendY * hh;

    gfx.moveTo(outerX, -hh);
    gfx.lineTo(innerX, -hh);
    gfx.quadraticCurveTo(innerX + bendAmount, cpY, innerX, hh);
    gfx.lineTo(outerX, hh);
    gfx.closePath();
    gfx.fill({ color, alpha });
  }

  /** Handle server game events (online mode) */
  handleGameEvent(event: GameEvent) {
    switch (event.type) {
      case "BallHitPaddle": {
        const hitLeft = this.ballData.vx < 0;
        const side: "left" | "right" = hitLeft ? "left" : "right";
        const paddleY = hitLeft ? this.leftPaddleY : this.rightPaddleY;
        const hitOffset = Math.max(-1, Math.min(1, (this.ballData.y - paddleY) / (this.stats.paddleHeight / 2)));
        const isMyLeft = this.playerSide === "Left";
        const color = (hitLeft === isMyLeft) ? this.paddleColor : this.opponentPaddleColor;
        this.hitParticles.push(...spawnHitParticles(this.trailContainer, this.ballData.x, this.ballData.y, this.ballData.vx < 0 ? 1 : -1, color));
        this.triggerPaddleBend(side, hitOffset);
        break;
      }
      case "PlayerScored": {
        this.hitParticles.push(...spawnGoalExplosion(this.trailContainer, this.ballData.x, this.ballData.y));
        this.triggerShake();
        break;
      }
    }
  }

  get isGameOver(): boolean {
    return this._gameOver;
  }

  setGameOver() {
    this._gameOver = true;
  }

  destroy() {
    for (const p of this.trailParticles) p.gfx.destroy();
    for (const p of this.hitParticles) p.gfx.destroy();
    for (const d of this.dustParticles) d.gfx.destroy();
    this.trailParticles = [];
    this.hitParticles = [];
    this.dustParticles = [];
    this.container.destroy({ children: true });
  }
}
