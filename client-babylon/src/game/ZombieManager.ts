import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";

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
import { PlasmaBurnEffect } from "./PlasmaBurnEffect";
import type { SoundManager } from "./soundManager";
import type { ZombieInstance } from "./ZombieLoader";
import {
  returnToPool,
  scaleZombieToHeight,
  spawnZombie,
  stopAllAnims,
} from "./ZombieLoader";

const ZOMBIE_SIZE = 30;
const SPAWN_INTERVAL = 4; // seconds between waves (was 2)
const QUEUE_INTERVAL = 0.35; // seconds between spawns within a wave
const FORMATION_STEP = 40; // Z spacing in line formation
const BALL_KILL_RADIUS = 25;
const MAX_ZOMBIES = 12;
const FIGHT_RADIUS = 20;
const FIGHT_HIT_INTERVAL = 0.8;
const ZOMBIE_HP = 3;
const DEATH_ANIM_DURATION = 2.5;

const DECAL_SIZE = 18;
const SCREAM_DURATION = 1.2;
const ZOMBIE_SPEED = 22;

interface QueuedSpawn {
  side: ZombieSide;
  x: number;
  z: number;
}

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
  isRunner: boolean;
  activeWalkAnim: AnimationGroup | null;
  shadowDisc: Mesh | null;
  decalMesh: Mesh | null;
  speed: number;
  animSpeed: number;
  wobblePhase: number;
  wobbleFreq: number;
  hp: number;
}

export class ZombieManager {
  zombies: Zombie[] = [];
  coins = 0;
  private spawnTimer = 0;
  private waveNumber = 0;
  private spawnQueue: QueuedSpawn[] = [];
  private queueTimer = 0;
  private scene: Scene;
  private sound: SoundManager;
  private decalMat: StandardMaterial | null = null;
  private burnEffect: PlasmaBurnEffect | null = null;

  onZombieReachedMech?: (side: ZombieSide) => void;
  onZombieKilled?: () => void;

  constructor(scene: Scene, shadowGen: unknown, sound: SoundManager) {
    this.scene = scene;
    this.sound = sound;
  }

