import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { AppState, MechAnimState } from "./AppState";
import { ARENA_HEIGHT, PADDLE_HEIGHT } from "./config/gameConfig";
import {
  triggerShieldImpact,
  updateShieldTime,
} from "./game/EnergyShieldMaterial";
import type { GameLogic } from "./game/GameLogic";
import type { GameObjects } from "./game/GameScene";
import type { InputManager } from "./game/InputManager";
import type { LoadedMech } from "./game/MechLoader";
import type { SoundManager } from "./game/soundManager";
import type { ZombieManager } from "./game/ZombieManager";
import { processServerMessages } from "./network/sync";
import type { WsClient } from "./network/wsClient";
import type { UIManager } from "./UIManager";

const IDLE_DELAY = 0.1;
const BLEND_SPEED = 0.06;
const IDLE_BLEND_SPEED = 0.09;
const MECH_LERP_SPEED = 12;
const VELOCITY_SMOOTHING = 15;
const ANIM_STRIDE_SPEED = 200;
const MIN_MOVE_THRESHOLD = 1;

export function startRenderLoop(
  engine: Engine,
  scene: Scene,
  objects: GameObjects,
  logic: GameLogic,
  input: InputManager,
  ws: WsClient,
  zombieManager: ZombieManager,
  ui: UIManager,
  state: AppState,
  onStartGame: () => void,
  sound: SoundManager,
) {
  let prevBallVx = 0;
  let lastHitBy: "left" | "right" = "left";

  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    const now = performance.now() / 1000;

    // Update energy shield time uniforms
    updateShieldTime(objects.leftShieldMat, now);
    updateShieldTime(objects.rightShieldMat, now);

    if (state.mode === "online") {
      processServerMessages(ws, logic, state.playerSide, {
        onQueueJoined: () => ui.showWaiting(),
        onMatchFound: (side) => {
          sound.play("matchFound");
          state.playerSide = side;
          onStartGame();
        },
        onGameOver: (winner) => {
          const iWon = winner === state.playerSide;
          sound.play(iWon ? "victory" : "defeat");
          sound.playMusic("menu");
          ui.showGameOver(iWon ? "YOU WIN!" : "YOU LOSE!");
        },
        onOpponentDisconnected: () => ui.showGameOver("OPPONENT LEFT"),
        onScoreUpdate: () => ui.updateScore(logic),
      });

      if (state.playing && !logic.gameOver) {
        const dir = input.getDirection();
        const direction = dir > 0 ? "Up" : dir < 0 ? "Down" : "Idle";
        ws.send({ type: "PlayerInput", direction });
      }
    }

    if (state.mode === "solo" && state.playing) {
      logic.update(dt, input.getDirection(), input.getTouchWorldY());
    }

    if (state.playing) {
      // Detect paddle hits by ball velocity sign change → shield impact ripple
      const currVx = logic.ball.vx;
      const vehiclePos = objects.vehicle.root.position;
      if (prevBallVx < 0 && currVx > 0) {
        lastHitBy = "left";
        triggerShieldImpact(
          objects.leftShieldMat,
          objects.leftShield,
          new Vector3(vehiclePos.x, vehiclePos.y, vehiclePos.z),
          now,
        );
      } else if (prevBallVx > 0 && currVx < 0) {
        lastHitBy = "right";
        triggerShieldImpact(
          objects.rightShieldMat,
          objects.rightShield,
          new Vector3(vehiclePos.x, vehiclePos.y, vehiclePos.z),
          now,
        );
      }
      prevBallVx = currVx;

      objects.vehicle.flame.update(dt);
      syncPositions(objects, logic, state, dt);
      updateStrafeAnim(objects.leftMech, state.leftMech, dt, 1);
      updateStrafeAnim(objects.rightMech, state.rightMech, dt, -1);

      if (state.mode === "solo" && !logic.gameOver) {
        zombieManager.update(dt);
        const ballZ = -logic.ball.y;
        zombieManager.checkBallCollisions(logic.ball.x, ballZ, lastHitBy);
      }
    }

    ui.updateFps(engine.getFps());
    scene.render();
  });
}

const WHEEL_SPIN_FACTOR = 0.15;

