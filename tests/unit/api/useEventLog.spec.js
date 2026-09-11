import { describe, it, expect } from 'vitest';
import {
  getScopedEventLogTargets,
  uniqueEventLogSystemIds,
  getActiveEventLogIndices,
  getActiveSystemIndices,
  getEventLogEntryTargets,
} from '@/api/composables/useEventLog';

const bmc = { systemId: 'System_0', logServiceId: 'EventLog' };
const hmc = { systemId: 'HGX_Baseboard_0', logServiceId: 'EventLog' };

function eventLogCollection(systemId) {
  return {
    Members: [
      {
        '@odata.id': `/redfish/v1/Systems/${systemId}/LogServices/EventLog`,
      },
    ],
  };
}

describe('getActiveSystemIndices', () => {
  it('returns every index when the caller is not system-scoped', () => {
    expect(
      getActiveSystemIndices(['System_0', 'HGX_Baseboard_0'], false, null),
    ).toEqual([0, 1]);
  });

  it('returns no indices until a system is selected', () => {
    expect(
      getActiveSystemIndices(['System_0', 'HGX_Baseboard_0'], true, null),
    ).toEqual([]);
  });

  it('returns only the selected ComputerSystem index', () => {
    expect(
      getActiveSystemIndices(
        ['System_0', 'HGX_Baseboard_0'],
        true,
        'HGX_Baseboard_0',
      ),
    ).toEqual([1]);
  });
});

describe('getScopedEventLogTargets', () => {
  it('returns every target when the caller is not system-scoped', () => {
    expect(getScopedEventLogTargets([bmc, hmc], false, null)).toEqual([
      bmc,
      hmc,
    ]);
  });

  it('returns no targets until a system is selected', () => {
    expect(getScopedEventLogTargets([bmc, hmc], true, null)).toEqual([]);
    expect(getScopedEventLogTargets([bmc, hmc], true, undefined)).toEqual([]);
  });

  it('returns only the selected ComputerSystem EventLog', () => {
    expect(getScopedEventLogTargets([bmc, hmc], true, 'HGX_Baseboard_0')).toEqual(
      [hmc],
    );
  });

  it('matches getActiveEventLogIndices so shown and cleared logs cannot diverge', () => {
    const targets = [bmc, hmc];
    const indices = getActiveEventLogIndices(targets, true, 'System_0');
    expect(getScopedEventLogTargets(targets, true, 'System_0')).toEqual(
      indices.map((index) => targets[index]),
    );
  });
});

describe('uniqueEventLogSystemIds', () => {
  it('preserves Systems collection order and drops duplicate system Ids', () => {
    expect(
      uniqueEventLogSystemIds([bmc, hmc, { ...bmc, logServiceId: 'SEL' }]),
    ).toEqual(['System_0', 'HGX_Baseboard_0']);
  });
});

describe('getActiveEventLogIndices', () => {
  it('returns every index when the caller is not system-scoped', () => {
    expect(getActiveEventLogIndices([bmc, hmc], false, null)).toEqual([0, 1]);
  });

  it('returns no indices until a system is selected', () => {
    expect(getActiveEventLogIndices([bmc, hmc], true, null)).toEqual([]);
  });

  it('returns only the selected ComputerSystem query indices', () => {
    expect(getActiveEventLogIndices([bmc, hmc], true, 'HGX_Baseboard_0')).toEqual(
      [1],
    );
  });
});

describe('getEventLogEntryTargets', () => {
  it('includes a ready system while another LogServices query is still pending', () => {
    expect(
      getEventLogEntryTargets(
        ['System_0', 'HGX_Baseboard_0'],
        [
          {
            isPending: false,
            collection: eventLogCollection('System_0'),
          },
          { isPending: true, collection: undefined },
        ],
      ),
    ).toEqual([bmc]);
  });

  it('returns no targets while every LogServices query is pending', () => {
    expect(
      getEventLogEntryTargets(
        ['System_0', 'HGX_Baseboard_0'],
        [
          { isPending: true, collection: undefined },
          { isPending: true, collection: undefined },
        ],
      ),
    ).toEqual([]);
  });

  it('includes every ready EventLog once LogServices queries settle', () => {
    expect(
      getEventLogEntryTargets(
        ['System_0', 'HGX_Baseboard_0'],
        [
          {
            isPending: false,
            collection: eventLogCollection('System_0'),
          },
          {
            isPending: false,
            collection: eventLogCollection('HGX_Baseboard_0'),
          },
        ],
      ),
    ).toEqual([bmc, hmc]);
  });
});
