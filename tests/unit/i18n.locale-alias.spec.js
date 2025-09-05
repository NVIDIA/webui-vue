// How to run this test in isolation:
//   npm run test:unit -- i18n.locale-alias.spec.js

describe('i18n locale aliases', () => {
  test('resolves pageLogin.language for en (alias to en-US)', async () => {
    const { createI18nInstance } = await import('@/i18n');
    const base = require('@/locales/en-US.json');
    const loadBase = () => ({ 'en-US': base.default || base });
    const i18n = createI18nInstance(undefined, 'en', undefined, loadBase);
    expect(i18n.global.t('pageLogin.language')).toBe('Language');
  });

  test('resolves pageLogin.language for en-US', async () => {
    const { createI18nInstance } = await import('@/i18n');
    const base = require('@/locales/en-US.json');
    const loadBase = () => ({ 'en-US': base.default || base });
    const i18n = createI18nInstance(undefined, 'en-US', undefined, loadBase);
    expect(i18n.global.t('pageLogin.language')).toBe('Language');
  });
});


