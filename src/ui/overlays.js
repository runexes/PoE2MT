import { DEFAULT_TEMPLATE, OVERLAY_ID_PATTERN } from "../core/constants.js";
import { state } from "../core/state.js";
import { els } from "../core/dom.js";
import { t } from "../core/i18n.js";
import { formatDuration } from "../core/duration.js";
import { isHiddenRecord } from "../data/classification.js";
import { copyToClipboard, escapeHtml, normalize } from "../core/utils.js";

export let overlays = [];
export let overlayManagerOpen = false;

let serverRunning = false;
let configSaveTimer = null;

const DYNAMIC_VARIABLE_TARGETS = {
  location_count: "selected_map_count",
  location_avg: "selected_map_avg",
  location_deaths: "selected_map_deaths"
};

export function renderOverlays() {
  const variables = getTemplateVariables();

  overlays.forEach((overlay, index) => {
    overlay.rendered = renderTemplate(overlay.template, variables);
    const card = els.overlayList.querySelector(`.overlay-card[data-index="${index}"]`);
    const preview = card?.querySelector(".overlay-preview");
    if (preview) preview.textContent = overlay.rendered;
    window.statsServer?.publish({
      overlayId: overlay.id,
      text: overlay.rendered,
      variables
    });
  });
}

function publishOverlay(index) {
  const overlay = overlays[index];
  if (!overlay) return;

  const variables = getTemplateVariables();
  overlay.rendered = renderTemplate(overlay.template, variables);

  const card = els.overlayList.querySelector(`.overlay-card[data-index="${index}"]`);
  const preview = card?.querySelector(".overlay-preview");
  if (preview) preview.textContent = overlay.rendered;

  window.statsServer?.publish({
    overlayId: overlay.id,
    text: overlay.rendered,
    variables
  });
}

export function renderOverlayList() {
  els.overlayList.innerHTML = "";
  overlays.forEach((overlay, index) => {
    const card = document.createElement("div");
    card.className = "overlay-card";
    card.dataset.index = String(index);
    const url = overlayUrl(overlay.id);
    card.innerHTML = [
      '<div class="overlay-card-head">',
      '<label class="field"><span>ID</span>',
      `<input class="overlay-id" type="text" value="${escapeHtml(
        overlay.id
      )}" spellcheck="false" autocomplete="off" />`,
      "</label>",
      '<button class="overlay-delete" type="button" title="' +
        escapeHtml(t("overlay.remove")) +
        '" aria-label="' +
        escapeHtml(t("overlay.remove")) +
        '">X</button>',
      "</div>",
      `<textarea class="overlay-template" rows="5" spellcheck="false" aria-label="${escapeHtml(
        t("overlay.templateLabel")
      )}">${escapeHtml(overlay.template)}</textarea>`,
      `<button class="overlay-url" type="button" data-url="${escapeHtml(
        url
      )}" title="${escapeHtml(t("overlay.copyLink"))}">${escapeHtml(url)}</button>`,
      `<pre class="overlay-preview">${escapeHtml(overlay.rendered)}</pre>`
    ].join("");
    els.overlayList.appendChild(card);
  });
}

export function addOverlay() {
  overlays.push({ id: uniqueOverlayId(), template: DEFAULT_TEMPLATE, rendered: "" });
  renderOverlayList();
  persistConfig();
  renderOverlays();
}

export function toggleOverlayManager() {
  overlayManagerOpen = !overlayManagerOpen;
  applyOverlayManagerState(true);
  if (overlayManagerOpen) renderOverlayList();
  persistConfig();
}

