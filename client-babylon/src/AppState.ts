import type { PlayerSide } from "./shared/messages";

export type GameMode = "solo" | "online";

export class AppState {
  mode: GameMode = "solo";
  playerSide: PlayerSide | null = null;
  playing = false;

  prevLeftY = 0;
  prevRightY = 0;
  leftWalking = false;
  rightWalking = false;
  leftIdleTimer = 0;
  rightIdleTimer = 0;

  resetForNewGame() {
    this.prevLeftY = 0;
    this.prevRightY = 0;
    this.leftWalking = false;
    this.rightWalking = false;
    this.leftIdleTimer = 0;
    this.rightIdleTimer = 0;
    this.playing = true;
  }

  resetToMenu() {
    this.playing = false;
    this.playerSide = null;
  }
}
