import { state } from "../core/state.js";
import { els } from "../core/dom.js";
import { t } from "../core/i18n.js";
import { formatDuration } from "../core/duration.js";
import { deathCount, isHiddenRecord, isTimedRun } from "../data/classification.js";
import { escapeHtml, normalize, normalizeSearch } from "../core/utils.js";
import { renderOverlays } from "./overlays.js";
import { renderTable, resetVisibleRows } from "./table.js";
import { typeLabel } from "./labels.js";

export function renderSummary() {
  const byType = (type) => state.records.filter((record) => record.type === type).length;
  const bosses = state.records.filter((record) => record.type === "boss" || record.type === "special").length;

  els.mapCount.textContent = byType("map");
  els.anomalyCount.textContent = byType("anomaly");
  els.citadelCount.textContent = byType("citadel");
  els.expeditionCount.textContent = byType("expedition");
  els.bossCount.textContent = bosses;
  els.deathCount.textContent = state.deaths.length;

  const lastVisible = state.records.filter((record) => !isHiddenRecord(record)).at(-1);
  els.lastArea.textContent = lastVisible ? lastVisible.name : "-";
}

export function renderLocationStats() {
  const stats = new Map();
  state.locations = new Map();

  for (const record of state.records) {
    if (isHiddenRecord(record)) continue;
    const keyNormalized = normalize(record.name);
    const key = `${keyNormalized}:${record.type}`;
    const current = stats.get(key) || {
      name: record.name,
      type: record.type,
      count: 0,
      deaths: 0,
      totalMs: 0,
      timedCount: 0,
      lastTime: ""
    };
    current.count += 1;
    current.deaths += deathCount(record);
    current.lastTime = record.time;
    if (isTimedRun(record) && record.durationMs) {
      current.totalMs += record.durationMs;
      current.timedCount += 1;
    }
    stats.set(key, current);
    state.locations.set(keyNormalized, current);
  }

  const rows = Array.from(stats.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  if (!rows.length) {
    els.locationStats.innerHTML = `<p class="empty-stat">${escapeHtml(t("stats.empty"))}</p>`;
    return;
  }

  els.locationStats.innerHTML = rows
    .map((item) => {
      const averageMs = item.timedCount ? item.totalMs / item.timedCount : 0;
      const selected = isSelectedLocation(item) ? " selected" : "";
      return `
        <article class="stat-row${selected}" role="button" tabindex="0" data-location-name="${escapeHtml(item.name)}" data-location-type="${escapeHtml(item.type)}">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span class="type type-${item.type}">${typeLabel(item.type)}</span>
          </div>
          <div class="stat-metrics">
            <b>${item.count}</b>
            <small>${statDetailLabel(item, averageMs)}</small>
          </div>
        </article>
      `;
    })
    .join("");
}

export function applyLocationFilter(name, type) {
  if (!name || !type) return;
  const key = normalize(name);
  if (state.locationFilter?.key === key && state.locationFilter.type === type) {
    clearLocationFilter();
    return;
  }
  state.locationFilter = { key, type };
  state.search = normalizeSearch(name);
  state.activeFilter = type;
  els.searchBox.value = name;
  syncFilterButtons();
  refreshListView();
}

export function clearLocationFilter() {
  state.locationFilter = null;
  state.search = "";
  state.activeFilter = "all";
  els.searchBox.value = "";
  syncFilterButtons();
  refreshListView();
}

export function isSelectedLocation(item) {
  return Boolean(
    state.locationFilter && state.locationFilter.key === normalize(item.name) && state.locationFilter.type === item.type
  );
}

export function syncFilterButtons() {
  els.filters.forEach((item) => item.classList.toggle("active", item.dataset.filter === state.activeFilter));
}

export function refreshListView() {
  resetVisibleRows();
  renderLocationStats();
  renderOverlays();
  renderTable();
}

function statDetailLabel(item, averageMs) {
  const parts = [];
  if (averageMs) parts.push(t("stats.avg", { duration: formatDuration(averageMs) }));
  if (item.deaths) parts.push(t("stats.deaths", { count: item.deaths }));
  return parts.join(" / ") || t("stats.noTime");
}
