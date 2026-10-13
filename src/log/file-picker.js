import { state } from "../core/state.js";
import { els } from "../core/dom.js";
import { t } from "../core/i18n.js";
import { isPickerCancel } from "../core/utils.js";
import { RemoteClientFile, isClientLog } from "./file-source.js";
import { deleteHandle, saveHandle } from "./handle-store.js";
import { loadFile } from "./scanner.js";

export async function chooseNativeFile() {
  if (window.statsServer?.pickLogFile) {
    await chooseElectronFile();
    return;
  }
  if (!window.showOpenFilePicker) {
    openFallbackPicker();
    return;
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: "PoE Client log", accept: { "text/plain": [".txt", ".log"] } }]
    });
    const file = await handle.getFile();
    if (!isClientLog(file)) {
      els.watchStatus.textContent = t("watch.selectLog");
      return;
    }
    await saveHandle(handle);
    await loadFile(file, handle, true);
  } catch (error) {
    if (isPickerCancel(error)) return;
    openFallbackPicker();
  }
}

async function chooseElectronFile() {
  let picked;
  try {
    picked = await window.statsServer.pickLogFile();
  } catch {
    return;
  }
  if (!picked || !picked.path) return;
  const file = new RemoteClientFile(picked.path);
  try {
    await file.getFile();
  } catch {
    els.watchStatus.textContent = t("watch.selectLog");
    return;
  }
  if (!isClientLog(file)) {
    els.watchStatus.textContent = t("watch.selectLog");
    return;
  }
  await deleteHandle();
  state.filePath = picked.path;
  await loadFile(file, file, true);
}

export async function chooseFallbackFile(event) {
  const [file] = Array.from(event.target.files || []);
  event.target.value = "";
  if (!file) return;
  if (!isClientLog(file)) {
    els.watchStatus.textContent = t("watch.selectLog");
    return;
  }
  await deleteHandle();
  await loadFile(file, null, true);
  els.watchStatus.textContent = t("watch.fileLoaded");
}

export function openFallbackPicker() {
  els.watchStatus.textContent = t("watch.chooseLog");
  els.fallbackPicker.click();
}
