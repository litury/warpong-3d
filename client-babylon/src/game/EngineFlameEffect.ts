import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

const VFX_DIR = "/assets/dragon/vfx/";

interface FlameBillboard {
  mesh: Mesh;
  baseScale: number;
  phaseOffset: number;
}

export interface EngineFlame {
  meshes: Mesh[];
  update(dt: number): void;
  dispose(): void;
}

const LAYERS = [
  { tex: "fire_core.png", size: 0.15, offset: 0.85 },
  { tex: "fire_core.png", size: 0.25, offset: 1.0 },
  { tex: "fire_mid.png", size: 0.35, offset: 1.15 },
];

export function createEngineFlame(
  scene: Scene,
  parentNode: TransformNode,
): EngineFlame {
  const billboards: FlameBillboard[] = [];
  const meshes: Mesh[] = [];
  let elapsed = 0;

  // Load textures (cached by Babylon internally per URL)
  const texCache = new Map<string, Texture>();
  for (const cfg of LAYERS) {
    if (!texCache.has(cfg.tex)) {
      const tex = new Texture(VFX_DIR + cfg.tex, scene, false, true, Texture.BILINEAR_SAMPLINGMODE);
      tex.hasAlpha = true;
      texCache.set(cfg.tex, tex);
    }
  }

  // Separate materials (not shared with dragon fire breath)
  const mats = LAYERS.map((cfg, i) => {
    const mat = new StandardMaterial(`engineFlameMat_${i}`, scene);
    mat.diffuseTexture = texCache.get(cfg.tex)!;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = i < 2
      ? new Color3(1.0, 0.8, 0.3)
      : new Color3(1.0, 0.5, 0.1);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.alphaMode = Constants.ALPHA_ADD;
    return mat;
  });

  for (let i = 0; i < LAYERS.length; i++) {
    const cfg = LAYERS[i];
    const plane = MeshBuilder.CreatePlane(`engineFlame_${i}`, { size: 1 }, scene);
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.parent = parentNode;
    plane.position.set(0, 0.2, cfg.offset);
    plane.scaling.setAll(cfg.size);
    plane.material = mats[i];
    plane.renderingGroupId = 1;

    billboards.push({
      mesh: plane,
      baseScale: cfg.size,
      phaseOffset: i * 1.1,
    });
    meshes.push(plane);
  }

  function update(dt: number) {
    elapsed += dt;

    for (const bb of billboards) {
      const t = elapsed * 4.0 + bb.phaseOffset;

      const scalePulse = 1.0 + Math.sin(t * 3.2) * 0.18 + Math.sin(t * 5.1) * 0.1;
      bb.mesh.scaling.setAll(bb.baseScale * scalePulse);

      const mat = bb.mesh.material as StandardMaterial;
      const flicker = 0.75 + Math.sin(t * 6.3) * 0.15 + Math.sin(t * 10.1) * 0.1;
      mat.alpha = Math.max(0.35, Math.min(1.0, flicker));

      bb.mesh.rotation.z = Math.sin(t * 2.0) * 0.25;
    }
  }

  function dispose() {
    for (const bb of billboards) {
      bb.mesh.dispose();
    }
    for (const mat of mats) {
      mat.dispose();
    }
    billboards.length = 0;
    meshes.length = 0;
  }

  return { meshes, update, dispose };
}
