export function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^the /, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSearch(value) {
  return String(value || "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCharacterName(value) {
  return String(value || "").trim();
}

export function normalizeCodeName(value) {
  return String(value || "")
    .replace(/^Map/i, "")
    .replace(/^The\s+/i, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[char]
  );
}

export function parseTime(value) {
  return value.replace(/\//g, "-");
}

export function lineDate(line) {
  const match = String(line || "").match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function isOnOrAfterStartDate(value, startDate) {
  if (!startDate) return true;
  return value.slice(0, 10) >= startDate;
}

export function formatTime(value) {
  return value ? value.replace("T", " ") : "";
}

export function splitDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds };
}

export function msBetween(start, end) {
  const startMs = Date.parse(start.replace(" ", "T"));
  const endMs = Date.parse(end.replace(" ", "T"));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return endMs - startMs;
}

export function instanceKey(code, seed) {
  return code && seed ? `${code}:${seed}` : "";
}

export function collectRecordDeaths(records) {
  return Array.from(new Set(records.flatMap((record) => (Array.isArray(record.deaths) ? record.deaths : []))));
}

export function isCharacterDeath(name, characterName) {
  if (!characterName) return true;
  return normalizeCharacterName(name).toLocaleLowerCase() === characterName.toLocaleLowerCase();
}

export function isPickerCancel(error) {
  return Boolean(error) && error.name === "AbortError";
}

export function copyToClipboard(text) {
  if (!text) return Promise.resolve(false);
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
