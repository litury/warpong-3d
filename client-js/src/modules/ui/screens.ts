import { CATALOG } from "../shop/parts/catalog";
import { getLevel, UpgradeCategory, UpgradeId } from "../shop/parts/data";
import type { Wallet, OwnedUpgrades, EquippedCosmetics } from "../shop/parts/data";
import type { LeaderboardEntry } from "../yandex/sdk";
import { t } from "../../i18n";

// --- Screen management ---

const SCREENS = ["screen-menu", "screen-hud", "screen-game-over", "screen-lobby", "screen-shop", "screen-vs"] as const;

export function showScreen(id: string) {
  for (const s of SCREENS) {
    const el = document.getElementById(s);
    if (el) el.style.display = s === id ? "flex" : "none";
  }
}

export function hideAllScreens() {
  for (const s of SCREENS) {
    const el = document.getElementById(s);
    if (el) el.style.display = "none";
  }
}

// --- Menu ---

export function updateMenuOnlineCount(count: number) {
  const el = document.getElementById("menu-online-count");
  if (el) el.textContent = count > 0 ? t("menu.onlineCount", { count }) : "";
}

export function updateMenuCoins(coins: number) {
  const el = document.getElementById("menu-coins");
  if (el) el.textContent = t("shop.coins", { count: coins });
}

export function updateMenuMmr(mmr: number | null) {
  const el = document.getElementById("menu-mmr");
  if (el) el.textContent = mmr != null ? `${getRankLabel(mmr)} (${mmr})` : "";
}

// --- HUD ---

export function updateHudScore(left: number, right: number) {
  const el = document.getElementById("hud-score");
  if (el) el.textContent = `${left} : ${right}`;
}


export function updateHudStake(stake: number | null) {
  const el = document.getElementById("hud-stake");
  if (el) el.textContent = stake ? t("hud.stake", { amount: stake }) : "";
}

export function updateHudStreak(streak: number) {
  const el = document.getElementById("hud-streak");
  if (el) el.textContent = streak > 1 ? t("hud.streak", { count: streak }) : "";
}

// --- Game Over ---

export function setupGameOver(
  playerWon: boolean,
  coinsEarned: number,
  totalCoins: number,
  isOnline: boolean,
  leaderboard: LeaderboardEntry[],
  winStreak: number,
  mmr?: number | null,
  mmrChange?: number | null,
) {
  const titleEl = document.getElementById("gameover-title");
  if (titleEl) titleEl.textContent = playerWon ? t("gameover.win") : t("gameover.lose");

  const coinsEl = document.getElementById("gameover-coins");
  if (coinsEl) {
    if (isOnline) {
      const sign = coinsEarned >= 0 ? "+" : "";
      coinsEl.textContent = `${sign}${coinsEarned} ${t("gameover.coinsLabel")} (${t("gameover.total")}: ${totalCoins})`;
      coinsEl.style.color = coinsEarned >= 0 ? "#44ff44" : "#ff4444";
    } else {
      coinsEl.textContent = t("gameover.coins", { earned: coinsEarned, total: totalCoins });
      coinsEl.style.color = "#ffd700";
    }
  }

  // MMR display
  const mmrEl = document.getElementById("gameover-mmr");
  if (mmrEl) {
    if (isOnline && mmr != null && mmrChange != null) {
      const sign = mmrChange >= 0 ? "+" : "";
      mmrEl.textContent = `${getRankLabel(mmr)} (${mmr}) ${sign}${mmrChange}`;
      mmrEl.style.color = mmrChange >= 0 ? "#44ff44" : "#ff4444";
      mmrEl.style.display = "block";
    } else {
      mmrEl.style.display = "none";
    }
  }

  // Win streak
  const streakEl = document.getElementById("gameover-streak");
  if (streakEl) {
    if (isOnline && winStreak > 1) {
      streakEl.textContent = t("gameover.streak", { count: winStreak });
      streakEl.style.display = "block";
    } else {
      streakEl.style.display = "none";
    }
  }

  // Buttons
  const playAgainBtn = document.getElementById("btn-play-again");
  const newOpponentBtn = document.getElementById("btn-new-opponent");
  if (playAgainBtn) playAgainBtn.style.display = isOnline ? "none" : "block";
  if (newOpponentBtn) newOpponentBtn.style.display = isOnline ? "block" : "none";

  // Leaderboard
  const lbList = document.getElementById("leaderboard-list");
  if (lbList) {
    lbList.innerHTML = "";
    for (const entry of leaderboard.slice(0, 5)) {
      const li = document.createElement("li");
      li.textContent = `#${entry.rank} ${entry.name} — ${entry.score}`;
      lbList.appendChild(li);
    }
  }
}

