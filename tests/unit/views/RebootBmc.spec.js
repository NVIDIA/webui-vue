import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import RebootBmc from '@/views/Operations/RebootBmc/RebootBmc.vue';

const invalidDate = new Date(undefined);

function mountPage(managers) {
  const store = createStore({
    modules: {
      controls: {
        namespaced: true,
        state: {
          Managers: managers,
          managersError: null,
          managersLoading: false,
        },
        getters: {
          Managers: (state) => state.Managers,
          managersError: (state) => state.managersError,
          isManagersLoading: (state) => state.managersLoading,
        },
        mutations: {
          setManagersLoading: (state, isLoading) => {
            state.managersLoading = isLoading;
          },
        },
        actions: {
          fetchManagersInfo: () => Promise.resolve(),
        },
      },
    },
  });

  return mount(RebootBmc, {
    global: {
      plugins: [store],
      mocks: {
        $filters: {
          formatDate(value) {
            if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
              throw new RangeError('Invalid time value');
            }
            return '2026-01-02';
          },
          formatTime(value) {
            if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
              throw new RangeError('Invalid time value');
            }
            return '03:04:05';
          },
        },
      },
      stubs: {
        PageTitle: true,
        PageSection: { template: '<div><slot /></div>' },
        Alert: true,
        'b-container': { template: '<div><slot /></div>' },
        'b-row': { template: '<div><slot /></div>' },
        'b-col': { template: '<div><slot /></div>' },
        'b-spinner': true,
        'b-button': true,
        'b-form-group': { template: '<div><slot /></div>' },
        'b-form-select': true,
        'b-form-select-option': true,
        'b-form-text': true,
        'b-form-invalid-feedback': true,
        'b-table': {
          props: ['items'],
          template: `
            <div>
              <div v-for="item in items" :key="item.id" class="manager-row">
                <slot name="cell(manager)" :item="item" />
                <slot name="cell(timestamp)" :item="item" />
                <slot name="cell(upTime)" :item="item" />
              </div>
            </div>
          `,
        },
      },
    },
  });
}

describe('RebootBmc manager table', () => {
  it('lists managers that have a reset action and skips invalid timestamps', () => {
    const wrapper = mountPage([
      {
        id: 'BMC_0',
        Id: 'BMC_0',
        ManagerType: 'BMC',
        displayName: 'BMC',
        lastResetTime: invalidDate,
        resetOptions: {
          allowableValues: ['GracefulRestart'],
          target: '/redfish/v1/Managers/BMC_0/Actions/Manager.Reset',
        },
      },
      {
        id: 'SMM_0',
        Id: 'SMM_0',
        ManagerType: 'Service',
        displayName: 'SMM_0',
        lastResetTime: invalidDate,
        resetOptions: null,
      },
      {
        id: 'Custom_0',
        Id: 'Custom_0',
        ManagerType: 'Service',
        displayName: 'Custom_0',
        lastResetTime: new Date('2026-01-02T03:04:05Z'),
        resetOptions: {
          allowableValues: ['GracefulRestart'],
          target: '/redfish/v1/Managers/Custom_0/Actions/Manager.Reset',
        },
      },
    ]);

    expect(wrapper.text()).toContain('BMC');
    expect(wrapper.text()).toContain('Custom_0');
    expect(wrapper.text()).toContain('2026-01-02');
    expect(wrapper.text()).not.toContain('SMM_0');
    expect(wrapper.text()).toContain('Unknown');
  });

  it('formats a real BMC reset time', () => {
    const wrapper = mountPage([
      {
        id: 'BMC_0',
        Id: 'BMC_0',
        ManagerType: 'BMC',
        displayName: 'BMC',
        lastResetTime: new Date('2026-01-02T03:04:05Z'),
        resetOptions: {
          allowableValues: ['GracefulRestart'],
          target: '/redfish/v1/Managers/BMC_0/Actions/Manager.Reset',
        },
      },
    ]);

    expect(wrapper.text()).toContain('2026-01-02');
    expect(wrapper.text()).toContain('03:04:05');
  });
});
