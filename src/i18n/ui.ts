import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import de from './locales/de';
import pt from './locales/pt';
import it from './locales/it';
import ja from './locales/ja';
import ko from './locales/ko';

export const DEFAULT_LOCALE = 'en';

export const SUPPORTED_LOCALES = [
  'en',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'ja',
  'ko',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export interface LocaleInfo {
  code: SupportedLocale;
  name: string;
  englishName: string;
}

export const LOCALES: Record<SupportedLocale, LocaleInfo> = {
  en: { code: 'en', name: 'English', englishName: 'English' },
  es: { code: 'es', name: 'Español', englishName: 'Spanish' },
  fr: { code: 'fr', name: 'Français', englishName: 'French' },
  de: { code: 'de', name: 'Deutsch', englishName: 'German' },
  pt: { code: 'pt', name: 'Português', englishName: 'Portuguese' },
  it: { code: 'it', name: 'Italiano', englishName: 'Italian' },
  ja: { code: 'ja', name: '日本語', englishName: 'Japanese' },
  ko: { code: 'ko', name: '한국어', englishName: 'Korean' },
};

export const ui = {
  en,
  es,
  fr,
  de,
  pt,
  it,
  ja,
  ko,
} as const;

export type TranslationKey = keyof typeof en;
