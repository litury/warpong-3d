import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";

const MAX_POOL = 3;

/** Single burn effect instance (3 particle systems: flash + fire + smoke). */
interface BurnInstance {
  flash: ParticleSystem;
  fire: ParticleSystem;
  smoke: ParticleSystem;
  emitter: Vector3;
  active: boolean;
}

/**
 * Plasma burn VFX — Diablo 2 style immolation when plasma orb kills a zombie.
 * Uses a pool of reusable ParticleSystem triplets.
 */
export class PlasmaBurnEffect {
  private pool: BurnInstance[] = [];
  private scene: Scene;
  private flareTex: Texture;
  private flameTex: Texture;
  private smokeTex: Texture;

  constructor(scene: Scene) {
    this.scene = scene;
    // Share textures across all pool instances to avoid duplicates
    this.flareTex = new Texture("./assets/plasma/flare_01.png", scene);
    this.flameTex = new Texture("./assets/particles/flame_02.png", scene);
    this.smokeTex = new Texture("./assets/smoke_01.png", scene);
    for (let i = 0; i < MAX_POOL; i++) {
      this.pool.push(this.createInstance(i));
    }
  }

  /** Play burn effect at world position. */
  play(position: Vector3): void {
    const inst = this.pool.find((b) => !b.active);
    if (!inst) return;

    inst.active = true;
    inst.emitter.copyFrom(position);

    // Phase 1: green plasma flash (0–0.3s)
    // reset() + re-arm manualEmitCount for pool reuse
    inst.flash.reset();
    inst.flash.manualEmitCount = 15;
    inst.flash.start();

    // Phase 2: fire (0.1–1.5s)
    setTimeout(() => {
      inst.fire.reset();
      inst.fire.start();
    }, 100);

    // Phase 3: smoke (0.5–2.5s)
    setTimeout(() => {
      inst.smoke.reset();
      inst.smoke.start();
    }, 500);

    // Auto-recycle after full duration
    setTimeout(() => {
      inst.active = false;
    }, 2500);
  }

  dispose(): void {
    for (const inst of this.pool) {
      inst.flash.dispose();
      inst.fire.dispose();
      inst.smoke.dispose();
    }
    this.pool.length = 0;
    this.flareTex.dispose();
    this.flameTex.dispose();
    this.smokeTex.dispose();
  }

  private createInstance(id: number): BurnInstance {
    const emitter = new Vector3(0, 0, 0);

    const flash = this.createFlash(id, emitter);
    const fire = this.createFire(id, emitter);
    const smoke = this.createSmoke(id, emitter);

    return { flash, fire, smoke, emitter, active: false };
  }

  /** Phase 1: Bright green plasma flash — fast burst, additive. */
  private createFlash(id: number, emitter: Vector3): ParticleSystem {
    const ps = new ParticleSystem(`burn_flash_${id}`, 15, this.scene);
    ps.particleTexture = this.flareTex;
    ps.emitter = emitter;

    ps.createSphereEmitter(10);
    ps.minEmitPower = 2;
    ps.maxEmitPower = 5;

    ps.minSize = 30;
    ps.maxSize = 80;
    ps.minLifeTime = 0.15;
    ps.maxLifeTime = 0.4;

    // Burst: all 30 particles at once, then stop
    ps.emitRate = 0;
    ps.manualEmitCount = 15;
    ps.targetStopDuration = 0.4;

    ps.blendMode = ParticleSystem.BLENDMODE_ADD;

    // Green plasma → white flash
    ps.addColorGradient(0, new Color4(0.2, 1, 0.3, 1));
    ps.addColorGradient(0.5, new Color4(0.8, 1, 0.8, 0.8));
    ps.addColorGradient(1, new Color4(1, 1, 1, 0));

    ps.addSizeGradient(0, 30);
    ps.addSizeGradient(0.3, 80);
    ps.addSizeGradient(1, 10);

    return ps;
  }

  /** Phase 2: Rising flames — green to orange to dark red. */
  private createFire(id: number, emitter: Vector3): ParticleSystem {
    const ps = new ParticleSystem(`burn_fire_${id}`, 30, this.scene);
    ps.particleTexture = this.flameTex;
    ps.emitter = emitter;

    // Flames spread outward on ground plane (no Y gravity — camera looks down)
    ps.createSphereEmitter(8);
    ps.minEmitPower = 3;
    ps.maxEmitPower = 8;
    ps.gravity = new Vector3(0, 0, 0); // no gravity — spread on ground

    ps.minSize = 20;
    ps.maxSize = 50;
    ps.minLifeTime = 0.3;
    ps.maxLifeTime = 1.0;

    ps.emitRate = 40;
    ps.targetStopDuration = 1.2;
    ps.minAngularSpeed = -1;
    ps.maxAngularSpeed = 1;

    ps.blendMode = ParticleSystem.BLENDMODE_ADD;

    // Green plasma → orange → dark red → fade
    ps.addColorGradient(0, new Color4(0.2, 1, 0.3, 0.9));
    ps.addColorGradient(0.3, new Color4(1, 0.8, 0.1, 0.8));
    ps.addColorGradient(0.7, new Color4(1, 0.3, 0.05, 0.5));
    ps.addColorGradient(1, new Color4(0.3, 0.05, 0.02, 0));

    ps.addSizeGradient(0, 20);
    ps.addSizeGradient(0.4, 50);
    ps.addSizeGradient(1, 10);

    return ps;
  }

  /** Phase 3: Dark smoke dissipating upward. */
  private createSmoke(id: number, emitter: Vector3): ParticleSystem {
    const ps = new ParticleSystem(`burn_smoke_${id}`, 20, this.scene);
    ps.particleTexture = this.smokeTex;
    ps.emitter = emitter;

    ps.createSphereEmitter(12);
    ps.minEmitPower = 0.5;
    ps.maxEmitPower = 2;
    ps.gravity = new Vector3(0, 0, 0); // no gravity — spread on ground

    ps.minSize = 30;
    ps.maxSize = 60;
    ps.minLifeTime = 1;
    ps.maxLifeTime = 2;

    ps.emitRate = 10;
    ps.targetStopDuration = 1.5;
    ps.minAngularSpeed = 0.01;
    ps.maxAngularSpeed = 0.1;

    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;

    // Dark grey smoke, fading out
    ps.addColorGradient(0, new Color4(0.15, 0.15, 0.12, 0));
    ps.addColorGradient(0.2, new Color4(0.15, 0.15, 0.12, 0.4));
    ps.addColorGradient(0.8, new Color4(0.1, 0.1, 0.08, 0.2));
    ps.addColorGradient(1, new Color4(0.1, 0.1, 0.08, 0));

    ps.addSizeGradient(0, 30);
    ps.addSizeGradient(0.5, 50);
    ps.addSizeGradient(1, 60);

    return ps;
  }
}
