import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BALL_SIZE,
  PADDLE_HEIGHT,
  PADDLE_MARGIN,
  PADDLE_WIDTH,
} from "../config/gameConfig";
import { loadMech, scaleMechToHeight } from "./MechLoader";
import type { LoadedMech } from "./MechLoader";

const MECH_SIZE = 70;

export interface GameObjects {
  ball: Mesh;
  leftShield: Mesh;
  rightShield: Mesh;
  leftMech: LoadedMech;
  rightMech: LoadedMech;
}

export async function createGameScene(engine: Engine): Promise<{
  scene: Scene;
  objects: GameObjects;
  camera: ArcRotateCamera;
  updateScoreboard: (left: number, right: number) => void;
}> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.02, 0.02, 0.05, 1);

  // --- Fog ---
  // Camera is ~900 units from arena center; fog must start beyond arena far edge (~1300 units)
  scene.fogMode = 3; // FOGMODE_LINEAR (0=none,1=exp,2=exp2,3=linear)
  scene.fogColor = new Color3(0.02, 0.02, 0.05);
  scene.fogStart = 1000;
  scene.fogEnd = 1600;

  // --- Camera ---
  const camera = new ArcRotateCamera(
    "cam",
    Math.PI,
    1.05,
    850,
    new Vector3(-50, 0, 0),
    scene,
  );
  camera.inputs.clear();

  // --- Lighting ---
  const keyLight = new DirectionalLight(
    "key",
    new Vector3(-1, -2, 1).normalize(),
    scene,
  );
  keyLight.intensity = 0.8;
  keyLight.diffuse = new Color3(1, 0.95, 0.9);

  const fillLight = new HemisphericLight("fill", new Vector3(0, 1, 0), scene);
  fillLight.intensity = 0.4;
  fillLight.groundColor = new Color3(0.1, 0.1, 0.2);

  const rimLight = new PointLight("rim", new Vector3(0, 300, -400), scene);
  rimLight.intensity = 0.5;
  rimLight.diffuse = new Color3(0.7, 0.8, 1);

  // --- Arena floor ---
  const floor = MeshBuilder.CreateGround(
    "arena",
    {
      width: ARENA_WIDTH,
      height: ARENA_HEIGHT,
    },
    scene,
  );
  const floorMat = new StandardMaterial("floorMat", scene);
  floorMat.diffuseTexture = new Texture("/assets/arena_bg.ktx2", scene);
  floorMat.specularColor = new Color3(0.1, 0.1, 0.1);
  floor.material = floorMat;
  floor.freezeWorldMatrix();
  floorMat.freeze();

  // --- Ball ---
  const ball = MeshBuilder.CreateSphere("ball", { diameter: BALL_SIZE }, scene);
  const ballMat = new StandardMaterial("ballMat", scene);
  ballMat.emissiveColor = new Color3(1, 1, 1);
  ballMat.diffuseColor = new Color3(1, 1, 1);
  ball.material = ballMat;
  ball.position.y = BALL_SIZE / 2;

  // --- Shields ---
  const shieldMat = new StandardMaterial("shieldMat", scene);
  shieldMat.diffuseColor = new Color3(0.3, 0.5, 1);
  shieldMat.emissiveColor = new Color3(0.1, 0.2, 0.5);
  shieldMat.alpha = 0.5;
  shieldMat.backFaceCulling = false;

  const leftShield = MeshBuilder.CreateBox(
    "leftShield",
    {
      width: PADDLE_WIDTH,
      height: 40,
      depth: PADDLE_HEIGHT,
    },
    scene,
  );
  leftShield.position.x = -ARENA_WIDTH / 2 + PADDLE_MARGIN + 30;
  leftShield.position.y = 20;
  leftShield.material = shieldMat;

  const rightShield = MeshBuilder.CreateBox(
    "rightShield",
    {
      width: PADDLE_WIDTH,
      height: 40,
      depth: PADDLE_HEIGHT,
    },
    scene,
  );
  rightShield.position.x = ARENA_WIDTH / 2 - PADDLE_MARGIN - 30;
  rightShield.position.y = 20;
  rightShield.material = shieldMat.clone("rightShieldMat");

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

  leftMech.idleAnim.start(true);
  rightMech.idleAnim.start(true);

  fitCameraToArena(camera, engine, floor);
  engine.onResizeObservable.add(() => fitCameraToArena(camera, engine, floor));

  return {
    scene,
    camera,
    objects: { ball, leftShield, rightShield, leftMech, rightMech },
    updateScoreboard,
  };
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
  // wall_side.ktx2 is 768×512 (3:2) → width = WALL_H * 1.5
  const SIDE_W = WALL_H * (768 / 512);
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

  const sideWallMat = makeWallMat("/assets/wall_side.ktx2");

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
      tex: "/assets/crowd_side_2.png",
    },
    {
      px: 80,
      py: CROWD_H / 2,
      pz: OFFSET_Z,
      ry: Math.PI,
      tex: "/assets/crowd_side_1.png",
    },
    {
      px: 220,
      py: CROWD_H / 2,
      pz: OFFSET_Z,
      ry: Math.PI,
      tex: "/assets/crowd_side_2.png",
    },
    {
      px: -80,
      py: CROWD_H / 2,
      pz: -OFFSET_Z,
      ry: 0,
      tex: "/assets/crowd_side_1.png",
    },
    {
      px: 80,
      py: CROWD_H / 2,
      pz: -OFFSET_Z,
      ry: 0,
      tex: "/assets/crowd_side_2.png",
    },
    {
      px: 220,
      py: CROWD_H / 2,
      pz: -OFFSET_Z,
      ry: 0,
      tex: "/assets/crowd_side_1.png",
    },
    // Back crowd (+X wall) — flanking scoreboard
    {
      px: OFFSET_X,
      py: CROWD_H / 2,
      pz: 200,
      ry: Math.PI / 2,
      tex: "/assets/crowd_side_1.png",
    },
    {
      px: OFFSET_X,
      py: CROWD_H / 2,
      pz: -200,
      ry: Math.PI / 2,
      tex: "/assets/crowd_side_2.png",
    },
  ];

  const crowdPlanes: Mesh[] = [];
  for (const { px, py, pz, ry, tex } of sidePlacements) {
    const plane = MeshBuilder.CreatePlane(
      `crowd_${pz}`,
      { width: CROWD_W, height: CROWD_H },
      scene,
    );
    plane.material = makeCrowdMat(tex);
    plane.position.set(px, py, pz);
    plane.rotation.y = ry;
    plane.freezeWorldMatrix();
    crowdPlanes.push(plane);
  }

  // --- Scoreboard billboard (far end, +X) with DynamicTexture ---
  // scoreboard.png is 1536×1024 (3:2)
  const TEX_W = 1024;
  const TEX_H = 682;
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
  bgImg.src = "/assets/scoreboard_clean.png";
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
    const fontSize = 170;
    ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Left score (orange glow)
    ctx.fillStyle = "#ff6a00";
    ctx.shadowColor = "#ff6a00";
    ctx.shadowBlur = 25;
    ctx.fillText(`${left}`, 287, 341);

    // Separator ":"
    ctx.fillStyle = "#555";
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillText(":", 370, 328);

    // Right score (cyan glow)
    ctx.fillStyle = "#aaeeff";
    ctx.shadowColor = "#aaeeff";
    ctx.shadowBlur = 25;
    ctx.fillText(`${right}`, 454, 314);

    ctx.shadowBlur = 0;
    dynTex.update();
  }

  // Gentle bobbing animation — crowd cheering effect
  let t = 0;
  scene.registerBeforeRender(() => {
    t += 0.016;
    for (let i = 0; i < crowdPlanes.length; i++) {
      const bob = 1 + Math.sin(t * 1.8 + i * 1.1) * 0.025;
      crowdPlanes[i].unfreezeWorldMatrix();
      crowdPlanes[i].scaling.y = bob;
      crowdPlanes[i].freezeWorldMatrix();
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
