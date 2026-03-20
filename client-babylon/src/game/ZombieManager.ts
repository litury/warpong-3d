import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PADDLE_MARGIN,
  WALL_INSET,
} from "../config/gameConfig";
import { isMobile } from "../utils/platform";
import type { ZombieInstance } from "./ZombieLoader";
import {
  disposeZombieAnimsOnly,
  scaleZombieToHeight,
  spawnZombie,
  stopAllAnims,
} from "./ZombieLoader";

const ZOMBIE_SIZE = 30;
const SPAWN_INTERVAL = 2;
const BALL_KILL_RADIUS = 25;
const MAX_ZOMBIES = isMobile ? 20 : 40;
const FIGHT_RADIUS = 20;
const FIGHT_HIT_INTERVAL = 0.8;
const ZOMBIE_HP = 3;
const DEATH_ANIM_DURATION = 2.5;
const MAX_CORPSES = isMobile ? 8 : 15;
const DECAL_SIZE = 18;
const SCREAM_DURATION = 0.5;
const ZOMBIE_SPEED = 22;

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
  walkVariant: number; // 0=walk, 1=monsterWalk, 2=injuredWalk
  attackVariant: number; // 0=attack, 1=punchCombo
  deathVariant: number; // 0=die, 1=dyingBackwards
  activeWalkAnim: AnimationGroup | null;
  decalMesh: Mesh | null;
  speed: number;
  animSpeed: number;
  hp: number;
}

interface Corpse {
  mesh: Mesh;
  decal: Mesh | null;
}

export class ZombieManager {
  zombies: Zombie[] = [];
  coins = 0;
  private spawnTimer = 0;
  private waveNumber = 0;
  private scene: Scene;
  private shadowGen: ShadowGenerator | null;
  private corpses: Corpse[] = [];
  private decalMat: StandardMaterial | null = null;

  onZombieReachedMech?: (side: ZombieSide) => void;
  onZombieKilled?: () => void;

