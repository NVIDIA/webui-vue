import { mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import AppHeader from '@/components/AppHeader';

describe('AppHeader.vue', () => {
  const eventBus = {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };

  // Create properly namespaced modules with state and getters
  // that match what AppHeader.vue expects
  const modules = {
    authentication: {
      namespaced: true,
      state: {
        consoleWindow: null,
      },
      actions: {
        resetStoreState: jest.fn(),
        logout: jest.fn(),
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
        getServerStatus: jest.fn(),
        getSystemInfo: jest.fn(),
        fetchHealthStatus: jest.fn(),
      },
    },
    eventLog: {
      namespaced: true,
      actions: {
        getLogData: jest.fn(),
      },
    },
  };

  const store = createStore({ modules });
  const wrapper = mount(AppHeader, {
    global: {
      plugins: [store],
      mocks: {
        $t: (key) => key,
        $eventBus: eventBus,
      },
    },
  });

  // Reset dispatch between tests so that multiple
  // actions are not dispatched for each test
  beforeEach(() => {
    store.dispatch = jest.fn();
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
    wrapper.get('#app-header-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    expect(eventBus.emit).toHaveBeenCalledWith('toggle-navigation');
  });

  it('logout button should dispatch authentication/logout', async () => {
    wrapper.get('[data-test-id="appHeader-link-logout"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(store.dispatch).toHaveBeenCalledTimes(1);
  });

  it('change:isNavigationOpen event should set isNavigationOpen prop to false', async () => {
    const navigationOpenHandler = eventBus.on.mock.calls.find(
      ([eventName]) => eventName === 'change-is-navigation-open',
    )?.[1];
    navigationOpenHandler(false);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isNavigationOpen).toEqual(false);
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
