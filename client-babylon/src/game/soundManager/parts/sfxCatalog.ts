const SFX_DIR = "./assets/audio/sfx/";

export interface SfxEntry {
  files: string[];
  volume: number;
  loop?: boolean;
  pitchRange?: number;
}

export const SFX_CATALOG: Record<string, SfxEntry> = {
  // --- Ball / Paddle (Kenney sci-fi) ---
  paddleHit: {
    files: ["paddle_hit_1.ogg", "paddle_hit_2.ogg", "paddle_hit_3.ogg"],
    volume: 0.5,
    pitchRange: 0.1,
  },
  wallBounce: {
    files: ["wall_bounce_1.ogg", "wall_bounce_2.ogg"],
    volume: 0.3,
  },
  goal: { files: ["goal.mp3"], volume: 0.6 },
  goalCrowd: { files: ["goal_crowd.mp3"], volume: 0.35 },
  shieldHit: { files: ["shield_hit.ogg"], volume: 0.3 },

  // --- Zombies (Kenney sci-fi + impact) ---
  zombieDeath: {
    files: ["zombie_death_2.mp3"],
    volume: 0.5,
    pitchRange: 0.15,
  },
  zombieHit: {
    files: ["zombie_hit_1.ogg", "zombie_hit_2.ogg", "zombie_hit_3.ogg"],
    volume: 0.25,
    pitchRange: 0.1,
  },

  // --- UI (Kenney sci-fi) ---
  uiClick: { files: ["ui_click.ogg"], volume: 0.4 },
  matchFound: { files: ["match_found.ogg"], volume: 0.5 },
  victory: { files: ["victory.mp3"], volume: 0.5 },
  defeat: { files: ["defeat.mp3"], volume: 0.5 },
  coin: { files: ["coin.ogg"], volume: 0.3 },
};

export function getSfxUrl(fileName: string): string {
  return SFX_DIR + fileName;
}
