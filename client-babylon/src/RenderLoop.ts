import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import type { AppState } from "./AppState";
import type { UIManager } from "./UIManager";
import { BALL_SIZE } from "./config/gameConfig";
import type { GameLogic } from "./game/GameLogic";
import type { GameObjects } from "./game/GameScene";
import type { InputManager } from "./game/InputManager";
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
      state.prevLeftY = logic.leftPaddleY;
      state.prevRightY = logic.rightPaddleY;

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
  const rightMoving = Math.abs(logic.rightPaddleY - state.prevRightY) > 0.5;

  if (leftMoving) {
    state.leftIdleTimer = 0;
    if (!state.leftWalking) {
      obj.leftMech.idleAnim.stop();
      obj.leftMech.walkAnim.start(true);
      state.leftWalking = true;
    }
  } else if (state.leftWalking) {
    state.leftIdleTimer += dt;
    if (state.leftIdleTimer > IDLE_DELAY) {
      obj.leftMech.walkAnim.stop();
      obj.leftMech.idleAnim.start(true);
      state.leftWalking = false;
    }
  }

  if (leftMoving) {
    const targetY = dir < 0 ? 0 : Math.PI;
    obj.leftMech.root.rotation.y = lerpAngle(
      obj.leftMech.root.rotation.y,
      targetY,
      ROTATION_SPEED * dt,
    );
  } else {
    obj.leftMech.root.rotation.y = lerpAngle(
      obj.leftMech.root.rotation.y,
      LEFT_IDLE_FACING,
      ROTATION_SPEED * dt,
    );
  }

  if (rightMoving) {
    state.rightIdleTimer = 0;
    if (!state.rightWalking) {
      obj.rightMech.idleAnim.stop();
      obj.rightMech.walkAnim.start(true);
      state.rightWalking = true;
    }
  } else if (state.rightWalking) {
    state.rightIdleTimer += dt;
    if (state.rightIdleTimer > IDLE_DELAY) {
      obj.rightMech.walkAnim.stop();
      obj.rightMech.idleAnim.start(true);
      state.rightWalking = false;
    }
  }

  if (rightMoving) {
    const rightDir = logic.rightPaddleY > state.prevRightY ? 1 : -1;
    const targetY = rightDir < 0 ? 0 : Math.PI;
    obj.rightMech.root.rotation.y = lerpAngle(
      obj.rightMech.root.rotation.y,
      targetY,
      ROTATION_SPEED * dt,
    );
  } else {
    obj.rightMech.root.rotation.y = lerpAngle(
      obj.rightMech.root.rotation.y,
      RIGHT_IDLE_FACING,
      ROTATION_SPEED * dt,
    );
  }
}

function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return from + diff * Math.min(t, 1);
}
