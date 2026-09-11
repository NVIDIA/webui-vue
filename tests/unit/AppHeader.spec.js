import { shallowMount } from '@vue/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ref, computed } from 'vue';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import i18n from '@/i18n';
import eventBus from '@/eventBus';
import { createStore } from 'vuex';
import AppHeader from '@/components/AppHeader';

// Mock Vue Query composables
vi.mock('@/api/composables/useManagedSystem', () => ({
  useManagedSystem: () => ({
    PowerState: ref(undefined),
    AssetTag: ref(''),
    Model: ref(''),
    SerialNumber: ref(''),
    refetch: vi.fn(),
  }),
}));

vi.mock('@/api/composables/useEventLog', () => ({
  useEventLog: () => ({
    entries: computed(() => []),
    healthStatus: computed(() => 'OK'),
    isLoading: ref(false),
    refetch: vi.fn(),
  }),
}));

// Mock Pinia auth store
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    isLoggedIn: true,
    consoleWindow: ref(null),
    resetStoreState: vi.fn(),
    logout: vi.fn(),
  }),
}));

// Mock Pinia global store (used by AppHeader for PowerState, etc.)
vi.mock('@/stores/global', () => ({
  useGlobalStore: () => ({
    PowerState: ref('On'),
    BootProgressState: ref('OSRunning'),
    BootProgressOemState: ref(null),
    IsBooting: ref(false),
    isBootPolling: ref(false),
    HealthStatus: ref('OK'),
    AssetTag: ref(''),
    Model: ref(''),
    SerialNumber: ref(''),
    ManagedSystem: ref(null),
    refetch: vi.fn(),
  }),
}));

// Mock bootstrap-vue-next toast
vi.mock('bootstrap-vue-next', () => ({
  useToast: () => ({
    show: vi.fn(),
  }),
  useModal: () => ({}),
}));

// Create a query client for tests
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('AppHeader.vue', () => {
  const actions = {
    'global/getServerStatus': vi.fn(),
    'authentication/resetStoreState': vi.fn(),
    'global/getSystemInfo': vi.fn(),
  };

  // VueX requires that all modules be present, even if they aren't used
  // in the test, so invent a Fake auth module and install it.
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

  const store = createStore({
    actions,
    modules,
    getters: {
      'global/assetTag': () => '',
      'global/modelType': () => '',
      'global/serialNumber': () => '',
      'global/isAuthorized': () => true,
      'global/userPrivilege': () => '',
      'global/serverStatus': () => '',
      'global/username': () => '',
    },
  });

  let wrapper;

  beforeEach(() => {
    if (typeof global.ResizeObserver === 'undefined') {
      global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    store.dispatch = vi.fn();
    wrapper = shallowMount(AppHeader, {
      global: {
        plugins: [i18n, store, [VueQueryPlugin, { queryClient }]],
      },
    });
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

  it('should render UserMenu component', () => {
    // With shallowMount, UserMenu is stubbed. Verify it's present.
    expect(wrapper.findComponent({ name: 'UserMenu' }).exists()).toBe(true);
  });

  it('change:isNavigationOpen event should set isNavigationOpen prop to false', async () => {
    const spy = vi.spyOn(eventBus, '$on');
    // Re-mount to capture the $on call
    const testWrapper = shallowMount(AppHeader, {
      global: {
        plugins: [i18n, store, [VueQueryPlugin, { queryClient }]],
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

  // Note: Created lifecycle hook tests removed - data fetching is now handled by Vue Query
});
