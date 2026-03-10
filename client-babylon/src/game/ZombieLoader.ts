import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import "@babylonjs/loaders/glTF";

/** Distance from camera beyond which the low-poly LOD is used */
export const LOD_DISTANCE = 300;

export interface ZombieInstance {
  root: TransformNode;
  meshes: Mesh[];
  /** Low-detail meshes (from zombie_lod.glb), hidden by default */
  lodMeshes: Mesh[];
  /** Root node of the LOD sub-instance, parented under `root` */
  lodRoot: TransformNode | null;
  walkAnim: AnimationGroup;
  monsterWalkAnim: AnimationGroup;
  injuredWalkAnim: AnimationGroup;
  attackAnim: AnimationGroup;
  punchComboAnim: AnimationGroup;
  dieAnim: AnimationGroup;
  dyingBackwardsAnim: AnimationGroup;
  screamAnim: AnimationGroup;
  /** Mirror animation groups for LOD model */
  lodWalkAnim: AnimationGroup;
  lodMonsterWalkAnim: AnimationGroup;
  lodInjuredWalkAnim: AnimationGroup;
  lodAttackAnim: AnimationGroup;
  lodPunchComboAnim: AnimationGroup;
  lodDieAnim: AnimationGroup;
  lodDyingBackwardsAnim: AnimationGroup;
  lodScreamAnim: AnimationGroup;
  skeleton: Skeleton | null;
  /** true = currently showing low-detail meshes */
  isLod: boolean;
}

let container: AssetContainer | null = null;
let lodContainer: AssetContainer | null = null;
let zombieCounter = 0;

function findAnim(groups: AnimationGroup[], keyword: string): AnimationGroup {
  return groups.find(ag => ag.name.toLowerCase().includes(keyword)) || groups[0];
}

async function ensureContainer(scene: Scene): Promise<AssetContainer> {
  if (container) return container;
  container = await SceneLoader.LoadAssetContainerAsync("/assets/", "zombie.glb", scene);
  return container;
}

async function ensureLodContainer(scene: Scene): Promise<AssetContainer> {
  if (lodContainer) return lodContainer;
  lodContainer = await SceneLoader.LoadAssetContainerAsync("/assets/", "zombie_lod.glb", scene);
  return lodContainer;
}

function collectMeshes(rootNodes: TransformNode[]): Mesh[] {
  const meshes: Mesh[] = [];
  for (const node of rootNodes) {
    if (node instanceof Mesh) meshes.push(node);
    for (const child of node.getChildMeshes(false)) {
      if (child instanceof Mesh) meshes.push(child);
    }
  }
  return meshes;
}

export async function spawnZombie(scene: Scene): Promise<ZombieInstance> {
  const [c, lc] = await Promise.all([
    ensureContainer(scene),
    ensureLodContainer(scene),
  ]);
  const id = zombieCounter++;
  const prefix = `zombie_${id}`;
  const lodPrefix = `zombie_lod_${id}`;

  // --- High-detail instance ---
  const inst = c.instantiateModelsToScene(name => `${prefix}_${name}`, false);
  const root = inst.rootNodes[0] as TransformNode;
  const meshes = collectMeshes(inst.rootNodes as TransformNode[]);
  const skeleton = inst.skeletons.length > 0 ? inst.skeletons[0] : null;

  const ag = inst.animationGroups;
  for (const a of ag) a.stop();

  // --- Low-detail instance ---
  const lodInst = lc.instantiateModelsToScene(name => `${lodPrefix}_${name}`, false);
  const lodRoot = lodInst.rootNodes[0] as TransformNode;
  const lodMeshes = collectMeshes(lodInst.rootNodes as TransformNode[]);

  const lodAg = lodInst.animationGroups;
  for (const a of lodAg) a.stop();

  // Parent LOD root under the main root so it inherits position/rotation/scale
  lodRoot.parent = root;
  // Reset LOD root local transform (main root handles all positioning)
  lodRoot.position.setAll(0);
  lodRoot.rotation.setAll(0);
  lodRoot.scaling.setAll(1);

  // Start with LOD meshes hidden
  for (const mesh of lodMeshes) mesh.setEnabled(false);
  setNodeEnabled(lodRoot, false);

  return {
    root, meshes, lodMeshes, lodRoot, skeleton,
    isLod: false,
    walkAnim: findAnim(ag, "walking_man"),
    monsterWalkAnim: findAnim(ag, "monster_walk"),
    injuredWalkAnim: findAnim(ag, "injured_walk"),
    attackAnim: findAnim(ag, "attack"),
    punchComboAnim: findAnim(ag, "punch_combo"),
    dieAnim: findAnim(ag, "dead"),
    dyingBackwardsAnim: findAnim(ag, "dying_backwards"),
    screamAnim: findAnim(ag, "zombie_scream"),
    lodWalkAnim: findAnim(lodAg, "walking_man"),
    lodMonsterWalkAnim: findAnim(lodAg, "monster_walk"),
    lodInjuredWalkAnim: findAnim(lodAg, "injured_walk"),
    lodAttackAnim: findAnim(lodAg, "attack"),
    lodPunchComboAnim: findAnim(lodAg, "punch_combo"),
    lodDieAnim: findAnim(lodAg, "dead"),
    lodDyingBackwardsAnim: findAnim(lodAg, "dying_backwards"),
    lodScreamAnim: findAnim(lodAg, "zombie_scream"),
  };
}

