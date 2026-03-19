import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { Sprite } from "@babylonjs/core/Sprites/sprite";
import { SpriteManager } from "@babylonjs/core/Sprites/spriteManager";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PADDLE_MARGIN,
  WALL_INSET,
} from "../config/gameConfig";
import {
  LOD_DISTANCE,
  disposeZombie,
  hideZombie,
  scaleZombieToHeight,
  showZombie,
  spawnZombie,
  stopAllAnims,
  switchToHiDetail,
  switchToLod,
} from "./ZombieLoader";
import type { ZombieInstance } from "./ZombieLoader";

const ZOMBIE_SIZE = 30;
const ZOMBIE_SPEED = 60;
const SPAWN_INTERVAL = 3;
const BALL_KILL_RADIUS = 25;
const MAX_ZOMBIES = 40;
const MAX_POOL = 15;
const FIGHT_RADIUS = 20;
const FIGHT_RADIUS_SQ = FIGHT_RADIUS * FIGHT_RADIUS;
const FIGHT_DURATION = 2;
const BODY_LINGER = 5;
const MAX_DECALS = 50;
const DECAL_SIZE = 18;
const SCREAM_DURATION = 0.5;

const GRID_CELL = FIGHT_RADIUS; // cell size = fight radius so neighbours cover full range

class SpatialGrid {
  private cellInv: number;
  private cells = new Map<number, Zombie[]>();

  constructor(cellSize: number) {
    this.cellInv = 1 / cellSize;
  }

  clear() {
    this.cells.clear();
  }

  insert(z: Zombie) {
    const key = this.key(z.x, z.z);
    const bucket = this.cells.get(key);
    if (bucket) {
      bucket.push(z);
    } else {
      this.cells.set(key, [z]);
    }
  }

  /** Iterate all pairs of (left, right) zombies in same or adjacent cells */
  forEachFightPair(callback: (l: Zombie, r: Zombie) => boolean) {
    for (const [key, bucket] of this.cells) {
      // Check within the same cell
      this.checkBucket(bucket, callback);
      // Check 4 neighbours (right, below, below-left, below-right) to avoid duplicates
      const cx = key & 0xFFFF;
      const cz = (key >> 16) & 0xFFFF;
      for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [-1, 1]] as const) {
        const nk = ((cz + dz) & 0xFFFF) << 16 | ((cx + dx) & 0xFFFF);
        const neighbour = this.cells.get(nk);
        if (neighbour) this.checkCross(bucket, neighbour, callback);
      }
    }
  }

  private checkBucket(bucket: Zombie[], cb: (l: Zombie, r: Zombie) => boolean) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i], b = bucket[j];
        if (a.side === b.side) continue;
        const [l, r] = a.side === "left" ? [a, b] : [b, a];
        if (cb(l, r)) return;
      }
    }
  }

  private checkCross(a: Zombie[], b: Zombie[], cb: (l: Zombie, r: Zombie) => boolean) {
    for (const za of a) {
      for (const zb of b) {
        if (za.side === zb.side) continue;
        const [l, r] = za.side === "left" ? [za, zb] : [zb, za];
        if (cb(l, r)) return;
      }
    }
  }

  private key(x: number, z: number): number {
    const cx = ((x * this.cellInv) | 0) & 0xFFFF;
    const cz = ((z * this.cellInv) | 0) & 0xFFFF;
    return (cz << 16) | cx;
  }
}

export type ZombieSide = "left" | "right";
type ZombieState = "spawning" | "walking" | "fighting" | "dying";

/** Pick the correct animation based on current LOD state */
function pickAnim(inst: ZombieInstance, hiKey: keyof ZombieInstance, lodKey: keyof ZombieInstance) {
  return (inst.isLod ? inst[lodKey] : inst[hiKey]) as import("@babylonjs/core/Animations/animationGroup").AnimationGroup;
}

export interface Zombie {
  instance: ZombieInstance;
  x: number;
  z: number;
  side: ZombieSide;
  state: ZombieState;
  fightTimer: number;
  deathTimer: number;
  spawnTimer: number;
  fightPartner: Zombie | null;
  useAltWalk: boolean;
  useAltAttack: boolean;
  useAltDeath: boolean;
}

export class ZombieManager {
  zombies: Zombie[] = [];
  coins = 0;
  private spawnTimer = 0;
  private waveNumber = 0;
  private scene: Scene;
  private pool: ZombieInstance[] = [];
  private decalSprites: Sprite[] = [];
  private decalManager: SpriteManager | null = null;
  private fightGrid = new SpatialGrid(GRID_CELL);

