import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_MARGIN,
} from "../config/gameConfig";
import { createEnergyShieldMaterial } from "./EnergyShieldMaterial";
import type { LoadedMech } from "./MechLoader";
import { loadMech, scaleMechToHeight } from "./MechLoader";
import type { PlasmaOrb } from "./PlasmaOrb";
import { createPlasmaOrb, scalePlasmaOrb } from "./PlasmaOrb";

const MECH_SIZE = 70;

export interface GameObjects {
  orb: PlasmaOrb;
  leftShield: Mesh;
  rightShield: Mesh;
  leftShieldMat: ShaderMaterial;
  rightShieldMat: ShaderMaterial;
  leftMech: LoadedMech;
  rightMech: LoadedMech;
  fogSystems: ParticleSystem[];
}

export async function createGameScene(engine: Engine): Promise<{
  scene: Scene;
  objects: GameObjects;
  camera: ArcRotateCamera;
  shadowGen: ShadowGenerator;
  updateScoreboard: (left: number, right: number) => void;
}> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.02, 0.05, 1);
  // Don't clear depth for rendering group 1 (shields) so they respect mech depth
  scene.setRenderingAutoClearDepthStencil(1, false);

  // Локальный env map — PBR-материалам обязательно нужен для корректного освещения
  scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
    "./assets/environmentSpecular.env",
    scene,
  );
  scene.environmentIntensity = 3.0;

  // --- Camera ---
  const BASE_RADIUS = 850;
  const camera = new ArcRotateCamera(
    "cam",
    Math.PI,
    1.05,
    BASE_RADIUS,
    new Vector3(-50, 0, 0),
    scene,
  );
  camera.inputs.clear();

  // --- Lighting ---
  // Key light — основной направленный свет (тёплый, сверху-справа)
  const keyLight = new DirectionalLight(
    "key",
    new Vector3(-1, -2, 1).normalize(),
    scene,
  );
  keyLight.intensity = 2.0;
  keyLight.diffuse = new Color3(1, 0.95, 0.9);

  // Shadows from key light
  const shadowGen = new ShadowGenerator(512, keyLight);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurKernel = 4;

  // Fill light — заполняющий свет (ambience всей сцены, снижен чтобы не смывать тени)
  const fillLight = new HemisphericLight("fill", new Vector3(0, 1, 0), scene);
  fillLight.intensity = 0.8;
  fillLight.diffuse = new Color3(0.9, 0.9, 1.0);
  fillLight.groundColor = new Color3(0.15, 0.15, 0.25);
  fillLight.specular = new Color3(0.3, 0.3, 0.4);

  // --- Arena floor (extra margin so mech shadows aren't clipped) ---
  const FLOOR_MARGIN = 120;
  const floor = MeshBuilder.CreateGround(
    "arena",
    {
      width: ARENA_WIDTH + FLOOR_MARGIN,
      height: ARENA_HEIGHT + FLOOR_MARGIN,
    },
    scene,
  );
  const floorMat = new StandardMaterial("floorMat", scene);
  floorMat.diffuseTexture = new Texture("./assets/arena_bg.png", scene);
  floorMat.specularColor = new Color3(0.1, 0.1, 0.1);
  floor.material = floorMat;
  floor.receiveShadows = true;
  floor.freezeWorldMatrix();
  floorMat.freeze();

  // --- Plasma Orb (replaces ball) ---
  const orb = createPlasmaOrb(scene);
  scalePlasmaOrb(orb, 25); // ~25 game units diameter

  // --- Energy Shields (curved planes in front of mechs) ---
  const SHIELD_W = PADDLE_HEIGHT; // 100 — matches paddle collision width
  const SHIELD_H = 45; // shorter than walls (40) won't stick out from camera angle
  const leftShieldMat = createEnergyShieldMaterial(
    "leftShieldMat",
    scene,
    new Color3(0.3, 0.5, 1.0),
  );
  const rightShieldMat = createEnergyShieldMaterial(
    "rightShieldMat",
    scene,
    new Color3(1.0, 0.3, 0.5),
  );

  // Shield pattern texture (sparkle overlay)
  const shieldTex = new Texture("./assets/shield_pattern.png", scene);
  shieldTex.wrapU = Texture.WRAP_ADDRESSMODE;
  shieldTex.wrapV = Texture.WRAP_ADDRESSMODE;
  // Set shield size for edge fade calculation (half-extents)
  const shieldSizeVec = new Vector2(SHIELD_W / 2, SHIELD_H / 2);
  leftShieldMat.setTexture("uPatternTex", shieldTex);
  leftShieldMat.setVector2("uShieldSize", shieldSizeVec);
  rightShieldMat.setTexture("uPatternTex", shieldTex);
  rightShieldMat.setVector2("uShieldSize", shieldSizeVec);

  // Use subdivided ground for enough vertices to bend in the shader
  const shieldOpts = {
    width: SHIELD_W,
    height: SHIELD_H,
    subdivisionsX: 20,
    subdivisionsY: 12,
    sideOrientation: Mesh.DEFAULTSIDE,
  };

  const SHIELD_OFFSET = 25; // how far in front of the mech the shield floats
  const leftShield = MeshBuilder.CreatePlane("leftShield", shieldOpts, scene);
  leftShield.position.x = -ARENA_WIDTH / 2 + PADDLE_MARGIN + SHIELD_OFFSET;
  leftShield.position.y = SHIELD_H / 2;
  leftShield.rotation.y = Math.PI / 2; // face right (toward opponent)
  leftShield.material = leftShieldMat;
  leftShield.renderingGroupId = 1; // render after opaque meshes (mechs)

  const rightShield = MeshBuilder.CreatePlane("rightShield", shieldOpts, scene);
  rightShield.position.x = ARENA_WIDTH / 2 - PADDLE_MARGIN - SHIELD_OFFSET;
  rightShield.position.y = SHIELD_H / 2;
  rightShield.rotation.y = -Math.PI / 2; // face left (toward opponent)
  rightShield.material = rightShieldMat;
  rightShield.renderingGroupId = 1; // render after opaque meshes (mechs)

  // GlowLayer — bloom only on shields (disabled on mobile to save GPU)
  // GlowLayer — bloom only on shields
  const glowLayer = new GlowLayer("glow", scene, { mainTextureSamples: 1, mainTextureRatio: 0.5 });
  glowLayer.intensity = 1.0;
  glowLayer.addIncludedOnlyMesh(leftShield as Mesh);
  glowLayer.addIncludedOnlyMesh(rightShield as Mesh);
  glowLayer.addIncludedOnlyMesh(orb.meshes[0]); // only core sphere, billboards already use ALPHA_ADD

  // --- Stadium environment ---
  const updateScoreboard = loadStadiumEnvironment(scene);

  // --- Load Mechs (sequential: first loads GLB, second clones from template) ---
  const leftMech = await loadMech(scene, "left");
  const rightMech = await loadMech(scene, "right");

  scaleMechToHeight(leftMech, MECH_SIZE);
  scaleMechToHeight(rightMech, MECH_SIZE);

  leftMech.root.position.x = -ARENA_WIDTH / 2 + PADDLE_MARGIN;
  leftMech.root.rotation.y = Math.PI / 2;

  rightMech.root.position.x = ARENA_WIDTH / 2 - PADDLE_MARGIN;
  rightMech.root.rotation.y = -Math.PI / 2;

  // Register mech meshes as shadow casters (plasma orb emits light, no shadow)
  for (const mesh of leftMech.meshes) shadowGen.addShadowCaster(mesh);
  for (const mesh of rightMech.meshes) shadowGen.addShadowCaster(mesh);

  leftMech.idleAnim.start(true);
  rightMech.idleAnim.start(true);

  // --- Particle fog at arena edges (zombie spawn zones) ---
  const fogSystems = createEdgeFog(scene);

  fitCameraToArena(camera, engine, floor);
  engine.onResizeObservable.add(() => fitCameraToArena(camera, engine, floor));

  return {
    scene,
    camera,
    shadowGen,
    objects: {
      orb,
      leftShield,
      rightShield,
      leftShieldMat,
      rightShieldMat,
      leftMech,
      rightMech,
      fogSystems,
    },
    updateScoreboard,
  };
}

