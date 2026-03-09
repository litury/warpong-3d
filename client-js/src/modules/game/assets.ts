import { Assets, Texture } from "pixi.js";

export interface GameAssets {
  mech: Texture;
  mechIdle: Texture[];
  mechWalk: Texture[];
  mechVictory: Texture[];
  mechDefeat: Texture[];
  projectile: Texture;
  arenaBg: Texture;
  shieldDefault: Texture;
}

export async function loadGameAssets(): Promise<GameAssets> {
  const idleFrames = 8;
  const walkFrames = 8;
  const idlePromises = Array.from({ length: idleFrames }, (_, i) =>
    Assets.load<Texture>(`/assets/mech_idle_${String(i + 1).padStart(2, "0")}.png`)
  );
  const walkPromises = Array.from({ length: walkFrames }, (_, i) =>
    Assets.load<Texture>(`/assets/mech_walk_${String(i + 1).padStart(2, "0")}.png`)
  );
  const victoryPromises = Array.from({ length: 4 }, (_, i) =>
    Assets.load<Texture>(`/assets/mech_victory${i + 1}.png`)
  );
  const defeatPromises = Array.from({ length: 4 }, (_, i) =>
    Assets.load<Texture>(`/assets/mech_defeat${i + 1}.png`)
  );

  const [mech, projectile, arenaBg, shieldDefault, ...rest] = await Promise.all([
    Assets.load<Texture>("/assets/mech_idle_01.png"),
    Assets.load<Texture>("/assets/projectile.png"),
    Assets.load<Texture>("/assets/arena_bg.png"),
    Assets.load<Texture>("/assets/shield_default.png"),
    ...idlePromises,
    ...walkPromises,
    ...victoryPromises,
    ...defeatPromises,
  ]);
  const mechIdle = rest.slice(0, idleFrames);
  const mechWalk = rest.slice(idleFrames, idleFrames + walkFrames);
  const mechVictory = rest.slice(idleFrames + walkFrames, idleFrames + walkFrames + 4);
  const mechDefeat = rest.slice(idleFrames + walkFrames + 4, idleFrames + walkFrames + 8);
  return { mech, mechIdle, mechWalk, mechVictory, mechDefeat, projectile, arenaBg, shieldDefault };
}
