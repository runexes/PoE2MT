import { HISTORY_PAGE_SIZE } from "../core/constants.js";
import { state } from "../core/state.js";
import { els } from "../core/dom.js";
import { t } from "../core/i18n.js";
import { formatDuration } from "../core/duration.js";
import { deathCount, isHiddenRecord, isTimedRun, locationKey } from "../data/classification.js";
import { escapeHtml, formatTime, normalizeSearch } from "../core/utils.js";
import { typeLabel } from "./labels.js";

export function renderTable() {
  const query = state.search;
  const allRows = state.records
    .filter((record) => !isHiddenRecord(record))
    .filter((record) => state.activeFilter === "all" || record.type === state.activeFilter)
    .filter(
      (record) =>
        !state.locationFilter ||
        (locationKey(record) === state.locationFilter.key && record.type === state.locationFilter.type)
    )
    .filter((record) => !query || normalizeSearch(`${record.name} ${record.code} ${record.boss}`).includes(query))
    .slice()
    .reverse();
  const rows = allRows.slice(0, state.visibleRows);

  if (!rows.length) {
    els.historyBody.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(t("table.noMatches"))}</td></tr>`;
    return;
  }

  els.historyBody.innerHTML =
    rows
      .map(
        (record) => `
      <tr>
        <td>${escapeHtml(formatTime(record.time))}</td>
        <td>
          <strong>${escapeHtml(record.name)}</strong>
          ${record.boss ? `<small>${escapeHtml(record.boss)}</small>` : ""}
        </td>
        <td><span class="type type-${record.type}">${typeLabel(record.type)}</span></td>
        <td>${escapeHtml(String(record.runCount || ""))}</td>
        <td>${escapeHtml(runDurationLabel(record))}</td>
        <td>${deathCell(record)}</td>
        <td>${escapeHtml(String(record.level || ""))}</td>
      </tr>
    `
      )
      .join("") + loadMoreRow(rows.length, allRows.length);
}

export function handleTableScroll() {
  if (!els.historyBody.querySelector(".load-more")) return;
  const nearBottom = els.tableWrap.scrollTop + els.tableWrap.clientHeight >= els.tableWrap.scrollHeight - 120;
  if (!nearBottom) return;
  const previousVisibleRows = state.visibleRows;
  state.visibleRows += HISTORY_PAGE_SIZE;
  if (state.visibleRows !== previousVisibleRows) renderTable();
}

export function resetVisibleRows() {
  state.visibleRows = HISTORY_PAGE_SIZE;
  if (els.tableWrap) els.tableWrap.scrollTop = 0;
}

function loadMoreRow(visibleCount, totalCount) {
  if (visibleCount >= totalCount) return "";
  return `<tr><td colspan="7" class="load-more">${escapeHtml(
    t("table.loadMore", { visible: visibleCount, total: totalCount })
  )}</td></tr>`;
}

function runDurationLabel(record) {
  if (!isTimedRun(record)) return "";
  return record.durationMs ? formatDuration(record.durationMs) : t("table.running");
}

function deathCell(record) {
  const deaths = deathCount(record);
  if (!deaths) return "";
  return `<strong class="death-count">${deaths}</strong>`;
}
