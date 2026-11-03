import { createInstance } from 'i18next';
import type { LauncherSettings, NixelPluginManifest } from './contracts';
import en from './locales/en-US';
import zh from './locales/zh-CN';

export type MessageKey = keyof typeof en;
const translations: Record<'zh-CN' | 'en-US', Record<MessageKey, string>> = {
  'zh-CN': zh,
  'en-US': en,
};
let systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
export const i18n = createInstance();
export function resolveLocale(
  locale: LauncherSettings['locale'],
  system = systemLocale,
): 'zh-CN' | 'en-US' {
  return locale === 'system' ? (system.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US') : locale;
}
void i18n.init({
  resources: {
    'en-US': { translation: translations['en-US'] },
    'zh-CN': { translation: translations['zh-CN'] },
  },
  lng: resolveLocale('system'),
  fallbackLng: 'en-US',
  supportedLngs: ['en-US', 'zh-CN'],
  keySeparator: false,
  initAsync: false,
  interpolation: { escapeValue: false },
});
export function setLocale(locale: LauncherSettings['locale'], system?: string) {
  if (system) systemLocale = system;
  const language = resolveLocale(locale, system);
  if (i18n.language !== language) void i18n.changeLanguage(language);
}
export function tr(key: MessageKey, values?: Record<string, unknown>): string {
  return i18n.t(key, values ?? {});
}
export function label(id: string): string {
  const key = `labels.${id}`;
  return Object.hasOwn(en, key) ? tr(key as MessageKey) : id;
}
export function withTranslations(
  manifest: NixelPluginManifest,
  keys: Partial<Record<'name' | 'description' | 'category', MessageKey>>,
): NixelPluginManifest {
  return {
    ...manifest,
    locales: Object.fromEntries(
      ['zh-CN', 'en-US'].map((lng) => [
        lng,
        Object.fromEntries(Object.entries(keys).map(([field, key]) => [field, tr(key, { lng })])),
      ]),
    ),
  };
}
export function localizeManifest(manifest: NixelPluginManifest): NixelPluginManifest {
  return { ...manifest, ...manifest.locales?.[i18n.language] };
}
export function translatedName(key: MessageKey) {
  return {
    name: tr(key),
    locales: Object.fromEntries(['zh-CN', 'en-US'].map((lng) => [lng, { name: tr(key, { lng }) }])),
  };
}
