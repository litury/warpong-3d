import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PADDLE_MARGIN,
  WALL_INSET,
} from "../config/gameConfig";
import {
  disposeZombie,
  hideZombie,
  scaleZombieToHeight,
  showZombie,
  spawnZombie,
  stopAllAnims,
} from "./ZombieLoader";
import type { ZombieInstance } from "./ZombieLoader";

const ZOMBIE_SIZE = 30;
const ZOMBIE_SPEED = 60;
const SPAWN_INTERVAL = 3;
const BALL_KILL_RADIUS = 25;
const MAX_ZOMBIES = 40;
const MAX_POOL = 15;
const FIGHT_RADIUS = 20;
const FIGHT_DURATION = 2;
const BODY_LINGER = 5;
const MAX_DECALS = 50;
const DECAL_SIZE = 18;
const SCREAM_DURATION = 0.5;

export type ZombieSide = "left" | "right";
type ZombieState = "spawning" | "walking" | "fighting" | "dying";

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
  private decals: Mesh[] = [];
  private decalMat: StandardMaterial | null = null;

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
          ? z.instance.injuredWalkAnim
          : z.instance.monsterWalkAnim;
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
        for (const mesh of z.instance.meshes) {
          mesh.visibility = alpha;
        }
      }
    }

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
    const walking = this.zombies.filter((z) => z.state === "walking");
    const left = walking.filter((z) => z.side === "left");
    const right = walking.filter((z) => z.side === "right");

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
          l.instance.root.rotation.y = Math.PI;
          r.instance.root.rotation.y = 0;
          // Play attack animations
          stopAllAnims(l.instance);
          stopAllAnims(r.instance);
          const lAnim = l.useAltAttack
            ? l.instance.punchComboAnim
            : l.instance.attackAnim;
          const rAnim = r.useAltAttack
            ? r.instance.punchComboAnim
            : r.instance.attackAnim;
          lAnim.start(true);
          rAnim.start(true);
          break;
        }
      }
    }
  }

  private startDying(z: Zombie) {
    if (z.state === "dying") return;
    z.state = "dying";
    z.deathTimer = 0;
    stopAllAnims(z.instance);
    const deathAnim = z.useAltDeath
      ? z.instance.dyingBackwardsAnim
      : z.instance.dieAnim;
    deathAnim.start(false);
    this.spawnDecal(z.x, z.z);
  }

  private killZombie(z: Zombie) {
    this.startDying(z);
  }

  private spawnDecal(x: number, z: number) {
    if (!this.decalMat) {
      this.decalMat = new StandardMaterial("bloodMat", this.scene);
      this.decalMat.diffuseTexture = new Texture(
        "/assets/blood_decal.png",
        this.scene,
      );
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

    const decal = MeshBuilder.CreateGround(
      "blood",
      { width: DECAL_SIZE, height: DECAL_SIZE },
      this.scene,
    );
    decal.position.set(x, 0.05, z);
    decal.rotation.y = Math.random() * Math.PI * 2;
    decal.material = this.decalMat;
    decal.freezeWorldMatrix();
    this.decals.push(decal);
  }

  private async spawnWave() {
    this.waveNumber++;
    const count = this.waveNumber;
    const bound = ARENA_HEIGHT / 2 - WALL_INSET;

    const activeCount = this.zombies.filter((z) => z.state !== "dying").length;
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
    }

    instance.root.position.x = x;
    instance.root.position.z = z;
    instance.root.position.y = 0;

    // Randomize animation variants
    const useAltWalk = Math.random() < 0.2;
    const useAltAttack = Math.random() < 0.5;
    const useAltDeath = Math.random() < 0.5;

    // Start with scream animation
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

  private cleanupDead() {
    const toRecycle: Zombie[] = [];
    for (const z of this.zombies) {
      if (z.state === "dying" && z.deathTimer >= BODY_LINGER) {
        toRecycle.push(z);
      }
    }
    for (const z of toRecycle) {
      hideZombie(z.instance);
      z.instance.root.rotation.set(0, 0, 0);
      for (const mesh of z.instance.meshes) mesh.visibility = 1;
      if (this.pool.length < MAX_POOL) {
        this.pool.push(z.instance);
      } else {
        disposeZombie(z.instance);
      }
    }
    this.zombies = this.zombies.filter(
      (z) => !(z.state === "dying" && z.deathTimer >= BODY_LINGER),
    );
  }

  dispose() {
    for (const z of this.zombies) {
      hideZombie(z.instance);
    }
    this.zombies = [];
    this.pool = [];
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