export function scaleZombieToHeight(zombie: ZombieInstance, targetHeight: number) {
  let minY = Infinity, maxY = -Infinity;
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

const ALL_ANIM_KEYS: (keyof ZombieInstance)[] = [
  "walkAnim", "monsterWalkAnim", "injuredWalkAnim",
  "attackAnim", "punchComboAnim",
  "dieAnim", "dyingBackwardsAnim", "screamAnim",
];

const ALL_LOD_ANIM_KEYS: (keyof ZombieInstance)[] = [
  "lodWalkAnim", "lodMonsterWalkAnim", "lodInjuredWalkAnim",
  "lodAttackAnim", "lodPunchComboAnim",
  "lodDieAnim", "lodDyingBackwardsAnim", "lodScreamAnim",
];

export function stopAllAnims(zombie: ZombieInstance) {
  for (const key of ALL_ANIM_KEYS) {
    (zombie[key] as AnimationGroup).stop();
  }
  for (const key of ALL_LOD_ANIM_KEYS) {
    (zombie[key] as AnimationGroup).stop();
  }
}

/** Mapping from hi-detail anim key to corresponding LOD anim key */
const HI_TO_LOD: Record<string, keyof ZombieInstance> = {
  walkAnim: "lodWalkAnim",
  monsterWalkAnim: "lodMonsterWalkAnim",
  injuredWalkAnim: "lodInjuredWalkAnim",
  attackAnim: "lodAttackAnim",
  punchComboAnim: "lodPunchComboAnim",
  dieAnim: "lodDieAnim",
  dyingBackwardsAnim: "lodDyingBackwardsAnim",
  screamAnim: "lodScreamAnim",
};

/**
 * Switch a zombie to the low-detail LOD.
 * Transfers currently playing animations to the LOD model.
 */
export function switchToLod(zombie: ZombieInstance) {
  if (zombie.isLod) return;
  zombie.isLod = true;

  // Find which hi-detail anims are playing and mirror them on LOD
  for (const hiKey of ALL_ANIM_KEYS) {
    const hiAnim = zombie[hiKey] as AnimationGroup;
    const lodKey = HI_TO_LOD[hiKey];
    const lodAnim = zombie[lodKey] as AnimationGroup;
    if (hiAnim.isPlaying) {
      lodAnim.start(hiAnim.loopAnimation, hiAnim.speedRatio);
      // Sync playback position
      lodAnim.goToFrame(hiAnim.animatables[0]?.masterFrame ?? 0);
    }
    hiAnim.stop();
  }

  // Hide hi-detail meshes, show LOD meshes
  for (const mesh of zombie.meshes) mesh.setEnabled(false);
  if (zombie.lodRoot) setNodeEnabled(zombie.lodRoot, true);
  for (const mesh of zombie.lodMeshes) mesh.setEnabled(true);
}

/**
 * Switch a zombie back to the high-detail model.
 * Transfers currently playing animations from LOD back to hi-detail.
 */
export function switchToHiDetail(zombie: ZombieInstance) {
  if (!zombie.isLod) return;
  zombie.isLod = false;

  // Transfer animations back
  for (const hiKey of ALL_ANIM_KEYS) {
    const hiAnim = zombie[hiKey] as AnimationGroup;
    const lodKey = HI_TO_LOD[hiKey];
    const lodAnim = zombie[lodKey] as AnimationGroup;
    if (lodAnim.isPlaying) {
      hiAnim.start(lodAnim.loopAnimation, lodAnim.speedRatio);
      hiAnim.goToFrame(lodAnim.animatables[0]?.masterFrame ?? 0);
    }
    lodAnim.stop();
  }

  // Show hi-detail meshes, hide LOD meshes
  for (const mesh of zombie.meshes) mesh.setEnabled(true);
  for (const mesh of zombie.lodMeshes) mesh.setEnabled(false);
  if (zombie.lodRoot) setNodeEnabled(zombie.lodRoot, false);
}

export function hideZombie(zombie: ZombieInstance) {
  stopAllAnims(zombie);
  for (const mesh of zombie.meshes) mesh.setEnabled(false);
  for (const mesh of zombie.lodMeshes) mesh.setEnabled(false);
  root_setEnabled(zombie.root, false);
}

export function showZombie(zombie: ZombieInstance) {
  root_setEnabled(zombie.root, true);
  if (zombie.isLod) {
    for (const mesh of zombie.lodMeshes) mesh.setEnabled(true);
    if (zombie.lodRoot) setNodeEnabled(zombie.lodRoot, true);
  } else {
    for (const mesh of zombie.meshes) mesh.setEnabled(true);
  }
}

function root_setEnabled(root: TransformNode, enabled: boolean) {
  root.setEnabled(enabled);
  for (const child of root.getChildTransformNodes(false)) {
    child.setEnabled(enabled);
  }
}

function setNodeEnabled(node: TransformNode, enabled: boolean) {
  node.setEnabled(enabled);
  for (const child of node.getChildTransformNodes(false)) {
    child.setEnabled(enabled);
  }
}

export function disposeZombie(zombie: ZombieInstance) {
  stopAllAnims(zombie);
  for (const key of ALL_ANIM_KEYS) {
    (zombie[key] as AnimationGroup).dispose();
  }
  for (const key of ALL_LOD_ANIM_KEYS) {
    (zombie[key] as AnimationGroup).dispose();
  }
  for (const mesh of zombie.meshes) mesh.dispose();
  for (const mesh of zombie.lodMeshes) mesh.dispose();
  if (zombie.skeleton) zombie.skeleton.dispose();
  if (zombie.lodRoot) {
    zombie.lodRoot.getChildTransformNodes(false).forEach(n => n.dispose());
    zombie.lodRoot.dispose();
  }
  zombie.root.getChildTransformNodes(false).forEach(n => n.dispose());
  zombie.root.dispose();
}

export function resetTemplate() {
  container = null;
  lodContainer = null;
  zombieCounter = 0;
}