function createEdgeFog(scene: Scene): ParticleSystem[] {
  const systems: ParticleSystem[] = [];
  const FOG_X = ARENA_WIDTH / 2 + 30; // 430 — behind mechs

  for (const side of [-1, 1]) {
    const ps = new ParticleSystem(`fog_${side > 0 ? "R" : "L"}`, 80, scene);
    ps.particleTexture = new Texture("./assets/smoke_01.png", scene);

    // Box emitter: full arena height wall behind mech
    ps.createBoxEmitter(
      new Vector3(-0.1, 0.02, -0.1), // direction1 — barely drifts
      new Vector3(0.1, 0.08, 0.1), // direction2
      new Vector3(-30, 0, -ARENA_HEIGHT / 2), // minEmitBox — full arena height
      new Vector3(30, 10, ARENA_HEIGHT / 2), // maxEmitBox
    );

    // Position emitter behind each mech
    ps.emitter = new Vector3(side * FOG_X, 0, 0);
    ps.minEmitPower = 0.02;
    ps.maxEmitPower = 0.1;

    // emitRate=20, avgLife=5s → ~100 particles alive = dense wall
    ps.minSize = 60;
    ps.maxSize = 80;
    ps.minLifeTime = 4;
    ps.maxLifeTime = 6;
    ps.emitRate = 12;
    ps.minAngularSpeed = 0.01;
    ps.maxAngularSpeed = 0.06;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;

    // Color gradient: thick enough to fully hide zombie spawns
    ps.addColorGradient(0, new Color4(0.5, 0.55, 0.7, 0));
    ps.addColorGradient(0.08, new Color4(0.5, 0.55, 0.7, 0.6));
    ps.addColorGradient(0.92, new Color4(0.5, 0.55, 0.7, 0.6));
    ps.addColorGradient(1.0, new Color4(0.5, 0.55, 0.7, 0));

    // Size gradient: large particles for heavy overlap
    ps.addSizeGradient(0, 50);
    ps.addSizeGradient(0.5, 70);
    ps.addSizeGradient(1.0, 80);

    ps.start();
    systems.push(ps);
  }

  return systems;
}

