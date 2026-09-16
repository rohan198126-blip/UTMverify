import { DEFAULT_LOCALE, SUPPORTED_LOCALES, ui, type SupportedLocale, type TranslationKey } from './ui';

/**
 * Returns a type-safe translator function for a given locale.
 * Falls back to DEFAULT_LOCALE if a key is missing.
 */
export function useTranslations(locale: SupportedLocale) {
  return function t(key: TranslationKey): string {
    const localeDict = ui[locale] as Record<string, string>;
    const defaultDict = ui[DEFAULT_LOCALE] as Record<string, string>;
    return localeDict[key] ?? defaultDict[key] ?? key;
  };
}

/**
 * Extracts the supported locale from a URL object or pathname string.
 * Defaults to 'en' if not present or unsupported.
 */
export function getLocaleFromUrl(url: URL | string): SupportedLocale {
  const pathname = typeof url === 'string' ? url : url.pathname;
  const segments = pathname.split('/').filter(Boolean);
  const candidate = segments[0] as SupportedLocale;

  if (candidate && SUPPORTED_LOCALES.includes(candidate)) {
    return candidate;
  }

  return DEFAULT_LOCALE;
}

/**
 * Strips any leading locale prefix from a pathname.
 * e.g. "/es/utm-checker" -> "/utm-checker"
 * e.g. "/en/" -> "/"
 * e.g. "/" -> "/"
 */
export function stripLocaleFromPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && SUPPORTED_LOCALES.includes(segments[0] as SupportedLocale)) {
    segments.shift();
  }
  const clean = '/' + segments.join('/');
  return clean === '' ? '/' : clean;
}

/**
 * Converts a current path to its equivalent localized path for the target locale.
 * e.g. ("/en/utm-checker", "es") -> "/es/utm-checker"
 * e.g. ("/", "de") -> "/de/"
 * e.g. ("/es/", "en") -> "/en/"
 */
export function getLocalizedPath(currentPath: string, targetLocale: SupportedLocale): string {
  const stripped = stripLocaleFromPath(currentPath);
  if (stripped === '/') {
    return `/${targetLocale}/`;
  }
  return `/${targetLocale}${stripped}`;
}

export interface HreflangItem {
  lang: string;
  href: string;
}

/**
 * Generates the complete set of hreflang tags for a given path across all 8 supported locales + x-default.
 */
export function getHreflangList(pathname: string, siteUrl: string): HreflangItem[] {
  const stripped = stripLocaleFromPath(pathname);
  const base = siteUrl.replace(/\/$/, '');

  const items: HreflangItem[] = SUPPORTED_LOCALES.map((locale) => {
    const localizedPath = stripped === '/' ? `/${locale}/` : `/${locale}${stripped}`;
    return {
      lang: locale,
      href: `${base}${localizedPath}`,
    };
  });

  // x-default points to the English equivalent
  const defaultPath = stripped === '/' ? '/en/' : `/en${stripped}`;
  items.push({
    lang: 'x-default',
    href: `${base}${defaultPath}`,
  });

  return items;
}
