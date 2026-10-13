import { LOG_READ_CHUNK, REQUIRED_LOG_FILE } from "../core/constants.js";

export class RemoteClientFile {
  constructor(filePath) {
    this.filePath = filePath;
    this.lastSize = 0;
  }

  get name() {
    return REQUIRED_LOG_FILE;
  }

  get size() {
    return this.lastSize;
  }

  async refresh() {
    if (!window.statsServer?.logInfo) return this.lastSize;
    try {
      const info = await window.statsServer.logInfo(this.filePath);
      if (info && Number.isFinite(info.size)) this.lastSize = info.size;
    } catch {
      return this.lastSize;
    }
    return this.lastSize;
  }

  async readRange(start, length) {
    const data = await window.statsServer.logRead(this.filePath, start, length);
    return data || new Uint8Array(0);
  }

  async requestPermission() {
    return "granted";
  }

  async getFile() {
    await this.refresh();
    return this;
  }

  slice(start = 0, end = this.lastSize) {
    const file = this;
    const startPos = Math.max(0, start);
    const endPos = Math.max(startPos, Math.min(end, file.lastSize));
    return {
      text: async () => {
        const data = await file.readRange(startPos, endPos - startPos);
        return new TextDecoder("utf-8").decode(data);
      },
      stream: () => ({
        getReader: () => remoteStreamReader(file, startPos, endPos)
      })
    };
  }
}

function remoteStreamReader(file, start, end) {
  let offset = start;
  return {
    async read() {
      if (offset >= end) return { value: undefined, done: true };
      const length = Math.min(LOG_READ_CHUNK, end - offset);
      const data = await file.readRange(offset, length);
      if (!data || data.byteLength === 0) return { value: undefined, done: true };
      offset += data.byteLength;
      return { value: data, done: false };
    },
    async cancel() {
      offset = end;
    },
    releaseLock() {}
  };
}

export function isClientLog(file) {
  return Boolean(file) && file.name === REQUIRED_LOG_FILE;
}
