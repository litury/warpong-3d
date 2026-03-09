export const CATALOG: Record<string, { maxLevel: number; costs: number[] }> = {
  paddle_speed: { maxLevel: 3, costs: [50, 150, 400] },
  paddle_size: { maxLevel: 3, costs: [50, 150, 400] },
  ball_start_speed: { maxLevel: 2, costs: [100, 300] },
  sticky_paddle: { maxLevel: 1, costs: [500] },
  color_neon_green: { maxLevel: 1, costs: [100] },
  color_neon_blue: { maxLevel: 1, costs: [100] },
  color_hot_pink: { maxLevel: 1, costs: [100] },
  color_gold: { maxLevel: 1, costs: [250] },
  trail_simple: { maxLevel: 1, costs: [200] },
  trail_rainbow: { maxLevel: 1, costs: [500] },
  ball_glow: { maxLevel: 1, costs: [150] },
};
