/**
 * i18n Framework — CapitalForge
 *
 * Locale detection, translation function t(), locale switching, RTL support.
 * Default locale: en-US. Supported: en-US, es-MX, fr-CA.
 */

'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode, createElement } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SupportedLocale = 'en-US' | 'es-MX' | 'fr-CA';

export interface LocaleConfig {
  locale: SupportedLocale;
  label: string;
  dir: 'ltr' | 'rtl';
  dateFormat: string;
  numberFormat: Intl.NumberFormatOptions;
  currencyCode: string;
}

export type TranslationKey = string; // dot-notation: "nav.dashboard", "form.required"
export type TranslationValue = string | ((...args: string[]) => string);
export type TranslationRecord = Record<string, TranslationValue>;

export interface I18nContextValue {
  locale: SupportedLocale;
  dir: 'ltr' | 'rtl';
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatDate: (date: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
  formatCurrency: (amount: number, currency?: string) => string;
}

// ─── Locale Configurations ───────────────────────────────────────────────────

export const LOCALE_CONFIGS: Record<SupportedLocale, LocaleConfig> = {
  'en-US': {
    locale:       'en-US',
    label:        'English (US)',
    dir:          'ltr',
    dateFormat:   'MM/DD/YYYY',
    numberFormat: { useGrouping: true },
    currencyCode: 'USD',
  },
  'es-MX': {
    locale:       'es-MX',
    label:        'Español (México)',
    dir:          'ltr',
    dateFormat:   'DD/MM/YYYY',
    numberFormat: { useGrouping: true },
    currencyCode: 'MXN',
  },
  'fr-CA': {
    locale:       'fr-CA',
    label:        'Français (Canada)',
    dir:          'ltr',
    dateFormat:   'DD/MM/YYYY',
    numberFormat: { useGrouping: true },
    currencyCode: 'CAD',
  },
};

export const DEFAULT_LOCALE: SupportedLocale = 'en-US';

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en-US', 'es-MX', 'fr-CA'];

// ─── RTL Locales ─────────────────────────────────────────────────────────────

const RTL_LOCALES: SupportedLocale[] = [];
// Future: add 'ar-SA', 'he-IL', 'fa-IR' here when Arabic/Hebrew/Farsi are supported

export function isRTL(locale: SupportedLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

// ─── Locale Detection ────────────────────────────────────────────────────────

/**
 * Detects the user's preferred locale from multiple sources in priority order:
 * 1. Persisted preference (localStorage)
 * 2. Browser navigator.language
 * 3. Default locale (en-US)
 */
export function detectLocale(): SupportedLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  // 1. Persisted user preference
  try {
    const stored = localStorage.getItem('cf-locale') as SupportedLocale | null;
    if (stored && SUPPORTED_LOCALES.includes(stored)) return stored;
  } catch {
    // localStorage unavailable (private mode, etc.)
  }

  // 2. Browser language preference
  const browserLangs = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];

  for (const lang of browserLangs) {
    // Exact match first (e.g. "es-MX")
    if (SUPPORTED_LOCALES.includes(lang as SupportedLocale)) {
      return lang as SupportedLocale;
    }
    // Language-only match (e.g. "es" matches "es-MX")
    const langCode = lang.split('-')[0];
    const match = SUPPORTED_LOCALES.find((l) => l.startsWith(langCode + '-'));
    if (match) return match;
  }

  return DEFAULT_LOCALE;
}

// ─── Translation Loader ───────────────────────────────────────────────────────

type TranslationsModule = { default: TranslationRecord };

const translationCache: Partial<Record<SupportedLocale, TranslationRecord>> = {};

export async function loadTranslations(locale: SupportedLocale): Promise<TranslationRecord> {
  if (translationCache[locale]) return translationCache[locale]!;

  let mod: TranslationsModule;
  switch (locale) {
    case 'es-MX':
      mod = await import('./es-MX');
      break;
    case 'fr-CA':
      mod = await import('./fr-CA');
      break;
    default:
      mod = await import('./en-US');
  }

  translationCache[locale] = mod.default;
  return mod.default;
}

