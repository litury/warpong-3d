import { Scene } from "@babylonjs/core/scene";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ARENA_WIDTH, ARENA_HEIGHT, PADDLE_MARGIN, WALL_INSET, DRAGON_SIZE, DRAGON_SPEED } from "../config/gameConfig";
import { spawnDragon, scaleDragonToHeight, stopAllAnims, disposeDragon } from "./DragonLoader";
import type { DragonInstance } from "./DragonLoader";
import { createFireBreath } from "./FireBreathEffect";
import type { FireBreathInstance } from "./FireBreathEffect";
import type { ZombieManager } from "./ZombieManager";
import type { Zombie } from "./ZombieManager";

const FLY_HEIGHT = 30;
const SPAWN_INTERVAL = 8;
const MAX_DRAGONS = 4;
const FIRE_BREATH_DURATION = 1.2;
const ATTACK_RANGE = 50;

export type DragonSide = "left" | "right";
type DragonState = "spawning" | "flying" | "attacking";

interface Dragon {
  instance: DragonInstance;
  fire: FireBreathInstance | null;
  x: number;
  z: number;
  side: DragonSide;
  state: DragonState;
  stateTimer: number;
  speed: number;
  targetZombie: Zombie | null;
}

export class DragonManager {
  dragons: Dragon[] = [];
  private spawnTimer = 0;
  private waveNumber = 0;
  private scene: Scene;
  private shadowGen: ShadowGenerator;
  private zombieManager: ZombieManager | null = null;

  constructor(scene: Scene, shadowGen: ShadowGenerator) {
    this.scene = scene;
    this.shadowGen = shadowGen;
  }

  setZombieManager(zm: ZombieManager) {
    this.zombieManager = zm;
  }

  async update(dt: number) {
    this.spawnTimer += dt;
    if (this.spawnTimer >= SPAWN_INTERVAL) {
      this.spawnTimer = 0;
      await this.spawnWave();
    }

    for (const d of this.dragons) {
      if (d.state === "spawning") {
        d.stateTimer += dt;
        if (d.stateTimer >= 0.5) {
          d.state = "flying";
          stopAllAnims(d.instance);
          d.instance.flyAnim.start(true);
          d.instance.flyAnim.speedRatio = 0.8 + Math.random() * 0.4;
        }
      }

      if (d.state === "flying") {
        this.updateFlying(d, dt);
      }

      if (d.state === "attacking") {
        d.stateTimer += dt;
        if (d.fire) d.fire.update(dt);
        if (d.stateTimer >= FIRE_BREATH_DURATION) {
          // Kill the target zombie
          if (d.targetZombie && d.targetZombie.state === "walking") {
            this.killTargetZombie(d.targetZombie);
          }
          // Resume flying — find next target
          this.resumeFlying(d);
        }
      }
    }
  }

  private updateFlying(d: Dragon, dt: number) {
    const enemySide = d.side === "left" ? "right" : "left";
    let target = d.targetZombie;

    // Re-acquire target if current one is dead/gone
    if (!target || target.state !== "walking") {
      target = this.findNearestZombie(d.x, d.z, enemySide);
      d.targetZombie = target;
    }

    if (target) {
      const dx = target.x - d.x;
      const dz = target.z - d.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < ATTACK_RANGE) {
        this.startAttacking(d);
        return;
      }

      // Move toward target
      const nx = dx / dist;
      const nz = dz / dist;
      d.x += nx * d.speed * dt;
      d.z += nz * d.speed * dt;

      // Face direction of movement
      d.instance.root.rotation.y = Math.atan2(nx, -nz);
    } else {
      // No target — patrol forward slowly
      if (d.side === "left") {
        d.x += d.speed * 0.3 * dt;
      } else {
        d.x -= d.speed * 0.3 * dt;
      }
      d.instance.root.rotation.y = d.side === "left" ? Math.PI / 2 : -Math.PI / 2;

      // If reached far end, turn around
      const farX = d.side === "left"
        ? ARENA_WIDTH / 2 - PADDLE_MARGIN
        : -ARENA_WIDTH / 2 + PADDLE_MARGIN;
      if ((d.side === "left" && d.x >= farX) || (d.side === "right" && d.x <= farX)) {
        d.side = d.side === "left" ? "right" : "left";
      }
    }

