// Port of client/src/modules/game/parts/cosmetics.rs

import { Application, Graphics, Container } from "pixi.js";
import { BALL_SIZE } from "../../../config";

export interface TrailParticle {
  gfx: Graphics;
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
