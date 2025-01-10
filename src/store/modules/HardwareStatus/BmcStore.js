import api from '@/store/api';
import i18n from '@/i18n';
import Vue from 'vue';

const BmcStore = {
  namespaced: true,
  state: {
    bmc: [],
    isManagerReady: false,
  },
  getters: {
    bmc: (state) => state.bmc,
    isManagerReady: (state) => state.isManagerReady,
  },
  mutations: {
    setBmcInfo: (state, data) => {
      const bmc = {};
      bmc.dateTime = new Date(data.DateTime);
      bmc.description = data.Description;
      bmc.firmwareVersion = data.FirmwareVersion;
      bmc.graphicalConsoleConnectTypes =
        data?.GraphicalConsole?.ConnectTypesSupported;
      bmc.graphicalConsoleEnabled = data?.GraphicalConsole?.ServiceEnabled;
      bmc.graphicalConsoleMaxSessions =
        data?.GraphicalConsole?.MaxConcurrentSessions;
      bmc.health = data.Status.Health;
      bmc.healthRollup = data.Status.HealthRollup;
      bmc.id = data.Id;
      bmc.lastResetTime = new Date(data.LastResetTime);
      bmc.identifyLed = data.LocationIndicatorActive;
      bmc.locationNumber = data.Location?.PartLocation?.ServiceLabel;
      bmc.manufacturer = data.manufacturer;
      bmc.managerType = data.ManagerType;
      bmc.model = data.Model;
      bmc.name = data.Name;
      bmc.partNumber = data.PartNumber;
      bmc.powerState = data.PowerState;
      bmc.serialConsoleConnectTypes = data.SerialConsole.ConnectTypesSupported;
      bmc.serialConsoleEnabled = data.SerialConsole.ServiceEnabled;
      bmc.serialConsoleMaxSessions = data.SerialConsole.MaxConcurrentSessions;
      bmc.serialNumber = data.SerialNumber;
      bmc.serviceEntryPointUuid = data.ServiceEntryPointUUID;
      bmc.sparePartNumber = data.SparePartNumber;
      bmc.statusState = data.Status.State;
      bmc.uuid = data.UUID;
      bmc.uri = data['@odata.id'];
      Vue.set(state.bmc, data.index, bmc);
    },
    setManagerReady: (state, ready) => {
      state.isManagerReady = ready;
    },
  },
  actions: {
    async getBmcInfo({ commit }) {
      try {
        const { data: { Members = [] } } = await api.get('/redfish/v1/Managers');
        const bmcPromises = Members.map((member, idx) =>
          api.get(member['@odata.id']).then(({ data }) => {
            commit('setBmcInfo', { ...data, index: idx });
            return data;
          })
        );

        const results = await Promise.all(bmcPromises);
        const allManagersReady = results.every((manager) =>
          manager?.Status?.State === 'Enabled');
        commit('setManagerReady', allManagersReady);
        return results;
      } catch (error) {
        console.log(error);
        commit('setManagerReady', false);
        throw error;
      }
    },
    async updateIdentifyLedValue({ dispatch }, led) {
      const uri = led.uri;
      const updatedIdentifyLedValue = {
        LocationIndicatorActive: led.identifyLed,
      };
      return await api
        .patch(uri, updatedIdentifyLedValue)
        .then(() => {
          dispatch('getBmcInfo');
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
          dispatch('getBmcInfo');
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
    async checkManagerStatus({ dispatch, state }) {
      await dispatch('getBmcInfo');
    },
  },
};

export default BmcStore;
