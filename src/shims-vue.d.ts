/* eslint-disable */
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// SVG imports as Vue components (Vite ?component query)
declare module '*.svg?component' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// SVG imports as URL strings
declare module '*.svg' {
  const src: string;
  export default src;
}

// Carbon icons (no official type definitions)
declare module '@carbon/icons-vue/es/*' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// i18n.js module (JavaScript file without types)
declare module '@/i18n' {
  import type { I18n, VueI18n } from 'vue-i18n';
  export function loadBaseLocaleMessages(): Record<string, unknown>;
  export function loadEnvLocaleMessages(envName: string): Record<string, unknown>;
  const i18n: I18n<Record<string, unknown>, unknown, unknown, string, false> & {
    global: VueI18n<Record<string, unknown>, unknown, unknown, string, false>;
  };
  export default i18n;
}
