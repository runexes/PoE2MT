export const TAIL_LINES = 3000;
export const TAIL_BYTES = 1600 * 1024;
export const REVERSE_SCAN_CHUNK_BYTES = 1024 * 1024;
export const POLL_MS = 3000;
export const HISTORY_PAGE_SIZE = 250;
export const LOG_READ_CHUNK = 256 * 1024;

export const DB_NAME = "poe2-map-tracker";
export const STORE_NAME = "settings";
export const HANDLE_KEY = "fileHandle";
export const STATE_STORAGE_KEY = "poe2-map-tracker-state";

export const REQUIRED_LOG_FILE = "Client.txt";
export const STATE_VERSION = 12;
export const DEFAULT_START_DATE = "2026-09-04";
export const DEFAULT_LANGUAGE = "en";

export const DEFAULT_TEMPLATE = ["Simulacrum: {location_count:Simulacrum of Delusion}", "Voices: 0"].join("\n");

export const OVERLAY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export const isElectron = Boolean(window.statsServer);
