import {
  DEFAULT_START_DATE,
  POLL_MS,
  REVERSE_SCAN_CHUNK_BYTES,
  STATE_VERSION,
  TAIL_BYTES,
  TAIL_LINES,
  isElectron
} from "../core/constants.js";
import { readLocalState, saveLocalState, state } from "../core/state.js";
import { els, setProgress } from "../core/dom.js";
import { t } from "../core/i18n.js";
import { isHiddenRecord, refreshClassification } from "../data/classification.js";
import { parseLines, recalculateDurations, recalculateRunCounts } from "./parser.js";
import { collectRecordDeaths, isOnOrAfterStartDate, lineDate, normalizeCharacterName } from "../core/utils.js";
import { RemoteClientFile } from "./file-source.js";
import { deleteHandle, readHandle } from "./handle-store.js";
import { render, renderRealtimeToggle } from "../ui/render.js";
import { resetVisibleRows } from "../ui/table.js";

export function isStale(generation) {
  return generation !== state.generation;
}

export async function currentFile() {
  if (state.fileHandle) {
    const permission = await state.fileHandle.requestPermission({ mode: "read" });
    if (permission !== "granted") {
      els.watchStatus.textContent = t("watch.noAccess");
      return null;
    }
    state.file = await state.fileHandle.getFile();
    return state.file;
  }
  return state.file;
}

export async function loadFile(file, handle, scanNow) {
  state.generation += 1;
  const generation = state.generation;
  if (!handle) {
    stopPolling();
    state.realtime = false;
  }
  state.file = file;
  state.fileHandle = handle;
  state.fileName = file.name;
  state.lastSize = file.size;
  els.fileName.textContent = file.name;
  els.watchStatus.textContent = handle && state.realtime ? t("watch.realtimeEnabled") : t("watch.fileLoaded");

  if (scanNow) {
    await fullScan();
  } else {
    saveLocalState();
  }

  if (isStale(generation)) return;
  if (handle && state.realtime) startPolling();
  render();
}

export async function rescanTail() {
  const generation = state.generation;
  const file = await currentFile();
  if (!file || isStale(generation)) return;

  setProgress(12, t("progress.readingRecent"));
  const start = Math.max(0, file.size - TAIL_BYTES);
  const text = await file.slice(start).text();
  if (isStale(generation)) return;
  const lines = text.split(/\r?\n/).slice(-TAIL_LINES);
  state.deaths = [];
  const parsed = parseLines(lines, { reset: true });
  state.records = parsed.records;
  state.pending = parsed.pending;
  recalculateDurations();
  recalculateRunCounts();
  state.lastSize = file.size;
  resetVisibleRows();
  setProgress(100, t("progress.lines", { count: lines.length.toLocaleString("en-US") }));
  saveLocalState();
  render();
}

export async function fullScan() {
  const generation = state.generation;
  const previous = {
    records: state.records,
    pending: state.pending,
    deaths: state.deaths,
    lastSize: state.lastSize
  };

  try {
    const file = await currentFile();
    if (!file || isStale(generation)) return;

    state.records = [];
    state.pending = null;
    state.deaths = [];
    const scanStart = await findScanStartOffset(file);
    if (isStale(generation)) return;
    const scanSize = Math.max(1, file.size - scanStart);
    const reader = file.slice(scanStart).stream().getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let scanned = 0;
    let linesCount = 0;
    setProgress(0, scanStart ? t("progress.scanningFromDate") : t("progress.fullScan"));

    while (true) {
      const { value, done } = await reader.read();
      if (isStale(generation)) return;
      if (done) break;
      scanned += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      linesCount += lines.length;
      const parsed = parseLines(lines, { reset: false });
      state.pending = parsed.pending;
      setProgress(
        Math.round((scanned / scanSize) * 100),
        t("progress.lines", { count: linesCount.toLocaleString("en-US") })
      );
    }

    if (buffer) parseLines([buffer], { reset: false });
    if (isStale(generation)) return;
    recalculateRunCounts();
    recalculateDurations();
    state.lastSize = file.size;
    resetVisibleRows();
    setProgress(100, t("progress.lines", { count: linesCount.toLocaleString("en-US") }));
    saveLocalState();
    render();
  } catch {
    if (isStale(generation)) return;
    state.records = previous.records;
    state.pending = previous.pending;
    state.deaths = previous.deaths;
    state.lastSize = previous.lastSize;
    setProgress(0, t("progress.refreshFailed"));
    els.watchStatus.textContent = t("watch.scanFailed");
    render();
  }
}