export function applyOverlayManagerState(showToggle) {
  els.streamToggle.hidden = !showToggle;
  if (!showToggle) {
    els.overlayManager.hidden = true;
    els.streamToggle.textContent = t("topbar.streamShow");
    els.streamToggle.setAttribute("aria-pressed", "false");
    els.streamToggle.classList.remove("active-toggle");
    return;
  }
  els.overlayManager.hidden = !overlayManagerOpen;
  els.streamToggle.textContent = overlayManagerOpen ? t("topbar.streamHide") : t("topbar.streamShow");
  els.streamToggle.setAttribute("aria-pressed", String(overlayManagerOpen));
  els.streamToggle.classList.toggle("active-toggle", overlayManagerOpen);
}

export function handleOverlayInput(event) {
  const field = event.target.closest(".overlay-template");
  if (!field) return;
  const card = field.closest(".overlay-card");
  const index = Number(card.dataset.index);
  if (!overlays[index]) return;
  overlays[index].template = field.value;
  publishOverlay(index);
  scheduleConfigSave();
}

export function handleOverlayChange(event) {
  const field = event.target.closest(".overlay-id");
  if (!field) return;
  const card = field.closest(".overlay-card");
  const index = Number(card.dataset.index);
  const overlay = overlays[index];
  if (!overlay) return;

  const nextId = field.value.trim();
  if (!isValidOverlayId(nextId)) {
    field.value = overlay.id;
    els.serverStatus.textContent = t("server.idInvalid");
    setServerStatusError(true);
    return;
  }
  if (overlays.some((item, itemIndex) => itemIndex !== index && item.id === nextId)) {
    field.value = overlay.id;
    els.serverStatus.textContent = t("server.idDuplicate");
    setServerStatusError(true);
    return;
  }

  overlay.id = nextId;
  renderOverlayList();
  persistConfig();
  renderOverlays();
}

export function handleOverlayClick(event) {
  const urlElement = event.target.closest(".overlay-url");
  if (urlElement) {
    const url = urlElement.dataset.url || "";
    copyToClipboard(url).then((ok) => flashUrl(urlElement, url, ok));
    return;
  }
  const button = event.target.closest(".overlay-delete");
  if (!button) return;
  const card = button.closest(".overlay-card");
  const index = Number(card.dataset.index);
  if (!overlays[index]) return;
  overlays.splice(index, 1);
  renderOverlayList();
  persistConfig();
  renderOverlays();
}

export function initStatsServer() {
  if (!window.statsServer) {
    els.streamToggle.hidden = true;
    if (els.overlayManager) els.overlayManager.hidden = true;
    return Promise.resolve();
  }

  return window.statsServer
    .getConfig()
    .then((info) => {
      if (!info?.config) return;
      els.statsPort.value = info.config.port;
      els.autoStart.checked = Boolean(info.config.autoStart);
      overlayManagerOpen = Boolean(info.config.overlayManagerOpen);
      overlays = (info.config.overlays || []).map((overlay) => ({
        id: overlay.id,
        template: overlay.template || "",
        rendered: ""
      }));
      renderOverlayList();
      applyServerInfo(info);
    })
    .catch(() => {
      els.serverStatus.textContent = t("server.configReadError");
      setServerStatusError(true);
    });
}

export function applyServerInfo(info) {
  if (!info) return;
  state.serverInfo = info;
  serverRunning = Boolean(info.running);
  els.serverStart.textContent = serverRunning ? t("overlayManager.stop") : t("overlayManager.start");

  if (info.error) {
    els.serverStatus.textContent = t("server.error", { error: info.error });
    setServerStatusError(true);
  } else if (serverRunning) {
    els.serverStatus.textContent = t("server.running");
    setServerStatusError(false);
  } else {
    els.serverStatus.textContent = t("server.stopped");
    setServerStatusError(false);
  }

  els.overlayList.querySelectorAll(".overlay-url").forEach((element, index) => {
    if (!overlays[index]) return;
    const url = overlayUrl(overlays[index].id);
    element.dataset.url = url;
    element.textContent = url;
  });
}

