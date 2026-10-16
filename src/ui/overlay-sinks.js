import { obsClient } from "../obs/client.js";

export function publishOverlay({ overlayId, text, variables }) {
  window.statsServer?.publish({ overlayId, text, variables });
  obsClient.setText(overlayId, text);
}
