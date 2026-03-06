// Port of client/src/modules/shop/parts/catalog.rs

import { UpgradeCategory, UpgradeId } from "./data";
import type { UpgradeDef } from "./data";

export const CATALOG: UpgradeDef[] = [
  // Gameplay
  { id: UpgradeId.PaddleSpeed, name: "Swift Paddle", category: UpgradeCategory.Gameplay, maxLevel: 3, costs: [50, 150, 400], description: "+50 paddle speed per level" },
  { id: UpgradeId.PaddleSize, name: "Big Paddle", category: UpgradeCategory.Gameplay, maxLevel: 3, costs: [50, 150, 400], description: "+15px paddle height per level" },
  { id: UpgradeId.BallStartSpeed, name: "Fast Start", category: UpgradeCategory.Gameplay, maxLevel: 2, costs: [100, 300], description: "+30 initial ball speed per level" },
  { id: UpgradeId.StickyPaddle, name: "Sticky Paddle", category: UpgradeCategory.Gameplay, maxLevel: 1, costs: [500], description: "Ball clings to paddle for 0.3s on hit" },
  // Paddle colors
  { id: UpgradeId.ColorNeonGreen, name: "Neon Green", category: UpgradeCategory.PaddleColor, maxLevel: 1, costs: [100], description: "Green paddle glow" },
  { id: UpgradeId.ColorNeonBlue, name: "Neon Blue", category: UpgradeCategory.PaddleColor, maxLevel: 1, costs: [100], description: "Blue paddle glow" },
  { id: UpgradeId.ColorHotPink, name: "Hot Pink", category: UpgradeCategory.PaddleColor, maxLevel: 1, costs: [100], description: "Pink paddle glow" },
  { id: UpgradeId.ColorGold, name: "Gold", category: UpgradeCategory.PaddleColor, maxLevel: 1, costs: [250], description: "Golden paddle" },
  // Ball trails
  { id: UpgradeId.TrailSimple, name: "Basic Trail", category: UpgradeCategory.BallTrail, maxLevel: 1, costs: [200], description: "Simple fading trail behind the ball" },
  { id: UpgradeId.TrailRainbow, name: "Rainbow Trail", category: UpgradeCategory.BallTrail, maxLevel: 1, costs: [500], description: "Colorful rainbow trail" },
  // Ball visual
  { id: UpgradeId.BallGlow, name: "Ball Glow", category: UpgradeCategory.BallVisual, maxLevel: 1, costs: [150], description: "Glowing ball effect" },
];

export function findUpgrade(id: UpgradeId): UpgradeDef | undefined {
  return CATALOG.find((u) => u.id === id);
}
