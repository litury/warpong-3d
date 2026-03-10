import type { ClientMessage, ServerMessage } from "../shared/messages";

const SERVER_URL = "ws://localhost:3030";
const RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_ATTEMPTS = 5;

export class WsClient {
  private ws: WebSocket | null = null;
  private _inbox: ServerMessage[] = [];
  private _connected = false;
  private _pendingJoin = false;

  // Reconnection state
  private _sessionToken: string | null = null;
  private _authData: { signature: string; uniqueId: string; name: string } | null = null;
  private _reconnectAttempts = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _inGame = false;

  connectPassive() {
    if (this.ws) return;
    const ws = new WebSocket(SERVER_URL);
    this.ws = ws;

    ws.onopen = () => {
      this._connected = true;
      const auth: ClientMessage = this._authData
        ? { type: "Auth", ...this._authData }
        : { type: "Auth", signature: "dev", uniqueId: "local-player", name: "Player" };
      this._authData = this._authData ?? { signature: "dev", uniqueId: "local-player", name: "Player" };
      this.send(auth);

      // If we have a session token, try to reconnect to the game
      if (this._sessionToken && this._inGame) {
        this.send({ type: "Reconnect", sessionToken: this._sessionToken });
        this._reconnectAttempts = 0;
      } else if (this._pendingJoin) {
        this.send({ type: "JoinQueue" });
        this._pendingJoin = false;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        // Capture session token from MatchFound
        if (msg.type === "MatchFound") {
          this._sessionToken = msg.sessionToken;
          this._inGame = true;
          this._reconnectAttempts = 0;
        } else if (msg.type === "GameOver" || msg.type === "OpponentDisconnected") {
          this._sessionToken = null;
          this._inGame = false;
        }
        this._inbox.push(msg);
      } catch (e) {
        console.warn("[ws] parse error:", e);
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this._connected = false;
        this.ws = null;

        // Auto-reconnect if in a game session
        if (this._inGame && this._sessionToken && this._reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this._reconnectAttempts++;
          console.log(`[ws] connection lost during game, reconnecting (attempt ${this._reconnectAttempts})...`);
          this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.connectPassive();
          }, RECONNECT_DELAY_MS);
        }
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
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this._inbox = [];
    this._sessionToken = null;
    this._inGame = false;
    this._reconnectAttempts = 0;
  }

  get connected(): boolean {
    return this._connected;
  }
}
