import {
  OP,
  buildAuthentication,
  closeReason,
  decodeMessage,
  identifyMessage,
  isSourceMissing,
  requestMessage
} from "./protocol.js";
import { defaultObsSettings } from "./settings.js";

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const REQUEST_TIMEOUT_MS = 5000;

export class ObsClient {
  constructor() {
    this.settings = defaultObsSettings();
    this.state = "disconnected";
    this.error = null;
    this.wanted = false;
    this.socket = null;
    this.pending = new Map();
    this.desiredText = new Map();
    this.sentText = new Map();
    this.pushing = new Set();
    this.dirty = new Set();
    this.requestSeq = 0;
    this.reconnectDelay = RECONNECT_MIN_MS;
    this.reconnectTimer = null;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState() {
    return { state: this.state, error: this.error };
  }

  configure(settings) {
    this.settings = defaultObsSettings();
    Object.assign(this.settings, settings || {});
  }

  connect() {
    this.wanted = true;
    this.clearReconnect();
    if (this.state === "connecting" || this.state === "connected") return;
    this.openSocket();
  }

  disconnect() {
    this.wanted = false;
    this.clearReconnect();
    this.closeSocket();
    this.sentText.clear();
    this.setState("disconnected", null);
  }

  setText(inputName, text) {
    if (!inputName || typeof text !== "string") return;
    if (this.desiredText.get(inputName) === text) return;
    this.desiredText.set(inputName, text);
    if (this.state !== "connected") return;
    this.pushInput(inputName);
  }

  openSocket() {
    this.setState("connecting", null);
    let socket;
    try {
      socket = new WebSocket(`ws://${this.settings.host}:${this.settings.port}`);
    } catch (error) {
      this.failTransport("unreachable", error?.message || "socket-open-failed");
      return;
    }
    this.socket = socket;
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = (event) => this.handleClose(event);
    socket.onerror = () => {
      // a close event always follows; handled there
    };
  }

  handleMessage(raw) {
    const message = decodeMessage(raw);
    if (!message) return;
    if (message.op === OP.HELLO) {
      this.handleHello(message.data).catch((error) => this.failTransport("auth", error?.message));
      return;
    }
    if (message.op === OP.IDENTIFIED) {
      this.handleIdentified();
      return;
    }
    if (message.op === OP.REQUEST_RESPONSE) {
      this.handleResponse(message.data);
    }
  }

  async handleHello(data) {
    const authentication = data?.authentication;
    const response = authentication
      ? await buildAuthentication(
          this.settings.password,
          String(authentication.salt || ""),
          String(authentication.challenge || "")
        )
      : null;
    this.send(identifyMessage(response));
  }

  handleIdentified() {
    this.reconnectDelay = RECONNECT_MIN_MS;
    this.setState("connected", null);
    for (const inputName of this.desiredText.keys()) this.pushInput(inputName);
  }

  handleResponse(data) {
    const entry = this.pending.get(data?.requestId);
    if (!entry) return;
    this.pending.delete(data.requestId);
    clearTimeout(entry.timer);
    const status = data.requestStatus || {};
    if (status.result) {
      entry.resolve(data.responseData || {});
      return;
    }
    const error = new Error(status.comment || `request-failed:${status.code}`);
    error.code = status.code;
    entry.reject(error);
  }

  handleClose(event) {
    const { code } = event || {};
    this.socket = null;
    this.sentText.clear();
    this.rejectPending("connection-closed");
    if (!this.wanted) {
      this.setState("disconnected", null);
      return;
    }
    const reason = closeReason(code);
    if (reason) {
      this.wanted = false;
      this.setState("error", { reason, code, message: `closed:${code}` });
      return;
    }
    this.setState("error", { reason: "unreachable", code, message: `closed:${code}` });
    this.scheduleReconnect();
  }

  closeSocket() {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close();
    } catch {
      // already closed
    }
  }

  scheduleReconnect() {
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.wanted) return;
      this.openSocket();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  clearReconnect() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  send(message) {
    if (!this.socket) throw new Error("socket-not-open");
    this.socket.send(JSON.stringify(message));
  }

  request(requestType, requestData) {
    return new Promise((resolve, reject) => {
      if (this.state !== "connected" || !this.socket) {
        reject(new Error("not-connected"));
        return;
      }
      const requestId = `r${(this.requestSeq += 1)}`;
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(Object.assign(new Error("request-timeout"), { code: 0 }));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.send(requestMessage(requestType, requestId, requestData));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      }
    });
  }

  async pushInput(inputName) {
    if (this.pushing.has(inputName)) {
      this.dirty.add(inputName);
      return;
    }
    this.pushing.add(inputName);
    try {
      do {
        this.dirty.delete(inputName);
        const text = this.desiredText.get(inputName);
        if (text === undefined) break;
        if (this.sentText.get(inputName) === text) break;
        await this.request("SetInputSettings", {
          inputName,
          inputSettings: { text },
          overlay: true
        });
        this.sentText.set(inputName, text);
      } while (this.dirty.has(inputName));
      this.clearError();
    } catch (error) {
      this.reportRequestError(error, inputName);
    } finally {
      this.pushing.delete(inputName);
    }
  }

  reportRequestError(error, inputName) {
    if (error?.message === "not-connected" || error?.message === "connection-closed") return;
    if (error?.message === "request-timeout") {
      this.setState("connected", { reason: "timeout", inputName, message: error.message });
      return;
    }
    const reason = isSourceMissing(error?.code) ? "source" : "request";
    this.setState("connected", { reason, inputName, code: error?.code, message: error?.message });
  }

  clearError() {
    if (!this.error) return;
    this.error = null;
    this.emit();
  }

  failTransport(reason, message) {
    this.wanted = false;
    this.closeSocket();
    this.rejectPending("connection-closed");
    this.sentText.clear();
    this.setState("error", { reason, message });
  }

  rejectPending(reason) {
    for (const [requestId, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
      this.pending.delete(requestId);
    }
  }

  setState(state, error) {
    this.state = state;
    this.error = error;
    this.emit();
  }

  emit() {
    for (const listener of this.listeners) listener();
  }
}

export const obsClient = new ObsClient();
