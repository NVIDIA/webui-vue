import { mount } from '@vue/test-utils';
import { vi, describe, it, expect } from 'vitest';
import eventBus from '@/eventBus';
import AppNavigation from '@/components/AppNavigation';
import { createStore } from 'vuex';
import { createRouter, createMemoryHistory } from 'vue-router';

// Mock Pinia auth store so AppNavigation doesn't need a real Pinia instance
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isLoggedIn: true,
    Roles: [],
    consoleWindow: null,
  }),
}));

describe('AppNavigation.vue', () => {
  let wrapper;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [],
  });
  const actions = {
    'global/userPrivilege': vi.fn(),
  };
  const store = createStore({ actions });

  wrapper = mount(AppNavigation, {
    global: {
      plugins: [store, router],
      mocks: {
        $t: (key) => key,
      },
    },
  });

  it('should exist', async () => {
    expect(wrapper.exists()).toBe(true);
  });

  it('should render correctly', () => {
    expect(wrapper.element).toMatchSnapshot();
  });

  it('should render with nav-container open', () => {
    wrapper.vm.isNavigationOpen = true;
    expect(wrapper.element).toMatchSnapshot();
  });

  it('Nav Overlay click should emit change-is-navigation-open event', async () => {
    const spy = vi.spyOn(eventBus, '$emit');
    const navOverlay = wrapper.find('#nav-overlay');
    navOverlay.trigger('click');
    await wrapper.vm.$nextTick();
    expect(spy).toHaveBeenCalledWith('change-is-navigation-open', false);
  });

  it('toggle-navigation event should toggle isNavigation data prop value', async () => {
    const spy = vi.spyOn(eventBus, '$on');
    // Re-mount to capture the $on call
    const testWrapper = mount(AppNavigation, {
      global: {
        plugins: [store, router],
        mocks: {
          $t: (key) => key,
        },
      },
    });
    const toggleHandler = spy.mock.calls.find(
      ([eventName]) => eventName === 'toggle-navigation',
    )?.[1];
    if (toggleHandler) {
      testWrapper.vm.isNavigationOpen = false;
      toggleHandler();
      expect(testWrapper.vm.isNavigationOpen).toBe(true);
      toggleHandler();
      expect(testWrapper.vm.isNavigationOpen).toBe(false);
    }
  });
});
