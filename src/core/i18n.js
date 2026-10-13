import { DEFAULT_LANGUAGE } from "./constants.js";
import { state } from "./state.js";
import { els } from "./dom.js";

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

export async function fetchMessages(language) {
  if (!window.statsServer?.i18nGet) {
    return { language: language || DEFAULT_LANGUAGE, messages: {} };
  }
  try {
    const info = await window.statsServer.i18nGet();
    return {
      language: info?.language || language || DEFAULT_LANGUAGE,
      messages: info?.messages || {}
    };
  } catch {
    return { language: language || DEFAULT_LANGUAGE, messages: {} };
  }
}

export async function initI18n() {
  const info = await fetchMessages(DEFAULT_LANGUAGE);
  state.language = info.language;
  state.messages = info.messages;
}