    d.instance.root.position.x = d.x;
    d.instance.root.position.z = d.z;
    d.instance.root.position.y = FLY_HEIGHT;
  }

  private findNearestZombie(x: number, z: number, side: "left" | "right"): Zombie | null {
    if (!this.zombieManager) return null;
    let best: Zombie | null = null;
    let bestDist = Infinity;
    for (const zombie of this.zombieManager.zombies) {
      if (zombie.side !== side) continue;
      if (zombie.state !== "walking") continue;
      const dx = zombie.x - x;
      const dz = zombie.z - z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        best = zombie;
      }
    }
    return best;
  }

  private killTargetZombie(zombie: Zombie) {
    if (!this.zombieManager) return;
    this.zombieManager.checkBallCollisions(zombie.x, zombie.z);
  }

  private startAttacking(d: Dragon) {
    if (d.state === "attacking") return;
    d.state = "attacking";
    d.stateTimer = 0;
    stopAllAnims(d.instance);
    if (d.instance.jawNode && !d.fire) {
      d.fire = createFireBreath(this.scene, d.instance.jawNode);
    }
    if (d.fire) d.fire.start();
  }

  private resumeFlying(d: Dragon) {
    d.state = "flying";
    d.stateTimer = 0;
    d.targetZombie = null;
    if (d.fire) d.fire.stop();
    stopAllAnims(d.instance);
    d.instance.flyAnim.start(true);
    d.instance.flyAnim.speedRatio = 0.8 + Math.random() * 0.4;
  }

  private async spawnWave() {
    this.waveNumber++;
    const slotsLeft = MAX_DRAGONS - this.dragons.length;
    const toSpawn = Math.min(this.waveNumber, slotsLeft, 2);

    for (let i = 0; i < toSpawn; i++) {
      const side: DragonSide = i % 2 === 0 ? "left" : "right";
      await this.spawnOne(side);
    }
  }

  private async spawnOne(side: DragonSide) {
    const instance = await spawnDragon(this.scene);
    scaleDragonToHeight(instance, DRAGON_SIZE);

    for (const mesh of instance.meshes) {
      if (mesh.material) mesh.material.freeze();
      this.shadowGen.addShadowCaster(mesh);
    }

    const bound = ARENA_HEIGHT / 2 - WALL_INSET - 50;
    const spawnX = side === "left"
      ? -ARENA_WIDTH / 2 + PADDLE_MARGIN + 60
      : ARENA_WIDTH / 2 - PADDLE_MARGIN - 60;
    const spawnZ = (Math.random() - 0.5) * bound * 2;

    instance.root.position.set(spawnX, FLY_HEIGHT, spawnZ);
    instance.root.rotation.y = side === "left" ? Math.PI / 2 : -Math.PI / 2;

    stopAllAnims(instance);
    instance.idleAnim.start(true);

    const speedVariation = 0.85 + Math.random() * 0.3;

    this.dragons.push({
      instance,
      fire: null,
      x: spawnX,
      z: spawnZ,
      side,
      state: "spawning",
      stateTimer: 0,
      speed: DRAGON_SPEED * speedVariation,
      targetZombie: null,
    });
  }

  dispose() {
    for (const d of this.dragons) {
      for (const mesh of d.instance.meshes) this.shadowGen.removeShadowCaster(mesh);
      if (d.fire) d.fire.dispose();
      disposeDragon(d.instance);
    }
    this.dragons = [];
  }

  restart() {
    this.dispose();
    this.spawnTimer = 0;
    this.waveNumber = 0;
  }
}
