import { DEFAULT_LANGUAGE } from "./constants.js";
import { state } from "./state.js";
import { els } from "./dom.js";
import en from "../../i18n/en.json";
import ru from "../../i18n/ru.json";

const CATALOGS = { en, ru };
const SUPPORTED_LANGUAGES = ["en", "ru"];
const LANGUAGE_STORAGE_KEY = "poe2-map-tracker-language";

export function t(key, params) {
  const template = state.messages?.[key];
  if (template == null) return key;
  if (!params) return template;
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
  });
}

export function updateLangToggle() {
  if (!els.langToggle) return;
  els.langToggle.textContent = state.language === "ru" ? "RU" : "EN";
}

export function saveLocalLanguage(language) {
  if (!SUPPORTED_LANGUAGES.includes(language)) return;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // storage may be unavailable (private mode); language falls back to detection
  }
}

function readLocalLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

function guessLanguage() {
  const stored = readLocalLanguage();
  if (stored) return stored;
  const locale = typeof navigator !== "undefined" ? navigator.language || "" : "";
  return locale.toLowerCase().startsWith("ru") ? "ru" : DEFAULT_LANGUAGE;
}

function loadLocalMessages(language) {
  const fallback = CATALOGS[DEFAULT_LANGUAGE] || {};
  if (!CATALOGS[language]) return fallback;
  if (language === DEFAULT_LANGUAGE) return fallback;
  return { ...fallback, ...CATALOGS[language] };
}

export async function fetchMessages(language) {
  if (window.statsServer?.i18nGet) {
    try {
      const info = await window.statsServer.i18nGet();
      if (info?.messages) {
        return {
          language: info.language || language || DEFAULT_LANGUAGE,
          messages: info.messages
        };
      }
    } catch {
      // fall through to the bundled catalogs
    }
  }
  const selected = language || guessLanguage();
  return { language: selected, messages: loadLocalMessages(selected) };
}

export async function initI18n() {
  const info = await fetchMessages(null);
  state.language = info.language;
  state.messages = info.messages;
}