// ─── Translation Function ─────────────────────────────────────────────────────

/**
 * Resolves a dot-notation key from a flat or nested translation record.
 * Supports variable interpolation: t("form.errorRequired", { field: "Email" })
 * → "Email is required"
 */
export function createTranslator(translations: TranslationRecord) {
  return function t(key: string, vars?: Record<string, string | number>): string {
    const raw = translations[key];

    if (raw === undefined) {
      // Fallback: humanize the last segment of the key
      const fallback = key.split('.').pop() ?? key;
      return fallback.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
    }

    let result = typeof raw === 'function' ? raw() : raw;

    // Variable interpolation: {{varName}}
    if (vars) {
      result = result.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        vars[name] !== undefined ? String(vars[name]) : `{{${name}}}`
      );
    }

    return result;
  };
}

// ─── Formatters ──────────────────────────────────────────────────────────────

export function createFormatters(locale: SupportedLocale) {
  const config = LOCALE_CONFIGS[locale];

  return {
    formatDate(date: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
      const d = date instanceof Date ? date : new Date(date);
      return new Intl.DateTimeFormat(locale, opts ?? {
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(d);
    },

    formatNumber(n: number, opts?: Intl.NumberFormatOptions): string {
      return new Intl.NumberFormat(locale, { ...config.numberFormat, ...opts }).format(n);
    },

    formatCurrency(amount: number, currency: string = config.currencyCode): string {
      return new Intl.NumberFormat(locale, {
        style: 'currency', currency, minimumFractionDigits: 2,
      }).format(amount);
    },
  };
}

// ─── React Context ────────────────────────────────────────────────────────────


const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}

// ─── I18nProvider ─────────────────────────────────────────────────────────────

interface I18nProviderProps {
  children: ReactNode;
  /** Override the initial locale (e.g. from a server-detected cookie) */
  initialLocale?: SupportedLocale;
  /** Pre-loaded translations to avoid a loading flash on first render */
  initialTranslations?: TranslationRecord;
}

export function I18nProvider({
  children,
  initialLocale,
  initialTranslations,
}: I18nProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>(
    initialLocale ?? (typeof window !== 'undefined' ? detectLocale() : DEFAULT_LOCALE)
  );

  const [translations, setTranslations] = useState<TranslationRecord>(
    initialTranslations ?? {}
  );

  // Load translations whenever locale changes
  useEffect(() => {
    if (initialTranslations && locale === (initialLocale ?? DEFAULT_LOCALE)) return;
    loadTranslations(locale).then(setTranslations);
  }, [locale]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update <html dir> and <html lang> on locale change
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = isRTL(locale) ? 'rtl' : 'ltr';
    }
  }, [locale]);

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem('cf-locale', next);
    } catch { /* ignore */ }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      createTranslator(translations)(key, vars),
    [translations]
  );

  const { formatDate, formatNumber, formatCurrency } = createFormatters(locale);

  const value: I18nContextValue = {
    locale,
    dir: isRTL(locale) ? 'rtl' : 'ltr',
    setLocale,
    t,
    formatDate,
    formatNumber,
    formatCurrency,
  };

  return createElement(I18nContext.Provider, { value }, children);
}

// ─── Locale Switcher Hook ─────────────────────────────────────────────────────

/** Returns the full list of supported locales with their display labels */
export function useLocaleSwitcher() {
  const { locale, setLocale } = useI18n();
  return {
    current:    locale,
    options:    SUPPORTED_LOCALES.map((l) => ({ value: l, label: LOCALE_CONFIGS[l].label })),
    setLocale,
  };
}

// ─── Static t() for server components / non-React code ───────────────────────

/**
 * Synchronous translation helper for contexts where hooks are unavailable.
 * Falls back to en-US from cache if the requested locale isn't loaded yet.
 */
export function staticT(key: string, locale: SupportedLocale = DEFAULT_LOCALE, vars?: Record<string, string | number>): string {
  const translations = translationCache[locale] ?? translationCache[DEFAULT_LOCALE] ?? {};
  return createTranslator(translations)(key, vars);
}
