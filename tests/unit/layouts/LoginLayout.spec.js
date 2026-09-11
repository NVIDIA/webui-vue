import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import LoginLayout from '@/layouts/LoginLayout.vue';

const mountLayout = (options = {}) =>
  mount(LoginLayout, {
    global: {
      stubs: {
        LoginCompanyLogo: true,
        BuiltOnOpenbmcLogo: true,
        'router-view': { template: '<form class="login-form"></form>' },
      },
    },
    ...options,
  });

describe('LoginLayout.vue', () => {
  afterEach(() => {
    document.documentElement.classList.remove('login-page');
  });

  it('should exist', () => {
    const wrapper = mountLayout();
    expect(wrapper.exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders a viewport-filling login shell', () => {
    const wrapper = mountLayout();
    expect(wrapper.find('main.login-layout').exists()).toBe(true);
    expect(wrapper.find('.login-container').exists()).toBe(true);
    expect(wrapper.find('.login-main').exists()).toBe(true);
    expect(wrapper.find('.login-panel').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps a 90px login logo width for non-NVIDIA platform builds', () => {
    const wrapper = mountLayout();
    expect(
      wrapper.findComponent({ name: 'LoginCompanyLogo' }).attributes('width'),
    ).toBe('90px');
    wrapper.unmount();
  });

  it('locks document overflow while mounted and restores it on unmount', () => {
    const wrapper = mountLayout();
    expect(document.documentElement.classList.contains('login-page')).toBe(
      true,
    );
    wrapper.unmount();
    expect(document.documentElement.classList.contains('login-page')).toBe(
      false,
    );
  });
});