// --- MMR / Rank ---

function getRankLabel(mmr: number): string {
  if (mmr >= 2000) return "Grand Master";
  if (mmr >= 1600) return "Master";
  if (mmr >= 1300) return "Diamond";
  if (mmr >= 1100) return "Gold";
  if (mmr >= 900) return "Silver";
  return "Bronze";
}

// --- VS Screen ---

export function showVsScreen(playerName: string, opponentName: string, stake: number, mmr?: number | null, opponentMmr?: number | null) {
  const playerEl = document.getElementById("vs-player");
  const opponentEl = document.getElementById("vs-opponent");
  const stakeEl = document.getElementById("vs-stake");
  const playerMmrEl = document.getElementById("vs-player-mmr");
  const opponentMmrEl = document.getElementById("vs-opponent-mmr");

  if (playerEl) playerEl.textContent = playerName;
  if (opponentEl) opponentEl.textContent = opponentName;
  if (stakeEl) stakeEl.textContent = t("vs.stake", { amount: stake });
  if (playerMmrEl) playerMmrEl.textContent = mmr != null ? `${getRankLabel(mmr)} (${mmr})` : "";
  if (opponentMmrEl) opponentMmrEl.textContent = opponentMmr != null ? `${getRankLabel(opponentMmr)} (${opponentMmr})` : "";

  showScreen("screen-vs");
}

// --- Lobby ---

export function updateLobbyStatus(text: string) {
  const el = document.getElementById("lobby-status");
  if (el) el.textContent = text;
}

export function updateLobbyStake(stake: number) {
  const el = document.getElementById("lobby-stake");
  if (el) el.textContent = t("lobby.stake", { amount: stake });
}

export function updateLobbyTimer(seconds: number) {
  const el = document.getElementById("lobby-timer");
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (el) el.textContent = t("lobby.timer", { time: `${mins}:${secs.toString().padStart(2, "0")}` });
}

export function updateLobbyTip(tip: string) {
  const el = document.getElementById("lobby-tip");
  if (el) el.textContent = tip;
}

// --- Shop ---

let activeShopTab = "gameplay";

export interface ShopCallbacks {
  onBuy: (id: string) => void;
  onEquip: (id: string) => void;
}

export function renderShop(
  wallet: Wallet,
  owned: OwnedUpgrades,
  equipped: EquippedCosmetics,
  callbacks: ShopCallbacks,
) {
  const coinsEl = document.getElementById("shop-coins");
  if (coinsEl) coinsEl.textContent = t("shop.coins", { count: wallet.coins });

  // Wire up tabs
  const tabs = document.querySelectorAll(".shop-tab");
  for (const tab of tabs) {
    (tab as HTMLElement).onclick = () => {
      activeShopTab = (tab as HTMLElement).dataset.tab ?? "gameplay";
      for (const t2 of tabs) t2.classList.toggle("active", t2 === tab);
      renderShopTab(wallet, owned, equipped, callbacks);
    };
    tab.classList.toggle("active", (tab as HTMLElement).dataset.tab === activeShopTab);
  }

  renderShopTab(wallet, owned, equipped, callbacks);
}

function renderShopTab(
  wallet: Wallet,
  owned: OwnedUpgrades,
  equipped: EquippedCosmetics,
  cb: ShopCallbacks,
) {
  const container = document.getElementById("shop-tab-content");
  if (!container) return;
  container.innerHTML = "";

  switch (activeShopTab) {
    case "gameplay":
      renderGameplayTab(container, wallet, owned, cb.onBuy);
      break;
    case "cosmetics":
      renderCosmeticsTab(container, wallet, owned, equipped, cb.onBuy, cb.onEquip);
      break;
  }
}

