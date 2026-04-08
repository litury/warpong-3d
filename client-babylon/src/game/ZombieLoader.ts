import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";

export interface ZombieInstance {
  root: TransformNode;
  meshes: Mesh[];
  skeleton: Skeleton | null;
  anims: Map<string, AnimationGroup>;

  // Convenience getters (backward-compat with ZombieManager)
  walkAnim: AnimationGroup;
  monsterWalkAnim: AnimationGroup;
  injuredWalkAnim: AnimationGroup;
  attackAnim: AnimationGroup;
  punchComboAnim: AnimationGroup;
  dieAnim: AnimationGroup;
  dyingBackwardsAnim: AnimationGroup;
  screamAnim: AnimationGroup;
}

const MODEL_DIR = "/assets/zombie/";
const ANIMS_DIR = "/assets/zombie/anims/";

const modelContainers = new Map<string, AssetContainer>();
const animContainerCache = new Map<string, AssetContainer>();
let zombieCounter = 0;

/** Pool of recycled zombie instances, keyed by side */
const zombiePool = new Map<string, ZombieInstance[]>([
  ["left", []],
  ["right", []],
]);
const MAX_POOL_SIZE = 6;

const SIDE_MODEL: Record<string, string> = {
  left: "model_blue_rigged.glb",
  right: "model_red_rigged.glb",
};

const ALL_ANIMS = ["walk", "attack", "die", "scream"];

async function ensureModelContainer(
  scene: Scene,
  side: "left" | "right",
): Promise<AssetContainer> {
  const fileName = SIDE_MODEL[side];
  const cached = modelContainers.get(fileName);
  if (cached) return cached;
  const container = await LoadAssetContainerAsync(fileName, scene, {
    rootUrl: MODEL_DIR,
  });
  // Удалить встроенные lights из GLB — они клонируются при каждом instantiate
  for (const light of container.lights) light.dispose();
  container.lights.length = 0;
  modelContainers.set(fileName, container);
  return container;
}

export async function preloadZombieAssets(scene: Scene): Promise<void> {
  // Preload models + anim containers (stripped of mesh/texture, only anim data).
  // Individual zombies will retarget only the 4 anims they need from these cached containers.
  await Promise.all([
    ensureModelContainer(scene, "left"),
    ensureModelContainer(scene, "right"),
    ...ALL_ANIMS.map((name) => ensureAnimContainer(scene, name)),
  ]);
}

async function ensureAnimContainer(
  scene: Scene,
  animName: string,
): Promise<AssetContainer> {
  const cached = animContainerCache.get(animName);
  if (cached) return cached;
  const container = await LoadAssetContainerAsync(`${animName}.glb`, scene, {
    rootUrl: ANIMS_DIR,
  });
  // Strip mesh/material/texture data — we only need animation groups.
  // Anim GLBs contain the full model mesh+textures which waste ~100MB+ of GPU memory.
  for (const tex of container.textures) tex.dispose();
  for (const mat of container.materials) mat.dispose();
  for (const mesh of container.meshes) mesh.dispose();
  for (const geo of container.geometries) geo.dispose();
  container.textures.length = 0;
  container.materials.length = 0;
  container.meshes.length = 0;
  container.geometries.length = 0;
  animContainerCache.set(animName, container);
  return container;
}

/** Return a zombie instance to the pool for reuse instead of disposing it. */
export function returnToPool(zombie: ZombieInstance, side: "left" | "right") {
  stopAllAnims(zombie);
  hideZombie(zombie);
  const pool = zombiePool.get(side)!;
  if (pool.length < MAX_POOL_SIZE) {
    pool.push(zombie);
  } else {
    // Pool full — dispose completely
    disposeZombie(zombie);
  }
}

