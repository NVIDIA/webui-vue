import api from '@/store/api';
import i18n from '@/i18n';

const ProcessorStore = {
  namespaced: true,
  state: {
    processors: [],
  },
  getters: {
    processors: (state) => state.processors,
  },
  mutations: {
    setProcessorsInfo: (state, data) => {
      state.processors = data.map((processor) => {
        const {
          Id,
          Status = {},
          PartNumber,
          SerialNumber,
          SparePartNumber,
          InstructionSet,
          Manufacturer,
          Model,
          Name,
          ProcessorArchitecture,
          ProcessorType,
          Version,
          AssetTag,
          MinSpeedMHz,
          MaxSpeedMHz,
          TotalCores,
          TotalThreads,
          Location,
          LocationIndicatorActive,
        } = processor;
        return {
          id: Id,
          health: Status.Health,
          healthRollup: Status.HealthRollup,
          partNumber: PartNumber,
          sparePartNumber: SparePartNumber,
          serialNumber: SerialNumber,
          statusState: Status.State,
          instructionSet: InstructionSet,
          manufacturer: Manufacturer,
          model: Model,
          name: Name,
          processorArchitecture: ProcessorArchitecture,
          processorType: ProcessorType,
          version: Version,
          assetTag: AssetTag,
          minSpeedMHz: MinSpeedMHz,
          maxSpeedMHz: MaxSpeedMHz,
          totalCores: TotalCores,
          totalThreads: TotalThreads,
          locationNumber: Location?.PartLocation?.ServiceLabel,
          identifyLed: LocationIndicatorActive,
          uri: processor['@odata.id'],
        };
      });
    },
  },
  actions: {
    async getProcessorsInfo({ commit }) {
      await this.dispatch('system/getSystemsResources', {
        name: 'Processors',
      }).then((results) => commit('setProcessorsInfo', results));
    },
    // Waiting for the following to be merged to test the Identify Led:
    // https://gerrit.openbmc-project.xyz/c/openbmc/bmcweb/+/37045
    async updateIdentifyLedValue({ dispatch }, led) {
      const uri = led.uri;
      const updatedIdentifyLedValue = {
        LocationIndicatorActive: led.identifyLed,
      };
      return await api
        .patch(uri, updatedIdentifyLedValue)
        .then(() => {
          if (led.identifyLed) {
            return i18n.t('pageInventory.toast.successEnableIdentifyLed');
          } else {
            return i18n.t('pageInventory.toast.successDisableIdentifyLed');
          }
        })
        .catch((error) => {
          dispatch('getProcessorsInfo');
          console.log('error', error);
          if (led.identifyLed) {
            throw new Error(
              i18n.t('pageInventory.toast.errorEnableIdentifyLed'),
            );
          } else {
            throw new Error(
              i18n.t('pageInventory.toast.errorDisableIdentifyLed'),
            );
          }
        });
    },
  },
};

export default ProcessorStore;
