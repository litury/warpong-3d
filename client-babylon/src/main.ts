import { Engine } from "@babylonjs/core/Engines/engine";
import { createGameScene } from "./game/GameScene";
import type { GameObjects } from "./game/GameScene";
import { GameLogic } from "./game/GameLogic";
import { InputManager } from "./game/InputManager";
import { BALL_SIZE } from "./config/gameConfig";
import { ZombieManager } from "./game/ZombieManager";
import { WsClient } from "./network/wsClient";
import { processServerMessages } from "./network/sync";
import type { PlayerSide } from "./shared/messages";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const hudEl = document.getElementById("hud")!;
const fpsEl = document.getElementById("fps")!;
const loadingEl = document.getElementById("loading")!;
const menuEl = document.getElementById("menu")!;
const statusEl = document.getElementById("status")!;
const gameOverEl = document.getElementById("game-over")!;
const resultTextEl = document.getElementById("result-text")!;
const btnSolo = document.getElementById("btn-solo")!;
const btnOnline = document.getElementById("btn-online")!;
const btnRestart = document.getElementById("btn-restart")!;
const coinsEl = document.getElementById("coins")!;

type GameMode = "solo" | "online";

async function main() {
  const engine = new Engine(canvas, true, { stencil: true });

  const { scene, objects, camera, updateScoreboard } = await createGameScene(engine);
  loadingEl.style.display = "none";
  menuEl.style.display = "block";

  const logic = new GameLogic();
  const input = new InputManager(canvas);
  const ws = new WsClient();
  const zombieManager = new ZombieManager(scene);

  let mode: GameMode = "solo";
  let playerSide: PlayerSide | null = null;
  let prevLeftY = 0;
  let prevRightY = 0;
  let leftWalking = false;
  let rightWalking = false;
  let leftIdleTimer = 0;
  let rightIdleTimer = 0;
  let playing = false;

  // --- Menu ---
  btnSolo.addEventListener("click", () => {
    mode = "solo";
    startGame();
  });

  btnOnline.addEventListener("click", () => {
    mode = "online";
    playerSide = null;
    menuEl.style.display = "none";
    statusEl.style.display = "block";
    statusEl.textContent = "Connecting...";
    ws.joinQueue();
  });

  btnRestart.addEventListener("click", () => {
    gameOverEl.style.display = "none";
    if (mode === "online") {
      ws.close();
    }
    logic.restart();
    zombieManager.restart();
    playing = false;
    playerSide = null;
    menuEl.style.display = "block";
    hudEl.style.display = "none";
  });

  function startGame() {
    menuEl.style.display = "none";
    statusEl.style.display = "none";
    gameOverEl.style.display = "none";
    hudEl.style.display = "block";
    logic.restart();
    zombieManager.restart();
    updateScoreUI();
    updateCoinsUI();
    prevLeftY = 0;
    prevRightY = 0;
    leftWalking = false;
    rightWalking = false;
    leftIdleTimer = 0;
    rightIdleTimer = 0;
    playing = true;
  }

  // --- Callbacks ---
  logic.onScore = () => updateScoreUI();

  logic.onGameOver = (leftWon) => {
    if (mode === "solo") {
      resultTextEl.textContent = leftWon ? "YOU WIN!" : "YOU LOSE!";
      gameOverEl.style.display = "block";
    }
  };

  zombieManager.onZombieReachedMech = (side) => {
    if (side === "left") {
      logic.score.right++;
    } else {
      logic.score.left++;
    }
    updateScoreUI();
    logic.checkGameOverPublic();
  };

  zombieManager.onZombieKilled = () => {
    updateCoinsUI();
  };

  // --- Render loop ---
  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;

    // Online: process server messages
    if (mode === "online") {
      processServerMessages(ws, logic, {
        onQueueJoined: () => {
          statusEl.textContent = "Waiting for opponent...";
        },
        onMatchFound: (side) => {
          playerSide = side;
          startGame();
        },
        onGameOver: (winner) => {
          const iWon = winner === playerSide;
          resultTextEl.textContent = iWon ? "YOU WIN!" : "YOU LOSE!";
          gameOverEl.style.display = "block";
        },
        onOpponentDisconnected: () => {
          resultTextEl.textContent = "OPPONENT LEFT";
          gameOverEl.style.display = "block";
        },
        onScoreUpdate: () => updateScoreUI(),
      });

      // Send input to server
      if (playing && !logic.gameOver) {
        const dir = input.getDirection();
        const direction = dir > 0 ? "Up" : dir < 0 ? "Down" : "Idle";
        ws.send({ type: "PlayerInput", direction });
      }
    }

    // Solo: run local logic
    if (mode === "solo" && playing) {
      logic.update(dt, input.getDirection(), input.getTouchWorldY());
    }

    // Sync 2D state → 3D positions
    if (playing) {
      syncPositions(objects);
      updateMechAnimations(objects, dt);
      prevLeftY = logic.leftPaddleY;
      prevRightY = logic.rightPaddleY;

      // Zombies: update + ball collisions
      if (mode === "solo" && !logic.gameOver) {
        zombieManager.update(dt);
        const ballZ = -logic.ball.y;
        zombieManager.checkBallCollisions(logic.ball.x, ballZ);
      }
    }

    fpsEl.textContent = `FPS: ${engine.getFps().toFixed(0)}`;
    scene.render();
  });

  function syncPositions(obj: GameObjects) {
    obj.ball.position.x = logic.ball.x;
    obj.ball.position.z = -logic.ball.y;
    obj.ball.position.y = BALL_SIZE / 2;

    obj.leftShield.position.z = -logic.leftPaddleY;
    obj.rightShield.position.z = -logic.rightPaddleY;

    obj.leftMech.root.position.z = -logic.leftPaddleY;
    obj.rightMech.root.position.z = -logic.rightPaddleY;
  }

  const ROTATION_SPEED = 8;
  const IDLE_DELAY = 0.1;
  const LEFT_IDLE_FACING = Math.PI / 2;
  const RIGHT_IDLE_FACING = -Math.PI / 2;

  function updateMechAnimations(obj: GameObjects, dt: number) {
    const dir = input.getDirection();
    const leftMoving = dir !== 0;
    const rightMoving = Math.abs(logic.rightPaddleY - prevRightY) > 0.5;

    // Left mech animation + idle delay
    if (leftMoving) {
      leftIdleTimer = 0;
      if (!leftWalking) {
        obj.leftMech.idleAnim.stop();
        obj.leftMech.walkAnim.start(true);
        leftWalking = true;
      }
    } else if (leftWalking) {
      leftIdleTimer += dt;
      if (leftIdleTimer > IDLE_DELAY) {
        obj.leftMech.walkAnim.stop();
        obj.leftMech.idleAnim.start(true);
        leftWalking = false;
      }
    }

    // Left mech rotation
    if (leftMoving) {
      const targetY = dir < 0 ? 0 : Math.PI;
      obj.leftMech.root.rotation.y = lerpAngle(obj.leftMech.root.rotation.y, targetY, ROTATION_SPEED * dt);
    } else {
      obj.leftMech.root.rotation.y = lerpAngle(obj.leftMech.root.rotation.y, LEFT_IDLE_FACING, ROTATION_SPEED * dt);
    }

    // Right mech animation (AI) + idle delay
    if (rightMoving) {
      rightIdleTimer = 0;
      if (!rightWalking) {
        obj.rightMech.idleAnim.stop();
        obj.rightMech.walkAnim.start(true);
        rightWalking = true;
      }
    } else if (rightWalking) {
      rightIdleTimer += dt;
      if (rightIdleTimer > IDLE_DELAY) {
        obj.rightMech.walkAnim.stop();
        obj.rightMech.idleAnim.start(true);
        rightWalking = false;
      }
    }

    // Right mech rotation (AI)
    if (rightMoving) {
      const rightDir = logic.rightPaddleY > prevRightY ? 1 : -1;
      const targetY = rightDir < 0 ? 0 : Math.PI;
      obj.rightMech.root.rotation.y = lerpAngle(obj.rightMech.root.rotation.y, targetY, ROTATION_SPEED * dt);
    } else {
      obj.rightMech.root.rotation.y = lerpAngle(obj.rightMech.root.rotation.y, RIGHT_IDLE_FACING, ROTATION_SPEED * dt);
    }
  }

  function lerpAngle(from: number, to: number, t: number): number {
    let diff = to - from;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return from + diff * Math.min(t, 1);
  }

  function updateScoreUI() {
    updateScoreboard(logic.score.left, logic.score.right);
  }

  function updateCoinsUI() {
    coinsEl.textContent = `Coins: ${zombieManager.coins}`;
  }

  window.addEventListener("resize", () => {
    engine.resize();
  });
}

main().catch(console.error);
