import { CATALOG } from "../shop/parts/catalog";
import { getLevel, UpgradeCategory, UpgradeId } from "../shop/parts/data";
import type { Wallet, OwnedUpgrades, EquippedCosmetics } from "../shop/parts/data";
import type { LeaderboardEntry } from "../yandex/sdk";
import { t } from "../../i18n";

// --- Screen management ---

const SCREENS = ["screen-menu", "screen-hud", "screen-game-over", "screen-lobby", "screen-shop"] as const;

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

// --- HUD ---

export function updateHudScore(left: number, right: number) {
  const el = document.getElementById("hud-score");
  if (el) el.textContent = `${left} : ${right}`;
}

export function updateHudCoins(coins: number) {
  const el = document.getElementById("hud-coins");
  if (el) el.textContent = `${coins}`;
}

// --- Game Over ---

export function setupGameOver(
  playerWon: boolean,
  coinsEarned: number,
  totalCoins: number,
  isOnline: boolean,
  leaderboard: LeaderboardEntry[],
) {
  const titleEl = document.getElementById("gameover-title");
  if (titleEl) titleEl.textContent = playerWon ? t("gameover.win") : t("gameover.lose");

  const coinsEl = document.getElementById("gameover-coins");
  if (coinsEl) coinsEl.textContent = t("gameover.coins", { earned: coinsEarned, total: totalCoins });

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

// --- Shop ---

export function renderShop(
  wallet: Wallet,
  owned: OwnedUpgrades,
  equipped: EquippedCosmetics,
  onBuy: (id: string) => void,
  onEquip: (id: string) => void,
) {
  const container = document.getElementById("shop-items");
  if (!container) return;
  container.innerHTML = "";

  const coinsEl = document.getElementById("shop-coins");
  if (coinsEl) coinsEl.textContent = t("shop.coins", { count: wallet.coins });

  const categories = [
    { cat: UpgradeCategory.Gameplay, label: t("shop.cat.Gameplay") },
    { cat: UpgradeCategory.PaddleColor, label: t("shop.cat.PaddleColor") },
    { cat: UpgradeCategory.BallTrail, label: t("shop.cat.BallTrail") },
    { cat: UpgradeCategory.BallVisual, label: t("shop.cat.BallVisual") },
  ];

  for (const { cat, label } of categories) {
    const items = CATALOG.filter((u) => u.category === cat);
    if (items.length === 0) continue;

    const heading = document.createElement("h3");
    heading.textContent = label;
    heading.className = "shop-category";
    container.appendChild(heading);

    for (const item of items) {
      const level = getLevel(owned, item.id);
      const maxed = level >= item.maxLevel;
      const isEquipped =
        equipped.paddleColor === item.id || equipped.ballTrail === item.id;

      const div = document.createElement("div");
      div.className = "shop-item";

      const info = document.createElement("div");
      info.className = "shop-item-info";
      info.innerHTML = `<strong>${t(`shop.item.${item.id}.name`)}</strong><br><small>${t(`shop.item.${item.id}.desc`)}</small>`;
      div.appendChild(info);

      const btn = document.createElement("button");
      if (!maxed && level === 0) {
        btn.textContent = t("shop.buy", { price: item.costs[0] });
        btn.className = "shop-btn buy";
        btn.onclick = () => onBuy(item.id);
      } else if (!maxed) {
        btn.textContent = t("shop.upgrade", { price: item.costs[level] });
        btn.className = "shop-btn buy";
        btn.onclick = () => onBuy(item.id);
      } else if (cat !== UpgradeCategory.Gameplay && !isEquipped) {
        btn.textContent = t("shop.equip");
        btn.className = "shop-btn equip";
        btn.onclick = () => onEquip(item.id);
      } else if (isEquipped) {
        btn.textContent = t("shop.equipped");
        btn.className = "shop-btn equipped";
        btn.disabled = true;
      } else {
        btn.textContent = t("shop.max");
        btn.className = "shop-btn maxed";
        btn.disabled = true;
      }

      div.appendChild(btn);
      container.appendChild(div);
    }
  }
}

// --- HUD Upgrades ---

export function updateHudUpgrades(owned: OwnedUpgrades) {
  const el = document.getElementById("hud-upgrades");
  if (!el) return;
  el.innerHTML = "";

  const upgrades = [
    { id: UpgradeId.PaddleSpeed, icon: "\u26A1", labelKey: "hud.badge.spd" },
    { id: UpgradeId.PaddleSize, icon: "\uD83D\uDCCF", labelKey: "hud.badge.size" },
    { id: UpgradeId.BallStartSpeed, icon: "\uD83D\uDE80", labelKey: "hud.badge.ball" },
  ];

  for (const u of upgrades) {
    const lvl = getLevel(owned, u.id);
    if (lvl <= 0) continue;
    const badge = document.createElement("div");
    badge.className = "hud-badge";
    badge.textContent = `${u.icon} ${t(u.labelKey)} +${lvl}`;
    el.appendChild(badge);
  }
}

// --- Lobby ---

export function updateLobbyStatus(text: string) {
  const el = document.getElementById("lobby-status");
  if (el) el.textContent = text;
}