export async function spawnZombie(
  scene: Scene,
  side: "left" | "right" = "left",
): Promise<ZombieInstance> {
  // Try to reuse a pooled instance first
  const pool = zombiePool.get(side)!;
  if (pool.length > 0) {
    const recycled = pool.pop()!;
    stopAllAnims(recycled);
    showZombie(recycled);
    for (const mesh of recycled.meshes) {
      mesh.setEnabled(true);
      mesh.visibility = 1;
    }
    return recycled;
  }

  const c = await ensureModelContainer(scene, side);
  const id = zombieCounter++;
  const prefix = `zombie_${id}`;

  const inst = c.instantiateModelsToScene((name) => `${prefix}_${name}`, true);

  // Wrap GLB root in a parent so rotation is not overridden by animations
  const glbRoot = inst.rootNodes[0] as TransformNode;
  const root = new TransformNode(`${prefix}_wrapper`, scene);
  glbRoot.parent = root;

  // Collect meshes
  const meshes: Mesh[] = [];
  for (const node of inst.rootNodes) {
    if (node instanceof Mesh) meshes.push(node);
    for (const child of node.getChildMeshes(false)) {
      if (child instanceof Mesh) meshes.push(child);
    }
  }

  for (const mesh of meshes) {
    mesh.receiveShadows = false;
    if (mesh.material) {
      mesh.material.freeze();
    }
  }

  const skeleton = inst.skeletons.length > 0 ? inst.skeletons[0] : null;

  // Build bone lookup by base name (without instance prefix)
  const boneNodeMap = new Map<string, TransformNode>();
  for (const node of glbRoot.getChildTransformNodes(false)) {
    const baseName = node.name.replace(`${prefix}_`, "");
    boneNodeMap.set(baseName, node);
  }

  const anims = new Map<string, AnimationGroup>();

  async function loadAnimForInstance(
    animName: string,
  ): Promise<AnimationGroup> {
    const existing = anims.get(animName);
    if (existing) return existing;

    const animContainer = await ensureAnimContainer(scene, animName);
    const sourceAg = animContainer.animationGroups[0];
    if (!sourceAg) throw new Error(`No animation found in ${animName}.glb`);

    const retargetedAg = new AnimationGroup(`${prefix}_${animName}`, scene);

    for (const ta of sourceAg.targetedAnimations) {
      const sourceBoneName = (ta.target as TransformNode).name;
      const targetNode = boneNodeMap.get(sourceBoneName);
      if (!targetNode) continue;

      // Skip root bone position & rotation for non-death anims — movement is driven by game logic.
      // Death anims need root bone to move the body to the ground.
      const isRootBone =
        sourceBoneName === "Armature" || sourceBoneName.includes("Hips");
      const isDeathAnim = animName.startsWith("die");
      if (
        isRootBone &&
        !isDeathAnim &&
        ta.animation.targetProperty === "position"
      )
        continue;
      if (
        isRootBone &&
        !isDeathAnim &&
        ta.animation.targetProperty === "rotationQuaternion"
      )
        continue;

      retargetedAg.addTargetedAnimation(ta.animation, targetNode);
    }

    retargetedAg.stop();
    anims.set(animName, retargetedAg);
    return retargetedAg;
  }

  // Load all 4 animations for this zombie
  await Promise.all(ALL_ANIMS.map(loadAnimForInstance));

  return {
    root,
    meshes,
    skeleton,
    anims,
    get walkAnim() {
      return anims.get("walk")!;
    },
    get monsterWalkAnim() {
      return anims.get("walk")!;
    },
    get injuredWalkAnim() {
      return anims.get("walk")!;
    },
    get attackAnim() {
      return anims.get("attack")!;
    },
    get punchComboAnim() {
      return anims.get("attack")!;
    },
    get dieAnim() {
      return anims.get("die")!;
    },
    get dyingBackwardsAnim() {
      return anims.get("die")!;
    },
    get screamAnim() {
      return anims.get("scream")!;
    },
  };
}

export function scaleZombieToHeight(
  zombie: ZombieInstance,
  targetHeight: number,
) {
  let minY = Infinity,
    maxY = -Infinity;
  for (const mesh of zombie.meshes) {
    mesh.computeWorldMatrix(true);
    const bounds = mesh.getBoundingInfo();
    if (bounds) {
      minY = Math.min(minY, bounds.boundingBox.minimumWorld.y);
      maxY = Math.max(maxY, bounds.boundingBox.maximumWorld.y);
    }
  }
  const currentHeight = maxY - minY;
  if (currentHeight > 0) {
    const scale = targetHeight / currentHeight;
    zombie.root.scaling.setAll(scale);
  }
}

export function stopAllAnims(zombie: ZombieInstance) {
  for (const ag of zombie.anims.values()) ag.stop();
}

export function hideZombie(zombie: ZombieInstance) {
  stopAllAnims(zombie);
  for (const mesh of zombie.meshes) mesh.setEnabled(false);
  root_setEnabled(zombie.root, false);
}

export function showZombie(zombie: ZombieInstance) {
  root_setEnabled(zombie.root, true);
  for (const mesh of zombie.meshes) mesh.setEnabled(true);
}

function root_setEnabled(root: TransformNode, enabled: boolean) {
  root.setEnabled(enabled);
  for (const child of root.getChildTransformNodes(false)) {
    child.setEnabled(enabled);
  }
}

export function disposeZombie(zombie: ZombieInstance) {
  for (const ag of zombie.anims.values()) {
    ag.stop();
    ag.dispose();
  }
  for (const mesh of zombie.meshes) mesh.dispose();
  if (zombie.skeleton) zombie.skeleton.dispose();
  for (const n of zombie.root.getChildTransformNodes(false)) n.dispose();
  zombie.root.dispose();
}

/** Dispose skeleton, animations, and transform nodes but NOT meshes (already consumed by MergeMeshes). */
export function disposeZombieAnimsOnly(zombie: ZombieInstance) {
  for (const ag of zombie.anims.values()) {
    ag.stop();
    ag.dispose();
  }
  if (zombie.skeleton) zombie.skeleton.dispose();
  for (const n of zombie.root.getChildTransformNodes(false)) n.dispose();
  zombie.root.dispose();
}

export function resetTemplate() {
  modelContainers.clear();
  animContainerCache.clear();
  zombieCounter = 0;
}
