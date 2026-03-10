import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ARENA_WIDTH, ARENA_HEIGHT, PADDLE_MARGIN, WALL_INSET } from "../config/gameConfig";
import {
  initZombieInstances, acquireInstance, releaseInstance,
  setTransform, setAnimation, freezeOnLastFrame,
  setInstanceScale, updateTime, getGlobalTime, getAnimDuration,
  flushBuffers, disposeAll,
  type ZombieThinHandle,
} from "./ZombieLoader";

const ZOMBIE_SPEED = 60;
const SPAWN_INTERVAL = 3;
const BALL_KILL_RADIUS = 25;
const MAX_ZOMBIES = 40;
const FIGHT_RADIUS = 20;
const FIGHT_DURATION = 2;
const BODY_LINGER = 5;
const MAX_DECALS = 50;
const DECAL_SIZE = 18;
const SCREAM_DURATION = 0.5;

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

export class ZombieManager {
  zombies: Zombie[] = [];
  coins = 0;
  private spawnTimer = 0;
  private waveNumber = 0;
  private scene: Scene;
  private decals: Mesh[] = [];
  private decalMat: StandardMaterial | null = null;
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
    const walking = this.zombies.filter(z => z.state === "walking");
    const left = walking.filter(z => z.side === "left");
    const right = walking.filter(z => z.side === "right");

    for (const l of left) {
      for (const r of right) {
        if (r.state !== "walking") continue;
        const dx = l.x - r.x;
        const dz = l.z - r.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < FIGHT_RADIUS) {
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
          break;
        }
      }
    }
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
    if (!this.decalMat) {
      this.decalMat = new StandardMaterial("bloodMat", this.scene);
      this.decalMat.diffuseTexture = new Texture("/assets/blood_decal.png", this.scene);
      this.decalMat.diffuseTexture.hasAlpha = true;
      this.decalMat.useAlphaFromDiffuseTexture = true;
      this.decalMat.disableLighting = true;
      this.decalMat.emissiveTexture = this.decalMat.diffuseTexture;
      this.decalMat.backFaceCulling = false;
      this.decalMat.freeze();
    }

    if (this.decals.length >= MAX_DECALS) {
      const old = this.decals.shift()!;
      old.dispose();
    }

    const decal = MeshBuilder.CreateGround("blood", { width: DECAL_SIZE, height: DECAL_SIZE }, this.scene);
    decal.position.set(x, 0.05, z);
    decal.rotation.y = Math.random() * Math.PI * 2;
    decal.material = this.decalMat;
    decal.freezeWorldMatrix();
    this.decals.push(decal);
  }

  private spawnWave() {
    this.waveNumber++;
    const count = this.waveNumber;
    const bound = ARENA_HEIGHT / 2 - WALL_INSET;

    const activeCount = this.zombies.filter(z => z.state !== "dying").length;
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
    const toRecycle: Zombie[] = [];
    for (const z of this.zombies) {
      if (z.state === "dying" && z.deathTimer >= BODY_LINGER) {
        toRecycle.push(z);
      }
    }
    for (const z of toRecycle) {
      releaseInstance(z.handle);
    }
    this.zombies = this.zombies.filter(z => !(z.state === "dying" && z.deathTimer >= BODY_LINGER));
  }

  dispose() {
    for (const z of this.zombies) {
      releaseInstance(z.handle);
    }
    this.zombies = [];
    for (const d of this.decals) d.dispose();
    this.decals = [];
  }

  restart() {
    this.dispose();
    this.coins = 0;
    this.spawnTimer = 0;
    this.waveNumber = 0;
  }
}
