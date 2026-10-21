import { describe, expect, it } from 'vitest';
import { describeManagerReset } from '@/store/modules/Operations/managerResetOption';

const bmcReset = {
  'Manager.Reset': {
    target: '/redfish/v1/Managers/BMC_0/Actions/Manager.Reset',
    parameters: {
      ResetType: { allowableValues: ['ForceRestart', 'GracefulRestart'] },
    },
  },
};

describe('describeManagerReset', () => {
  it('omits a manager that has no Manager.Reset action', () => {
    expect(
      describeManagerReset(
        { Id: 'SMM_0', ManagerType: 'Service' },
        {},
        { forceGracefulRestart: true },
      ),
    ).toEqual({
      id: 'SMM_0',
      displayName: 'SMM_0',
      resetOptions: null,
    });
  });

  it('includes a non-BMC manager when it exposes Manager.Reset', () => {
    expect(
      describeManagerReset(
        { Id: 'SMM_0', ManagerType: 'Service' },
        {
          'Manager.Reset': {
            target: '/redfish/v1/Managers/SMM_0/Actions/Manager.Reset',
            parameters: {
              ResetType: { allowableValues: ['GracefulRestart'] },
            },
          },
        },
        { forceGracefulRestart: true },
      ).resetOptions,
    ).toEqual({
      label: 'SMM_0',
      allowableValues: ['GracefulRestart'],
      target: '/redfish/v1/Managers/SMM_0/Actions/Manager.Reset',
    });
  });

  it('keeps a BMC reset action and can force GracefulRestart', () => {
    expect(
      describeManagerReset(
        { Id: 'BMC_0', ManagerType: 'BMC' },
        bmcReset,
        { forceGracefulRestart: true },
      ).resetOptions,
    ).toEqual({
      label: 'BMC',
      allowableValues: ['GracefulRestart'],
      target: '/redfish/v1/Managers/BMC_0/Actions/Manager.Reset',
    });
  });

  it('omits a manager that advertises no ResetType values', () => {
    expect(
      describeManagerReset(
        { Id: 'BMC_0', ManagerType: 'BMC' },
        {
          'Manager.Reset': {
            target: '/redfish/v1/Managers/BMC_0/Actions/Manager.Reset',
            parameters: { ResetType: { allowableValues: [] } },
          },
        },
        { forceGracefulRestart: true },
      ).resetOptions,
    ).toBeNull();
  });

  it('keeps advertised reset types that do not include GracefulRestart', () => {
    expect(
      describeManagerReset(
        { Id: 'BMC_0', ManagerType: 'BMC' },
        {
          'Manager.Reset': {
            target: '/redfish/v1/Managers/BMC_0/Actions/Manager.Reset',
            parameters: {
              ResetType: { allowableValues: ['ForceRestart'] },
            },
          },
        },
        { forceGracefulRestart: true },
      ).resetOptions.allowableValues,
    ).toEqual(['ForceRestart']);
  });

  it('labels an HMC and leaves its advertised reset types when not forced', () => {
    const described = describeManagerReset(
      { Id: 'HGX_BMC_0', ManagerType: 'BMC' },
      {
        'Manager.Reset': {
          target: '/redfish/v1/Managers/HGX_BMC_0/Actions/Manager.Reset',
          parameters: {
            ResetType: { allowableValues: ['GracefulRestart'] },
          },
        },
      },
    );

    expect(described.displayName).toBe('HMC');
    expect(described.resetOptions.allowableValues).toEqual(['GracefulRestart']);
  });
});
