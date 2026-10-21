import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import { BFormGroup, BFormRadio, BFormRadioGroup, BFormText } from 'bootstrap-vue-next';
import i18n from '@/i18n';
import FactoryReset from '@/views/Operations/FactoryReset/FactoryReset.vue';

const bmcHelper = i18n.global.t(
  'pageFactoryReset.form.resetToDefaultsOptionHelperText',
);
const biosHelper = i18n.global.t(
  'pageFactoryReset.form.resetBiosOptionHelperText',
);
const bmcLabel = i18n.global.t(
  'pageFactoryReset.form.resetToDefaultsOptionLabel',
);

const biosTarget = '/redfish/v1/Systems/System_0/Bios/Actions/Bios.ResetBios';
const bmcTarget = '/redfish/v1/Managers/BMC_0/Actions/Manager.ResetToDefaults';

function mountPage({
  bios = [],
  bmc = [],
  realRadios = false,
  factoryResetActions = {},
} = {}) {
  const store = createStore({
    modules: {
      factoryReset: {
        namespaced: true,
        state: { bios },
        getters: {
          resetBiosUris: (state) => state.bios,
        },
        mutations: {
          setBios(state, value) {
            state.bios = value;
          },
        },
        actions: {
          preloadResetBiosTargets: () => Promise.resolve(),
          resetBios: () => Promise.resolve('resetBios'),
          resetToDefaults: () => Promise.resolve('resetToDefaults'),
          ...factoryResetActions,
        },
      },
      bmc: {
        namespaced: true,
        state: { bmc },
        getters: {
          resetToDefaultsUris: (state) => state.bmc,
        },
        mutations: {
          setBmc(state, value) {
            state.bmc = value;
          },
        },
        actions: {
          getBmcInfo: () => Promise.resolve(),
        },
      },
    },
  });

  return mount(FactoryReset, {
    global: {
      plugins: [store],
      stubs: {
        PageTitle: true,
        ModalReset: true,
        FactoryResetModal: true,
        'b-container': { template: '<div><slot /></div>' },
        'b-row': { template: '<div><slot /></div>' },
        'b-col': { template: '<div><slot /></div>' },
        'b-form': { template: '<form><slot /></form>' },
        ...(realRadios
          ? {
              'b-button': {
                props: { disabled: Boolean },
                template: '<button :disabled="disabled"><slot /></button>',
              },
              'b-form-group': false,
              'b-form-radio-group': false,
              'b-form-radio': false,
              'b-form-text': false,
            }
          : {
              'b-form-radio-group': { template: '<div><slot /></div>' },
              'b-form-text': { template: '<small><slot /></small>' },
            }),
      },
      components: realRadios
        ? { BFormGroup, BFormRadioGroup, BFormRadio, BFormText }
        : {},
    },
  });
}

