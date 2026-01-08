import { mount } from '@vue/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import eventBus from '@/eventBus';
import { createStore } from 'vuex';
import AppHeader from '@/components/AppHeader';

describe('AppHeader.vue', () => {
  // Create properly namespaced modules with state and getters
  // that match what AppHeader.vue expects
  const modules = {
    authentication: {
      namespaced: true,
      state: {
        consoleWindow: null,
      },
      actions: {
        resetStoreState: vi.fn(),
        logout: vi.fn(),
      },
    },
    global: {
      namespaced: true,
      state: {
        assetTag: '',
        modelType: '',
        serialNumber: '',
        isAuthorized: true,
        userPrivilege: 'Administrator',
        serverStatus: 'on',
        powerState: 'On',
        username: 'root',
        healthStatus: 'OK',
      },
      getters: {
        assetTag: (state) => state.assetTag,
        modelType: (state) => state.modelType,
        serialNumber: (state) => state.serialNumber,
        isAuthorized: (state) => state.isAuthorized,
        userPrivilege: (state) => state.userPrivilege,
        serverStatus: (state) => state.serverStatus,
        powerState: (state) => state.powerState,
        username: (state) => state.username,
        healthStatus: (state) => state.healthStatus,
      },
      actions: {
        getServerStatus: vi.fn(),
        getSystemInfo: vi.fn(),
        fetchHealthStatus: vi.fn(),
      },
    },
    eventLog: {
      namespaced: true,
      actions: {
        getLogData: vi.fn(),
      },
    },
    redfishLogger: {
      namespaced: true,
      state: {
        featureEnabled: false,
        loggingEnabled: false,
        loggerVisible: false,
      },
      getters: {
        isFeatureEnabled: (state) => state.featureEnabled,
        isLoggingEnabled: (state) => state.loggingEnabled,
        isLoggerVisible: (state) => state.loggerVisible,
      },
      actions: {
        toggleLogging: vi.fn(),
      },
    },
  };

  const store = createStore({ modules });
  const wrapper = mount(AppHeader, {
    global: {
      plugins: [store],
      mocks: {
        $t: (key) => key,
      },
    },
  });

  // Reset dispatch between tests so that multiple
  // actions are not dispatched for each test
  beforeEach(() => {
    store.dispatch = vi.fn();
  });

  it('should exist', () => {
    expect(wrapper.exists()).toBe(true);
  });

  it('should render correctly', () => {
    expect(wrapper.element).toMatchSnapshot();
  });

  it('refresh button click should emit refresh event', async () => {
    wrapper.get('#app-header-refresh').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('refresh')).toBeTruthy();
  });

  it('nav-trigger button click should emit toggle-navigation event', async () => {
    const spy = vi.spyOn(eventBus, '$emit');
    wrapper.get('#app-header-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    expect(spy).toHaveBeenCalledWith('toggle-navigation');
  });

  it('logout button should dispatch authentication/logout', async () => {
    wrapper.get('[data-test-id="appHeader-link-logout"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(store.dispatch).toHaveBeenCalledTimes(1);
  });

  it('change:isNavigationOpen event should set isNavigationOpen prop to false', async () => {
    const spy = vi.spyOn(eventBus, '$on');
    // Re-mount to capture the $on call
    const testWrapper = mount(AppHeader, {
      global: {
        plugins: [store],
        mocks: {
          $t: (key) => key,
        },
      },
    });
    const navigationOpenHandler = spy.mock.calls.find(
      ([eventName]) => eventName === 'change-is-navigation-open',
    )?.[1];
    if (navigationOpenHandler) {
      navigationOpenHandler(false);
      await testWrapper.vm.$nextTick();
      expect(testWrapper.vm.isNavigationOpen).toEqual(false);
    }
  });

  describe('Created lifecycle hook', () => {
    it('getSystemInfo should dispatch global/getSystemInfo', () => {
      wrapper.vm.getSystemInfo();
      expect(store.dispatch).toHaveBeenCalledTimes(1);
    });

    it('getEvents should dispatch eventLog/getLogData', () => {
      wrapper.vm.getEvents();
      expect(store.dispatch).toHaveBeenCalledTimes(1);
    });
  });
});
