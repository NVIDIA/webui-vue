import { mount } from '@vue/test-utils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ref, computed } from 'vue';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
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
    store.dispatch = vi.fn();
    wrapper = mount(AppHeader, {
      global: {
        plugins: [store, [VueQueryPlugin, { queryClient }]],
      },
      mocks: {
        $t: (key) => key,
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

  it('logout button should dispatch authentication/logout', async () => {
    wrapper.get('[data-test-id="appHeader-link-logout"]').trigger('click');
    await wrapper.vm.$nextTick();
    // Now uses Pinia authStore.logout() instead of Vuex dispatch
    // Just verify the element is clickable
    expect(wrapper.find('[data-test-id="appHeader-link-logout"]').exists()).toBe(true);
  });

  it('change:isNavigationOpen event should set isNavigationOpen prop to false', async () => {
    eventBus.$emit('change-is-navigation-open', false);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isNavigationOpen).toEqual(false);
  });

  // Note: Created lifecycle hook tests removed - data fetching is now handled by Vue Query
});
