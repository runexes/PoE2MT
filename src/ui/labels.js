import { t } from "../core/i18n.js";

export function typeLabel(type) {
  const key = `type.${type}`;
  const label = t(key);
  return label === key ? t("type.area") : label;
}
