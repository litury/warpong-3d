import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { Scene } from "@babylonjs/core/scene";
import { ARENA_HEIGHT } from "../config/gameConfig";

const TOUCH_ZONE_FRACTION = 0.3; // bottom 30% of screen
const SENSITIVITY = 1.6; // 1px finger → 1.6px paddle in game world

export class InputManager {
  private keys = new Set<string>();
  private canvas: HTMLCanvasElement;
  private activePointerId: number | null = null;
  private startPointerScreenX = 0;
  private startPaddleWorldY = 0;
  private targetWorldY: number | null = null;
  private currentPaddleYProvider: () => number = () => 0;

  constructor(canvas: HTMLCanvasElement, scene: Scene) {
    this.canvas = canvas;

    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    scene.onPointerObservable.add((info) => {
      const ev = info.event as PointerEvent;
      switch (info.type) {
        case PointerEventTypes.POINTERDOWN:
          this.handleDown(ev);
          break;
        case PointerEventTypes.POINTERMOVE:
          this.handleMove(ev);
          break;
        case PointerEventTypes.POINTERUP:
          this.handleUp(ev);
          break;
      }
    });

    canvas.addEventListener("pointercancel", (ev) => this.handleUp(ev));
  }

  /** Register a function that returns current paddle Y in game world units. */
  setPaddleYProvider(fn: () => number) {
    this.currentPaddleYProvider = fn;
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

  /** Target paddle Y in game world units, or null if no active drag. */
  getTouchWorldY(): number | null {
    return this.targetWorldY;
  }

  /** Discrete direction from touch drag, for online mode. +1=Up, -1=Down, 0=Idle. */
  getTouchDirection(currentPaddleY: number): number {
    if (this.targetWorldY === null) return 0;
    const diff = this.targetWorldY - currentPaddleY;
    const deadZone = 5;
    if (diff > deadZone) return 1;
    if (diff < -deadZone) return -1;
    return 0;
  }

  private handleDown(ev: PointerEvent) {
    if (this.activePointerId !== null) return;
    const rect = this.canvas.getBoundingClientRect();
    const localY = ev.clientY - rect.top;
    const inTouchZone = localY > rect.height * (1 - TOUCH_ZONE_FRACTION);
    if (!inTouchZone) return;

    this.activePointerId = ev.pointerId;
    this.startPointerScreenX = ev.clientX;
    this.startPaddleWorldY = this.currentPaddleYProvider();
    this.targetWorldY = this.startPaddleWorldY;

    try {
      this.canvas.setPointerCapture(ev.pointerId);
    } catch {
      // older browsers may not support pointer capture
    }
  }

  private handleMove(ev: PointerEvent) {
    if (ev.pointerId !== this.activePointerId) return;
    const rect = this.canvas.getBoundingClientRect();
    const screenDx = ev.clientX - this.startPointerScreenX;
    // Convert horizontal screen pixels → game world Y units.
    // Screen width maps to ARENA_HEIGHT span on the visible movement axis.
    const worldDelta = (screenDx / rect.width) * ARENA_HEIGHT * SENSITIVITY;
    this.targetWorldY = this.startPaddleWorldY + worldDelta;
  }

  private handleUp(ev: PointerEvent) {
    if (ev.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.targetWorldY = null;
    try {
      this.canvas.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  }
}
