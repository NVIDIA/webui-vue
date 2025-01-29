import api from '@/store/api';
import i18n from '@/i18n';

const ChassisStore = {
  namespaced: true,
  state: {
    chassis: [],
    redfish_chassis: [],
  },
  getters: {
    chassis: (state) => state.chassis,
    redfish_chassis: (state) => state.redfish_chassis,
  },
  mutations: {
    setChassisInfo: (state, data) => {
      state.redfish_chassis = data;
      state.chassis = data.map((chassis) => {
        const {
          Id,
          Status = {},
          PartNumber,
          SerialNumber,
          ChassisType,
          Manufacturer,
          PowerState,
          LocationIndicatorActive,
          AssetTag,
          Model,
          MaxPowerWatts,
          MinPowerWatts,
          Name,
          Location,
        } = chassis;

        return {
          id: Id,
          health: Status.Health,
          partNumber: PartNumber,
          serialNumber: SerialNumber,
          chassisType: ChassisType,
          manufacturer: Manufacturer,
          powerState: PowerState,
          statusState: Status.State,
          healthRollup: Status.HealthRollup,
          assetTag: AssetTag,
          model: Model,
          maxPowerWatts: MaxPowerWatts,
          minPowerWatts: MinPowerWatts,
          name: Name,
          identifyLed: LocationIndicatorActive,
          uri: chassis['@odata.id'],
          locationNumber: Location?.PartLocation?.ServiceLabel,
        };
      });
    },
  },
  actions: {
    async getChassisInfo({ commit }) {
      return await api
        .get('/redfish/v1/Chassis')
        .then(({ data: { Members = [] } }) =>
          Members.map((member) => api.get(member['@odata.id'])),
        )
        .then((promises) => api.allSettled(promises))
        .then((response) => {
          // resolved/fulfilled Promises' values
          const fulfilled = response
            .filter((result) => result.status === 'fulfilled')
            .map((result) => result?.value?.data);
          commit('setChassisInfo', fulfilled);
        })
        .catch((error) => console.log(error));
    },
    async updateIdentifyLedValue({ dispatch }, led) {
      const uri = led.uri;
      const updatedIdentifyLedValue = {
        LocationIndicatorActive: led.identifyLed,
      };
      return await api
        .patch(uri, updatedIdentifyLedValue)
        .then(() => {
          dispatch('getChassisInfo');
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
          dispatch('getChassisInfo');
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

export default ChassisStore;
