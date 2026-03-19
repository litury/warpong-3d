import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import "@babylonjs/loaders/glTF";

export interface DragonInstance {
  root: TransformNode;
  meshes: Mesh[];
  skeleton: Skeleton | null;
  anims: Map<string, AnimationGroup>;
  /** Jaw bone node for fire breath attachment */
  jawNode: TransformNode | null;

  idleAnim: AnimationGroup;
  walkAnim: AnimationGroup;
  runAnim: AnimationGroup;
  flyAnim: AnimationGroup;
  sitAnim: AnimationGroup;
}

const MODEL_DIR = "/assets/dragon/";
const ANIMS_DIR = "/assets/dragon/anims/";

let modelContainer: AssetContainer | null = null;
const animContainerCache = new Map<string, AssetContainer>();
let dragonCounter = 0;

const ALL_ANIMS = ["idle", "walk", "run", "fly", "sit"];

async function ensureModelContainer(scene: Scene): Promise<AssetContainer> {
  if (modelContainer) return modelContainer;
  modelContainer = await SceneLoader.LoadAssetContainerAsync(MODEL_DIR, "model.glb", scene);
  return modelContainer;
}

async function ensureAnimContainer(scene: Scene, animName: string): Promise<AssetContainer> {
  const cached = animContainerCache.get(animName);
  if (cached) return cached;
  const container = await SceneLoader.LoadAssetContainerAsync(ANIMS_DIR, `${animName}.glb`, scene);
  // Strip mesh/material/texture data — we only need animation groups.
  // Anim GLBs contain the full model mesh+textures which waste ~60MB of GPU memory.
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

export async function spawnDragon(scene: Scene): Promise<DragonInstance> {
  const c = await ensureModelContainer(scene);
  const id = dragonCounter++;
  const prefix = `dragon_${id}`;

  const inst = c.instantiateModelsToScene(name => `${prefix}_${name}`, false);

  const glbRoot = inst.rootNodes[0] as TransformNode;
  const root = new TransformNode(`${prefix}_wrapper`, scene);
  glbRoot.parent = root;

  const meshes: Mesh[] = [];
  for (const node of inst.rootNodes) {
    if (node instanceof Mesh) meshes.push(node);
    for (const child of node.getChildMeshes(false)) {
      if (child instanceof Mesh) meshes.push(child);
    }
  }

  for (const mesh of meshes) {
    mesh.receiveShadows = true;
    if (mesh.material) {
      const mat = mesh.material as any;
      if (mat.usePhysicalLightFalloff !== undefined) {
        mat.usePhysicalLightFalloff = false;
        mat.directIntensity = 1.8;
        mat.environmentIntensity = 1.5;
      }
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

  // Find jaw bone for fire breath VFX attachment
  const jawNode = boneNodeMap.get("DEF-Bone.002") ?? boneNodeMap.get("DEF-Bone") ?? null;

  const anims = new Map<string, AnimationGroup>();

  async function loadAnimForInstance(animName: string): Promise<AnimationGroup> {
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

      // Skip root bone position — movement is driven by game logic
      const isRootBone = sourceBoneName === "Root" || sourceBoneName === "DEF-Spine";
      if (isRootBone && ta.animation.targetProperty === "position") continue;

      retargetedAg.addTargetedAnimation(ta.animation, targetNode);
    }

    retargetedAg.stop();
    anims.set(animName, retargetedAg);
    return retargetedAg;
  }

  await Promise.all(ALL_ANIMS.map(loadAnimForInstance));

  return {
    root, meshes, skeleton, anims, jawNode,
    get idleAnim() { return anims.get("idle")!; },
    get walkAnim() { return anims.get("walk")!; },
    get runAnim() { return anims.get("run")!; },
    get flyAnim() { return anims.get("fly")!; },
    get sitAnim() { return anims.get("sit")!; },
  };
}

export function scaleDragonToHeight(dragon: DragonInstance, targetHeight: number) {
  let minY = Infinity, maxY = -Infinity;
  for (const mesh of dragon.meshes) {
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
    dragon.root.scaling.setAll(scale);
  }
}

export function stopAllAnims(dragon: DragonInstance) {
  for (const ag of dragon.anims.values()) ag.stop();
}

export function hideDragon(dragon: DragonInstance) {
  stopAllAnims(dragon);
  for (const mesh of dragon.meshes) mesh.setEnabled(false);
  setNodeEnabled(dragon.root, false);
}

export function showDragon(dragon: DragonInstance) {
  setNodeEnabled(dragon.root, true);
  for (const mesh of dragon.meshes) mesh.setEnabled(true);
}

function setNodeEnabled(root: TransformNode, enabled: boolean) {
  root.setEnabled(enabled);
  for (const child of root.getChildTransformNodes(false)) {
    child.setEnabled(enabled);
  }
}

export function disposeDragon(dragon: DragonInstance) {
  for (const ag of dragon.anims.values()) { ag.stop(); ag.dispose(); }
  for (const mesh of dragon.meshes) mesh.dispose();
  if (dragon.skeleton) dragon.skeleton.dispose();
  dragon.root.getChildTransformNodes(false).forEach(n => n.dispose());
  dragon.root.dispose();
}

export function resetTemplate() {
  modelContainer = null;
  animContainerCache.clear();
  dragonCounter = 0;
}