function loadStadiumEnvironment(
  scene: Scene,
): (left: number, right: number) => void {
  // Camera is at x≈-787, looking along +X axis.
  // "Far" side = +X (behind opponent goal), "sides" = ±Z
  // Never place anything at -X (that's between camera and arena)
  const OFFSET_X = ARENA_WIDTH / 2 + 80;
  const OFFSET_Z = ARENA_HEIGHT / 2 + 40;

  // --- Arena wall billboards (sprites on Planes, no deformation) ---
  const WALL_H = 40;
  // wall_side.png is 768×512 (3:2) → width = WALL_H * 1.5
  const SIDE_W = WALL_H * (1536 / 1024);
  const makeWallMat = (texPath: string) => {
    const mat = new StandardMaterial(`wallMat_${texPath}`, scene);
    const tex = new Texture(
      texPath,
      scene,
      false,
      true,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    tex.hasAlpha = true;
    mat.diffuseTexture = tex;
    mat.emissiveColor = new Color3(0.4, 0.4, 0.45);
    mat.backFaceCulling = false;
    mat.useAlphaFromDiffuseTexture = true;
    return mat;
  };

  const sideWallMat = makeWallMat("./assets/wall_side.png");

  // Side walls (±Z) only — no walls at ±X (behind player/opponent)
  const sideSegments = Math.ceil(ARENA_WIDTH / SIDE_W);
  const startX = -(sideSegments * SIDE_W) / 2 + SIDE_W / 2;
  for (let i = 0; i < sideSegments; i++) {
    const px = startX + i * SIDE_W;
    // +Z side
    const p1 = MeshBuilder.CreatePlane(
      `wallSide_pz_${i}`,
      { width: SIDE_W, height: WALL_H },
      scene,
    );
    p1.material = sideWallMat;
    p1.position.set(px, WALL_H / 2, ARENA_HEIGHT / 2);
    p1.rotation.y = Math.PI;
    p1.freezeWorldMatrix();
    // -Z side
    const p2 = MeshBuilder.CreatePlane(
      `wallSide_nz_${i}`,
      { width: SIDE_W, height: WALL_H },
      scene,
    );
    p2.material = sideWallMat;
    p2.position.set(px, WALL_H / 2, -ARENA_HEIGHT / 2);
    p2.rotation.y = 0;
    p2.freezeWorldMatrix();
  }

  // --- Crowd billboards (sides ±Z) ---
  // New sprites: 1536×1024 = 3:2
  const CROWD_W = ARENA_WIDTH * 0.55;
  const CROWD_H = CROWD_W * (1024 / 1536);

  const makeCrowdMat = (texPath: string) => {
    const mat = new StandardMaterial(`crowdMat_${texPath}`, scene);
    const tex = new Texture(
      texPath,
      scene,
      false,
      true,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    tex.hasAlpha = true;
    mat.diffuseTexture = tex;
    mat.emissiveColor = new Color3(0.7, 0.7, 0.8);
    mat.backFaceCulling = false;
    mat.useAlphaFromDiffuseTexture = true;
    return mat;
  };

  const sidePlacements = [
    // Side crowd (±Z) — near, mid, far along X axis
    {
      px: -80,
      py: CROWD_H / 2,
      pz: OFFSET_Z,
      ry: Math.PI,
      tex: "./assets/crowd_side_2.png",
    },
    {
      px: 80,
      py: CROWD_H / 2,
      pz: OFFSET_Z,
      ry: Math.PI,
      tex: "./assets/crowd_side_1.png",
    },
    {
      px: 220,
      py: CROWD_H / 2,
      pz: OFFSET_Z,
      ry: Math.PI,
      tex: "./assets/crowd_side_2.png",
    },
    {
      px: -80,
      py: CROWD_H / 2,
      pz: -OFFSET_Z,
      ry: 0,
      tex: "./assets/crowd_side_1.png",
    },
    {
      px: 80,
      py: CROWD_H / 2,
      pz: -OFFSET_Z,
      ry: 0,
      tex: "./assets/crowd_side_2.png",
    },
    {
      px: 220,
      py: CROWD_H / 2,
      pz: -OFFSET_Z,
      ry: 0,
      tex: "./assets/crowd_side_1.png",
    },
    // Back crowd (+X wall) — flanking scoreboard
    {
      px: OFFSET_X,
      py: CROWD_H / 2,
      pz: 200,
      ry: Math.PI / 2,
      tex: "./assets/crowd_side_1.png",
    },
    {
      px: OFFSET_X,
      py: CROWD_H / 2,
      pz: -200,
      ry: Math.PI / 2,
      tex: "./assets/crowd_side_2.png",
    },
  ];

  // Pre-create only 2 crowd materials (one per texture) and share between planes
  const crowdMatCache = new Map<string, StandardMaterial>();
  const crowdPlanes: Mesh[] = [];
  for (const { px, py, pz, ry, tex } of sidePlacements) {
    const plane = MeshBuilder.CreatePlane(
      `crowd_${pz}`,
      { width: CROWD_W, height: CROWD_H },
      scene,
    );
    if (!crowdMatCache.has(tex)) {
      crowdMatCache.set(tex, makeCrowdMat(tex));
    }
    plane.material = crowdMatCache.get(tex)!;
    plane.position.set(px, py, pz);
    plane.rotation.y = ry;
    plane.freezeWorldMatrix();
    crowdPlanes.push(plane);
  }

  // --- Scoreboard billboard (far end, +X) with DynamicTexture ---
  // scoreboard.png is 1536×1024 (3:2)
  const TEX_W = 512;
  const TEX_H = 341;
  const BOARD_W = ARENA_HEIGHT * 0.9;
  const BOARD_H = BOARD_W * (TEX_H / TEX_W);
  const scoreboard = MeshBuilder.CreatePlane(
    "scoreboard",
    { width: BOARD_W, height: BOARD_H },
    scene,
  );

  const dynTex = new DynamicTexture(
    "scoreboardTex",
    { width: TEX_W, height: TEX_H },
    scene,
    false,
  );
  dynTex.hasAlpha = true;
  const boardMat = new StandardMaterial("boardMat", scene);
  boardMat.diffuseTexture = dynTex;
  boardMat.emissiveColor = new Color3(1, 1, 1);
  boardMat.backFaceCulling = false;
  boardMat.useAlphaFromDiffuseTexture = true;
  scoreboard.material = boardMat;
  scoreboard.position.set(OFFSET_X, BOARD_H / 2 + 20, 0);
  scoreboard.rotation.y = Math.PI / 2;
  scoreboard.freezeWorldMatrix();

  // Load scoreboard.png as background image for DynamicTexture
  const bgImg = new Image();
  bgImg.src = "./assets/scoreboard_clean.png";
  let bgReady = false;
  bgImg.onload = () => {
    bgReady = true;
    drawScore(0, 0);
  };

  function drawScore(left: number, right: number) {
    const ctx = dynTex.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, TEX_W, TEX_H);

    if (bgReady) {
      ctx.drawImage(bgImg, 0, 0, TEX_W, TEX_H);
    }

    // Digit positions matched to scoreboard.png pixel analysis:
    // Left orange "0" center: 28%, 50% → x=287, y=341
    // Right cyan "0" center: 44.3%, 46% → x=454, y=314
    const fontSize = 85;
    ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Left score (orange glow)
    ctx.fillStyle = "#ff6a00";
    ctx.shadowColor = "#ff6a00";
    ctx.shadowBlur = 12;
    ctx.fillText(`${left}`, 144, 171);

    // Separator ":"
    ctx.fillStyle = "#555";
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillText(":", 185, 164);

    // Right score (cyan glow)
    ctx.fillStyle = "#aaeeff";
    ctx.shadowColor = "#aaeeff";
    ctx.shadowBlur = 12;
    ctx.fillText(`${right}`, 227, 157);

    ctx.shadowBlur = 0;
    dynTex.update();
  }

  // Gentle bobbing animation — crowd cheering effect (update every 3rd frame to reduce GC)
  let t = 0;
  let frameSkip = 0;
  scene.registerBeforeRender(() => {
    t += 0.016;
    if (++frameSkip % 3 !== 0) return;
    for (let i = 0; i < crowdPlanes.length; i++) {
      const bob = 1 + Math.sin(t * 1.8 + i * 1.1) * 0.025;
      crowdPlanes[i].scaling.y = bob;
    }
  });

  return drawScore;
}

function fitCameraToArena(
  camera: ArcRotateCamera,
  engine: Engine,
  _floor: Mesh,
) {
  const aspect = engine.getAspectRatio(camera);
  camera.fovMode =
    aspect < 1
      ? Camera.FOVMODE_HORIZONTAL_FIXED
      : Camera.FOVMODE_VERTICAL_FIXED;
}
