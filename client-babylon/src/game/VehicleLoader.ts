import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/loaders/glTF";
import { createEngineFlame } from "./EngineFlameEffect";
import type { EngineFlame } from "./EngineFlameEffect";

export interface LoadedVehicle {
  root: TransformNode;
  wheels: Mesh[];
  meshes: Mesh[];
  flame: EngineFlame;
}

const MODEL_DIR = "/assets/apc/";
let vehicleContainer: AssetContainer | null = null;

async function ensureContainer(scene: Scene): Promise<AssetContainer> {
  if (vehicleContainer) return vehicleContainer;
  vehicleContainer = await SceneLoader.LoadAssetContainerAsync(MODEL_DIR, "model_retextured.glb", scene);
  return vehicleContainer;
}

export async function loadVehicle(scene: Scene): Promise<LoadedVehicle> {
  const container = await ensureContainer(scene);
  const inst = container.instantiateModelsToScene(name => `vehicle_${name}`, false);

  const glbRoot = inst.rootNodes[0] as TransformNode;
  const root = new TransformNode("vehicle_wrapper", scene);
  glbRoot.parent = root;

  // Collect all meshes
  const meshes: Mesh[] = [];
  for (const node of inst.rootNodes) {
    if (node instanceof Mesh) meshes.push(node);
    for (const child of node.getChildMeshes(false)) {
      if (child instanceof Mesh) meshes.push(child);
    }
  }

  // Find wheel meshes by name
  const wheels: Mesh[] = [];
  for (const mesh of meshes) {
    if (mesh.name.toLowerCase().includes("wheel")) {
      wheels.push(mesh);
    }
  }

  // Dispose any lights that came with the GLB
  for (const light of inst.rootNodes) {
    if ((light as any).intensity !== undefined && !(light instanceof TransformNode)) {
      light.dispose();
    }
  }

  // Freeze materials for performance
  for (const mesh of meshes) {
    mesh.receiveShadows = true;
    if (mesh.material) {
      const mat = mesh.material as any;
      if (mat.usePhysicalLightFalloff !== undefined) {
        mat.usePhysicalLightFalloff = false;
      }
      mesh.material.freeze();
    }
  }

  const flame = createEngineFlame(scene, glbRoot);

  return { root, wheels, meshes, flame };
}

export function scaleVehicle(vehicle: LoadedVehicle, targetWidth: number) {
  // Model is 2.0 units wide in Blender
  const scale = targetWidth / 2.0;
  vehicle.root.scaling.setAll(scale);
}

export function resetVehicleTemplate() {
  vehicleContainer = null;
}
