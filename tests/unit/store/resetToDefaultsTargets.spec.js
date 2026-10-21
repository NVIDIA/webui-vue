import { describe, expect, it } from 'vitest';
import { resetToDefaultsTargets } from '@/store/modules/HardwareStatus/resetToDefaultsTargets';

const bmcReset = '/redfish/v1/Managers/BMC_0/Actions/Manager.ResetToDefaults';

describe('resetToDefaultsTargets', () => {
  it('keeps only managers that advertise ResetToDefaults', () => {
    const targets = resetToDefaultsTargets([
      {
        Id: 'BMC_0',
        Actions: { '#Manager.ResetToDefaults': { target: bmcReset } },
      },
      { Id: 'SMM_0', Actions: {} },
      { Id: 'StorageBackplane_0' },
      undefined,
    ]);

    expect(targets).toEqual([{ Id: 'BMC_0', target: bmcReset }]);
  });

  it('drops a repeated action target', () => {
    const targets = resetToDefaultsTargets([
      {
        Id: 'BMC_0',
        Actions: { '#Manager.ResetToDefaults': { target: bmcReset } },
      },
      {
        Id: 'BMC_0',
        Actions: { '#Manager.ResetToDefaults': { target: bmcReset } },
      },
      {
        Id: 'BMC_1',
        Actions: {
          '#Manager.ResetToDefaults': {
            target: '/redfish/v1/Managers/BMC_1/Actions/Manager.ResetToDefaults',
          },
        },
      },
    ]);

    expect(targets.map((target) => target.Id)).toEqual(['BMC_0', 'BMC_1']);
  });
});
