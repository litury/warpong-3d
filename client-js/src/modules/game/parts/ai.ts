// Port of client/src/modules/game/parts/ai.rs

import { ARENA_HEIGHT } from "../../../config";

export function updateAi(
  paddleY: number, paddleSpeed: number, paddleHeight: number,
  ballY: number, dt: number,
): number {
  const halfH = ARENA_HEIGHT / 2;
  const bound = halfH - paddleHeight / 2 - 5;
  const aiSpeed = paddleSpeed * 0.85;
  const diff = ballY - paddleY;
  const deadZone = 10;

  if (Math.abs(diff) > deadZone) {
    const direction = Math.sign(diff);
    paddleY += direction * aiSpeed * dt;
    paddleY = Math.max(-bound, Math.min(bound, paddleY));
  }

  return paddleY;
}
