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
  idleAnim: AnimationGroup;
  walkAnim: AnimationGroup;
  skeletons: Skeleton[];
}

let container: AssetContainer | null = null;

async function ensureContainer(scene: Scene): Promise<AssetContainer> {
  if (container) return container;
  container = await SceneLoader.LoadAssetContainerAsync("/assets/", "mech_final.glb", scene);
  return container;
}

export async function loadMech(
  scene: Scene,
  name: string,
): Promise<LoadedMech> {
  const c = await ensureContainer(scene);
  const inst = c.instantiateModelsToScene(n => `${name}_${n}`, false);

  const root = inst.rootNodes[0] as TransformNode;

  const meshes: Mesh[] = [];
  for (const node of inst.rootNodes) {
    if (node instanceof Mesh) meshes.push(node);
    for (const child of node.getChildMeshes(false)) {
      if (child instanceof Mesh) meshes.push(child);
    }
  }

  // Freeze materials
  for (const mesh of meshes) {
    if (mesh.material) mesh.material.freeze();
  }

  const ag = inst.animationGroups;
  const idleAnim = ag.find(a => a.name.includes("idle")) || ag[0];
  const walkAnim = ag.find(a => a.name.includes("walk")) || ag[0];

  for (const a of ag) a.stop();

  return {
    root,
    meshes,
    idleAnim,
    walkAnim,
    skeletons: inst.skeletons,
  };
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
