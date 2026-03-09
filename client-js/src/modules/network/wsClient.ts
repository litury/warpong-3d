import type { ClientMessage, ServerMessage } from "../../shared/messages";

const SERVER_URL = "ws://localhost:3030";

export interface AuthPayload {
  signature: string;
  uniqueId: string;
  name: string;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private _inbox: ServerMessage[] = [];
  private _connected = false;
  private _authenticated = false;
  private _pendingJoin = false;
  private _authPayload: AuthPayload | null = null;
  private _pendingMessages: ClientMessage[] = [];

  setAuthPayload(payload: AuthPayload) {
    this._authPayload = payload;
  }

  connectPassive() {
    if (this.ws) return;
    const ws = new WebSocket(SERVER_URL);
    this.ws = ws;

    ws.onopen = () => {
      this._connected = true;

      // Send Auth as the very first message
      if (this._authPayload) {
        ws.send(JSON.stringify({
          type: "Auth",
          signature: this._authPayload.signature,
          uniqueId: this._authPayload.uniqueId,
          name: this._authPayload.name,
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        this._inbox.push(msg);

        // PlayerSync confirms authentication — flush pending messages
        if (msg.type === "PlayerSync" && !this._authenticated) {
          this._authenticated = true;
          for (const pending of this._pendingMessages) {
            ws.send(JSON.stringify(pending));
          }
          this._pendingMessages = [];

          if (this._pendingJoin) {
            this.send({ type: "JoinQueue" });
            this._pendingJoin = false;
          }
        }
      } catch (e) {
        console.warn("[ws] parse error:", e);
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this._connected = false;
        this._authenticated = false;
        this.ws = null;
      }
    };

    ws.onerror = (e) => {
      console.error("[ws] error:", e);
    };
  }

  joinQueue() {
    if (this._connected && this._authenticated) {
      this.send({ type: "JoinQueue" });
    } else {
      this._pendingJoin = true;
      if (!this._connected) {
        this.connectPassive();
      }
    }
  }

  send(msg: ClientMessage) {
    if (!this.ws || !this._connected) return;

    if (!this._authenticated) {
      this._pendingMessages.push(msg);
      return;
    }

    this.ws.send(JSON.stringify(msg));
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
    this._authenticated = false;
    this._inbox = [];
    this._pendingMessages = [];
  }

  get connected(): boolean {
    return this._connected;
  }

  get authenticated(): boolean {
    return this._authenticated;
  }
}
