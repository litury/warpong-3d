import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexAnimationBaker } from "@babylonjs/core/BakedVertexAnimation/vertexAnimationBaker";
import { BakedVertexAnimationManager } from "@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager";
import { AnimationRange } from "@babylonjs/core/Animations/animationRange";
import type { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import "@babylonjs/loaders/glTF";

const ZOMBIE_TARGET_HEIGHT = 30;

export interface AnimRangeInfo {
  name: string;
  startFrame: number;
  endFrame: number;
  frameCount: number;
}

export interface ZombieVATData {
  mesh: Mesh;
  vatTexture: RawTexture;
  manager: BakedVertexAnimationManager;
  anims: Map<string, AnimRangeInfo>;
}

export async function initZombieVAT(scene: Scene): Promise<ZombieVATData> {
  // 1. Load GLB into asset container
  const container = await SceneLoader.LoadAssetContainerAsync("/assets/", "zombie.glb", scene);

  // 2. Instantiate once for baking
  const inst = container.instantiateModelsToScene(name => `vat_bake_${name}`, false);
  const skeleton = inst.skeletons[0];

  // 3. Collect meshes with actual geometry
  const meshesWithGeometry: Mesh[] = [];
  for (const node of inst.rootNodes) {
    if (node instanceof Mesh && node.getTotalVertices() > 0) {
      meshesWithGeometry.push(node);
    }
    for (const child of node.getChildMeshes(false)) {
      if (child instanceof Mesh && child.getTotalVertices() > 0) {
        meshesWithGeometry.push(child);
      }
    }
  }

  // 4. Merge into single mesh if multiple, or use the single one
  let templateMesh: Mesh;
  if (meshesWithGeometry.length === 0) {
    throw new Error("zombie.glb has no meshes with geometry");
  } else if (meshesWithGeometry.length === 1) {
    templateMesh = meshesWithGeometry[0];
  } else {
    // Detach from parent before merging so transforms are baked in
    for (const m of meshesWithGeometry) {
      m.computeWorldMatrix(true);
    }
    const merged = Mesh.MergeMeshes(
      meshesWithGeometry,
      true,   // disposeSource
      true,   // allow32BitsIndices
      undefined,
      true,   // multiMultiMaterials
      true,   // subdivideWithSubMeshes
    );
    if (!merged) throw new Error("Failed to merge zombie meshes");
    templateMesh = merged;
    templateMesh.skeleton = skeleton;
  }

  // 5. Register animation ranges on skeleton from AnimationGroups
  const animationGroups = inst.animationGroups;
  const ranges: AnimationRange[] = [];

  for (const ag of animationGroups) {
    const name = ag.name;
    const from = ag.from;
    const to = ag.to;
    skeleton.createAnimationRange(name, from, to);
    ranges.push(new AnimationRange(name, from, to));
    ag.stop();
  }

  // 6. Bake VAT
  const baker = new VertexAnimationBaker(scene, templateMesh);
  const vertexData = await baker.bakeVertexData(ranges);
  const vatTexture = baker.textureFromBakedVertexData(vertexData);

  // 7. Build animation range map (baker concatenates ranges sequentially)
  const anims = new Map<string, AnimRangeInfo>();
  let frameOffset = 0;
  for (const range of ranges) {
    const frameCount = Math.round(range.to - range.from);
    anims.set(range.name.toLowerCase(), {
      name: range.name,
      startFrame: frameOffset,
      endFrame: frameOffset + frameCount,
      frameCount,
    });
    frameOffset += frameCount;
  }

  // 8. Setup BakedVertexAnimationManager
  const manager = new BakedVertexAnimationManager(scene);
  manager.texture = vatTexture;
  manager.isEnabled = true;
  templateMesh.bakedVertexAnimationManager = manager;

  // 9. Dispose skeleton and animation groups (no longer needed after baking)
  for (const ag of animationGroups) ag.dispose();
  skeleton.dispose();
  templateMesh.skeleton = null;

  // 10. Scale template mesh to target height
  templateMesh.computeWorldMatrix(true);
  const bounds = templateMesh.getBoundingInfo();
  const currentHeight = bounds.boundingBox.maximumWorld.y - bounds.boundingBox.minimumWorld.y;
  if (currentHeight > 0) {
    const scale = ZOMBIE_TARGET_HEIGHT / currentHeight;
    templateMesh.scaling.setAll(scale);
    templateMesh.bakeCurrentTransformIntoVertices();
  }

  // 11. Dispose root transform nodes from the instantiation
  for (const node of inst.rootNodes) {
    if (node !== templateMesh && !templateMesh.isDescendantOf(node)) {
      node.dispose();
    }
  }

  // Detach from any parent
  templateMesh.parent = null;

  // Freeze material for perf
  if (templateMesh.material) templateMesh.material.freeze();

  // Dispose the container (we have everything we need)
  container.dispose();

  return { mesh: templateMesh, vatTexture, manager, anims };
}
