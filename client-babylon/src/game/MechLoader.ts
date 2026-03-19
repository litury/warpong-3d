import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import "@babylonjs/loaders/glTF";

export interface LoadedMech {
  root: TransformNode;
  meshes: Mesh[];
  skeletons: Skeleton[];
  /** Pre-loaded animation groups keyed by name */
  anims: Map<string, AnimationGroup>;
  /** Lazy-load an animation by name (e.g. "victory", "strafe_left") */
  loadAnim(name: string): Promise<AnimationGroup>;

  /* Convenience getters */
  idleAnim: AnimationGroup;
  strafeLeftAnim: AnimationGroup;
  strafeRightAnim: AnimationGroup;
}

const MODEL_DIR = "/assets/mech/";
const ANIMS_DIR = "/assets/mech/anims/";

let modelContainer: AssetContainer | null = null;

/** Animation container cache: shared across all mech instances */
const animContainerCache = new Map<string, AssetContainer>();

async function ensureModelContainer(scene: Scene): Promise<AssetContainer> {
  if (modelContainer) return modelContainer;
  modelContainer = await SceneLoader.LoadAssetContainerAsync(MODEL_DIR, "model.glb", scene);
  // Удалить встроенные lights из GLB
  for (const light of modelContainer.lights) light.dispose();
  modelContainer.lights.length = 0;
  return modelContainer;
}

async function ensureAnimContainer(scene: Scene, animName: string): Promise<AssetContainer> {
  const cached = animContainerCache.get(animName);
  if (cached) return cached;
  const container = await SceneLoader.LoadAssetContainerAsync(ANIMS_DIR, `${animName}.glb`, scene);
  animContainerCache.set(animName, container);
  return container;
}

/**
 * Load a mech with the model and a set of pre-loaded animations.
 * By default, loads "idle" and "strafe_right" immediately.
 * Additional animations can be loaded later via mech.loadAnim().
 */
export async function loadMech(
  scene: Scene,
  name: string,
  preloadAnims: string[] = ["idle", "strafe_right", "strafe_left"],
): Promise<LoadedMech> {
  const c = await ensureModelContainer(scene);
  const inst = c.instantiateModelsToScene(n => `${name}_${n}`, false);

  const glbRoot = inst.rootNodes[0] as TransformNode;
  const root = new TransformNode(`${name}_wrapper`, scene);
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
      }
      mesh.material.freeze();
    }
  }

  const skeletons = inst.skeletons;
  const anims = new Map<string, AnimationGroup>();

  // Build a lookup of all bones in this instance by their base name (without instance prefix)
  const boneNodeMap = new Map<string, TransformNode>();
  for (const node of glbRoot.getChildTransformNodes(false)) {
    // node.name is like "left_mixamorig:Hips" — extract base name after first underscore
    const baseName = node.name.replace(`${name}_`, "");
    boneNodeMap.set(baseName, node);
  }

  // Helper: load animation from separate GLB and retarget onto this instance's skeleton
  async function loadAnimForInstance(animName: string): Promise<AnimationGroup> {
    const existing = anims.get(animName);
    if (existing) return existing;

    const animContainer = await ensureAnimContainer(scene, animName);
    const sourceAg = animContainer.animationGroups[0];
    if (!sourceAg) throw new Error(`No animation found in ${animName}.glb`);

    // Create a new AnimationGroup retargeted to our bones
    const retargetedAg = new AnimationGroup(`${name}_${animName}`, scene);

    for (const ta of sourceAg.targetedAnimations) {
      const sourceBoneName = (ta.target as TransformNode).name;
      const targetNode = boneNodeMap.get(sourceBoneName);
      if (!targetNode) continue;

      // Skip root motion translation (Hips/Armature) — position is driven by game logic
      const isRootBone = sourceBoneName.includes("Hips") || sourceBoneName === "Armature";
      if (isRootBone && ta.animation.targetProperty === "position") continue;

      retargetedAg.addTargetedAnimation(ta.animation.clone(), targetNode);
    }

    retargetedAg.stop();
    anims.set(animName, retargetedAg);
    return retargetedAg;
  }

  // Pre-load requested animations in parallel
  await Promise.all(preloadAnims.map(loadAnimForInstance));

  const mech: LoadedMech = {
    root,
    meshes,
    skeletons,
    anims,
    loadAnim: loadAnimForInstance,
    get idleAnim() {
      return anims.get("idle")!;
    },
    get strafeLeftAnim() {
      return anims.get("strafe_left") || anims.get("idle")!;
    },
    get strafeRightAnim() {
      return anims.get("strafe_right") || anims.get("idle")!;
    },
  };

  return mech;
}

export function scaleMechToHeight(mech: LoadedMech, targetHeight: number) {
  let minY = Infinity, maxY = -Infinity;
  for (const mesh of mech.meshes) {
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
    mech.root.scaling.setAll(scale);
  }
}