  onZombieReachedMech?: (side: ZombieSide) => void;
  onZombieKilled?: () => void;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  async update(dt: number) {
    this.spawnTimer += dt;
    if (this.spawnTimer >= SPAWN_INTERVAL) {
      this.spawnTimer = 0;
      await this.spawnWave();
    }

    const mechLeftX = -ARENA_WIDTH / 2 + PADDLE_MARGIN;
    const mechRightX = ARENA_WIDTH / 2 - PADDLE_MARGIN;

    // Update spawning zombies
    for (const z of this.zombies) {
      if (z.state !== "spawning") continue;
      z.spawnTimer += dt;
      if (z.spawnTimer >= SCREAM_DURATION) {
        z.state = "walking";
        stopAllAnims(z.instance);
        const walkAnim = z.useAltWalk
          ? pickAnim(z.instance, "injuredWalkAnim", "lodInjuredWalkAnim")
          : pickAnim(z.instance, "monsterWalkAnim", "lodMonsterWalkAnim");
        walkAnim.start(true);
      }
    }

    // Move walking zombies
    for (const z of this.zombies) {
      if (z.state !== "walking") continue;

      if (z.side === "left") {
        z.x += ZOMBIE_SPEED * dt;
        z.instance.root.rotation.y = Math.PI;
        if (z.x >= mechRightX) {
          this.startDying(z);
          this.onZombieReachedMech?.("left");
        }
      } else {
        z.x -= ZOMBIE_SPEED * dt;
        z.instance.root.rotation.y = 0;
        if (z.x <= mechLeftX) {
          this.startDying(z);
          this.onZombieReachedMech?.("right");
        }
      }

      z.instance.root.position.x = z.x;
      z.instance.root.position.z = z.z;
    }

    // Check fights between opposite-side zombies
    this.checkFights();

    // Update fighting zombies
    for (const z of this.zombies) {
      if (z.state !== "fighting") continue;
      z.fightTimer += dt;
      if (z.fightTimer >= FIGHT_DURATION) {
        this.killZombie(z);
        if (z.fightPartner && z.fightPartner.state === "fighting") {
          this.killZombie(z.fightPartner);
        }
      }
    }

    // Update dying zombies (fade out)
    for (const z of this.zombies) {
      if (z.state !== "dying") continue;
      z.deathTimer += dt;

      // Fade out meshes in last 2 seconds
      if (z.deathTimer > BODY_LINGER - 2) {
        const fadeT = (z.deathTimer - (BODY_LINGER - 2)) / 2;
        const alpha = Math.max(0, 1 - fadeT);
        const activeMeshes = z.instance.isLod ? z.instance.lodMeshes : z.instance.meshes;
        for (const mesh of activeMeshes) {
          mesh.visibility = alpha;
        }
      }
    }

    // LOD: switch mesh detail based on camera distance
    this.updateLod();

    this.cleanupDead();
  }

