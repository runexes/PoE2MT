import { state } from "../core/state.js";
import { classify, humanizeCode, isHiddenRecord, isTimedRun, locationKey } from "../data/classification.js";
import { instanceKey, isCharacterDeath, isOnOrAfterStartDate, msBetween, parseTime } from "../core/utils.js";

export function parseLines(lines, options) {
  if (options.reset) {
    state.records = [];
    state.pending = null;
    state.deaths = [];
  }

  for (const line of lines) {
    if (!line) continue;

    const generated = line.match(
      /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}).*Generating level (\d+) area "([^"]+)" with seed (\d+)/
    );
    if (generated) {
      if (!isOnOrAfterStartDate(parseTime(generated[1]), state.startDate)) {
        state.pending = null;
        continue;
      }
      finalizePending();
      state.pending = {
        id: `${generated[3]}:${generated[4]}:${generated[1]}`,
        instanceKey: instanceKey(generated[3], generated[4]),
        time: parseTime(generated[1]),
        level: Number(generated[2]),
        code: generated[3],
        seed: generated[4],
        name: humanizeCode(generated[3])
      };
      continue;
    }

    const death = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}).*\[INFO Client \d+]\s+: (.+) has been slain\.$/);
    if (death) {
      if (!isOnOrAfterStartDate(parseTime(death[1]), state.startDate)) continue;
      if (!isCharacterDeath(death[2], state.characterName)) continue;
      recordGlobalDeath(parseTime(death[1]));
      recordDeath(parseTime(death[1]));
      continue;
    }

    const scene = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}).*\[SCENE\] Set Source \[(.+)]/);
    if (scene) {
      if (!isOnOrAfterStartDate(parseTime(scene[1]), state.startDate)) continue;
      const name = scene[2].trim();
      if (!name || name === "(null)" || name === "(unknown)") continue;
      if (state.pending) {
        state.pending.name = name;
      } else if (name === "Atlas") {
        pushRecord({
          id: `scene:${scene[1]}:${name}`,
          time: parseTime(scene[1]),
          name,
          level: "",
          code: "",
          seed: ""
        });
      }
      continue;
    }

    const loading = line.match(
      /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}).*\[LOADING SCREEN\] \((.+)\) Duration = ([\d.]+)/
    );
    if (loading && state.pending) {
      if (!isOnOrAfterStartDate(parseTime(loading[1]), state.startDate)) continue;
      state.pending.name = loading[2].trim();
      state.pending.loadingDuration = Number(loading[3]);
      finalizePending();
    }
  }

  return { records: state.records, pending: state.pending };
}

function finalizePending() {
  if (!state.pending) return;
  pushRecord(state.pending);
  state.pending = null;
}

function pushRecord(raw) {
  const meta = classify(raw.name, raw.code);
  const record = { ...raw, ...meta };
  record.deaths = Array.isArray(record.deaths) ? record.deaths : [];
  record.instanceKey = record.instanceKey || instanceKey(record.code, record.seed);
  const last = state.records[state.records.length - 1];
  if (last && last.instanceKey && last.instanceKey === record.instanceKey) {
    mergeDeaths(last, record.deaths);
    return;
  }
  closePreviousRun(record);
  if (isHiddenRecord(record)) return;
  state.records.push(record);
}

function recordDeath(time) {
  const record = state.pending || lastTimedRecord();
  if (!record) return;
  record.deaths = Array.isArray(record.deaths) ? record.deaths : [];
  if (record.deaths.includes(time)) return;
  record.deaths.push(time);
}

function recordGlobalDeath(time) {
  if (state.deaths.includes(time)) return;
  state.deaths.push(time);
}

function mergeDeaths(record, deaths) {
  if (!Array.isArray(deaths) || !deaths.length) return;
  record.deaths = Array.isArray(record.deaths) ? record.deaths : [];
  for (const death of deaths) {
    if (!record.deaths.includes(death)) record.deaths.push(death);
  }
}

function lastTimedRecord() {
  for (let index = state.records.length - 1; index >= 0; index -= 1) {
    if (isTimedRun(state.records[index])) return state.records[index];
  }
  return null;
}

function closePreviousRun(nextRecord) {
  const previous = state.records[state.records.length - 1];
  if (!previous || !isTimedRun(previous)) return;
  if (previous.endTime) return;
  const durationMs = msBetween(previous.time, nextRecord.time);
  if (durationMs > 0) {
    previous.endTime = nextRecord.time;
    previous.durationMs = durationMs;
  }
}

export function recalculateDurations() {
  for (const record of state.records) {
    delete record.durationMs;
  }

  for (let index = 0; index < state.records.length - 1; index += 1) {
    const record = state.records[index];
    if (!isTimedRun(record)) continue;
    const durationMs = msBetween(record.time, record.endTime || state.records[index + 1].time);
    if (durationMs > 0) record.durationMs = durationMs;
  }

  const last = state.records[state.records.length - 1];
  if (last?.endTime && isTimedRun(last)) {
    const durationMs = msBetween(last.time, last.endTime);
    if (durationMs > 0) last.durationMs = durationMs;
  }
}

export function recalculateRunCounts() {
  const counts = new Map();
  for (const record of state.records) {
    if (isHiddenRecord(record)) {
      delete record.runCount;
      continue;
    }
    const key = locationKey(record);
    const nextCount = (counts.get(key) || 0) + 1;
    record.runCount = nextCount;
    counts.set(key, nextCount);
  }
}
