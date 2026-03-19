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
  acquireInstance,
  disposeAll,
  flushBuffers,
  freezeOnLastFrame,
  getAnimDuration,
  getGlobalTime,
  initZombieInstances,
  releaseInstance,
  setAnimation,
  setInstanceScale,
  setTransform,
  updateTime,
  type ZombieThinHandle,
} from "./ZombieLoader";

const ZOMBIE_SPEED = 60;
const SPAWN_INTERVAL = 3;
const BALL_KILL_RADIUS = 25;
const MAX_ZOMBIES = 40;
const FIGHT_RADIUS = 20;
const FIGHT_RADIUS_SQ = FIGHT_RADIUS * FIGHT_RADIUS;
const FIGHT_DURATION = 2;
const BODY_LINGER = 5;
const MAX_DECALS = 50;
const DECAL_SIZE = 18;
const SCREAM_DURATION = 0.5;
const GRID_CELL = FIGHT_RADIUS * 2;

export type ZombieSide = "left" | "right";
type ZombieState = "spawning" | "walking" | "fighting" | "dying";

export interface Zombie {
  handle: ZombieThinHandle;
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
  rotY: number;
  currentAnim: string;
}

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

  forEachFightPair(callback: (l: Zombie, r: Zombie) => boolean) {
    for (const [key, bucket] of this.cells) {
      this.checkBucket(bucket, callback);
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

export class ZombieManager {
  zombies: Zombie[] = [];
  coins = 0;
  private spawnTimer = 0;
  private waveNumber = 0;
  private scene: Scene;
  private decalSprites: Sprite[] = [];
  private decalManager: SpriteManager | null = null;
  private fightGrid = new SpatialGrid(GRID_CELL);
  private initialized = false;

  onZombieReachedMech?: (side: ZombieSide) => void;
  onZombieKilled?: () => void;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    await initZombieInstances(this.scene);
    this.initialized = true;
  }

  update(dt: number) {
    if (!this.initialized) return;

    updateTime(dt);

    this.spawnTimer += dt;
    if (this.spawnTimer >= SPAWN_INTERVAL) {
      this.spawnTimer = 0;
      this.spawnWave();
    }

    const mechLeftX = -ARENA_WIDTH / 2 + PADDLE_MARGIN;
    const mechRightX = ARENA_WIDTH / 2 - PADDLE_MARGIN;

    // Update spawning zombies
    for (const z of this.zombies) {
      if (z.state !== "spawning") continue;
      z.spawnTimer += dt;
      if (z.spawnTimer >= SCREAM_DURATION) {
        z.state = "walking";
        const walkAnim = z.useAltWalk ? "injured_walk" : "monster_walk";
        z.currentAnim = walkAnim;
        setAnimation(z.handle, walkAnim, true, getGlobalTime());
      }
    }

    // Move walking zombies
    for (const z of this.zombies) {
      if (z.state !== "walking") continue;

      if (z.side === "left") {
        z.x += ZOMBIE_SPEED * dt;
        z.rotY = Math.PI;
        if (z.x >= mechRightX) {
          this.startDying(z);
          this.onZombieReachedMech?.("left");
        }
      } else {
        z.x -= ZOMBIE_SPEED * dt;
        z.rotY = 0;
        if (z.x <= mechLeftX) {
          this.startDying(z);
          this.onZombieReachedMech?.("right");
        }
      }

      setTransform(z.handle, z.x, 0, z.z, z.rotY, 1);
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

    // Update dying zombies (shrink instead of fade)
    for (const z of this.zombies) {
      if (z.state !== "dying") continue;
      z.deathTimer += dt;

      // Check if non-looping death animation finished → freeze on last frame
      const deathAnimName = z.useAltDeath ? "dying_backwards" : "dead";
      const animDuration = getAnimDuration(deathAnimName);
      if (z.deathTimer >= animDuration && z.currentAnim === deathAnimName) {
        freezeOnLastFrame(z.handle, deathAnimName);
        z.currentAnim = ""; // mark as frozen
      }

      // Shrink in last 2 seconds of linger
      if (z.deathTimer > BODY_LINGER - 2) {
        const fadeT = (z.deathTimer - (BODY_LINGER - 2)) / 2;
        const scale = Math.max(0, 1 - fadeT);
        setInstanceScale(z.handle, scale);
      }
    }

    this.cleanupDead();
    flushBuffers();
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
        // Face each other
        l.rotY = Math.PI;
        r.rotY = 0;
        setTransform(l.handle, l.x, 0, l.z, l.rotY, 1);
        setTransform(r.handle, r.x, 0, r.z, r.rotY, 1);
        // Play attack animations
        const lAnimName = l.useAltAttack ? "punch_combo" : "attack";
        const rAnimName = r.useAltAttack ? "punch_combo" : "attack";
        const time = getGlobalTime();
        l.currentAnim = lAnimName;
        r.currentAnim = rAnimName;
        setAnimation(l.handle, lAnimName, true, time);
        setAnimation(r.handle, rAnimName, true, time);
      }
      return false;
    });
  }

  private startDying(z: Zombie) {
    if (z.state === "dying") return;
    z.state = "dying";
    z.deathTimer = 0;
    const deathAnim = z.useAltDeath ? "dying_backwards" : "dead";
    z.currentAnim = deathAnim;
    setAnimation(z.handle, deathAnim, false, getGlobalTime());
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

  private spawnWave() {
    this.waveNumber++;
    const count = this.waveNumber;
    const bound = ARENA_HEIGHT / 2 - WALL_INSET;

    let activeCount = 0;
    for (const z of this.zombies) {
      if (z.state !== "dying") activeCount++;
    }
    const slotsLeft = MAX_ZOMBIES - activeCount;
    const toSpawn = Math.min(count, slotsLeft);

    for (let i = 0; i < toSpawn; i++) {
      const side: ZombieSide = i % 2 === 0 ? "left" : "right";
      const spawnX = side === "left"
        ? -ARENA_WIDTH / 2 + PADDLE_MARGIN + 40
        : ARENA_WIDTH / 2 - PADDLE_MARGIN - 40;
      const spawnZ = (Math.random() - 0.5) * bound * 2;
      this.spawnOne(side, spawnX, spawnZ);
    }
  }

  private spawnOne(side: ZombieSide, x: number, z: number) {
    const handle = acquireInstance();
    if (!handle) return; // no slots available

    const rotY = side === "left" ? Math.PI : 0;
    setTransform(handle, x, 0, z, rotY, 1);

    const time = getGlobalTime();
    setAnimation(handle, "zombie_scream", false, time);

    const useAltWalk = Math.random() < 0.2;
    const useAltAttack = Math.random() < 0.5;
    const useAltDeath = Math.random() < 0.5;

    this.zombies.push({
      handle, x, z, side,
      state: "spawning",
      fightTimer: 0,
      deathTimer: 0,
      spawnTimer: 0,
      fightPartner: null,
      useAltWalk,
      useAltAttack,
      useAltDeath,
      rotY,
      currentAnim: "zombie_scream",
    });
  }

  private cleanupDead() {
    let write = 0;
    for (let read = 0; read < this.zombies.length; read++) {
      const z = this.zombies[read];
      if (z.state === "dying" && z.deathTimer >= BODY_LINGER) {
        releaseInstance(z.handle);
      } else {
        this.zombies[write++] = z;
      }
    }
    this.zombies.length = write;
  }

  dispose() {
    for (const z of this.zombies) {
      releaseInstance(z.handle);
    }
    this.zombies = [];
    for (const d of this.decalSprites) d.dispose();
    this.decalSprites = [];
  }

  restart() {
    this.dispose();
    this.coins = 0;
    this.spawnTimer = 0;
    this.waveNumber = 0;
  }
}