  checkBallCollisions(ballX: number, ballZ: number): number {
    let kills = 0;
    for (const z of this.zombies) {
      if (z.state !== "walking" && z.state !== "fighting") continue;
      const dx = z.x - ballX;
      const dz = z.z - ballZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < BALL_KILL_RADIUS) {
        this.killZombie(z);
        kills++;
        this.coins++;
        this.onZombieKilled?.();
      }
    }
    return kills;
  }

  private checkFights() {
    const grid = this.fightGrid;
    grid.clear();

    // Insert only walking zombies into the grid — no temporary arrays
    for (const z of this.zombies) {
      if (z.state === "walking") grid.insert(z);
    }

    // Check only same/adjacent cells — O(n) average instead of O(n²)
    grid.forEachFightPair((l, r) => {
      if (l.state !== "walking" || r.state !== "walking") return false;
      const dx = l.x - r.x;
      const dz = l.z - r.z;
      if (dx * dx + dz * dz < FIGHT_RADIUS_SQ) {
        l.state = "fighting";
        r.state = "fighting";
        l.fightTimer = 0;
        r.fightTimer = 0;
        l.fightPartner = r;
        r.fightPartner = l;
        l.instance.root.rotation.y = Math.PI;
        r.instance.root.rotation.y = 0;
        stopAllAnims(l.instance);
        stopAllAnims(r.instance);
        const lAnim = l.useAltAttack
          ? pickAnim(l.instance, "punchComboAnim", "lodPunchComboAnim")
          : pickAnim(l.instance, "attackAnim", "lodAttackAnim");
        const rAnim = r.useAltAttack
          ? pickAnim(r.instance, "punchComboAnim", "lodPunchComboAnim")
          : pickAnim(r.instance, "attackAnim", "lodAttackAnim");
        lAnim.start(true);
        rAnim.start(true);
      }
      return false;
    });
  }

  private startDying(z: Zombie) {
    if (z.state === "dying") return;
    z.state = "dying";
    z.deathTimer = 0;
    stopAllAnims(z.instance);
    const deathAnim = z.useAltDeath
      ? pickAnim(z.instance, "dyingBackwardsAnim", "lodDyingBackwardsAnim")
      : pickAnim(z.instance, "dieAnim", "lodDieAnim");
    deathAnim.start(false);
    this.spawnDecal(z.x, z.z);
  }

  private killZombie(z: Zombie) {
    this.startDying(z);
  }

  private spawnDecal(x: number, z: number) {
    if (!this.decalManager) {
      this.decalManager = new SpriteManager(
        "bloodDecals",
        "/assets/blood_decal.png",
        MAX_DECALS,
        DECAL_SIZE,
        this.scene,
      );
      this.decalManager.renderingGroupId = 0;
      this.decalManager.isPickable = false;
    }

    if (this.decalSprites.length >= MAX_DECALS) {
      const old = this.decalSprites.shift()!;
      old.dispose();
    }

    const sprite = new Sprite("blood", this.decalManager);
    sprite.position.set(x, 0.05, z);
    sprite.angle = Math.random() * Math.PI * 2;
    sprite.width = DECAL_SIZE;
    sprite.height = DECAL_SIZE;
    this.decalSprites.push(sprite);
  }

  private async spawnWave() {
    this.waveNumber++;
    const count = this.waveNumber;
    const bound = ARENA_HEIGHT / 2 - WALL_INSET;

    let activeCount = 0;
    for (const z of this.zombies) {
      if (z.state !== "dying") activeCount++;
    }
    const slotsLeft = MAX_ZOMBIES - activeCount;
    const toSpawn = Math.min(count, slotsLeft);

    const promises: Promise<void>[] = [];
    for (let i = 0; i < toSpawn; i++) {
      const side: ZombieSide = i % 2 === 0 ? "left" : "right";
      const spawnX =
        side === "left"
          ? -ARENA_WIDTH / 2 + PADDLE_MARGIN + 40
          : ARENA_WIDTH / 2 - PADDLE_MARGIN - 40;
      const spawnZ = (Math.random() - 0.5) * bound * 2;
      promises.push(this.spawnOne(side, spawnX, spawnZ));
    }
    await Promise.all(promises);
  }

  private async spawnOne(side: ZombieSide, x: number, z: number) {
    let instance: ZombieInstance;

    if (this.pool.length > 0) {
      instance = this.pool.pop()!;
      showZombie(instance);
      instance.root.rotation.set(0, 0, 0);
      instance.root.position.set(0, 0, 0);
      for (const mesh of instance.meshes) mesh.visibility = 1;
    } else {
      instance = await spawnZombie(this.scene);
      scaleZombieToHeight(instance, ZOMBIE_SIZE);
      for (const mesh of instance.meshes) {
        if (mesh.material) mesh.material.freeze();
      }
      for (const mesh of instance.lodMeshes) {
        if (mesh.material) mesh.material.freeze();
      }
    }

    instance.root.position.x = x;
    instance.root.position.z = z;
    instance.root.position.y = 0;

    // Randomize animation variants
    const useAltWalk = Math.random() < 0.2;
    const useAltAttack = Math.random() < 0.5;
    const useAltDeath = Math.random() < 0.5;

    // Start with scream animation (always hi-detail since freshly spawned/recycled)
    stopAllAnims(instance);
    instance.screamAnim.start(false);

    // Face the direction of movement
    instance.root.rotation.y = side === "left" ? Math.PI : 0;

    this.zombies.push({
      instance,
      x,
      z,
      side,
      state: "spawning",
      fightTimer: 0,
      deathTimer: 0,
      spawnTimer: 0,
      fightPartner: null,
      useAltWalk,
      useAltAttack,
      useAltDeath,
    });
  }

  private updateLod() {
    const cam = this.scene.activeCamera;
    if (!cam) return;
    const camPos = cam.position;
    const tmpVec = Vector3.Zero();

    for (const z of this.zombies) {
      if (z.state === "dying") continue; // don't LOD-switch dying zombies mid-animation
      tmpVec.set(z.x, 0, z.z);
      const dist = Vector3.Distance(camPos, tmpVec);
      if (dist > LOD_DISTANCE && !z.instance.isLod) {
        switchToLod(z.instance);
      } else if (dist <= LOD_DISTANCE && z.instance.isLod) {
        switchToHiDetail(z.instance);
      }
    }
  }

  private cleanupDead() {
    let write = 0;
    for (let read = 0; read < this.zombies.length; read++) {
      const z = this.zombies[read];
      if (z.state === "dying" && z.deathTimer >= BODY_LINGER) {
        hideZombie(z.instance);
        z.instance.root.rotation.set(0, 0, 0);
        // Reset visibility on both mesh sets
        for (const mesh of z.instance.meshes) mesh.visibility = 1;
        for (const mesh of z.instance.lodMeshes) mesh.visibility = 1;
        // Reset to hi-detail for next reuse
        z.instance.isLod = false;
        if (this.pool.length < MAX_POOL) {
          this.pool.push(z.instance);
        } else {
          disposeZombie(z.instance);
        }
      } else {
        this.zombies[write++] = z;
      }
    }
    this.zombies.length = write;
  }

  dispose() {
    for (const z of this.zombies) {
      hideZombie(z.instance);
    }
    this.zombies = [];
    this.pool = [];
    if (this.decalManager) {
      this.decalManager.dispose();
      this.decalManager = null;
    }
    this.decalSprites = [];
  }

  restart() {
    this.dispose();
    this.coins = 0;
    this.spawnTimer = 0;
    this.waveNumber = 0;
  }
}
