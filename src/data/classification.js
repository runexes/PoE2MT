import { POE2_LOCATION_DATA } from "./locations.data.js";
import { normalize, normalizeCodeName, instanceKey } from "../core/utils.js";
import { t } from "../core/i18n.js";

export const HIDDEN_TYPES = new Set(["hideout", "town"]);

export const wikiRows = POE2_LOCATION_DATA.maps.map(([name, type, biome, boss]) => ({
  name,
  type,
  biome,
  boss,
  key: normalize(name),
  codeKey: normalizeCodeName(name)
}));

const wikiByName = new Map(wikiRows.map((row) => [row.key, row]));
const wikiByCodeName = new Map(wikiRows.map((row) => [row.codeKey, row]));

export function locationKey(record) {
  return normalize(record.name || record.code);
}

export function isExcludedLocation(record) {
  return Number(record.level) < 65 || locationKey(record) === "vaal ruins";
}

export function isHiddenRecord(record) {
  return HIDDEN_TYPES.has(record.type) || isExcludedLocation(record);
}

export function isTimedRun(record) {
  return (
    record.type === "map" ||
    record.type === "anomaly" ||
    record.type === "citadel" ||
    record.type === "expedition" ||
    record.type === "boss" ||
    record.type === "special"
  );
}

export function deathCount(record) {
  return Array.isArray(record.deaths) ? record.deaths.length : 0;
}

export function classify(name, code) {
  const found = wikiByName.get(normalize(name));
  if (found) {
    return { type: found.type, biome: found.biome, boss: found.boss, known: true };
  }

  const codeMatch = matchByCode(code);
  if (codeMatch) {
    return { type: codeMatch.type, biome: codeMatch.biome, boss: codeMatch.boss, known: true };
  }

  const hint = matchHint(name, code);
  if (hint) return { type: hint[1], biome: "", boss: "", known: false };
  if (name === "Atlas") return { type: "town", biome: "", boss: "", known: true };
  if (/town|encampment|caravan|ziggurat/i.test(name)) {
    return { type: "town", biome: "", boss: "", known: false };
  }
  return { type: "map", biome: "", boss: "", known: false };
}

export function refreshClassification(record) {
  const meta = classify(record.name, record.code);
  return {
    ...record,
    ...meta,
    deaths: Array.isArray(record.deaths) ? record.deaths : [],
    instanceKey: record.instanceKey || instanceKey(record.code, record.seed)
  };
}

export function humanizeCode(code) {
  return (
    String(code || "")
      .replace(/^Map/, "")
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim() || t("area.unknown")
  );
}

function matchByCode(code) {
  if (!code) return null;
  const candidates = codeCandidates(code);
  for (const candidate of candidates) {
    const found = wikiByCodeName.get(candidate);
    if (found) return found;
  }
  return (
    wikiRows.find((row) =>
      candidates.some((candidate) => candidate.includes(row.codeKey) || row.codeKey.includes(candidate))
    ) || null
  );
}

function codeCandidates(code) {
  const raw = String(code || "");
  const parts = raw.split(/[_/\\-]+/).filter(Boolean);
  const candidates = new Set([normalizeCodeName(raw)]);
  for (const part of parts) {
    candidates.add(normalizeCodeName(part));
  }
  candidates.add(normalizeCodeName(raw.replace(/Act\d+/gi, "")));
  candidates.add(normalizeCodeName(raw.replace(/Map/gi, "")));
  return Array.from(candidates).filter(Boolean);
}

function matchHint(name, code) {
  const raw = `${code || ""} ${name || ""}`.toLowerCase();
  return POE2_LOCATION_DATA.internalHints.find(([needle]) => raw.includes(String(needle).toLowerCase()));
}
