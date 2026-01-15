import { config } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { deepMerge } from '@/utilities/objectUtils';

import enUS from '@/locales/en-US.json';
import ruRU from '@/locales/ru-RU.json';
import zhCN from '@/locales/zh-CN.json';
import kaGE from '@/locales/ka-GE.json';

const messages = {
  'en-US': enUS,
  'ru-RU': ruRU,
  'zh-CN': zhCN,
  'ka-GE': kaGE,
};

const normalizeLocale = (val) => {
  if (!val) return 'en-US';
  const s = String(val);
  if (s === 'en') return 'en-US';
  if (s === 'ru') return 'ru-RU';
  if (s === 'zh') return 'zh-CN';
  if (s === 'ka') return 'ka-GE';
  return s;
};

const mockCreateI18nInstance = (
  envName,
  locale,
  loadEnv = () => ({}),
  loadBase = () => messages,
) => {
  const base = loadBase() || {};
  const env = loadEnv(envName) || {};
  const merged = { ...base };
  Object.keys(env).forEach((loc) => {
    merged[loc] = deepMerge(base[loc] || {}, env[loc]);
  });

  const addAlias = (alias, target) => {
    if (!merged[alias] && merged[target]) merged[alias] = merged[target];
  };
  addAlias('en', 'en-US');
  addAlias('ru', 'ru-RU');
  addAlias('zh', 'zh-CN');
  addAlias('ka', 'ka-GE');

  return createI18n({
    locale: normalizeLocale(locale),
    fallbackLocale: 'en-US',
    silentFallbackWarn: true,
    messages: merged,
    globalInjection: true,
    legacy: false,
  });
};

const mockI18n = mockCreateI18nInstance(undefined, 'en-US');

config.global.mocks = {
  ...(config.global.mocks || {}),
  $t: mockI18n.global.t,
  $route: { meta: {} },
  $eventBus: {
    on: () => {},
    off: () => {},
    emit: () => {},
  },
};

config.global.directives = {
  ...(config.global.directives || {}),
  'b-tooltip': () => {},
};

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: mockI18n,
  createI18nInstance: mockCreateI18nInstance,
}));
