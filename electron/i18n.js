const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const FALLBACK_LANGUAGE = "en";
const SUPPORTED_LANGUAGES = ["en", "ru"];

const localeCache = new Map();

function localeFile(language) {
  return path.join(__dirname, "..", "i18n", `${language}.json`);
}

function readLocale(language) {
  if (localeCache.has(language)) return localeCache.get(language);
  let dict;
  try {
    dict = JSON.parse(fs.readFileSync(localeFile(language), "utf8"));
  } catch {
    dict = {};
  }
  localeCache.set(language, dict);
  return dict;
}

function loadMessages(language) {
  const fallback = readLocale(FALLBACK_LANGUAGE);
  if (language === FALLBACK_LANGUAGE) return fallback;
  return { ...fallback, ...readLocale(language) };
}

function translate(language, key, params) {
  const messages = loadMessages(language);
  const template = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : key;
  if (!params) return template;
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

function guessLanguage() {
  try {
    const locale = String(app.getLocale() || "").toLowerCase();
    if (locale.startsWith("ru")) return "ru";
  } catch {
    return FALLBACK_LANGUAGE;
  }
  return FALLBACK_LANGUAGE;
}

module.exports = {
  FALLBACK_LANGUAGE,
  SUPPORTED_LANGUAGES,
  loadMessages,
  translate,
  guessLanguage
};
