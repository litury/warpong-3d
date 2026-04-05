import { Constants } from "@babylonjs/core/Engines/constants";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { Scene } from "@babylonjs/core/scene";
import {
  createPlasmaOrbMaterial,
  triggerOrbImpact,
  updateOrbTime,
} from "./PlasmaOrbMaterial";

const PLASMA_DIR = "/assets/plasma/";

export interface PlasmaOrb {
  root: TransformNode;
  meshes: Mesh[];
  material: ShaderMaterial;
  update(dt: number): void;
  triggerImpact(time: number): void;
  dispose(): void;
}

interface AuraBillboard {
  mesh: Mesh;
  baseScale: number;
  phaseOffset: number;
  rotSpeed: number;
}

const AURA_LAYERS = [
  { tex: "flare_01.png", size: 1.4, rotSpeed: 0.3 },
  { tex: "twirl_01.png", size: 1.2, rotSpeed: -1.5 },
  { tex: "magic_03.png", size: 1.6, rotSpeed: 0.8 },
];

export function createPlasmaOrb(scene: Scene): PlasmaOrb {
  const root = new TransformNode("plasmaOrb_root", scene);
  const meshes: Mesh[] = [];
  const billboards: AuraBillboard[] = [];
  let elapsed = 0;

  // --- Core sphere with plasma shader ---
  const sphere = MeshBuilder.CreateSphere(
    "plasmaOrb_core",
    { diameter: 1.0, segments: 32 },
    scene,
  );
  sphere.parent = root;
  sphere.renderingGroupId = 1;

  const orbMat = createPlasmaOrbMaterial(
    "plasmaOrbMat",
    scene,
    new Color3(0.2, 1.0, 0.3),
  );
  sphere.material = orbMat;
  meshes.push(sphere);

  // --- Billboard aura layers ---
  const texCache = new Map<string, Texture>();
  for (const cfg of AURA_LAYERS) {
    if (!texCache.has(cfg.tex)) {
      const tex = new Texture(
        PLASMA_DIR + cfg.tex,
        scene,
        false,
        true,
        Texture.BILINEAR_SAMPLINGMODE,
      );
      tex.hasAlpha = true;
      texCache.set(cfg.tex, tex);
    }
  }

  for (let i = 0; i < AURA_LAYERS.length; i++) {
    const cfg = AURA_LAYERS[i];

    const mat = new StandardMaterial(`plasmaAura_mat_${i}`, scene);
    mat.diffuseTexture = texCache.get(cfg.tex)!;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = new Color3(0.1, 0.9, 0.2);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.freeze();

    const plane = MeshBuilder.CreatePlane(
      `plasmaAura_${i}`,
      { size: 1 },
      scene,
    );
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.parent = root;
    plane.scaling.setAll(cfg.size);
    plane.material = mat;
    plane.renderingGroupId = 1;

    billboards.push({
      mesh: plane,
      baseScale: cfg.size,
      phaseOffset: i * 1.3,
      rotSpeed: cfg.rotSpeed,
    });
    meshes.push(plane);
  }

  function update(dt: number) {
    elapsed += dt;
    const absTime = performance.now() / 1000;

    // Update shader time (absolute, same as shield — so impact timing works)
    updateOrbTime(orbMat, absTime);

    // Animate billboard auras
    const auraT = elapsed * 4.0;
    for (const bb of billboards) {
      const t = auraT + bb.phaseOffset;

      // Scale pulse
      const scalePulse =
        1.0 + Math.sin(t * 2.8) * 0.15 + Math.sin(t * 4.3) * 0.08;
      bb.mesh.scaling.setAll(bb.baseScale * scalePulse);

      // Rotation
      bb.mesh.rotation.z += bb.rotSpeed * dt;

      // Alpha flicker (use mesh.visibility to avoid unfreezing material)
      const flicker =
        0.6 + Math.sin(t * 5.1) * 0.2 + Math.sin(t * 8.7) * 0.1;
      bb.mesh.visibility = Math.max(0.25, Math.min(0.9, flicker));
    }
  }

  function triggerImpact(time: number) {
    triggerOrbImpact(orbMat, time);
  }

  function dispose() {
    for (const bb of billboards) {
      bb.mesh.material?.dispose();
      bb.mesh.dispose();
    }
    sphere.material?.dispose();
    sphere.dispose();
    root.dispose();
    billboards.length = 0;
    meshes.length = 0;
  }

  return { root, meshes, material: orbMat, update, triggerImpact, dispose };
}

export function scalePlasmaOrb(orb: PlasmaOrb, targetDiameter: number) {
  orb.root.scaling.setAll(targetDiameter);
}