async function findScanStartOffset(file) {
  if (!state.startDate) return 0;

  let end = file.size;
  let carry = "";
  setProgress(0, t("progress.findingStart"));

  while (end > 0) {
    const start = Math.max(0, end - REVERSE_SCAN_CHUNK_BYTES);
    const text = await file.slice(start, end).text();
    const combined = text + carry;
    const lines = combined.split(/\r?\n/);
    carry = lines.shift() || "";

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const date = lineDate(lines[index]);
      if (date && date < state.startDate) return start;
    }

    end = start;
    setProgress(Math.round(((file.size - end) / file.size) * 100), t("progress.findingStart"));
  }

  return 0;
}

export async function pollFile() {
  if (!state.realtime) return;
  const generation = state.generation;
  const file = await currentFile();
  if (!file || isStale(generation)) return;

  if (file.size < state.lastSize) {
    await rescanTail();
    return;
  }

  if (file.size === state.lastSize) {
    els.watchStatus.textContent = t("watch.waitingNewAreas");
    return;
  }

  const text = await file.slice(state.lastSize).text();
  if (isStale(generation)) return;
  const lines = text.split(/\r?\n/);
  parseLines(lines, { reset: false });
  recalculateRunCounts();
  recalculateDurations();
  state.lastSize = file.size;
  setProgress(100, t("progress.addedLines", { count: lines.length }));
  els.watchStatus.textContent = t("watch.updated");
  saveLocalState();
  render();
}

export function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(
    () =>
      pollFile().catch(() => {
        els.watchStatus.textContent = t("watch.waitingAccess");
      }),
    POLL_MS
  );
}

export function stopPolling() {
  if (!state.pollTimer) return;
  clearInterval(state.pollTimer);
  state.pollTimer = null;
}

export function toggleRealtime() {
  state.realtime = !state.realtime;
  if (state.realtime && state.fileHandle) {
    startPolling();
    pollFile();
  } else {
    stopPolling();
    els.watchStatus.textContent = state.fileHandle ? t("watch.realtimeDisabled") : t("watch.noFile");
  }
  saveLocalState();
  renderRealtimeToggle();
}

export async function restoreSavedState() {
  const saved = readLocalState();
  const savedLastSize = saved?.lastSize || 0;
  const needsMigrationScan = Boolean(saved && saved.version !== STATE_VERSION);

  if (saved) {
    state.records = (saved.records || []).map(refreshClassification).filter((record) => !isHiddenRecord(record));
    state.deaths = Array.isArray(saved.deaths) ? saved.deaths : collectRecordDeaths(state.records);
    state.realtime = saved.realtime !== false;
    state.statsExpanded = Boolean(saved.statsExpanded);
    state.startDate = saved.startDate || DEFAULT_START_DATE;
    state.characterName = normalizeCharacterName(saved.characterName);
    state.records = state.records.filter((record) => isOnOrAfterStartDate(record.time, state.startDate));
    recalculateRunCounts();
    recalculateDurations();
    state.lastSize = savedLastSize;
    state.fileName = saved.fileName || "";
  }

  let handle = await readHandle();
  if (!handle && isElectron && state.filePath) {
    const candidate = new RemoteClientFile(state.filePath);
    try {
      await candidate.getFile();
      handle = candidate;
    } catch {
      state.filePath = "";
    }
  }
  if (!handle) return;

  state.fileHandle = handle;
  const permission = handle.requestPermission
    ? await handle.requestPermission({ mode: "read" })
    : await handle.queryPermission({ mode: "read" });
  if (permission === "granted") {
    try {
      const file = await handle.getFile();
      await loadFile(file, handle, false);
      if (needsMigrationScan) {
        await fullScan();
      } else if (savedLastSize > 0 && file.size > savedLastSize) {
        state.lastSize = savedLastSize;
        await pollFile();
      }
      if (state.realtime) startPolling();
    } catch {
      state.fileHandle = null;
      await deleteHandle();
      els.watchStatus.textContent = t("watch.reopenLog");
    }
  } else {
    els.watchStatus.textContent = t("watch.allowAccess");
  }
}