  constructor(scene: Scene, shadowGen: ShadowGenerator | null) {
    this.scene = scene;
    this.shadowGen = shadowGen;
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
        const walkAnim =
          z.walkVariant === 0
            ? z.instance.walkAnim
            : z.walkVariant === 1
              ? z.instance.monsterWalkAnim
              : z.instance.injuredWalkAnim;
        walkAnim.start(true);
        walkAnim.goToFrame(Math.random() * walkAnim.to);
        walkAnim.speedRatio = z.animSpeed;
        z.activeWalkAnim = walkAnim;
      }
    }

    // Move walking zombies at constant speed
    for (const z of this.zombies) {
      if (z.state !== "walking") continue;

      if (z.side === "left") {
        z.x += z.speed * dt;
      } else {
        z.x -= z.speed * dt;
      }

      z.instance.root.rotation.y =
        z.side === "left" ? Math.PI / 2 : -Math.PI / 2;
      z.instance.root.position.x = z.x;
      z.instance.root.position.z = z.z;

      if (z.side === "left" && z.x >= mechRightX) {
        this.startDying(z);
        this.onZombieReachedMech?.("left");
      } else if (z.side === "right" && z.x <= mechLeftX) {
        this.startDying(z);
        this.onZombieReachedMech?.("right");
      }
    }

    // Check fights between opposite-side zombies
    this.checkFights();

    // Update fighting zombies — HP-based combat, winner continues walking
    for (const z of this.zombies) {
      if (z.state !== "fighting") continue;
      z.fightTimer += dt;
      if (z.fightTimer >= FIGHT_HIT_INTERVAL) {
        z.fightTimer = 0;
        if (z.fightPartner && z.fightPartner.state === "fighting") {
          z.fightPartner.hp--;
          if (z.fightPartner.hp <= 0) {
            const loser = z.fightPartner;
            this.killZombie(loser);
            // Winner resumes walking
            z.state = "walking";
            z.fightPartner = null;
            stopAllAnims(z.instance);
            const walkAnim =
              z.walkVariant === 0
                ? z.instance.walkAnim
                : z.walkVariant === 1
                  ? z.instance.monsterWalkAnim
                  : z.instance.injuredWalkAnim;
            walkAnim.start(true);
            walkAnim.speedRatio = z.animSpeed;
            z.activeWalkAnim = walkAnim;
            z.instance.root.rotation.y =
              z.side === "left" ? Math.PI / 2 : -Math.PI / 2;
          }
        }
      }
    }

    // Update dying zombies — wait for death anim then freeze as corpse
    for (const z of this.zombies) {
      if (z.state !== "dying") continue;
      z.deathTimer += dt;
    }

    this.cleanupDead();
  }

  checkBallCollisions(
    ballX: number,
    ballZ: number,
    lastHitBy: "left" | "right",
  ): number {
    let kills = 0;
    for (const z of this.zombies) {
      if (z.state !== "walking" && z.state !== "fighting") continue;
      if (z.side === lastHitBy) continue; // don't kill your own zombies
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
          l.instance.root.rotation.y = Math.PI / 2;
          r.instance.root.rotation.y = -Math.PI / 2;
          // Play attack animations
          stopAllAnims(l.instance);
          stopAllAnims(r.instance);
          const lAnim =
            l.attackVariant === 0
              ? l.instance.attackAnim
              : l.instance.punchComboAnim;
          const rAnim =
            r.attackVariant === 0
              ? r.instance.attackAnim
              : r.instance.punchComboAnim;
          lAnim.start(true);
          lAnim.speedRatio = l.animSpeed;
          rAnim.start(true);
          rAnim.speedRatio = r.animSpeed;
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
    const deathAnim =
      z.deathVariant === 0 ? z.instance.dieAnim : z.instance.dyingBackwardsAnim;
    deathAnim.start(false);
    z.decalMesh = this.spawnDecal(z.x, z.z);
  }

  private killZombie(z: Zombie) {
    this.startDying(z);
  }

  private spawnDecal(x: number, z: number): Mesh {
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

    const decal = MeshBuilder.CreateGround(
      "blood",
      { width: DECAL_SIZE, height: DECAL_SIZE },
      this.scene,
    );
    decal.position.set(x, 0.05, z);
    decal.rotation.y = Math.random() * Math.PI * 2;
    decal.material = this.decalMat;
    decal.freezeWorldMatrix();
    return decal;
  }

  private async spawnWave() {
    this.waveNumber++;
    const count = this.waveNumber;
    const bound = ARENA_HEIGHT / 2 - WALL_INSET - ZOMBIE_SIZE;

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
    const instance = await spawnZombie(this.scene, side);
    // Slight size variation (±10%) for visual diversity
    const sizeVariation = 0.9 + Math.random() * 0.2;
    scaleZombieToHeight(instance, ZOMBIE_SIZE * sizeVariation);
    instance.root.position.x = x;
    instance.root.position.z = z;
    instance.root.position.y = 0;

    // Randomize animation variants (equal distribution across all variants)
    const walkVariant = Math.floor(Math.random() * 3); // 0,1,2
    const attackVariant = Math.floor(Math.random() * 2); // 0,1
    const deathVariant = Math.floor(Math.random() * 2); // 0,1

    // Random speed variation (0.6x–1.3x) — slow zombies lag behind, fast ones rush
    const speedVariation = 0.6 + Math.random() * 0.7;
    const speed = ZOMBIE_SPEED * speedVariation;
    const animSpeed = speedVariation;

    // Start with scream animation at random offset
    stopAllAnims(instance);
    instance.screamAnim.start(false);
    instance.screamAnim.goToFrame(Math.random() * instance.screamAnim.to);

    // Face the direction of movement
    instance.root.rotation.y = side === "left" ? Math.PI / 2 : -Math.PI / 2;

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
      walkVariant,
      attackVariant,
      deathVariant,
      activeWalkAnim: null,
      decalMesh: null,
      speed,
      animSpeed,
      hp: ZOMBIE_HP,
    });
  }

  private cleanupDead() {
    const ready: Zombie[] = [];
    for (const z of this.zombies) {
      if (z.state === "dying" && z.deathTimer >= DEATH_ANIM_DURATION) {
        ready.push(z);
      }
    }
    for (const z of ready) {
      // Stop animations so current pose is baked into mesh vertices
      stopAllAnims(z.instance);

      // Slight random rotation so corpses don't all look identical
      z.instance.root.rotation.y += (Math.random() - 0.5) * 0.3;

      // Remove from shadow casters before merge
      for (const mesh of z.instance.meshes) {
        this.shadowGen?.removeShadowCaster(mesh);
      }

      // Freeze zombie as static corpse mesh
      let corpse: Mesh | null = null;
      if (z.instance.meshes.length === 1) {
        // Single skinned mesh — detach from skeleton and hierarchy, use directly
        corpse = z.instance.meshes[0];
        corpse.skeleton = null;
        corpse.parent = null;
      } else if (z.instance.meshes.length > 1) {
        corpse = Mesh.MergeMeshes(
          z.instance.meshes,
          true, // disposeSource
          true, // allow32BitsIndices
          undefined, // parent
          false, // multiMaterial
          true, // subdivideWithSubMeshes
        );
      }

      if (corpse) {
        corpse.isPickable = false;
        corpse.freezeWorldMatrix();
        this.corpses.push({ mesh: corpse, decal: z.decalMesh });
      }

      // Dispose skeleton, animations, transform nodes (meshes already consumed above)
      disposeZombieAnimsOnly(z.instance);

      // FIFO: remove oldest corpse if over limit
      if (this.corpses.length > MAX_CORPSES) {
        const old = this.corpses.shift()!;
        old.mesh.dispose();
        if (old.decal) old.decal.dispose();
      }
    }
    this.zombies = this.zombies.filter(
      (z) => !(z.state === "dying" && z.deathTimer >= DEATH_ANIM_DURATION),
    );
  }

  dispose() {
    for (const z of this.zombies) {
      for (const mesh of z.instance.meshes)
        this.shadowGen?.removeShadowCaster(mesh);
      disposeZombieAnimsOnly(z.instance);
      if (z.decalMesh) z.decalMesh.dispose();
    }
    this.zombies = [];
    for (const c of this.corpses) {
      c.mesh.dispose();
      if (c.decal) c.decal.dispose();
    }
    this.corpses = [];
  }

  restart() {
    this.dispose();
    this.coins = 0;
    this.spawnTimer = 0;
    this.waveNumber = 0;
  }
}
