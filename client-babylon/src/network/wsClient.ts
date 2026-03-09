import type { ClientMessage, ServerMessage } from "../shared/messages";

const SERVER_URL = "ws://localhost:3030";

export class WsClient {
  private ws: WebSocket | null = null;
  private _inbox: ServerMessage[] = [];
  private _connected = false;
  private _pendingJoin = false;

  connectPassive() {
    if (this.ws) return;
    const ws = new WebSocket(SERVER_URL);
    this.ws = ws;

    ws.onopen = () => {
      this._connected = true;
      if (this._pendingJoin) {
        this.send({ type: "JoinQueue" });
        this._pendingJoin = false;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        this._inbox.push(msg);
      } catch (e) {
        console.warn("[ws] parse error:", e);
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this._connected = false;
        this.ws = null;
      }
    };

    ws.onerror = (e) => {
      console.error("[ws] error:", e);
    };
  }

  joinQueue() {
    if (this._connected) {
      this.send({ type: "JoinQueue" });
    } else {
      this._pendingJoin = true;
      this.connectPassive();
    }
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
      this.ws.onclose = null;
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