export function persistConfig() {
  clearTimeout(configSaveTimer);
  if (!window.statsServer) return Promise.resolve();

  const config = {
    port: Number(els.statsPort.value),
    autoStart: els.autoStart.checked,
    overlayManagerOpen,
    language: state.language,
    overlays: overlays.map((overlay) => ({
      id: overlay.id,
      template: overlay.template
    }))
  };

  return window.statsServer
    .configSet(config)
    .then(applyServerInfo)
    .catch(() => {
      els.serverStatus.textContent = t("server.saveError");
      setServerStatusError(true);
    });
}

export function scheduleConfigSave() {
  clearTimeout(configSaveTimer);
  configSaveTimer = setTimeout(persistConfig, 400);
}

export function toggleServer() {
  if (!window.statsServer) return;
  const action = serverRunning ? window.statsServer.serverStop() : window.statsServer.serverStart();
  action.then(applyServerInfo).catch(() => {
    els.serverStatus.textContent = t("server.controlError");
    setServerStatusError(true);
  });
}

function isValidOverlayId(value) {
  return OVERLAY_ID_PATTERN.test(value);
}

function setServerStatusError(isError) {
  els.serverStatus.classList.toggle("server-status-error", isError);
}

function overlayUrl(overlayId) {
  const port = Number(els.statsPort.value) || 8080;
  return `http://localhost:${port}/overlays/map/${encodeURIComponent(overlayId)}`;
}

function uniqueOverlayId() {
  let index = overlays.length + 1;
  let candidate = `map-${index}`;
  while (overlays.some((overlay) => overlay.id === candidate)) {
    index += 1;
    candidate = `map-${index}`;
  }
  return candidate;
}

function flashUrl(element, url, ok) {
  clearTimeout(element.copyTimer);
  element.classList.toggle("overlay-url-done", ok);
  element.classList.toggle("overlay-url-error", !ok);
  element.textContent = ok ? t("overlay.copied") : t("overlay.copyFailed");
  element.copyTimer = setTimeout(() => {
    element.classList.remove("overlay-url-done", "overlay-url-error");
    element.textContent = url;
  }, 1200);
}

function getTemplateVariables() {
  const countByType = (type) => state.records.filter((record) => record.type === type).length;

  const lastVisible = state.records.filter((record) => !isHiddenRecord(record)).at(-1);

  return {
    maps_completed: countByType("map"),
    anomalies: countByType("anomaly"),
    citadels: countByType("citadel"),
    expeditions: countByType("expedition"),
    bosses: state.records.filter((record) => record.type === "boss" || record.type === "special").length,
    deaths: state.deaths.length,
    current_location: state.pending?.name ?? "",
    last_area: lastVisible?.name ?? "-",
    character_name: state.characterName || "",
    ...getSelectedMapVariables()
  };
}

function locationStatsFor(name) {
  if (!name) return null;
  return state.locations?.get(normalize(name)) || null;
}

function locationVariables(selected) {
  if (!selected) {
    return {
      selected_map_count: 0,
      selected_map_name: "",
      selected_map_avg: "",
      selected_map_deaths: 0
    };
  }

  const averageMs = selected.timedCount ? selected.totalMs / selected.timedCount : 0;
  return {
    selected_map_count: selected.count,
    selected_map_name: selected.name,
    selected_map_avg: averageMs ? formatDuration(averageMs) : "",
    selected_map_deaths: selected.deaths
  };
}

function getSelectedMapVariables() {
  const selected = state.locationFilter ? locationStatsFor(state.locationFilter.key) : null;
  return locationVariables(selected);
}

function resolveDynamicVariable(key, arg) {
  const target = DYNAMIC_VARIABLE_TARGETS[key];
  if (!target) return null;
  const selected = locationStatsFor(arg);
  if (!selected) return null;
  return locationVariables(selected)[target];
}

function renderTemplate(template, variables) {
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)(?::([^}]+))?\}/g, (match, key, arg) => {
    if (arg !== undefined) {
      const value = resolveDynamicVariable(key, arg.trim());
      return value != null ? String(value) : match;
    }
    return Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match;
  });
}
