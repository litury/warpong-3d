import type { PlayerSide } from "./shared/messages";

export type GameMode = "solo" | "online";

export interface MechAnimState {
  walking: boolean;
  idleTimer: number;
  prevY: number;
}

function createMechAnimState(): MechAnimState {
  return { walking: false, idleTimer: 0, prevY: 0 };
}

export class AppState {
  mode: GameMode = "solo";
  playerSide: PlayerSide | null = null;
  playing = false;

  leftMech = createMechAnimState();
  rightMech = createMechAnimState();

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
