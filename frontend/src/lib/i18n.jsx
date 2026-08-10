import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { setFormatLocale } from "@/lib/format";
import { DICTIONARY } from "@/lib/translations";

const STORAGE_KEY = "erydez.locale";
const LocaleContext = createContext(null);

const readInitial = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "de" || stored === "en") return stored;
  } catch (_) {}
  return "de";
};

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(readInitial);

  useEffect(() => {
    setFormatLocale(locale);
    try { localStorage.setItem(STORAGE_KEY, locale); } catch (_) {}
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale: setLocaleState,
    t: (key) => {
      if (locale === "en") return key;
      const val = DICTIONARY[key];
      return val || key;
    },
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useT() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useT must be used inside LocaleProvider");
  return ctx;
}

// Convenience for non-hook access (e.g., inside module-scope arrays used in JSX)
// Consumers should still call useT() in components; this is a passive lookup.
export function tStatic(key, locale) {
  if (locale === "en") return key;
  return DICTIONARY[key] || key;
}
