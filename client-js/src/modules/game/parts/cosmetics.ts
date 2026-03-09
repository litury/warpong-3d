// Port of client/src/modules/game/parts/cosmetics.rs

import { Graphics, Container } from "pixi.js";
import { BALL_SIZE } from "../../../config";

export interface TrailParticle {
  gfx: Graphics;
  lifetime: number;
  maxLifetime: number;
}

export interface HitParticle {
  gfx: Graphics;
  vx: number;
  vy: number;
  lifetime: number;
  maxLifetime: number;
}

const TRAIL_LIFETIME = 0.3;
const TRAIL_SIZE = BALL_SIZE * 0.6;

export function spawnTrailParticle(
  container: Container,
  ballX: number, ballY: number,
  trailType: string | null,
): TrailParticle | null {
  if (!trailType) return null;

  const gfx = new Graphics();
  const halfSize = TRAIL_SIZE / 2;

  if (trailType === "TrailRainbow") {
    const t = ballX * 0.01 + ballY * 0.01;
    const r = Math.floor((Math.sin(t) * 0.5 + 0.5) * 255);
    const g = Math.floor((Math.sin(t + 2.1) * 0.5 + 0.5) * 255);
    const b = Math.floor((Math.sin(t + 4.2) * 0.5 + 0.5) * 255);
    gfx.rect(-halfSize, -halfSize, TRAIL_SIZE, TRAIL_SIZE);
    gfx.fill({ color: (r << 16) | (g << 8) | b, alpha: 0.6 });
  } else {
    gfx.rect(-halfSize, -halfSize, TRAIL_SIZE, TRAIL_SIZE);
    gfx.fill({ color: 0xffffff, alpha: 0.5 });
  }

  gfx.x = ballX;
  gfx.y = ballY;
  container.addChild(gfx);

  return { gfx, lifetime: 0, maxLifetime: TRAIL_LIFETIME };
}

export function updateTrailParticles(particles: TrailParticle[], dt: number): TrailParticle[] {
  return particles.filter((p) => {
    p.lifetime += dt;
    const frac = p.lifetime / p.maxLifetime;
    p.gfx.alpha = Math.max(0, 1 - frac);

    if (frac >= 1) {
      p.gfx.destroy();
      return false;
    }
    return true;
  });
}

// --- Hit / Goal particles ---

export function spawnHitParticles(
  container: Container,
  x: number, y: number,
  dirX: number,
  color: number,
): HitParticle[] {
  const count = 8 + Math.floor(Math.random() * 5); // 8-12
  const particles: HitParticle[] = [];

  for (let i = 0; i < count; i++) {
    const size = 2 + Math.random() * 2;
    const gfx = new Graphics();
    gfx.rect(-size / 2, -size / 2, size, size);
    gfx.fill({ color, alpha: 0.8 });
    gfx.x = x;
    gfx.y = y;
    container.addChild(gfx);

    const angle = (dirX > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.2;
    const speed = 150 + Math.random() * 200;

    particles.push({
      gfx,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      lifetime: 0,
      maxLifetime: 0.2 + Math.random() * 0.2,
    });
  }
  return particles;
}

export function spawnGoalExplosion(
  container: Container,
  x: number, y: number,
  color: number = 0xffffff,
): HitParticle[] {
  const count = 20 + Math.floor(Math.random() * 11); // 20-30
  const particles: HitParticle[] = [];

  for (let i = 0; i < count; i++) {
    const size = 3 + Math.random() * 5;
    const gfx = new Graphics();
    gfx.rect(-size / 2, -size / 2, size, size);
    gfx.fill({ color, alpha: 0.9 });
    gfx.x = x;
    gfx.y = y;
    container.addChild(gfx);

    const angle = Math.random() * Math.PI * 2;
    const speed = 100 + Math.random() * 300;

    particles.push({
      gfx,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      lifetime: 0,
      maxLifetime: 0.3 + Math.random() * 0.2,
    });
  }
  return particles;
}

export function updateHitParticles(particles: HitParticle[], dt: number): HitParticle[] {
  return particles.filter((p) => {
    p.lifetime += dt;
    const frac = p.lifetime / p.maxLifetime;

    if (frac >= 1) {
      p.gfx.destroy();
      return false;
    }

    p.gfx.x += p.vx * dt;
    p.gfx.y += p.vy * dt;
    p.gfx.alpha = Math.max(0, 1 - frac);
    return true;
  });
}
