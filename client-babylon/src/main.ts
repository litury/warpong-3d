import { Engine } from "@babylonjs/core/Engines/engine";
import { AppState } from "./AppState";
import { startRenderLoop } from "./RenderLoop";
import { UIManager, queryUIElements } from "./UIManager";
import { GameLogic } from "./game/GameLogic";
import { createGameScene } from "./game/GameScene";
import { InputManager } from "./game/InputManager";
import { ZombieManager } from "./game/ZombieManager";
import { WsClient } from "./network/wsClient";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

async function main() {
  const engine = new Engine(canvas, true, { stencil: true });
  const { scene, objects, updateScoreboard } = await createGameScene(engine);

  const state = new AppState();
  const logic = new GameLogic();
  const input = new InputManager(canvas);
  const ws = new WsClient();
  const zombieManager = new ZombieManager(scene);
  const ui = new UIManager(queryUIElements(), updateScoreboard);

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

  ui.bindMenuButtons({
    state,
    logic,
    ws,
    zombieManager,
    onStartGame: startGame,
  });

  startRenderLoop(
    engine,
    scene,
    objects,
    logic,
    input,
    ws,
    zombieManager,
    ui,
    state,
    startGame,
  );

  window.addEventListener("resize", () => engine.resize());
}

main().catch(console.error);
