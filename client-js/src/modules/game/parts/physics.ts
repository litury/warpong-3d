// Port of client/src/modules/game/parts/physics.rs

import { BALL_MAX_SPEED, BALL_SPEED_INCREMENT } from "../../../config";

export function applyPaddleBounce(
  vx: number, vy: number, hitOffset: number, isRightPaddle: boolean,
): { vx: number; vy: number } {
  const speed = Math.min(Math.sqrt(vx * vx + vy * vy), BALL_MAX_SPEED) + BALL_SPEED_INCREMENT;
  const angle = Math.max(-1, Math.min(1, hitOffset)) * (Math.PI / 4);
  const dirX = isRightPaddle ? -1 : 1;

  return {
    vx: dirX * speed * Math.cos(angle),
    vy: speed * Math.sin(angle),
  };
}
