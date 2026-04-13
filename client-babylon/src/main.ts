import type { SDK } from "ysdk";
import { Engine } from "@babylonjs/core/Engines/engine";

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AppState } from "./AppState";
import { triggerShieldImpact } from "./game/EnergyShieldMaterial";
import { GameLogic } from "./game/GameLogic";
import { createGameScene } from "./game/GameScene";
import { InputManager } from "./game/InputManager";
import { SoundManager } from "./game/soundManager";
import { preloadZombieAssets } from "./game/ZombieLoader";
import { ZombieManager } from "./game/ZombieManager";
import { WsClient } from "./network/wsClient";
import { startRenderLoop } from "./RenderLoop";
import { queryUIElements, UIManager } from "./UIManager";
import { setLang, t } from "./i18n";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

/** Yandex Games SDK — null when running outside the platform (local dev) */
let ysdk: SDK | null = null;

async function initYandexSDK(): Promise<SDK | null> {
  if (typeof YaGames === "undefined") return null;
  try {
    return await YaGames.init();
  } catch {
    console.warn("Yandex SDK init failed — running in standalone mode");
    return null;
  }
}

async function main() {
  ysdk = await initYandexSDK();

  // Set language from Yandex SDK (requirement 2.14)
  const lang = ysdk?.environment.i18n.lang ?? "ru";
  setLang(lang);

  const engine = new Engine(canvas, true, { stencil: true });
  const { scene, objects, shadowGen, updateScoreboard } =
    await createGameScene(engine);

  const state = new AppState();
  const logic = new GameLogic();
  const input = new InputManager(canvas, scene);
  const ws = new WsClient();
  const sound = new SoundManager();
  const zombieManager = new ZombieManager(scene, shadowGen, sound);
  const ui = new UIManager(queryUIElements(), updateScoreboard, sound);

  ui.applyTranslations();
  ui.hideLoading();
  ui.showMenu();

  // Connect to WS early to receive online player count in menu
  ws.connectPassive();

  // Tell Yandex platform the game is fully loaded and ready
  ysdk?.features.LoadingAPI?.ready();

  // Unlock audio on first user click — creates AudioContext and loads sounds
  const unlockAudio = async () => {
    if (sound.isReady) return;
    sound.unlock();
    document.removeEventListener("click", unlockAudio);
    document.removeEventListener("touchstart", unlockAudio);
    await sound.waitForLoad();
    sound.playMusic("menu");
  };
  document.addEventListener("click", unlockAudio);
  document.addEventListener("touchstart", unlockAudio);

  let zombieAssetsReady = false;

  function startGame() {
    ui.showGameUI();
    logic.restart();
    zombieManager.restart();
    ui.updateScore(logic);
    ui.updateCoins(zombieManager);
    state.resetForNewGame();
    sound.playMusic("battle");
    ui.showTouchHint();
    ysdk?.features.GameplayAPI?.start();

    // Lazy-load zombie assets on first game start (4s spawn delay gives plenty of time)
    if (!zombieAssetsReady) {
      zombieAssetsReady = true;
      preloadZombieAssets(scene);
    }
  }

  logic.onWallBounce = () => sound.play("wallBounce");

  logic.onPaddleHit = (isRight, hitY) => {
    sound.play("paddleHit");
    sound.play("shieldHit");
    const mat = isRight ? objects.rightShieldMat : objects.leftShieldMat;
    const shield = isRight ? objects.rightShield : objects.leftShield;
    triggerShieldImpact(
      mat,
      shield,
      new Vector3(shield.position.x, 7.5, -hitY),
      performance.now() / 1000,
    );
  };

  logic.onScore = () => {
    sound.play("goal");
    sound.play("goalCrowd");
    ui.updateScore(logic);
  };

  logic.onGameOver = (leftWon) => {
    if (state.mode === "solo") {
      sound.play(leftWon ? "victory" : "defeat");
      sound.playMusic("menu");
      ui.showGameOver(leftWon ? t("you_win") : t("you_lose"));
      ysdk?.features.GameplayAPI?.stop();
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
    sound,
  );

  window.addEventListener("resize", () => engine.resize());
}

main().catch(console.error);
