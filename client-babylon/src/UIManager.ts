import type { AppState } from "./AppState";
import type { GameLogic } from "./game/GameLogic";
import type { SoundManager } from "./game/soundManager";
import type { ZombieManager } from "./game/ZombieManager";
import type { WsClient } from "./network/wsClient";
import { t } from "./i18n";

export interface UIElements {
  hud: HTMLElement;
  loading: HTMLElement;
  menu: HTMLElement;
  status: HTMLElement;
  statusText: HTMLElement;
  gameOver: HTMLElement;
  resultText: HTMLElement;
  btnSolo: HTMLElement;
  btnOnline: HTMLElement;
  btnRestart: HTMLElement;
  btnCancelSearch: HTMLElement;
  coins: HTMLElement;
  onlineCount: HTMLElement;
  matchesCount: HTMLElement;
  touchHint: HTMLElement;
}

export function queryUIElements(): UIElements {
  return {
    hud: document.getElementById("hud")!,
    loading: document.getElementById("loading")!,
    menu: document.getElementById("menu")!,
    status: document.getElementById("status")!,
    statusText: document.getElementById("status-text")!,
    gameOver: document.getElementById("game-over")!,
    resultText: document.getElementById("result-text")!,
    btnSolo: document.getElementById("btn-solo")!,
    btnOnline: document.getElementById("btn-online")!,
    btnRestart: document.getElementById("btn-restart")!,
    btnCancelSearch: document.getElementById("btn-cancel-search")!,
    coins: document.getElementById("coins-hud")!,
    onlineCount: document.getElementById("online-count")!,
    matchesCount: document.getElementById("matches-count")!,
    touchHint: document.getElementById("touch-hint")!,
  };
}

const HINT_STORAGE_KEY = "warpong_hint_shown_count";
const HINT_MAX_SHOWS = 3;
const HINT_DURATION_MS = 2500;

/** iOS Safari often drops click; pointerup + touchstart + click with debounce. */
function bindPress(el: HTMLElement, handler: () => void) {
  let last = 0;
  const fire = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    if (now - last < 350) return;
    last = now;
    handler();
  };
  el.addEventListener("pointerup", fire);
  el.addEventListener("touchstart", fire, { passive: false });
  el.addEventListener("click", fire);
}

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
    this.ui.btnCancelSearch.textContent = t("cancel");
  }

  hideLoading() {
    this.ui.loading.style.display = "none";
  }

  showMenu() {
    this.ui.menu.style.display = "block";
    this.ui.status.style.display = "none";
    this.ui.btnCancelSearch.style.display = "none";
    this.ui.coins.style.display = "none";
  }

  showGameUI() {
    this.ui.menu.style.display = "none";
    this.ui.status.style.display = "none";
    this.ui.btnCancelSearch.style.display = "none";
    this.ui.gameOver.style.display = "none";
    this.ui.hud.style.display = "block";
    this.ui.coins.style.display = "block";
  }

  showConnecting() {
    this.ui.menu.style.display = "none";
    this.ui.status.style.display = "block";
    this.ui.statusText.textContent = t("connecting");
    this.ui.btnCancelSearch.style.display = "block";
  }

  showWaiting() {
    this.ui.status.style.display = "block";
    this.ui.statusText.textContent = t("waiting");
    this.ui.btnCancelSearch.style.display = "block";
  }

  showQueueStatus(estimatedWaitSec: number) {
    this.ui.status.style.display = "block";
    this.ui.btnCancelSearch.style.display = "block";
    if (estimatedWaitSec <= 0) {
      this.ui.statusText.textContent = t("matching");
    } else {
      const m = Math.floor(estimatedWaitSec / 60);
      const s = estimatedWaitSec % 60;
      const time = m > 0 ? `~${m}m ${s}s` : `~${s}s`;
      this.ui.statusText.textContent = `${t("searching")}... ${time}`;
    }
  }

  showQueueTimeout() {
    this.ui.statusText.textContent = t("no_opponent");
    this.ui.btnCancelSearch.style.display = "none";
    setTimeout(() => {
      this.ui.status.style.display = "none";
      this.showMenu();
    }, 3000);
  }

  showGameOver(text: string) {
    this.ui.status.style.display = "none";
    this.ui.btnCancelSearch.style.display = "none";
    this.ui.resultText.textContent = text;
    this.ui.gameOver.style.display = "block";
  }

  showPaused(secondsLeft: number) {
    this.ui.status.style.display = "block";
    this.ui.btnCancelSearch.style.display = "none";
    this.ui.statusText.textContent = `${t("opponent_reconnect")}... ${secondsLeft}s`;
  }

  hidePaused() {
    this.ui.status.style.display = "none";
  }

  hideGameOver() {
    this.ui.gameOver.style.display = "none";
    this.ui.hud.style.display = "none";
    this.ui.coins.style.display = "none";
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

  bindMenuButtons(deps: {
    state: AppState;
    logic: GameLogic;
    ws: WsClient;
    zombieManager: ZombieManager;
    onStartGame: () => void;
  }) {
    bindPress(this.ui.btnSolo, () => {
      this.sound.play("uiClick");
      deps.state.mode = "solo";
      deps.onStartGame();
    });

    bindPress(this.ui.btnOnline, () => {
      this.sound.play("uiClick");
      deps.state.mode = "online";
      deps.state.playerSide = null;
      this.showConnecting();
      deps.ws.joinQueue();
    });

    bindPress(this.ui.btnCancelSearch, () => {
      this.sound.play("uiClick");
      deps.ws.leaveQueue();
      deps.state.resetToMenu();
      this.showMenu();
    });

    bindPress(this.ui.btnRestart, () => {
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
