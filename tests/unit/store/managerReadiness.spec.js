import { describe, expect, it } from 'vitest';
import {
  bmcManagersAwaitingEnabled,
  hasMultipleBmcManagers,
} from '@/store/modules/HardwareStatus/managerReadiness';

describe('bmcManagersAwaitingEnabled', () => {
  it('ignores service managers that have no Status.State', () => {
    const awaiting = bmcManagersAwaitingEnabled([
      {
        Id: 'BMC_0',
        ManagerType: 'BMC',
        Status: { State: 'Enabled' },
      },
      { Id: 'SMM_0', ManagerType: 'Service', Status: { Conditions: [] } },
      {
        Id: 'StorageBackplane_0',
        ManagerType: 'Service',
        Status: { Conditions: [] },
      },
    ]);

    expect(awaiting).toEqual([]);
  });

  it('still reports a BMC or HMC that is not Enabled', () => {
    const awaiting = bmcManagersAwaitingEnabled([
      {
        Id: 'BMC_0',
        ManagerType: 'BMC',
        Status: { State: 'Enabled' },
      },
      {
        Id: 'HGX_BMC_0',
        ManagerType: 'BMC',
        Status: { State: 'Starting' },
      },
      { Id: 'SMM_0', ManagerType: 'Service' },
    ]);

    expect(awaiting.map((manager) => manager.Id)).toEqual(['HGX_BMC_0']);
  });

  it('reads the slim store shape used by later status polls', () => {
    const awaiting = bmcManagersAwaitingEnabled([
      { id: 'BMC_0', managerType: 'BMC', statusState: 'Enabled' },
      { id: 'SMM_0', managerType: 'Service', statusState: undefined },
    ]);

    expect(awaiting).toEqual([]);
  });
});

describe('hasMultipleBmcManagers', () => {
  it('is false when the only BMC is the host and service managers are present', () => {
    expect(
      hasMultipleBmcManagers([
        { id: 'BMC_0', managerType: 'BMC' },
        { id: 'SMM_0', managerType: 'Service' },
        { id: 'StorageBackplane_0', managerType: 'Service' },
      ]),
    ).toBe(false);
  });

  it('is true when a host BMC and an HMC are both present', () => {
    expect(
      hasMultipleBmcManagers([
        { Id: 'BMC_0', ManagerType: 'BMC' },
        { Id: 'HGX_BMC_0', ManagerType: 'BMC' },
        { Id: 'SMM_0', ManagerType: 'Service' },
      ]),
    ).toBe(true);
  });
});
