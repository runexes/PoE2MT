import { DEFAULT_START_DATE } from "./core/constants.js";
import { clearLocalState, saveLocalState, state } from "./core/state.js";
import { els, setProgress } from "./core/dom.js";
import { applyTranslations, fetchMessages, initI18n, t, updateLangToggle } from "./core/i18n.js";
import { normalizeCharacterName, normalizeSearch } from "./core/utils.js";
import { chooseFallbackFile, chooseNativeFile, openFallbackPicker } from "./log/file-picker.js";
import { fullScan, stopPolling, restoreSavedState, toggleRealtime } from "./log/scanner.js";
import { deleteHandle } from "./log/handle-store.js";
import {
  addOverlay,
  handleOverlayChange,
  handleOverlayClick,
  handleOverlayInput,
  initStatsServer,
  overlayManagerOpen,
  persistConfig,
  renderOverlayList,
  toggleOverlayManager,
  toggleServer
} from "./ui/overlays.js";
import { applyLocationFilter, refreshListView, syncFilterButtons } from "./ui/summary.js";
import { handleTableScroll, resetVisibleRows } from "./ui/table.js";
import { render, renderStatsState } from "./ui/render.js";

async function init() {
  wireEvents();
  await initI18n();
  await Promise.all([initStatsServer(), restoreSavedState()]);
  applyTranslations();
  updateLangToggle();
  render();
}

function wireEvents() {
  els.nativePicker.addEventListener("click", chooseNativeFile);
  els.fallbackButton.addEventListener("click", openFallbackPicker);
  els.fallbackPicker.addEventListener("change", chooseFallbackFile);
  els.fullScan.addEventListener("click", () => fullScan());
  els.realtimeToggle.addEventListener("click", toggleRealtime);
  els.clearData.addEventListener("click", clearData);
  els.dateField.addEventListener("click", openDatePicker);
  els.startDate.addEventListener("change", () => {
    state.startDate = els.startDate.value;
    saveLocalState();
    if (state.file || state.fileHandle) fullScan();
  });
  els.characterName.addEventListener("change", () => {
    state.characterName = normalizeCharacterName(els.characterName.value);
    els.characterName.value = state.characterName;
    saveLocalState();
    if (state.file || state.fileHandle) fullScan();
  });
  els.statsHeader.addEventListener("click", toggleStats);
  els.locationStats.addEventListener("click", (event) => {
    const row = event.target.closest(".stat-row");
    if (row) applyLocationFilter(row.dataset.locationName, row.dataset.locationType);
  });
  els.locationStats.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest(".stat-row");
    if (!row) return;
    event.preventDefault();
    applyLocationFilter(row.dataset.locationName, row.dataset.locationType);
  });
  els.searchBox.addEventListener("input", (event) => {
    state.locationFilter = null;
    state.search = normalizeSearch(event.target.value);
    refreshListView();
  });
  els.tableWrap.addEventListener("scroll", handleTableScroll);
  els.filters.forEach((button) => {
    button.addEventListener("click", () => {
      state.locationFilter = null;
      state.activeFilter = button.dataset.filter;
      syncFilterButtons();
      refreshListView();
    });
  });

  els.streamToggle.addEventListener("click", toggleOverlayManager);
  els.addOverlay.addEventListener("click", addOverlay);
  els.langToggle.addEventListener("click", toggleLanguage);
  els.serverStart.addEventListener("click", toggleServer);
  els.statsPort.addEventListener("change", persistConfig);
  els.autoStart.addEventListener("change", persistConfig);
  els.overlayList.addEventListener("input", handleOverlayInput);
  els.overlayList.addEventListener("change", handleOverlayChange);
  els.overlayList.addEventListener("click", handleOverlayClick);
}

function openDatePicker(event) {
  if (event.target === els.startDate) return;
  els.startDate.focus();
  if (typeof els.startDate.showPicker === "function") {
    els.startDate.showPicker();
  }
}

function toggleStats() {
  state.statsExpanded = !state.statsExpanded;
  saveLocalState();
  renderStatsState();
}

function toggleLanguage() {
  const next = state.language === "ru" ? "en" : "ru";
  setLanguage(next);
}

async function setLanguage(language) {
  state.language = language;
  updateLangToggle();
  try {
    await persistConfig();
    const info = await fetchMessages(language);
    state.language = info.language || language;
    state.messages = info.messages || {};
  } catch {
    state.messages = state.messages || {};
  }
  applyTranslations();
  updateLangToggle();
  if (overlayManagerOpen) renderOverlayList();
  render();
}

async function clearData() {
  state.generation += 1;
  stopPolling();
  state.fileHandle = null;
  state.file = null;
  state.fileName = "";
  state.filePath = "";
  state.lastSize = 0;
  state.pending = null;
  state.records = [];
  state.deaths = [];
  resetVisibleRows();
  state.startDate = DEFAULT_START_DATE;
  state.characterName = "";
  els.startDate.value = DEFAULT_START_DATE;
  els.characterName.value = "";
  clearLocalState();
  await deleteHandle();
  setProgress(0, t("progress.lines", { count: 0 }));
  els.watchStatus.textContent = t("watch.cleared");
  render();
}

init();
