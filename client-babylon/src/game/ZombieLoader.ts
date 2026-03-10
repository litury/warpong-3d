import { Scene } from "@babylonjs/core/scene";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { initZombieVAT, type ZombieVATData, type AnimRangeInfo } from "./ZombieVAT";

const MAX_INSTANCES = 40;
const ANIM_FPS = 30;

// Hidden instance: scale 0 matrix
const ZERO_MATRIX = Matrix.Scaling(0, 0, 0);
const HIDDEN_ANIM_PARAMS = [0, 0, 0, 0];

export interface ZombieThinHandle {
  index: number;
}

// Module state
let vatData: ZombieVATData | null = null;
let matrixBuffer: Float32Array;
let animBuffer: Float32Array;
let freeList: number[] = [];
let highWaterMark = 0; // highest active index + 1

// Temp objects to avoid per-frame allocations
const tmpMatrix = Matrix.Identity();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const tmpPos = new Vector3();

export async function initZombieInstances(scene: Scene): Promise<void> {
  vatData = await initZombieVAT(scene);

  // Pre-allocate buffers
  matrixBuffer = new Float32Array(MAX_INSTANCES * 16);
  animBuffer = new Float32Array(MAX_INSTANCES * 4);

  // Initialize all slots as hidden (zero-scale)
  const zeroArr = new Float32Array(16);
  ZERO_MATRIX.copyToArray(zeroArr);
  for (let i = 0; i < MAX_INSTANCES; i++) {
    matrixBuffer.set(zeroArr, i * 16);
  }

  // Set up thin instance buffers (dynamic)
  vatData.mesh.thinInstanceSetBuffer("matrix", matrixBuffer, 16, false);
  vatData.mesh.thinInstanceRegisterAttribute("bakedVertexAnimationSettingsInstanced", 4);
  vatData.mesh.thinInstanceSetBuffer("bakedVertexAnimationSettingsInstanced", animBuffer, 4, false);
  vatData.mesh.thinInstanceCount = 0;

  // Build free list (all slots available, in reverse for pop efficiency)
  freeList = [];
  for (let i = MAX_INSTANCES - 1; i >= 0; i--) {
    freeList.push(i);
  }
  highWaterMark = 0;
}

export function acquireInstance(): ZombieThinHandle | null {
  if (freeList.length === 0) return null;
  const index = freeList.pop()!;
  if (index >= highWaterMark) {
    highWaterMark = index + 1;
  }
  vatData!.mesh.thinInstanceCount = highWaterMark;
  return { index };
}

export function releaseInstance(h: ZombieThinHandle): void {
  // Hide by setting zero-scale matrix
  const offset = h.index * 16;
  ZERO_MATRIX.copyToArray(matrixBuffer, offset);

  // Zero out animation params
  const animOffset = h.index * 4;
  animBuffer.set(HIDDEN_ANIM_PARAMS, animOffset);

  freeList.push(h.index);

  // Recalculate high water mark
  recalcHighWaterMark();
}

function recalcHighWaterMark(): void {
  // Build a set of free indices for fast lookup
  const freeSet = new Set(freeList);
  let mark = highWaterMark;
  while (mark > 0 && freeSet.has(mark - 1)) {
    mark--;
  }
  highWaterMark = mark;
  vatData!.mesh.thinInstanceCount = highWaterMark;
}

export function setTransform(
  h: ZombieThinHandle,
  x: number, y: number, z: number,
  rotY: number,
  scaleVal: number,
): void {
  tmpPos.set(x, y, z);
  tmpScale.set(scaleVal, scaleVal, scaleVal);
  Quaternion.FromEulerAnglesToRef(0, rotY, 0, tmpQuat);
  Matrix.ComposeToRef(tmpScale, tmpQuat, tmpPos, tmpMatrix);
  tmpMatrix.copyToArray(matrixBuffer, h.index * 16);
}

export function setAnimation(
  h: ZombieThinHandle,
  animName: string,
  _loop: boolean,
  globalTime: number,
): void {
  const info = findAnim(animName);
  if (!info) return;

  const offset = h.index * 4;
  animBuffer[offset + 0] = info.startFrame;     // startFrame
  animBuffer[offset + 1] = info.endFrame;        // endFrame
  animBuffer[offset + 2] = -globalTime;           // offset (negative so anim starts from frame 0 at this moment)
  animBuffer[offset + 3] = ANIM_FPS;              // speed (frames per second)
}

export function freezeOnLastFrame(h: ZombieThinHandle, animName: string): void {
  const info = findAnim(animName);
  if (!info) return;

  const offset = h.index * 4;
  // Set start=end-1, end=end, speed=0 → frozen on last frame
  animBuffer[offset + 0] = info.endFrame - 1;
  animBuffer[offset + 1] = info.endFrame;
  animBuffer[offset + 2] = 0;
  animBuffer[offset + 3] = 0;
}

export function setInstanceScale(h: ZombieThinHandle, scaleVal: number): void {
  // Read current matrix, extract position & rotation, recompose with new scale
  // For perf, we directly scale the matrix columns (first 3 column vectors)
  const offset = h.index * 16;
  // Simple approach: we know the matrix structure, so re-normalize and scale
  // Actually, let's just store the params and recompose — simpler and correct
  // We'll need the caller to pass full transform again. Provide a scale-only shortcut:
  for (let col = 0; col < 3; col++) {
    const base = offset + col * 4;
    // Each column's length is the current scale on that axis
    const cx = matrixBuffer[base + 0];
    const cy = matrixBuffer[base + 1];
    const cz = matrixBuffer[base + 2];
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (len > 0) {
      const factor = scaleVal / len;
      matrixBuffer[base + 0] *= factor;
      matrixBuffer[base + 1] *= factor;
      matrixBuffer[base + 2] *= factor;
    }
  }
}

export function updateTime(dt: number): void {
  if (vatData) {
    vatData.manager.time += dt;
  }
}

export function getGlobalTime(): number {
  return vatData ? vatData.manager.time : 0;
}

export function getAnimDuration(animName: string): number {
  const info = findAnim(animName);
  if (!info) return 1;
  return info.frameCount / ANIM_FPS;
}

export function flushBuffers(): void {
  if (!vatData) return;
  vatData.mesh.thinInstanceBufferUpdated("matrix");
  vatData.mesh.thinInstanceBufferUpdated("bakedVertexAnimationSettingsInstanced");
}

export function disposeAll(): void {
  if (vatData) {
    vatData.mesh.dispose();
    vatData.vatTexture.dispose();
    vatData.manager.dispose();
    vatData = null;
  }
  freeList = [];
  highWaterMark = 0;
}

function findAnim(name: string): AnimRangeInfo | undefined {
  if (!vatData) return undefined;
  // Try exact match first, then substring match
  const lower = name.toLowerCase();
  const exact = vatData.anims.get(lower);
  if (exact) return exact;
  for (const [key, info] of vatData.anims) {
    if (key.includes(lower) || lower.includes(key)) return info;
  }
  return undefined;
}
