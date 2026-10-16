import { els } from "../core/dom.js";
import { t } from "../core/i18n.js";
import { obsClient } from "../obs/client.js";
import { loadObsSettings, saveObsSettings } from "../obs/settings.js";

export async function initObsPanel() {
  const settings = await loadObsSettings();
  els.obsHost.value = settings.host;
  els.obsPort.value = String(settings.port);
  els.obsPassword.value = settings.password;
  els.obsAutoConnect.checked = settings.autoConnect;
  obsClient.configure(settings);
  obsClient.subscribe(renderObsStatus);
  renderObsStatus();
  if (settings.autoConnect) obsClient.connect();
}

export function toggleObsConnection() {
  const { state } = obsClient.getState();
  if (state === "connected" || state === "connecting") {
    obsClient.disconnect();
    return;
  }
  persistObsPanelSettings();
  obsClient.connect();
}

export function persistObsPanelSettings() {
  const settings = saveObsSettings({
    host: els.obsHost.value,
    port: Number(els.obsPort.value),
    password: els.obsPassword.value,
    autoConnect: els.obsAutoConnect.checked
  });
  return settings.then((clean) => {
    obsClient.configure(clean);
    if (els.obsHost.value !== clean.host) els.obsHost.value = clean.host;
    if (Number(els.obsPort.value) !== clean.port) els.obsPort.value = String(clean.port);
  });
}

export function updateObsStatusText() {
  renderObsStatus();
}

function renderObsStatus() {
  const { state, error } = obsClient.getState();
  const active = state === "connected" || state === "connecting";
  els.obsToggle.textContent = active ? t("obs.disconnect") : t("obs.connect");
  els.obsToggle.setAttribute("aria-pressed", String(state === "connected"));
  els.obsToggle.classList.toggle("active-toggle", state === "connected");
  els.obsStatus.classList.toggle("server-status-error", Boolean(error));
  if (error) {
    els.obsStatus.textContent = describeObsError(error);
    return;
  }
  if (state === "connected") {
    els.obsStatus.textContent = t("obs.connected");
    return;
  }
  els.obsStatus.textContent = state === "connecting" ? t("obs.connecting") : t("obs.disconnected");
}

function describeObsError(error) {
  if (error.reason === "auth") return t("obs.authFailed");
  if (error.reason === "rpc") return t("obs.rpcVersion");
  if (error.reason === "source") return t("obs.sourceMissing", { name: error.inputName || "" });
  if (error.reason === "timeout") return t("obs.timeout");
  if (error.reason === "unreachable") return t("obs.unreachable");
  return t("obs.error", { error: error.message || "" });
}
