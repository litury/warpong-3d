import type { ClientMessage, ServerMessage, PlayerCosmetics, PlayerUpgrades } from "../../shared/messages";

const SERVER_URL = "ws://localhost:3030";

export class WsClient {
  private ws: WebSocket | null = null;
  private _inbox: ServerMessage[] = [];
  private _connected = false;
  private _pendingCosmetics: PlayerCosmetics | null = null;
  private _pendingUpgrades: PlayerUpgrades | null = null;

  connect(cosmetics: PlayerCosmetics, upgrades: PlayerUpgrades) {
    if (this.ws) return;
    this._pendingCosmetics = cosmetics;
    this._pendingUpgrades = upgrades;
    this.ws = new WebSocket(SERVER_URL);

    this.ws.onopen = () => {
      this._connected = true;
      this.send({ type: "JoinQueue", cosmetics: this._pendingCosmetics!, upgrades: this._pendingUpgrades! });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        this._inbox.push(msg);
      } catch (e) {
        console.warn("[ws] parse error:", e);
      }
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.ws = null;
    };

    this.ws.onerror = (e) => {
      console.error("[ws] error:", e);
    };
  }

  send(msg: ClientMessage) {
    if (this.ws && this._connected) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  drainInbox(): ServerMessage[] {
    const msgs = this._inbox;
    this._inbox = [];
    return msgs;
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this._inbox = [];
  }

  get connected(): boolean {
    return this._connected;
  }
}
