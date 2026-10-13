import test from "node:test";
import assert from "node:assert/strict";

import {
  collectRecordDeaths,
  escapeHtml,
  instanceKey,
  isCharacterDeath,
  isOnOrAfterStartDate,
  lineDate,
  msBetween,
  normalize,
  normalizeCodeName,
  parseTime,
  splitDuration
} from "../src/core/utils.js";

test("normalize lowercases, strips leading 'the' and collapses whitespace", () => {
  assert.equal(normalize("The Alpine Ridge"), "alpine ridge");
  assert.equal(normalize("  Steaming   Springs "), "steaming springs");
  assert.equal(normalize(""), "");
});

test("normalizeCodeName drops Map prefix and punctuation", () => {
  assert.equal(normalizeCodeName("Map_Alpine_Ridge"), "alpineridge");
  assert.equal(normalizeCodeName("MapTheBloodwood"), "thebloodwood");
});

test("escapeHtml escapes markup characters", () => {
  assert.equal(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#039;");
});

test("splitDuration splits milliseconds into h/m/s", () => {
  assert.deepEqual(splitDuration(0), { hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(splitDuration(65000), { hours: 0, minutes: 1, seconds: 5 });
  assert.deepEqual(splitDuration(3661000), { hours: 1, minutes: 1, seconds: 1 });
});

test("msBetween parses space separated timestamps", () => {
  assert.equal(msBetween("2024-01-01 10:00:00", "2024-01-01 10:00:05"), 5000);
  assert.equal(msBetween("garbage", "2024-01-01 10:00:05"), 0);
});

test("parseTime and lineDate", () => {
  assert.equal(parseTime("2024/01/02 03:04:05"), "2024-01-02 03:04:05");
  assert.equal(lineDate("2024/01/02 something"), "2024-01-02");
  assert.equal(lineDate("no date"), "");
});

test("isOnOrAfterStartDate compares date prefix", () => {
  assert.equal(isOnOrAfterStartDate("2024-01-02 10:00", "2024-01-01"), true);
  assert.equal(isOnOrAfterStartDate("2024-01-02 10:00", "2024-01-03"), false);
  assert.equal(isOnOrAfterStartDate("2024-01-02 10:00", ""), true);
});

test("instanceKey joins code and seed", () => {
  assert.equal(instanceKey("MapX", "123"), "MapX:123");
  assert.equal(instanceKey("", "123"), "");
});

test("isCharacterDeath matches configured name case-insensitively", () => {
  assert.equal(isCharacterDeath("Hero", ""), true);
  assert.equal(isCharacterDeath("Hero", "hero"), true);
  assert.equal(isCharacterDeath("Other", "hero"), false);
});

test("collectRecordDeaths deduplicates across records", () => {
  assert.deepEqual(collectRecordDeaths([{ deaths: ["a", "b"] }, { deaths: ["b", "c"] }, {}]), ["a", "b", "c"]);
});
