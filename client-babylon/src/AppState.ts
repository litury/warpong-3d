import type { PlayerSide } from "./shared/messages";

export type GameMode = "solo" | "online";

export interface MechAnimState {
  walking: boolean;
  strafeDir: number; // -1, 0, 1
  idleTimer: number;
  prevY: number;
  visualZ: number; // сглаженная позиция меха в 3D
  smoothVelocity: number; // сглаженная скорость для анимации
}

function createMechAnimState(): MechAnimState {
  return {
    walking: false,
    strafeDir: 0,
    idleTimer: 0,
    prevY: 0,
    visualZ: 0,
    smoothVelocity: 0,
  };
}

export class AppState {
  mode: GameMode = "solo";
  playerSide: PlayerSide | null = null;
  playing = false;

  leftMech: MechAnimState = createMechAnimState();
  rightMech: MechAnimState = createMechAnimState();

  resetForNewGame() {
    this.leftMech = createMechAnimState();
    this.rightMech = createMechAnimState();
    this.playing = true;
  }

  resetToMenu() {
    this.playing = false;
    this.playerSide = null;
  }
}
