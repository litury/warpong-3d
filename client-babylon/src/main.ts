import { Engine } from "@babylonjs/core/Engines/engine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createGameScene } from "./game/GameScene";
import { GameLogic } from "./game/GameLogic";
import { InputManager } from "./game/InputManager";
import { ZombieManager } from "./game/ZombieManager";
import { WsClient } from "./network/wsClient";
import { AppState } from "./AppState";
import { queryUIElements, UIManager } from "./UIManager";
import { startRenderLoop } from "./RenderLoop";
import { triggerShieldImpact } from "./game/EnergyShieldMaterial";
import { preloadZombieAssets } from "./game/ZombieLoader";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

async function main() {
  const engine = new Engine(canvas, true, { stencil: true });
  const { scene, objects, shadowGen, updateScoreboard } = await createGameScene(engine);

  const state = new AppState();
  const logic = new GameLogic();
  const input = new InputManager(canvas);
  const ws = new WsClient();
  const zombieManager = new ZombieManager(scene, shadowGen);
  const ui = new UIManager(queryUIElements(), updateScoreboard);

  await preloadZombieAssets(scene);

  ui.hideLoading();
  ui.showMenu();

  function startGame() {
    ui.showGameUI();
    logic.restart();
    zombieManager.restart();
    ui.updateScore(logic);
    ui.updateCoins(zombieManager);
    state.resetForNewGame();
  }

  logic.onPaddleHit = (isRight, hitY) => {
    const mat = isRight ? objects.rightShieldMat : objects.leftShieldMat;
    const shield = isRight ? objects.rightShield : objects.leftShield;
    triggerShieldImpact(mat, shield, new Vector3(shield.position.x, 7.5, -hitY), performance.now() / 1000);
  };

  logic.onScore = () => ui.updateScore(logic);

  logic.onGameOver = (leftWon) => {
    if (state.mode === "solo") {
      ui.showGameOver(leftWon ? "YOU WIN!" : "YOU LOSE!");
    }
  };

  zombieManager.onZombieReachedMech = (side) => {
    if (side === "left") {
      logic.score.right++;
    } else {
      logic.score.left++;
    }
    ui.updateScore(logic);
    logic.checkGameOverPublic();
  };

  zombieManager.onZombieKilled = () => ui.updateCoins(zombieManager);

  ui.bindMenuButtons({ state, logic, ws, zombieManager, onStartGame: startGame });

  startRenderLoop(engine, scene, objects, logic, input, ws, zombieManager, ui, state, startGame);

  window.addEventListener("resize", () => engine.resize());
}

main().catch(console.error);
