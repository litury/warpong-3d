import { ARENA_HEIGHT } from "../config/gameConfig";

export class InputManager {
  private keys = new Set<string>();
  private touchX: number | null = null;
  private touchY: number | null = null;
  portrait = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    canvas.addEventListener("touchstart", (e) => this.handleTouch(e), {
      passive: false,
    });
    canvas.addEventListener("touchmove", (e) => this.handleTouch(e), {
      passive: false,
    });
    canvas.addEventListener("touchend", () => {
      this.touchX = null;
      this.touchY = null;
    });
  }

  private handleTouch(e: TouchEvent) {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    this.touchX = (touch.clientX - rect.left) / rect.width;
    this.touchY = (touch.clientY - rect.top) / rect.height;
  }

  /** Keyboard direction: A/Left/Up/W = -1 (left), D/Right/Down/S = +1 (right) */
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

  /** Touch world Y (landscape: vertical paddle control) */
  getTouchWorldY(): number | null {
    if (this.touchY === null) return null;
    return (0.5 - this.touchY) * ARENA_HEIGHT;
  }

  /** Touch world Y mapped from horizontal drag (portrait: horizontal paddle → game Y axis) */
  getTouchWorldYFromPortrait(): number | null {
    if (this.touchX === null) return null;
    // In portrait, horizontal finger position maps to paddle Y (game coordinates)
    // touchX 0=left → negative Y, touchX 1=right → positive Y
    return (this.touchX - 0.5) * ARENA_HEIGHT;
  }
}