  async update(dt: number) {
    // Trigger new wave on timer
    this.spawnTimer += dt;
    if (this.spawnTimer >= SPAWN_INTERVAL && this.spawnQueue.length === 0) {
      this.spawnTimer = 0;
      this.prepareWave();
    }

    // Process spawn queue — one zombie at a time with interval
    if (this.spawnQueue.length > 0) {
      this.queueTimer += dt;
      if (this.queueTimer >= QUEUE_INTERVAL) {
        this.queueTimer = 0;
        const next = this.spawnQueue.shift()!;
        await this.spawnOne(next.side, next.x, next.z);
        // zombieSpawn sound removed — too noisy
      }
    }

    const mechLeftX = -ARENA_WIDTH / 2 + PADDLE_MARGIN;
    const mechRightX = ARENA_WIDTH / 2 - PADDLE_MARGIN;

    // Update spawning zombies — already walking, just fade-in from fog
    for (const z of this.zombies) {
      if (z.state !== "spawning") continue;
      z.spawnTimer += dt;

      // Move toward arena (walk anim already playing from spawnOne)
      if (z.side === "left") z.x += z.speed * dt;
      else z.x -= z.speed * dt;
      z.instance.root.position.x = z.x;

      // Cubic ease-in: invisible most of the time, appears at the end
      // t³: at 50% → 12% visible, at 70% → 34%, at 90% → 73%
      const linear = Math.min(z.spawnTimer / SCREAM_DURATION, 1);
      const eased = linear * linear * linear;
      if (z.instance.meshes) {
        for (const mesh of z.instance.meshes) {
          // Enable mesh only when it starts becoming visible (avoids black artifact)
          if (eased > 0.05 && !mesh.isEnabled()) mesh.setEnabled(true);
          mesh.visibility = eased;
        }
      }

      if (z.spawnTimer >= SCREAM_DURATION) {
        if (z.instance.meshes) {
          for (const mesh of z.instance.meshes) {
            mesh.setEnabled(true);
            mesh.visibility = 1;
          }
        }
        z.state = "walking";
      }
    }

    // Move walking zombies at constant speed
    for (const z of this.zombies) {
      if (z.state !== "walking") continue;
      z.spawnTimer += dt; // reuse as elapsed time for wobble

      if (z.side === "left") {
        z.x += z.speed * dt;
      } else {
        z.x -= z.speed * dt;
      }

      // Wobble: slight lateral sway for organic movement
      const wobble = Math.sin(z.spawnTimer * z.wobbleFreq + z.wobblePhase) * 2;

      z.instance.root.rotation.y =
        z.side === "left" ? Math.PI / 2 : -Math.PI / 2;
      z.instance.root.position.x = z.x;
      z.instance.root.position.z = z.z + wobble;

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
          this.sound.play("zombieHit");
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
        if (!this.burnEffect) this.burnEffect = new PlasmaBurnEffect(this.scene);
        this.burnEffect.play(z.instance.root.position.clone());
        this.killZombie(z);
        kills++;
        this.coins++;
        this.sound.play("zombieDeath");
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
    // zombieDeath sound removed — didn't fit the game feel
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
        "./assets/blood_decal.png",
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

  private prepareWave() {
    this.waveNumber++;
    const wave = this.waveNumber;

    // Sqrt-based count: wave 1→2, wave 4→4, wave 9→6, wave 16→8
    const count = Math.ceil(Math.sqrt(wave) * 2);
    const activeCount = this.zombies.filter((z) => z.state !== "dying").length;
    const slotsLeft = MAX_ZOMBIES - activeCount;
    const toSpawn = Math.min(count, slotsLeft);
    if (toSpawn <= 0) return;

    // Determine side(s): waves 1-3 alternate, 4+ both sides
    const useBothSides = wave >= 4;

    // Pick formation based on wave progression
    const formations = ["line", "spread", "cluster"] as const;
    const formation = formations[wave % formations.length];

    const bound = ARENA_HEIGHT / 2 - WALL_INSET - ZOMBIE_SIZE;

    // Generate Z positions based on formation type
    const zPositions: number[] = [];
    if (formation === "line") {
      // Line: fixed step, ordered
      const totalHeight = toSpawn * FORMATION_STEP;
      const startZ = Math.max(
        -bound,
        Math.min(bound - totalHeight, (Math.random() - 0.5) * bound),
      );
      for (let i = 0; i < toSpawn; i++) {
        zPositions.push(startZ + i * FORMATION_STEP);
      }
    } else if (formation === "cluster") {
      // Cluster: tight group around one point
      const centerZ = (Math.random() - 0.5) * bound;
      for (let i = 0; i < toSpawn; i++) {
        zPositions.push(centerZ + (Math.random() - 0.5) * 60);
      }
    } else {
      // Spread: random across full arena width (like original)
      for (let i = 0; i < toSpawn; i++) {
        zPositions.push((Math.random() - 0.5) * bound * 2);
      }
    }

    for (let i = 0; i < toSpawn; i++) {
      const side: ZombieSide = useBothSides
        ? i % 2 === 0
          ? "left"
          : "right"
        : wave % 2 === 1
          ? "left"
          : "right";

      const spawnX =
        side === "left"
          ? -ARENA_WIDTH / 2 + PADDLE_MARGIN - 80
          : ARENA_WIDTH / 2 - PADDLE_MARGIN + 80;

      this.spawnQueue.push({ side, x: spawnX, z: zPositions[i] });
    }

    this.queueTimer = QUEUE_INTERVAL; // spawn first one immediately
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

    // 30% chance to be a runner — faster speed + run animation
    const isRunner = Math.random() < 0.3;
    const speedVariation = isRunner
      ? 1.4 + Math.random() * 0.4 // runners: 1.4x–1.8x
      : 0.6 + Math.random() * 0.7; // walkers: 0.6x–1.3x
    const speed = ZOMBIE_SPEED * speedVariation;
    const animSpeed = isRunner ? 1.0 : speedVariation;

    // Start completely hidden (setEnabled=false prevents any rendering artifacts)
    for (const mesh of instance.meshes) {
      mesh.setEnabled(false);
      mesh.visibility = 0;
    }

    // Start walk animation immediately — runners use faster speedRatio
    stopAllAnims(instance);
    const moveAnim =
      walkVariant === 0
        ? instance.walkAnim
        : walkVariant === 1
          ? instance.monsterWalkAnim
          : instance.injuredWalkAnim;
    moveAnim.start(true);
    moveAnim.goToFrame(Math.random() * moveAnim.to);
    moveAnim.speedRatio = isRunner ? 2.0 : animSpeed;

    // Face the direction of movement
    instance.root.rotation.y = side === "left" ? Math.PI / 2 : -Math.PI / 2;

    // Zombies no longer cast real shadows (saves ~5-10MB with 12+ shadow casters)

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
      isRunner,
      activeWalkAnim: moveAnim,
      shadowDisc: null,
      decalMesh: null,
      speed,
      animSpeed,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleFreq: 1.0 + Math.random() * 1.5,
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
      if (z.shadowDisc) {
        z.shadowDisc.dispose();
        z.shadowDisc = null;
      }
      if (z.decalMesh) {
        z.decalMesh.dispose();
        z.decalMesh = null;
      }

      // Return zombie to pool for reuse instead of disposing
      returnToPool(z.instance, z.side);
    }
    this.zombies = this.zombies.filter(
      (z) => !(z.state === "dying" && z.deathTimer >= DEATH_ANIM_DURATION),
    );
  }

  dispose() {
    for (const z of this.zombies) {
      returnToPool(z.instance, z.side);
      if (z.shadowDisc) z.shadowDisc.dispose();
      if (z.decalMesh) z.decalMesh.dispose();
    }
    this.zombies = [];
  }

  restart() {
    this.dispose();
    this.coins = 0;
    this.spawnTimer = 0;
    this.waveNumber = 0;
    this.spawnQueue = [];
    this.queueTimer = 0;
  }
}
