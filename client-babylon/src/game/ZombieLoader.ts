import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import "@babylonjs/loaders/glTF";

export interface ZombieInstance {
  root: TransformNode;
  meshes: Mesh[];
  walkAnim: AnimationGroup;
  monsterWalkAnim: AnimationGroup;
  injuredWalkAnim: AnimationGroup;
  attackAnim: AnimationGroup;
  punchComboAnim: AnimationGroup;
  dieAnim: AnimationGroup;
  dyingBackwardsAnim: AnimationGroup;
  screamAnim: AnimationGroup;
  skeleton: Skeleton | null;
}

let container: AssetContainer | null = null;
let zombieCounter = 0;

function findAnim(groups: AnimationGroup[], keyword: string): AnimationGroup {
  return groups.find(ag => ag.name.toLowerCase().includes(keyword)) || groups[0];
}

async function ensureContainer(scene: Scene): Promise<AssetContainer> {
  if (container) return container;
  container = await SceneLoader.LoadAssetContainerAsync("/assets/", "zombie.glb", scene);
  return container;
}

export async function spawnZombie(scene: Scene): Promise<ZombieInstance> {
  const c = await ensureContainer(scene);
  const id = zombieCounter++;
  const prefix = `zombie_${id}`;

  const inst = c.instantiateModelsToScene(name => `${prefix}_${name}`, false);

  // Root node
  const root = inst.rootNodes[0] as TransformNode;

  // Collect meshes
  const meshes: Mesh[] = [];
  for (const node of inst.rootNodes) {
    if (node instanceof Mesh) meshes.push(node);
    for (const child of node.getChildMeshes(false)) {
      if (child instanceof Mesh) meshes.push(child);
    }
  }

  // Skeleton
  const skeleton = inst.skeletons.length > 0 ? inst.skeletons[0] : null;

  // Animation groups — properly cloned and retargeted by instantiateModelsToScene
  const ag = inst.animationGroups;
  for (const a of ag) a.stop();

  return {
    root, meshes, skeleton,
    walkAnim: findAnim(ag, "walking_man"),
    monsterWalkAnim: findAnim(ag, "monster_walk"),
    injuredWalkAnim: findAnim(ag, "injured_walk"),
    attackAnim: findAnim(ag, "attack"),
    punchComboAnim: findAnim(ag, "punch_combo"),
    dieAnim: findAnim(ag, "dead"),
    dyingBackwardsAnim: findAnim(ag, "dying_backwards"),
    screamAnim: findAnim(ag, "zombie_scream"),
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

export function stopAllAnims(zombie: ZombieInstance) {
  for (const key of ALL_ANIM_KEYS) {
    (zombie[key] as AnimationGroup).stop();
  }
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
  stopAllAnims(zombie);
  for (const key of ALL_ANIM_KEYS) {
    (zombie[key] as AnimationGroup).dispose();
  }
  for (const mesh of zombie.meshes) mesh.dispose();
  if (zombie.skeleton) zombie.skeleton.dispose();
  zombie.root.getChildTransformNodes(false).forEach(n => n.dispose());
  zombie.root.dispose();
}

export function resetTemplate() {
  container = null;
  zombieCounter = 0;
}
