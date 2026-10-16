export const RPC_VERSION = 1;

export const OP = {
  HELLO: 0,
  IDENTIFY: 1,
  IDENTIFIED: 2,
  EVENT: 5,
  REQUEST: 6,
  REQUEST_RESPONSE: 7
};

export const REQUEST_SUCCESS = 100;
export const SOURCE_MISSING_CODES = [600, 601, 603];
export const CLOSE_AUTH_FAILED = 4009;
export const CLOSE_RPC_VERSION = 4010;

export function encodeMessage(op, data) {
  return JSON.stringify({ op, d: data || {} });
}

export function decodeMessage(raw) {
  if (typeof raw !== "string") return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (!Number.isInteger(parsed.op)) return null;
  const data = parsed.d && typeof parsed.d === "object" ? parsed.d : {};
  return { op: parsed.op, data };
}

export function identifyMessage(authentication) {
  const data = { rpcVersion: RPC_VERSION };
  if (authentication) data.authentication = authentication;
  return { op: OP.IDENTIFY, d: data };
}

export function requestMessage(requestType, requestId, requestData) {
  return { op: OP.REQUEST, d: { requestType, requestId, requestData: requestData || {} } };
}

export function isSourceMissing(code) {
  return SOURCE_MISSING_CODES.includes(code);
}

export function closeReason(code) {
  if (code === CLOSE_AUTH_FAILED) return "auth";
  if (code === CLOSE_RPC_VERSION) return "rpc";
  return null;
}

export async function buildAuthentication(password, salt, challenge) {
  const secret = await sha256Base64(`${password}${salt}`);
  return sha256Base64(`${secret}${challenge}`);
}

async function sha256Base64(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return bytesToBase64(new Uint8Array(digest));
}

export function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