function renderGameplayTab(
  container: HTMLElement,
  wallet: Wallet,
  owned: OwnedUpgrades,
  onBuy: (id: string) => void,
) {
  const items = CATALOG.filter((u) => u.category === UpgradeCategory.Gameplay);
  for (const item of items) {
    const level = getLevel(owned, item.id);
    const maxed = level >= item.maxLevel;

    const div = document.createElement("div");
    div.className = "upgrade-item";

    const header = document.createElement("div");
    header.className = "upgrade-header";
    header.innerHTML = `<strong>${t(`shop.item.${item.id}.name`)}</strong>`;

    const btn = document.createElement("button");
    if (!maxed) {
      btn.textContent = t("shop.buy", { price: item.costs[level] });
      btn.className = "shop-btn buy";
      btn.onclick = () => onBuy(item.id);
    } else {
      btn.textContent = t("shop.max");
      btn.className = "shop-btn maxed";
      btn.disabled = true;
    }
    header.appendChild(btn);
    div.appendChild(header);

    const progress = document.createElement("div");
    progress.className = "upgrade-progress";
    const fill = document.createElement("div");
    fill.className = "upgrade-progress-fill";
    fill.style.width = `${(level / item.maxLevel) * 100}%`;
    progress.appendChild(fill);
    div.appendChild(progress);

    const desc = document.createElement("small");
    desc.style.color = "#888";
    desc.textContent = `${t(`shop.item.${item.id}.desc`)} (${level}/${item.maxLevel})`;
    div.appendChild(desc);

    container.appendChild(div);
  }
}

const PADDLE_COLORS: Record<string, string> = {
  [UpgradeId.ColorNeonGreen]: "#39ff14",
  [UpgradeId.ColorNeonBlue]: "#00bfff",
  [UpgradeId.ColorHotPink]: "#ff69b4",
  [UpgradeId.ColorGold]: "#ffd700",
};

function renderCosmeticsTab(
  container: HTMLElement,
  wallet: Wallet,
  owned: OwnedUpgrades,
  equipped: EquippedCosmetics,
  onBuy: (id: string) => void,
  onEquip: (id: string) => void,
) {
  // Paddle colors — grid
  const colorHeading = document.createElement("h3");
  colorHeading.className = "shop-category";
  colorHeading.textContent = t("shop.cat.PaddleColor");
  container.appendChild(colorHeading);

  const grid = document.createElement("div");
  grid.className = "cosmetic-grid";

  const colorItems = CATALOG.filter((u) => u.category === UpgradeCategory.PaddleColor);
  for (const item of colorItems) {
    const level = getLevel(owned, item.id);
    const isOwned = level >= item.maxLevel;
    const isEquipped = equipped.paddleColor === item.id;

    const card = document.createElement("div");
    card.className = `cosmetic-card${isEquipped ? " equipped" : isOwned ? " owned" : ""}`;

    const swatch = document.createElement("div");
    swatch.className = "card-swatch";
    swatch.style.background = PADDLE_COLORS[item.id] ?? "#fff";
    card.appendChild(swatch);

    const label = document.createElement("div");
    label.className = "card-label";
    label.textContent = t(`shop.item.${item.id}.name`);
    card.appendChild(label);

    const price = document.createElement("div");
    price.className = "card-price";
    if (isEquipped) {
      price.textContent = t("shop.equipped");
      price.style.color = "#4a4";
    } else if (isOwned) {
      price.textContent = t("shop.equip");
    } else {
      price.textContent = `${item.costs[0]}`;
    }
    card.appendChild(price);

    card.onclick = () => {
      if (isEquipped) return;
      if (isOwned) onEquip(item.id);
      else onBuy(item.id);
    };

    grid.appendChild(card);
  }
  container.appendChild(grid);

  // Ball trails + ball visual — list
  const trailItems = CATALOG.filter(
    (u) => u.category === UpgradeCategory.BallTrail || u.category === UpgradeCategory.BallVisual,
  );
  if (trailItems.length > 0) {
    const trailHeading = document.createElement("h3");
    trailHeading.className = "shop-category";
    trailHeading.textContent = t("shop.cat.BallTrail");
    container.appendChild(trailHeading);

    for (const item of trailItems) {
      const level = getLevel(owned, item.id);
      const maxed = level >= item.maxLevel;
      const isEquipped = equipped.ballTrail === item.id;

      const div = document.createElement("div");
      div.className = "shop-item";

      const info = document.createElement("div");
      info.className = "shop-item-info";
      info.innerHTML = `<strong>${t(`shop.item.${item.id}.name`)}</strong><br><small>${t(`shop.item.${item.id}.desc`)}</small>`;
      div.appendChild(info);

      const btn = document.createElement("button");
      if (!maxed) {
        btn.textContent = t("shop.buy", { price: item.costs[0] });
        btn.className = "shop-btn buy";
        btn.onclick = () => onBuy(item.id);
      } else if (!isEquipped) {
        btn.textContent = t("shop.equip");
        btn.className = "shop-btn equip";
        btn.onclick = () => onEquip(item.id);
      } else {
        btn.textContent = t("shop.equipped");
        btn.className = "shop-btn equipped";
        btn.disabled = true;
      }
      div.appendChild(btn);
      container.appendChild(div);
    }
  }
}

