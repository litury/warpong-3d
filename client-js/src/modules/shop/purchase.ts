// Port of client/src/modules/shop/purchase.rs

import { PADDLE_SPEED, PADDLE_HEIGHT, BALL_INITIAL_SPEED } from "../../config";
import { GameMode } from "../../config/states";
import { findUpgrade } from "./parts/catalog";
import { getLevel, UpgradeId } from "./parts/data";
import type { Wallet, OwnedUpgrades, EquippedCosmetics, EffectiveStats } from "./parts/data";

export function tryBuyUpgrade(wallet: Wallet, owned: OwnedUpgrades, id: UpgradeId): boolean {
  const def = findUpgrade(id);
  if (!def) return false;

  const currentLevel = getLevel(owned, id);
  if (currentLevel >= def.maxLevel) return false;

  const cost = def.costs[currentLevel];
  if (wallet.coins < cost) return false;

  wallet.coins -= cost;
  owned.levels[id] = currentLevel + 1;
  return true;
}

export function computeEffectiveStats(owned: OwnedUpgrades): EffectiveStats {
  return {
    paddleSpeed: PADDLE_SPEED + getLevel(owned, UpgradeId.PaddleSpeed) * 50,
    paddleHeight: PADDLE_HEIGHT + getLevel(owned, UpgradeId.PaddleSize) * 15,
    ballInitialSpeed: BALL_INITIAL_SPEED + getLevel(owned, UpgradeId.BallStartSpeed) * 30,
  };
}

export function awardCoins(
  wallet: Wallet,
  mode: GameMode,
  playerWon: boolean,
): number {
  let reward: number;
  if (mode === GameMode.Online) {
    reward = playerWon ? 25 : 3;
  } else {
    reward = playerWon ? 10 : 3;
  }
  wallet.coins += reward;
  return reward;
}

export function getPaddleColor(equipped: EquippedCosmetics): number {
  switch (equipped.paddleColor) {
    case UpgradeId.ColorNeonGreen: return 0x33ff33;
    case UpgradeId.ColorNeonBlue: return 0x3366ff;
    case UpgradeId.ColorHotPink: return 0xff3399;
    case UpgradeId.ColorGold: return 0xffd700;
    default: return 0xffffff;
  }
}

export function getTrailType(equipped: EquippedCosmetics): string | null {
  if (equipped.ballTrail === UpgradeId.TrailSimple) return "TrailSimple";
  if (equipped.ballTrail === UpgradeId.TrailRainbow) return "TrailRainbow";
  return null;
}
