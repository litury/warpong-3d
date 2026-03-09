// Direct calls to window.ysdk_* functions defined in yandex_sdk.js
// No wasm-bindgen needed — just call them!

declare global {
  interface Window {
    ysdk_init(): void;
    ysdk_is_ready(): boolean;
    ysdk_drain_inbox(): string[];
    ysdk_show_fullscreen_adv(): void;
    ysdk_show_rewarded_video(): void;
    ysdk_set_score(name: string, score: number): void;
    ysdk_get_leaderboard(name: string, top: number): void;
    ysdk_get_player(): void;
    ysdk_purchase(productId: string): void;
    ysdk_consume_purchase(token: string): void;
    ysdk_save_data(jsonStr: string): void;
    ysdk_load_data(): void;
  }
}

export interface SdkMessage {
  type: string;
  [key: string]: unknown;
}

export interface LeaderboardEntry {
  rank: number;
  score: number;
  name: string;
}

export interface PlayerInfo {
  name: string;
  id: string;
  signature: string;
  isAuthorized: boolean;
}

export class YandexSdk {
  ready = false;
  lang = "en";
  showingAd = false;
  player: PlayerInfo | null = null;
  leaderboardEntries: LeaderboardEntry[] = [];

  init() {
    try {
      window.ysdk_init();
    } catch {
      console.warn("[ysdk] init failed — SDK script not loaded");
    }
  }

  pollInbox(callbacks: {
    onInitOk?: (lang: string) => void;
    onRewardedGranted?: () => void;
    onAdClose?: () => void;
    onLeaderboardEntries?: (entries: LeaderboardEntry[]) => void;
    onPlayerInfo?: (info: PlayerInfo) => void;
    onLoadOk?: (data: string) => void;
    onPurchaseOk?: (productId: string, token: string) => void;
  }) {
    let msgs: string[];
    try {
      msgs = window.ysdk_drain_inbox();
    } catch {
      return;
    }

    for (const raw of msgs) {
      let msg: SdkMessage;
      try {
        msg = JSON.parse(raw);
      } catch {
        continue;
      }

      switch (msg.type) {
        case "init_ok":
          this.ready = true;
          this.lang = (msg.lang as string) || "en";
          callbacks.onInitOk?.(this.lang);
          window.ysdk_get_player();
          break;

        case "adv_close":
        case "adv_err":
          this.showingAd = false;
          callbacks.onAdClose?.();
          break;

        case "rewarded_granted":
          callbacks.onRewardedGranted?.();
          break;

        case "rewarded_close":
        case "rewarded_err":
          this.showingAd = false;
          callbacks.onAdClose?.();
          break;

        case "player_info":
          this.player = {
            name: msg.name as string,
            id: msg.id as string,
            signature: msg.signature as string,
            isAuthorized: msg.isAuthorized as boolean,
          };
          callbacks.onPlayerInfo?.(this.player);
          window.ysdk_load_data();
          break;

        case "lb_entries":
          this.leaderboardEntries = msg.entries as LeaderboardEntry[];
          callbacks.onLeaderboardEntries?.(this.leaderboardEntries);
          break;

        case "lb_score_ok":
          window.ysdk_get_leaderboard("default", 10);
          break;

        case "load_ok":
          callbacks.onLoadOk?.(msg.data as string);
          break;

        case "purchase_ok":
          callbacks.onPurchaseOk?.(msg.productId as string, msg.token as string);
          break;
      }
    }
  }

  showFullscreenAd() {
    if (!this.showingAd) {
      this.showingAd = true;
      window.ysdk_show_fullscreen_adv();
    }
  }

  showRewardedVideo() {
    if (!this.showingAd) {
      this.showingAd = true;
      window.ysdk_show_rewarded_video();
    }
  }

  submitScore(score: number) {
    window.ysdk_set_score("default", score);
  }

  purchase(productId: string) {
    window.ysdk_purchase(productId);
  }

  consumePurchase(token: string) {
    window.ysdk_consume_purchase(token);
  }

  saveData(jsonStr: string) {
    window.ysdk_save_data(jsonStr);
  }

  loadData() {
    window.ysdk_load_data();
  }
}
