export class InputManager {
  private keys = new Set<string>();
  private touchY: number | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    canvas.addEventListener("touchstart", (e) => this.handleTouch(e), { passive: false });
    canvas.addEventListener("touchmove", (e) => this.handleTouch(e), { passive: false });
    canvas.addEventListener("touchend", () => { this.touchY = null; });
  }

  private handleTouch(e: TouchEvent) {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    const rect = this.canvas.getBoundingClientRect();
    // Normalize to 0..1 (0 = top, 1 = bottom)
    const normalized = (touch.clientY - rect.top) / rect.height;
    this.touchY = normalized;
  }

  isUp(): boolean {
    return this.keys.has("KeyW") || this.keys.has("ArrowUp");
  }

  isDown(): boolean {
    return this.keys.has("KeyS") || this.keys.has("ArrowDown");
  }

  getDirection(): number {
    // Stage Y is flipped (scale.y = -1), so positive Y = up = visual up
    if (this.isUp()) return 1;
    if (this.isDown()) return -1;
    return 0;
  }

  /** Returns normalized touch Y (0=top, 1=bottom) or null */
  getTouchY(): number | null {
    return this.touchY;
  }

  getNetworkDirection(): "Up" | "Down" | "Idle" {
    if (this.isUp()) return "Up";
    if (this.isDown()) return "Down";
    return "Idle";
  }
}
