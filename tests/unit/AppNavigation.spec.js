import { mount } from '@vue/test-utils';
import AppNavigation from '@/components/AppNavigation';
import { createStore } from 'vuex';
import { createRouter, createMemoryHistory } from 'vue-router';

describe('AppNavigation.vue', () => {
  let wrapper;
  const eventBus = {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [],
  });
  const actions = {
    'global/userPrivilege': jest.fn(),
  };
  const store = createStore({ actions });

  wrapper = mount(AppNavigation, {
    global: {
      plugins: [store, router],
      mocks: {
        $t: (key) => key,
        $eventBus: eventBus,
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
    const navOverlay = wrapper.find('#nav-overlay');
    navOverlay.trigger('click');
    await wrapper.vm.$nextTick();
    expect(eventBus.emit).toHaveBeenCalledWith(
      'change-is-navigation-open',
      true,
    );
  });

  it('toggle-navigation event should toggle isNavigation data prop value', async () => {
    const toggleHandler = eventBus.on.mock.calls.find(
      ([eventName]) => eventName === 'toggle-navigation',
    )?.[1];
    wrapper.vm.isNavigationOpen = false;
    toggleHandler();
    expect(wrapper.vm.isNavigationOpen).toBe(true);
    toggleHandler();
    expect(wrapper.vm.isNavigationOpen).toBe(false);
  });
});
