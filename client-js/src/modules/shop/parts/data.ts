// Port of client/src/modules/shop/parts/data.rs

export enum UpgradeId {
  PaddleSpeed = "PaddleSpeed",
  PaddleSize = "PaddleSize",
  BallStartSpeed = "BallStartSpeed",
  StickyPaddle = "StickyPaddle",
  ColorNeonGreen = "ColorNeonGreen",
  ColorNeonBlue = "ColorNeonBlue",
  ColorHotPink = "ColorHotPink",
  ColorGold = "ColorGold",
  TrailSimple = "TrailSimple",
  TrailRainbow = "TrailRainbow",
  BallGlow = "BallGlow",
}

export enum UpgradeCategory {
  Gameplay = "Gameplay",
  PaddleColor = "PaddleColor",
  BallTrail = "BallTrail",
  BallVisual = "BallVisual",
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  category: UpgradeCategory;
  maxLevel: number;
  costs: number[];
  description: string;
}

export interface Wallet {
  coins: number;
}

export interface OwnedUpgrades {
  levels: Record<string, number>;
}

export interface EquippedCosmetics {
  paddleColor: UpgradeId | null;
  ballTrail: UpgradeId | null;
}

export interface EffectiveStats {
  paddleSpeed: number;
  paddleHeight: number;
  ballInitialSpeed: number;
}

export interface ShopSaveData {
  wallet: Wallet;
  owned: OwnedUpgrades;
  equipped: EquippedCosmetics;
  totalOnlineWins: number;
  winStreak: number;
}

export function getLevel(owned: OwnedUpgrades, id: UpgradeId): number {
  return owned.levels[id] ?? 0;
}

export function createDefaultWallet(): Wallet {
  return { coins: 100 };
}

export function createDefaultOwned(): OwnedUpgrades {
  return { levels: {} };
}

export function createDefaultEquipped(): EquippedCosmetics {
  return { paddleColor: null, ballTrail: null };
}