function syncPositions(
  obj: GameObjects,
  logic: GameLogic,
  state: AppState,
  dt: number,
) {
  // Vehicle position (sits on ground)
  const root = obj.vehicle.root;
  root.position.x = logic.ball.x;
  root.position.z = -logic.ball.y;
  root.position.y = 7.5; // raise so wheels sit on floor (model origin is at center)

  // Vehicle faces movement direction
  const { vx, vy } = logic.ball;
  const speed = Math.sqrt(vx * vx + vy * vy);
  if (speed > 1) {
    root.rotation.y = Math.atan2(-vy, vx) - Math.PI / 2;
  }

  // Wheel spin proportional to speed
  for (const wheel of obj.vehicle.wheels) {
    wheel.rotation.x += speed * dt * WHEEL_SPIN_FACTOR;
  }

  // Shield = paddle. Clamp with margin so shield + glow stays inside arena walls.
  const shieldBound = ARENA_HEIGHT / 2 - PADDLE_HEIGHT / 2 - 10;
  const leftShieldZ = clamp(-logic.leftPaddleY, -shieldBound, shieldBound);
  const rightShieldZ = clamp(-logic.rightPaddleY, -shieldBound, shieldBound);
  obj.leftShield.position.z = leftShieldZ;
  obj.rightShield.position.z = rightShieldZ;

  // Мехи follow the CLAMPED shield position (shield is the paddle, mech follows it)
  const lerpFactor = 1 - Math.exp(-MECH_LERP_SPEED * dt);

  state.leftMech.visualZ += (leftShieldZ - state.leftMech.visualZ) * lerpFactor;
  obj.leftMech.root.position.z = state.leftMech.visualZ;

  state.rightMech.visualZ +=
    (rightShieldZ - state.rightMech.visualZ) * lerpFactor;
  obj.rightMech.root.position.z = state.rightMech.visualZ;
}

function updateStrafeAnim(
  mech: LoadedMech,
  anim: MechAnimState,
  dt: number,
  flipDir: number,
) {
  // Визуальная скорость из дельты сглаженной позиции
  const deltaZ = anim.visualZ - anim.prevY;
  const instantVelocity = dt > 0 ? Math.abs(deltaZ) / dt : 0;

  // Сглаживаем velocity (frame-rate independent)
  const vLerp = 1 - Math.exp(-VELOCITY_SMOOTHING * dt);
  anim.smoothVelocity += (instantVelocity - anim.smoothVelocity) * vLerp;

  // Направление из визуальной дельты (flipDir инвертирует для правого меха)
  const rawDir =
    Math.abs(deltaZ) > MIN_MOVE_THRESHOLD * dt ? (deltaZ < 0 ? 1 : -1) : 0;
  const dir = rawDir * flipDir;

  if (dir !== 0) {
    anim.idleTimer = 0;

    if (!anim.walking || anim.strafeDir !== dir) {
      mech.idleAnim.stop();
      mech.strafeLeftAnim.stop();
      mech.strafeRightAnim.stop();
      playWithBlend(dir > 0 ? mech.strafeRightAnim : mech.strafeLeftAnim);
      anim.walking = true;
      anim.strafeDir = dir;
    }

    const activeAnim =
      anim.strafeDir > 0 ? mech.strafeRightAnim : mech.strafeLeftAnim;
    activeAnim.speedRatio = clamp(
      anim.smoothVelocity / ANIM_STRIDE_SPEED,
      0.3,
      2.0,
    );
  } else if (anim.walking) {
    anim.idleTimer += dt;
    if (anim.idleTimer > IDLE_DELAY) {
      mech.strafeLeftAnim.stop();
      mech.strafeRightAnim.stop();
      playWithBlend(mech.idleAnim, IDLE_BLEND_SPEED);
      mech.idleAnim.speedRatio = 1;
      anim.walking = false;
      anim.strafeDir = 0;
    } else {
      // Замедляем анимацию при остановке
      const activeAnim =
        anim.strafeDir > 0 ? mech.strafeRightAnim : mech.strafeLeftAnim;
      activeAnim.speedRatio = clamp(
        anim.smoothVelocity / ANIM_STRIDE_SPEED,
        0.3,
        2.0,
      );
    }
  }

  anim.prevY = anim.visualZ;
}

function playWithBlend(ag: AnimationGroup, speed = BLEND_SPEED) {
  ag.enableBlending = true;
  ag.blendingSpeed = speed;
  ag.start(true);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
