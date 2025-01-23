import api from '@/store/api';
import i18n from '@/i18n';

const MemoryStore = {
  namespaced: true,
  state: {
    dimms: [],
  },
  getters: {
    dimms: (state) => state.dimms,
  },
  mutations: {
    setMemoryInfo: (state, data) => {
      state.dimms = data.map((dimm) => {
        const {
          Id,
          Status = {},
          BaseModuleType,
          BusWidthBits,
          CapacityMiB,
          DataWidthBits,
          Enabled,
          ErrorCorrection,
          Manufacturer,
          OperatingSpeedMhz,
          PartNumber,
          RankCount,
          SerialNumber,
          SparePartNumber,
          Description,
          MemoryType,
          LocationIndicatorActive,
          Location,
        } = dimm;
        return {
          id: Id,
          health: Status.Health,
          baseModuleType: BaseModuleType,
          busWidthBits: BusWidthBits,
          capacityMiB: CapacityMiB,
          dataWidthBits: DataWidthBits,
          operatingSpeedMhz: OperatingSpeedMhz,
          enabled: Enabled,
          errorCorrection: ErrorCorrection,
          manufacturer: Manufacturer,
          partNumber: PartNumber,
          rankCount: RankCount,
          serialNumber: SerialNumber,
          statusState: Status.State,
          sparePartNumber: SparePartNumber,
          description: Description,
          memoryType: MemoryType,
          identifyLed: LocationIndicatorActive,
          uri: data['@odata.id'],
          locationNumber: Location?.PartLocation?.ServiceLabel,
        };
      });
    },
  },
  actions: {
    async getDimms({ commit }) {
      this.dispatch('system/getSystemsResources', {
        name: 'Memory',
      }).then((results) => commit('setMemoryInfo', results));
    },
    async updateIdentifyLedValue({ dispatch }, led) {
      const uri = led.uri;
      const updatedIdentifyLedValue = {
        LocationIndicatorActive: led.identifyLed,
      };
      return await api
        .patch(uri, updatedIdentifyLedValue)
        .then(() => {
          if (led.identifyLed) {
            return i18n.global.t(
              'pageInventory.toast.successEnableIdentifyLed',
            );
          } else {
            return i18n.global.t(
              'pageInventory.toast.successDisableIdentifyLed',
            );
          }
        })
        .catch((error) => {
          dispatch('getDimms');
          console.log('error', error);
          if (led.identifyLed) {
            throw new Error(
              i18n.global.t('pageInventory.toast.errorEnableIdentifyLed'),
            );
          } else {
            throw new Error(
              i18n.global.t('pageInventory.toast.errorDisableIdentifyLed'),
            );
          }
        });
    },
  },
};

export default MemoryStore;
