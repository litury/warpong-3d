import type { AppState } from "./AppState";
import type { GameLogic } from "./game/GameLogic";
import type { SoundManager } from "./game/soundManager";
import type { ZombieManager } from "./game/ZombieManager";
import type { WsClient } from "./network/wsClient";
import { t } from "./i18n";

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
  onlineCount: HTMLElement;
  matchesCount: HTMLElement;
  touchHint: HTMLElement;
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
    onlineCount: document.getElementById("online-count")!,
    matchesCount: document.getElementById("matches-count")!,
    touchHint: document.getElementById("touch-hint")!,
  };
}

const HINT_STORAGE_KEY = "warpong_hint_shown_count";
const HINT_MAX_SHOWS = 3;
const HINT_DURATION_MS = 2500;

export class UIManager {
  constructor(
    private ui: UIElements,
    private updateScoreboard: (left: number, right: number) => void,
    private sound: SoundManager,
  ) {}

  /** Show first-time touch hint overlay. Displays up to HINT_MAX_SHOWS times, then never again. */
  showTouchHint() {
    let count = 0;
    try {
      count = Number(localStorage.getItem(HINT_STORAGE_KEY) || "0");
    } catch {
      // localStorage unavailable (e.g. privacy mode) — just show without persistence
    }
    if (count >= HINT_MAX_SHOWS) return;
    try {
      localStorage.setItem(HINT_STORAGE_KEY, String(count + 1));
    } catch {
      // ignore
    }

    const el = this.ui.touchHint;
    el.textContent = t("touch_hint");
    el.style.display = "block";
    requestAnimationFrame(() => {
      el.style.opacity = "1";
    });

    let hidden = false;
    const hide = () => {
      if (hidden) return;
      hidden = true;
      el.style.opacity = "0";
      setTimeout(() => {
        el.style.display = "none";
      }, 300);
      window.removeEventListener("pointerdown", hide);
    };
    setTimeout(hide, HINT_DURATION_MS);
    window.addEventListener("pointerdown", hide, { once: true });
  }

  applyTranslations() {
    this.ui.loading.textContent = t("loading");
    (this.ui.menu.querySelector("h1") as HTMLElement).textContent = t("title");
    this.ui.btnSolo.textContent = t("solo");
    this.ui.btnOnline.textContent = t("online");
    this.ui.btnRestart.textContent = t("play_again");
  }

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
    this.ui.status.textContent = t("connecting");
  }

  showWaiting() {
    this.ui.status.textContent = t("waiting");
  }

  showQueueStatus(estimatedWaitSec: number) {
    if (estimatedWaitSec <= 0) {
      this.ui.status.textContent = t("matching");
    } else {
      const m = Math.floor(estimatedWaitSec / 60);
      const s = estimatedWaitSec % 60;
      const time = m > 0 ? `~${m}m ${s}s` : `~${s}s`;
      this.ui.status.textContent = `Searching for opponent... ${time}`;
    }
  }

  showQueueTimeout() {
    this.ui.status.textContent = t("no_opponent");
    setTimeout(() => {
      this.ui.status.style.display = "none";
      this.showMenu();
    }, 3000);
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
    this.ui.coins.textContent = `${t("coins")}: ${zombieManager.coins}`;
  }

  updateOnlineCount(count: number) {
    this.ui.onlineCount.textContent = `${t("online_count")}: ${count}`;
  }

  updateMatchesCount(count: number) {
    this.ui.matchesCount.textContent = `${t("matches_played")}: ${count}`;
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
      this.sound.play("uiClick");
      deps.state.mode = "solo";
      deps.onStartGame();
    });

    this.ui.btnOnline.addEventListener("click", () => {
      this.sound.play("uiClick");
      deps.state.mode = "online";
      deps.state.playerSide = null;
      this.showConnecting();
      deps.ws.joinQueue();
    });

    this.ui.btnRestart.addEventListener("click", () => {
      this.sound.play("uiClick");
      this.hideGameOver();
      if (deps.state.mode === "online") {
        deps.ws.close();
      }
      deps.logic.restart();
      deps.zombieManager.restart();
      deps.state.resetToMenu();
      this.sound.playMusic("menu");
      this.showMenu();
    });
  }
}
