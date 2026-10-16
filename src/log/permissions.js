const PERMISSION_OPTIONS = { mode: "read" };

export function hasUserActivation() {
  const activation = globalThis.navigator?.userActivation;
  if (!activation) return true;
  return Boolean(activation.isActive);
}

async function queryPermission(handle) {
  if (!handle.queryPermission) return "granted";
  try {
    return await handle.queryPermission(PERMISSION_OPTIONS);
  } catch {
    return "denied";
  }
}

async function requestPermission(handle) {
  if (!handle.requestPermission) return "granted";
  try {
    return await handle.requestPermission(PERMISSION_OPTIONS);
  } catch {
    return "denied";
  }
}

export async function hasReadPermission(handle, { request = false } = {}) {
  if (!handle) return false;
  if ((await queryPermission(handle)) === "granted") return true;
  if (!request || !hasUserActivation()) return false;
  return (await requestPermission(handle)) === "granted";
}
