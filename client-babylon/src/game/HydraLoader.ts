import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import "@babylonjs/loaders/glTF";

export interface HydraInstance {
  root: TransformNode;
  meshes: Mesh[];
  skeleton: Skeleton | null;
  anims: Map<string, AnimationGroup>;

  walkAnim: AnimationGroup;
  idleAnim: AnimationGroup;
  attackAnim: AnimationGroup;
  dieAnim: AnimationGroup;
}

const MODEL_DIR = "/assets/hydra/";
const ANIMS_DIR = "/assets/hydra/anims/";

let modelContainer: AssetContainer | null = null;
const animContainerCache = new Map<string, AssetContainer>();
let hydraCounter = 0;

const ALL_ANIMS = ["idle", "walk", "attack", "die"];

async function ensureModelContainer(scene: Scene): Promise<AssetContainer> {
  if (modelContainer) return modelContainer;
  modelContainer = await SceneLoader.LoadAssetContainerAsync(MODEL_DIR, "model.glb", scene);
  return modelContainer;
}

async function ensureAnimContainer(scene: Scene, animName: string): Promise<AssetContainer> {
  const cached = animContainerCache.get(animName);
  if (cached) return cached;
  const container = await SceneLoader.LoadAssetContainerAsync(ANIMS_DIR, `${animName}.glb`, scene);
  animContainerCache.set(animName, container);
  return container;
}

export async function spawnHydra(scene: Scene): Promise<HydraInstance> {
  const c = await ensureModelContainer(scene);
  const id = hydraCounter++;
  const prefix = `hydra_${id}`;

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

  const boneNodeMap = new Map<string, TransformNode>();
  for (const node of glbRoot.getChildTransformNodes(false)) {
    const baseName = node.name.replace(`${prefix}_`, "");
    boneNodeMap.set(baseName, node);
  }

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

      const isRootBone = sourceBoneName === "Armature" || sourceBoneName.includes("Hips");
      if (isRootBone && ta.animation.targetProperty === "position") continue;

      retargetedAg.addTargetedAnimation(ta.animation.clone(), targetNode);
    }

    retargetedAg.stop();
    anims.set(animName, retargetedAg);
    return retargetedAg;
  }

  await Promise.all(ALL_ANIMS.map(loadAnimForInstance));

  return {
    root, meshes, skeleton, anims,
    get idleAnim() { return anims.get("idle")!; },
    get walkAnim() { return anims.get("walk")!; },
    get attackAnim() { return anims.get("attack")!; },
    get dieAnim() { return anims.get("die")!; },
  };
}

export function scaleHydraToHeight(hydra: HydraInstance, targetHeight: number) {
  let minY = Infinity, maxY = -Infinity;
  for (const mesh of hydra.meshes) {
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
    hydra.root.scaling.setAll(scale);
  }
}

export function stopAllAnims(hydra: HydraInstance) {
  for (const ag of hydra.anims.values()) ag.stop();
}

export function hideHydra(hydra: HydraInstance) {
  stopAllAnims(hydra);
  for (const mesh of hydra.meshes) mesh.setEnabled(false);
  setEnabled(hydra.root, false);
}

export function showHydra(hydra: HydraInstance) {
  setEnabled(hydra.root, true);
  for (const mesh of hydra.meshes) mesh.setEnabled(true);
}

function setEnabled(root: TransformNode, enabled: boolean) {
  root.setEnabled(enabled);
  for (const child of root.getChildTransformNodes(false)) {
    child.setEnabled(enabled);
  }
}

export function disposeHydra(hydra: HydraInstance) {
  for (const ag of hydra.anims.values()) { ag.stop(); ag.dispose(); }
  for (const mesh of hydra.meshes) mesh.dispose();
  if (hydra.skeleton) hydra.skeleton.dispose();
  hydra.root.getChildTransformNodes(false).forEach(n => n.dispose());
  hydra.root.dispose();
}

export function resetTemplate() {
  modelContainer = null;
  animContainerCache.clear();
  hydraCounter = 0;
}
