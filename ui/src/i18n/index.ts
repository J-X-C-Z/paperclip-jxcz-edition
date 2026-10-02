import i18n, { type InitOptions, type TOptions } from "i18next";
import { useCallback } from "react";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import { DEFAULT_LOCALE, i18nextResources, supportedLocales } from "./locales";

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: readPreferredLocale(),
  fallbackLng: "en",
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

function readPreferredLocale() {
  try {
    const saved = window.localStorage.getItem("paperclip.locale");
    return saved && supportedLocales.includes(saved) ? saved : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});

i18n.on("languageChanged", (locale) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  try {
    window.localStorage.setItem("paperclip.locale", locale);
  } catch {
    // The selected locale still applies for this session when storage is unavailable.
  }
});

if (typeof document !== "undefined") {
  document.documentElement.lang = i18n.language;
}

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

const uiCatalogModules = import.meta.glob<Record<string, string>>("./catalog/*.json", {
  eager: true,
  import: "default",
});
const simplifiedChineseUiCatalog = Object.assign(
  {},
  ...Object.entries(uiCatalogModules)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, messages]) => messages),
);

export function uiText(source: string, values?: Record<string, string | number | null | undefined>) {
  const text = i18n.language.toLowerCase().startsWith("zh")
    ? simplifiedChineseUiCatalog[source] ?? source
    : source;
  if (!values) return text;
  return text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder: string, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? "") : placeholder
  ));
}

/** Translate a static English interface string while retaining English as the fallback. */
export function useUiTranslator() {
  const { i18n: activeI18n } = useReactI18nextTranslation();
  return useCallback((source: string) => uiText(source), [activeI18n.language]);
}

export const useTranslation = useReactI18nextTranslation;
export { i18n };
