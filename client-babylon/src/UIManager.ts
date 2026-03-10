import type { GameLogic } from "./game/GameLogic";
import type { WsClient } from "./network/wsClient";
import type { ZombieManager } from "./game/ZombieManager";
import type { AppState } from "./AppState";

export interface UIElements {
  hud: HTMLElement;
  fps: HTMLElement;
  loading: HTMLElement;
  menu: HTMLElement;
  status: HTMLElement;
  gameOver: HTMLElement;
  resultText: HTMLElement;
  btnSolo: HTMLElement;
  btnOnline: HTMLElement;
  btnRestart: HTMLElement;
  coins: HTMLElement;
}

export function queryUIElements(): UIElements {
  return {
    hud: document.getElementById("hud")!,
    fps: document.getElementById("fps")!,
    loading: document.getElementById("loading")!,
    menu: document.getElementById("menu")!,
    status: document.getElementById("status")!,
    gameOver: document.getElementById("game-over")!,
    resultText: document.getElementById("result-text")!,
    btnSolo: document.getElementById("btn-solo")!,
    btnOnline: document.getElementById("btn-online")!,
    btnRestart: document.getElementById("btn-restart")!,
    coins: document.getElementById("coins")!,
  };
}

export class UIManager {
  constructor(
    private ui: UIElements,
    private updateScoreboard: (left: number, right: number) => void,
  ) {}

  hideLoading() {
    this.ui.loading.style.display = "none";
  }

  showMenu() {
    this.ui.menu.style.display = "block";
  }

  showGameUI() {
    this.ui.menu.style.display = "none";
    this.ui.status.style.display = "none";
    this.ui.gameOver.style.display = "none";
    this.ui.hud.style.display = "block";
  }

  showConnecting() {
    this.ui.menu.style.display = "none";
    this.ui.status.style.display = "block";
    this.ui.status.textContent = "Connecting...";
  }

  showWaiting() {
    this.ui.status.textContent = "Waiting for opponent...";
  }

  showGameOver(text: string) {
    this.ui.status.style.display = "none";
    this.ui.resultText.textContent = text;
    this.ui.gameOver.style.display = "block";
  }

  showPaused(secondsLeft: number) {
    this.ui.status.style.display = "block";
    this.ui.status.textContent = `Opponent reconnecting... ${secondsLeft}s`;
  }

  hidePaused() {
    this.ui.status.style.display = "none";
  }

  hideGameOver() {
    this.ui.gameOver.style.display = "none";
    this.ui.hud.style.display = "none";
  }

  updateScore(logic: GameLogic) {
    this.updateScoreboard(logic.score.left, logic.score.right);
  }

  updateCoins(zombieManager: ZombieManager) {
    this.ui.coins.textContent = `Coins: ${zombieManager.coins}`;
  }

  updateFps(fps: number) {
    this.ui.fps.textContent = `FPS: ${fps.toFixed(0)}`;
  }

  bindMenuButtons(deps: {
    state: AppState;
    logic: GameLogic;
    ws: WsClient;
    zombieManager: ZombieManager;
    onStartGame: () => void;
  }) {
    this.ui.btnSolo.addEventListener("click", () => {
      deps.state.mode = "solo";
      deps.onStartGame();
    });

    this.ui.btnOnline.addEventListener("click", () => {
      deps.state.mode = "online";
      deps.state.playerSide = null;
      this.showConnecting();
      deps.ws.joinQueue();
    });

    this.ui.btnRestart.addEventListener("click", () => {
      this.hideGameOver();
      if (deps.state.mode === "online") {
        deps.ws.close();
      }
      deps.logic.restart();
      deps.zombieManager.restart();
      deps.state.resetToMenu();
      this.showMenu();
    });
  }
}
