import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { Scene } from "@babylonjs/core/scene";
import {
  ARENA_HEIGHT,
  PADDLE_HEIGHT,
  WALL_INSET,
} from "../config/gameConfig";

export class InputManager {
  private keys = new Set<string>();
  private canvas: HTMLCanvasElement;
  private activePointerId: number | null = null;
  private targetWorldY: number | null = null;

  constructor(canvas: HTMLCanvasElement, scene: Scene) {
    this.canvas = canvas;

    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    scene.onPointerObservable.add((info) => {
      const ev = info.event as PointerEvent;
      switch (info.type) {
        case PointerEventTypes.POINTERDOWN:
          if (this.activePointerId !== null) return;
          this.activePointerId = ev.pointerId;
          this.updateTarget(ev);
          try {
            canvas.setPointerCapture(ev.pointerId);
          } catch {
            // older browsers may not support pointer capture
          }
          break;
        case PointerEventTypes.POINTERMOVE:
          if (ev.pointerId !== this.activePointerId) return;
          this.updateTarget(ev);
          break;
        case PointerEventTypes.POINTERUP:
          if (ev.pointerId !== this.activePointerId) return;
          this.activePointerId = null;
          this.targetWorldY = null;
          try {
            canvas.releasePointerCapture(ev.pointerId);
          } catch {
            // ignore
          }
          break;
      }
    });

    canvas.addEventListener("pointercancel", () => {
      this.activePointerId = null;
      this.targetWorldY = null;
    });
  }

  /** Keyboard direction: A/Left/Up/W = -1, D/Right/Down/S = +1 */
  getDirection(): number {
    if (
      this.keys.has("KeyA") ||
      this.keys.has("ArrowLeft") ||
      this.keys.has("ArrowUp") ||
      this.keys.has("KeyW")
    )
      return -1;
    if (
      this.keys.has("KeyD") ||
      this.keys.has("ArrowRight") ||
      this.keys.has("ArrowDown") ||
      this.keys.has("KeyS")
    )
      return 1;
    return 0;
  }

  /** Target paddle Y in game world units, or null if no active touch/click. */
  getTouchWorldY(): number | null {
    return this.targetWorldY;
  }

  /** Discrete direction from touch target, for online mode. +1=Up, -1=Down, 0=Idle. */
  getTouchDirection(currentPaddleY: number): number {
    if (this.targetWorldY === null) return 0;
    const diff = this.targetWorldY - currentPaddleY;
    const deadZone = 5;
    if (diff > deadZone) return 1;
    if (diff < -deadZone) return -1;
    return 0;
  }

  private updateTarget(ev: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const localX = ev.clientX - rect.left;
    const normalized = (localX / rect.width - 0.5) * 2; // -1..+1
    const maxRange = ARENA_HEIGHT / 2 - WALL_INSET - PADDLE_HEIGHT / 2;
    this.targetWorldY = normalized * maxRange;
  }
}
