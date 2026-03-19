import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Constants } from "@babylonjs/core/Engines/constants";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

const VFX_DIR = "/assets/dragon/vfx/";

interface FireBillboard {
  mesh: Mesh;
  baseScale: number;
  offset: number;
  phaseOffset: number;
}

export interface FireBreathInstance {
  start(): void;
  stop(): void;
  update(dt: number): void;
  dispose(): void;
  readonly active: boolean;
}

// Shared materials cache — all dragons reuse the same 5 materials
let sharedMaterials: StandardMaterial[] | null = null;

const LAYERS = [
  { tex: "fire_core.png", size: 1.2, offset: 0.5 },
  { tex: "fire_core.png", size: 2.0, offset: 2.0 },
  { tex: "fire_mid.png", size: 3.5, offset: 4.5 },
  { tex: "fire_mid.png", size: 5.0, offset: 7.0 },
  { tex: "fire_smoke.png", size: 6.5, offset: 10.0 },
];

function ensureSharedMaterials(scene: Scene): StandardMaterial[] {
  if (sharedMaterials) return sharedMaterials;

  // Load each unique texture once
  const texCache = new Map<string, Texture>();
  for (const cfg of LAYERS) {
    if (!texCache.has(cfg.tex)) {
      const tex = new Texture(VFX_DIR + cfg.tex, scene, false, true, Texture.BILINEAR_SAMPLINGMODE);
      tex.hasAlpha = true;
      texCache.set(cfg.tex, tex);
    }
  }

  sharedMaterials = LAYERS.map((cfg, i) => {
    const mat = new StandardMaterial(`fireBreathMat_shared_${i}`, scene);
    mat.diffuseTexture = texCache.get(cfg.tex)!;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = i < 2
      ? new Color3(1.0, 0.8, 0.3)
      : i < 4
        ? new Color3(1.0, 0.4, 0.1)
        : new Color3(0.3, 0.2, 0.15);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.alphaMode = i < 4 ? Constants.ALPHA_ADD : Constants.ALPHA_COMBINE;
    return mat;
  });

  return sharedMaterials;
}

export function createFireBreath(
  scene: Scene,
  jawNode: TransformNode,
): FireBreathInstance {
  const billboards: FireBillboard[] = [];
  let active = false;
  let elapsed = 0;

  const mats = ensureSharedMaterials(scene);

  for (let i = 0; i < LAYERS.length; i++) {
    const cfg = LAYERS[i];

    const plane = MeshBuilder.CreatePlane(`fireBreath_${i}`, {
      size: 1,
    }, scene);

    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.parent = jawNode;
    plane.position.set(0, 0, cfg.offset);
    plane.scaling.setAll(cfg.size);
    plane.material = mats[i];
    plane.setEnabled(false);
    plane.renderingGroupId = 1;

    billboards.push({
      mesh: plane,
      baseScale: cfg.size,
      offset: cfg.offset,
      phaseOffset: i * 1.3,
    });
  }

  function start() {
    if (active) return;
    active = true;
    elapsed = 0;
    for (const bb of billboards) {
      bb.mesh.setEnabled(true);
    }
  }

  function stop() {
    if (!active) return;
    active = false;
    for (const bb of billboards) {
      bb.mesh.setEnabled(false);
    }
  }

  function update(dt: number) {
    if (!active) return;
    elapsed += dt;

    for (const bb of billboards) {
      const t = elapsed * 3.0 + bb.phaseOffset;

      const scalePulse = 1.0 + Math.sin(t * 2.7) * 0.15 + Math.sin(t * 4.3) * 0.08;
      bb.mesh.scaling.setAll(bb.baseScale * scalePulse);

      // Note: alpha flickering via shared material affects all instances simultaneously.
      // This is acceptable — all fire breaths flicker in sync, barely noticeable.
      const mat = bb.mesh.material as StandardMaterial;
      const flicker = 0.7 + Math.sin(t * 5.1) * 0.2 + Math.sin(t * 8.7) * 0.1;
      mat.alpha = Math.max(0.3, Math.min(1.0, flicker));

      bb.mesh.rotation.z = Math.sin(t * 1.5) * 0.3;
    }
  }

  function dispose() {
    // Only dispose meshes — materials are shared and reused
    for (const bb of billboards) {
      bb.mesh.dispose();
    }
    billboards.length = 0;
  }

  return {
    start,
    stop,
    update,
    dispose,
    get active() { return active; },
  };
}
