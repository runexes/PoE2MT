import { state } from "../core/state.js";
import { els } from "../core/dom.js";
import { t } from "../core/i18n.js";
import { applyOverlayManagerState, applyServerInfo, renderOverlays } from "./overlays.js";
import { renderLocationStats, renderSummary } from "./summary.js";
import { renderTable } from "./table.js";

export function render() {
  const hasLog = Boolean(state.fileName || state.file || state.fileHandle);
  els.fileName.textContent = state.fileName || t("controls.noLog");
  if (!hasLog) els.watchStatus.textContent = t("watch.noFile");
  els.setupGuide.hidden = hasLog;
  els.setupPathhint.hidden = hasLog;
  els.summaryGrid.hidden = !hasLog;
  const showOverlayToggle = hasLog;
  applyOverlayManagerState(showOverlayToggle);
  els.statsBand.hidden = !hasLog;
  els.workspace.hidden = !hasLog;
  els.controlBand.classList.toggle("setup-mode", !hasLog);
  els.afterLoad.forEach((item) => {
    item.hidden = !hasLog;
  });
  els.nativePicker.hidden = hasLog;
  els.fallbackControl.hidden = hasLog;
  els.startDate.value = state.startDate;
  if (document.activeElement !== els.characterName) {
    els.characterName.value = state.characterName;
  }
  renderRealtimeToggle();
  renderStatsState();
  renderSummary();
  renderLocationStats();
  renderOverlays();
  renderTable();
  if (state.serverInfo) applyServerInfo(state.serverInfo);
}

export function renderRealtimeToggle() {
  if (!state.fileHandle) {
    els.realtimeToggle.textContent = t("controls.realtimeUnavailable");
    els.realtimeToggle.setAttribute("aria-pressed", "false");
    els.realtimeToggle.classList.remove("active-toggle");
    els.realtimeToggle.disabled = true;
    return;
  }
  els.realtimeToggle.disabled = false;
  els.realtimeToggle.textContent = state.realtime ? t("controls.realtimeOn") : t("controls.realtimeOff");
  els.realtimeToggle.setAttribute("aria-pressed", String(state.realtime));
  els.realtimeToggle.classList.toggle("active-toggle", state.realtime);
}

export function renderStatsState() {
  els.statsBand.classList.toggle("expanded", state.statsExpanded);
  els.statsHeader.setAttribute("aria-expanded", String(state.statsExpanded));
  els.statsHint.textContent = state.statsExpanded ? t("stats.collapseHint") : t("stats.expandHint");
}
