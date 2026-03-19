import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import type { AppState, MechAnimState } from "./AppState";
import type { UIManager } from "./UIManager";
import { BALL_SIZE } from "./config/gameConfig";
import type { GameLogic } from "./game/GameLogic";
import type { GameObjects } from "./game/GameScene";
import type { InputManager } from "./game/InputManager";
import type { LoadedMech } from "./game/MechLoader";
import type { ZombieManager } from "./game/ZombieManager";
import { processServerMessages } from "./network/sync";
import type { WsClient } from "./network/wsClient";

const ROTATION_SPEED = 8;
const IDLE_DELAY = 0.1;
const LEFT_IDLE_FACING = Math.PI / 2;
const RIGHT_IDLE_FACING = -Math.PI / 2;

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
) {
  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;

    if (state.mode === "online") {
      processServerMessages(ws, logic, {
        onQueueJoined: () => ui.showWaiting(),
        onQueueStatus: (sec) => ui.showQueueStatus(sec),
        onQueueTimeout: () => ui.showQueueTimeout(),
        onMatchFound: (side) => {
          state.playerSide = side;
          onStartGame();
        },
        onGameOver: (winner) => {
          const iWon = winner === state.playerSide;
          ui.showGameOver(iWon ? "YOU WIN!" : "YOU LOSE!");
        },
        onOpponentDisconnected: () => ui.showGameOver("OPPONENT LEFT"),
        onScoreUpdate: () => ui.updateScore(logic),
        onGamePaused: (secondsLeft) => ui.showPaused(secondsLeft),
        onGameResumed: () => ui.hidePaused(),
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
      syncPositions(objects, logic);
      updateMechAnimations(objects, logic, input, state, dt);
      state.leftMech.prevY = logic.leftPaddleY;
      state.rightMech.prevY = logic.rightPaddleY;

      if (state.mode === "solo" && !logic.gameOver) {
        zombieManager.update(dt);
        const ballZ = -logic.ball.y;
        zombieManager.checkBallCollisions(logic.ball.x, ballZ);
      }
    }

    ui.updateFps(engine.getFps());
    scene.render();
  });
}

function syncPositions(obj: GameObjects, logic: GameLogic) {
  obj.ball.position.x = logic.ball.x;
  obj.ball.position.z = -logic.ball.y;
  obj.ball.position.y = BALL_SIZE / 2;

  obj.leftShield.position.z = -logic.leftPaddleY;
  obj.rightShield.position.z = -logic.rightPaddleY;

  obj.leftMech.root.position.z = -logic.leftPaddleY;
  obj.rightMech.root.position.z = -logic.rightPaddleY;
}

function updateMechAnimations(
  obj: GameObjects,
  logic: GameLogic,
  input: InputManager,
  state: AppState,
  dt: number,
) {
  const dir = input.getDirection();
  const leftMoving = dir !== 0;
  const leftDir = dir < 0 ? -1 : 1;
  updateMechAnimation(obj.leftMech, state.leftMech, leftMoving, leftDir, LEFT_IDLE_FACING, dt);

  const rightMoving = Math.abs(logic.rightPaddleY - state.rightMech.prevY) > 0.5;
  const rightDir = logic.rightPaddleY > state.rightMech.prevY ? 1 : -1;
  updateMechAnimation(obj.rightMech, state.rightMech, rightMoving, rightDir, RIGHT_IDLE_FACING, dt);
}

function updateMechAnimation(
  mech: LoadedMech,
  animState: MechAnimState,
  moving: boolean,
  direction: number,
  idleFacing: number,
  dt: number,
) {
  if (moving) {
    animState.idleTimer = 0;
    if (!animState.walking) {
      mech.idleAnim.stop();
      mech.walkAnim.start(true);
      animState.walking = true;
    }
  } else if (animState.walking) {
    animState.idleTimer += dt;
    if (animState.idleTimer > IDLE_DELAY) {
      mech.walkAnim.stop();
      mech.idleAnim.start(true);
      animState.walking = false;
    }
  }

  if (moving) {
    const targetY = direction < 0 ? 0 : Math.PI;
    mech.root.rotation.y = lerpAngle(mech.root.rotation.y, targetY, ROTATION_SPEED * dt);
  } else {
    mech.root.rotation.y = lerpAngle(mech.root.rotation.y, idleFacing, ROTATION_SPEED * dt);
  }
}

function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return from + diff * Math.min(t, 1);
}
