import { t } from "./i18n.js";
import { splitDuration } from "./utils.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

export function formatDuration(ms) {
  const { hours, minutes, seconds } = splitDuration(ms);
  if (hours > 0) {
    return t("duration.hours", { hours, minutes, minutesPadded: pad(minutes) });
  }
  return t("duration.minutes", { minutes, seconds, secondsPadded: pad(seconds) });
}