describe('FactoryReset', () => {
  it('shows the BMC description once when other managers have no reset action', () => {
    const wrapper = mountPage({
      bios: [
        {
          Id: 'System_0',
          target: '/redfish/v1/Systems/System_0/Bios/Actions/Bios.ResetBios',
        },
      ],
      bmc: [
        {
          Id: 'BMC_0',
          target: '/redfish/v1/Managers/BMC_0/Actions/Manager.ResetToDefaults',
        },
        undefined,
        undefined,
      ],
    });

    const text = wrapper.text();
    expect(text).toContain(bmcLabel);
    expect(text).not.toContain(`${bmcLabel}: [BMC_0]`);
    expect(text.split(bmcHelper)).toHaveLength(2);
    expect(text.split(biosHelper)).toHaveLength(2);
    expect(wrapper.findAll('#reset-to-defaults')).toHaveLength(1);
    expect(wrapper.findAll('#reset-bios')).toHaveLength(1);
    expect(
      wrapper.findAll('[data-test-id^="factoryReset-radio-resetToDefaults-"]'),
    ).toHaveLength(1);
  });

  it('keeps one shared description when several BMC targets are real', () => {
    const wrapper = mountPage({
      bmc: [
        { Id: 'BMC_0', target: '/redfish/v1/Managers/BMC_0/Actions/Manager.ResetToDefaults' },
        { Id: 'BMC_1', target: '/redfish/v1/Managers/BMC_1/Actions/Manager.ResetToDefaults' },
        { Id: 'BMC_0', target: '/redfish/v1/Managers/BMC_0/Actions/Manager.ResetToDefaults' },
      ],
    });

    const text = wrapper.text();
    expect(text).toContain(`${bmcLabel}: [BMC_0]`);
    expect(text).toContain(`${bmcLabel}: [BMC_1]`);
    expect(text.split(bmcHelper)).toHaveLength(2);
    expect(text).not.toContain(biosHelper);
    expect(
      wrapper.findAll('[data-test-id^="factoryReset-radio-resetToDefaults-"]'),
    ).toHaveLength(2);
  });

  it('leaves every radio empty until the user picks one', async () => {
    const wrapper = mountPage({
      bios: [{ Id: 'System_0', target: biosTarget }],
      bmc: [{ Id: 'BMC_0', target: bmcTarget }],
      realRadios: true,
    });
    await wrapper.vm.$nextTick();

    const inputs = wrapper.findAll('input[type="radio"]');
    expect(inputs.map((input) => input.element.value)).toEqual([
      biosTarget,
      bmcTarget,
    ]);
    expect(inputs[0].element.checked).toBe(false);
    expect(inputs[1].element.checked).toBe(false);
    expect(
      wrapper.get('[data-test-id="factoryReset-button-submit"]').element.disabled,
    ).toBe(true);

    await inputs[1].setChecked(true);
    await wrapper.vm.$nextTick();

    const after = wrapper.findAll('input[type="radio"]');
    expect(after[0].element.checked).toBe(false);
    expect(after[1].element.checked).toBe(true);
    expect(wrapper.vm.resetOption).toMatchObject({
      Id: 'BMC_0',
      target: bmcTarget,
      value: 'resetToDefaults',
    });
  });

  it('keeps a radio change on the current default when BIOS arrives', async () => {
    const wrapper = mountPage({
      bmc: [{ Id: 'BMC_0', target: bmcTarget }],
      realRadios: true,
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.selectedTarget).toBe(bmcTarget);

    await wrapper.get('input[type="radio"]').trigger('change');
    wrapper.vm.$store.commit('factoryReset/setBios', [
      { Id: 'System_0', target: biosTarget },
    ]);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.selectedTarget).toBe(bmcTarget);
    expect(wrapper.vm.resetOption.value).toBe('resetToDefaults');
  });

  it('does not treat a helper-text click as a choice', async () => {
    const wrapper = mountPage({
      bmc: [{ Id: 'BMC_0', target: bmcTarget }],
      realRadios: true,
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.selectedTarget).toBe(bmcTarget);

    await wrapper.get('#reset-to-defaults').trigger('click');
    wrapper.vm.$store.commit('factoryReset/setBios', [
      { Id: 'System_0', target: biosTarget },
    ]);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.selectedTarget).toBeNull();
    expect(wrapper.vm.resetOption.value).toBeNull();
    expect(
      wrapper.get('[data-test-id="factoryReset-button-submit"]').element
        .disabled,
    ).toBe(true);
  });

  it('clears an untouched BMC default when a second target arrives', async () => {
    const wrapper = mountPage({
      bmc: [{ Id: 'BMC_0', target: bmcTarget }],
      realRadios: true,
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.selectedTarget).toBe(bmcTarget);

    wrapper.vm.$store.commit('factoryReset/setBios', [
      { Id: 'System_0', target: biosTarget },
    ]);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.selectedTarget).toBeNull();
    expect(wrapper.vm.resetOption.value).toBeNull();
  });

  it('keeps a user-selected target when another target arrives', async () => {
    const wrapper = mountPage({
      bios: [{ Id: 'System_0', target: biosTarget }],
      bmc: [{ Id: 'BMC_0', target: bmcTarget }],
      realRadios: true,
    });
    await wrapper.vm.$nextTick();
    await wrapper.findAll('input[type="radio"]')[1].setChecked(true);
    await wrapper.vm.$nextTick();

    wrapper.vm.$store.commit('bmc/setBmc', [
      { Id: 'BMC_0', target: bmcTarget },
      {
        Id: 'HGX_BMC_0',
        target: '/redfish/v1/Managers/HGX_BMC_0/Actions/Manager.ResetToDefaults',
      },
    ]);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.selectedTarget).toBe(bmcTarget);
    expect(wrapper.vm.resetOption.value).toBe('resetToDefaults');
  });

  it('keeps the submitted BMC reset when BIOS arrives while confirm is open', async () => {
    const resetToDefaults = vi.fn(() => Promise.resolve('resetToDefaults'));
    const resetBios = vi.fn(() => Promise.resolve('resetBios'));
    const wrapper = mountPage({
      bmc: [{ Id: 'BMC_0', target: bmcTarget }],
      realRadios: true,
      factoryResetActions: { resetBios, resetToDefaults },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.selectedTarget).toBe(bmcTarget);

    wrapper.vm.onResetSubmit();
    expect(wrapper.vm.showResetModal).toBe(true);
    expect(wrapper.vm.confirmResetType).toBe('resetToDefaults');
    expect(wrapper.vm.pendingReset).toMatchObject({
      value: 'resetToDefaults',
      target: bmcTarget,
    });

    wrapper.vm.$store.commit('factoryReset/setBios', [
      { Id: 'System_0', target: biosTarget },
    ]);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.selectedTarget).toBe(bmcTarget);
    expect(wrapper.vm.confirmResetType).toBe('resetToDefaults');
    expect(wrapper.vm.pendingReset).toMatchObject({
      value: 'resetToDefaults',
      target: bmcTarget,
    });

    wrapper.vm.onOkConfirm();
    expect(resetToDefaults).toHaveBeenCalledWith(expect.anything(), bmcTarget);
    expect(resetBios).not.toHaveBeenCalled();
  });
});
