/*
 * i18n initialization and vendor overlays
 *
 * Build behavior and bundling:
 * - Base locales are discovered dynamically from `src/locales/` via require.context.
 *   Webpack resolves and inlines all matched JSON bundles at build time, so a single
 *   compressed deliverable (production bundle) includes the shipped languages.
 * - Vendor overlays are discovered dynamically from `src/env/locales/<env>/` with
 *   a vendor-root fallback (e.g., `nvidia-gb` also loads `nvidia`). Overlays are
 *   merged at runtime on app start; this is deterministic and does not require
 *   network access.
 * - This design works the same whether emitted as multiple chunks or a single
 *   compressed artifact; the merged messages are identical at runtime.
 *
 * Bundle size considerations:
 * - All JSON files matching the require.context patterns are bundled. If you want
 *   to exclude unused vendor variants to minimize size, you can:
 *   1) Use build-time aliases in `vue.config.js` to point to only the active vendor
 *      directories, then require.context those aliases; or
 *   2) Lazy-load per-locale JSON with dynamic import() based on the selected language.
 */
import { createI18n } from 'vue-i18n';
import { deepMerge } from './utilities/objectUtils';

/**
 * Dynamically load all JSON locale files under `src/locales/`.
 * The filename (e.g., en-US.json) becomes the locale key (e.g., en-US).
 *
 * @returns {Record<string, any>} Map of locale code to translation bundle.
 */
export function loadBaseLocaleMessages() {
  const context = require.context(
    './locales',
    true,
    /[A-Za-z0-9-_,\s]+\.json$/i,
  );
  const messages = {};
  context.keys().forEach((key) => {
    const match = key.match(/([A-Za-z0-9-_]+)\.json$/i);
    if (!match) return;
    const locale = match[1];
    const mod = context(key);
    messages[locale] = mod && mod.default ? mod.default : mod;
  });
  return messages;
}

/**
 * Load environment/vendor-specific locale messages from `src/env/locales/<envName>/`.
 *
 * Behavior:
 * - When `envName` is hyphenated (e.g., `nvidia-gb`), this will also load overlays
 *   from the vendor root folder (e.g., `nvidia`) and merge them first, then the
 *   specific env overrides. This allows multiple NVIDIA projects to share a single
 *   `src/env/locales/nvidia/` folder.
 * - All JSON files matched by the require.context will be included in the bundle.
 *
 * @param {string|undefined} envName Active environment name (e.g., 'nvidia-gb').
 * @returns {Record<string, any>} Map of locale code to merged overlay bundles.
 */
export function loadEnvLocaleMessages(envName) {
  if (!envName) return {};
  const envMessages = {};
  const envLocales = require.context(
    './env/locales',
    true,
    /[A-Za-z0-9-_,\s]+\.json$/i,
  );
  const vendorRoot = String(envName).split('-')[0];
  const candidates = vendorRoot && vendorRoot !== envName ? [vendorRoot, envName] : [envName];

  candidates.forEach((candidate) => {
    envLocales.keys().forEach((key) => {
      if (!key.includes(`/${candidate}/`)) return;
      const localeMatch = key.match(/([A-Za-z0-9-_]+)\.json$/i);
      if (!localeMatch) return;
      const locale = localeMatch[1];
      const mod = envLocales(key);
      const bundle = mod && mod.default ? mod.default : mod;
      envMessages[locale] = deepMerge(envMessages[locale] || {}, bundle);
    });
  });

  return envMessages;
}

/**
 * Create a configured vue-i18n instance by merging base messages with optional
 * environment/vendor overlays.
 *
 * @param {string|undefined} envName Environment name for vendor overlays.
 * @param {string|undefined} locale Preferred locale (e.g., from localStorage).
 * @param {(envName: string|undefined) => Record<string, any>} [loadEnv=loadEnvLocaleMessages]
 *        Optional loader override (used by unit tests to stub overlay loading).
 * @returns {import('vue-i18n').I18n} A configured i18n instance.
 */
export function createI18nInstance(envName, locale, loadEnv = loadEnvLocaleMessages, loadBase = loadBaseLocaleMessages) {
  const baseMessages = loadBase();
  const envMessages = loadEnv(envName);
  const finalMessages = { ...baseMessages };
  Object.keys(envMessages).forEach((loc) => {
    finalMessages[loc] = deepMerge(baseMessages[loc] || {}, envMessages[loc]);
  });

  // Add common language aliases to support older stored values like 'en', 'ru', 'zh'
  const addLocaleAlias = (alias, target) => {
    if (!finalMessages[alias] && finalMessages[target]) {
      finalMessages[alias] = finalMessages[target];
    }
  };
  addLocaleAlias('en', 'en-US');
  addLocaleAlias('ru', 'ru-RU');
  addLocaleAlias('zh', 'zh-CN');

  // Normalize incoming locale codes to our known set
  const normalizeLocale = (value) => {
    if (!value) return undefined;
    const lc = String(value);
    if (lc === 'en') return 'en-US';
    if (lc === 'ru') return 'ru-RU';
    if (lc === 'zh') return 'zh-CN';
    return lc;
  };
  const normalizedLocale = normalizeLocale(locale);

  return createI18n({
    locale: normalizedLocale,
    fallbackLocale: 'en-US',
    silentFallbackWarn: true,
    messages: finalMessages,
    globalInjection: false,
    legacy: false,
  });
}

const envName = process.env.VUE_APP_ENV_NAME;
const locale = window.localStorage.getItem('storedLanguage');

export default createI18nInstance(envName, locale);