// --- HUD Upgrades ---

// --- Quick Chat ---

const CHAT_LABELS: Record<string, string> = {
  gg: "GG!", nice: "Nice!", wow: "Wow!", glhf: "GL HF", oops: "Oops!", rematch: "Rematch?",
};

let chatBubbleTimeout: ReturnType<typeof setTimeout> | null = null;

export function showQuickChatBar(visible: boolean) {
  const bar = document.getElementById("quick-chat-bar");
  if (bar) bar.classList.toggle("active", visible);
}

export function showChatBubble(chatId: string) {
  const bubble = document.getElementById("chat-bubble");
  if (!bubble) return;
  bubble.textContent = CHAT_LABELS[chatId] ?? chatId;
  bubble.classList.add("visible");
  if (chatBubbleTimeout) clearTimeout(chatBubbleTimeout);
  chatBubbleTimeout = setTimeout(() => {
    bubble.classList.remove("visible");
    chatBubbleTimeout = null;
  }, 2000);
}

export function setupQuickChatButtons(onChat: (chatId: string) => void) {
  const bar = document.getElementById("quick-chat-bar");
  if (!bar) return;
  bar.querySelectorAll(".qc-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const chatId = (btn as HTMLElement).dataset.chat;
      if (!chatId || btn.classList.contains("cooldown")) return;
      onChat(chatId);
      // Show own message as bubble too
      showChatBubble(chatId);
      // Cooldown 3s
      btn.classList.add("cooldown");
      setTimeout(() => btn.classList.remove("cooldown"), 3000);
    });
  });
}

import type { PlayerUpgrades } from "../../shared/messages";

const UPGRADE_BADGES = [
  { id: UpgradeId.PaddleSpeed, key: "paddleSpeedLevel" as const, icon: "\u26A1", labelKey: "hud.badge.spd" },
  { id: UpgradeId.PaddleSize, key: "paddleSizeLevel" as const, icon: "\uD83D\uDCCF", labelKey: "hud.badge.size" },
  { id: UpgradeId.BallStartSpeed, key: "ballSpeedLevel" as const, icon: "\uD83D\uDE80", labelKey: "hud.badge.ball" },
];

function renderBadges(container: HTMLElement, levels: { id: UpgradeId; lvl: number; icon: string; labelKey: string }[]) {
  container.innerHTML = "";
  for (const u of levels) {
    if (u.lvl <= 0) continue;
    const badge = document.createElement("div");
    badge.className = "hud-badge";
    badge.textContent = `${u.icon} ${t(u.labelKey)} +${u.lvl}`;
    container.appendChild(badge);
  }
}

export function updateHudUpgrades(owned: OwnedUpgrades) {
  const el = document.getElementById("hud-player-info");
  if (!el) return;
  renderBadges(el, UPGRADE_BADGES.map(u => ({
    id: u.id, lvl: getLevel(owned, u.id), icon: u.icon, labelKey: u.labelKey,
  })));
}

export function updateHudOpponentInfo(
  opponentUpgrades: PlayerUpgrades | null,
  opponentMmr: number | null,
) {
  const el = document.getElementById("hud-opponent-info");
  if (!el) return;
  el.innerHTML = "";

  if (!opponentUpgrades) return;

  // Opponent upgrade badges
  for (const u of UPGRADE_BADGES) {
    const lvl = opponentUpgrades[u.key];
    if (lvl <= 0) continue;
    const badge = document.createElement("div");
    badge.className = "hud-badge";
    badge.textContent = `${u.icon} +${lvl}`;
    el.appendChild(badge);
  }

  // Opponent MMR
  if (opponentMmr != null) {
    const mmrBadge = document.createElement("div");
    mmrBadge.className = "hud-badge";
    mmrBadge.textContent = `${getRankLabel(opponentMmr)}`;
    mmrBadge.style.color = "#aaf";
    el.appendChild(mmrBadge);
  }
}
