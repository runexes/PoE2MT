import {
  DEFAULT_LANGUAGE,
  DEFAULT_START_DATE,
  HISTORY_PAGE_SIZE,
  STATE_STORAGE_KEY,
  STATE_VERSION
} from "./constants.js";

export const state = {
  fileHandle: null,
  file: null,
  fileName: "",
  filePath: "",
  lastSize: 0,
  pending: null,
  records: [],
  deaths: [],
  activeFilter: "all",
  search: "",
  locationFilter: null,
  visibleRows: HISTORY_PAGE_SIZE,
  startDate: DEFAULT_START_DATE,
  characterName: "",
  realtime: true,
  statsExpanded: false,
  pollTimer: null,
  generation: 0,
  language: DEFAULT_LANGUAGE,
  messages: {},
  serverInfo: null,
  locations: null
};

export function saveLocalState() {
  localStorage.setItem(
    STATE_STORAGE_KEY,
    JSON.stringify({
      version: STATE_VERSION,
      records: state.records,
      deaths: state.deaths,
      lastSize: state.lastSize,
      fileName: state.fileName,
      filePath: state.filePath,
      realtime: state.realtime,
      statsExpanded: state.statsExpanded,
      startDate: state.startDate,
      characterName: state.characterName,
      savedAt: Date.now()
    })
  );
}

export function readLocalState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

export function clearLocalState() {
  localStorage.removeItem(STATE_STORAGE_KEY);
}
