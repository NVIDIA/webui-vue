import api from '@/store/api';
import i18n from '@/i18n';
import Vue from 'vue';

const BmcStore = {
  namespaced: true,
  state: {
    bmc: [],
    Managers: [],
    isManagerReady: false,
    resetToDefaultsUris: [],
    bmcTime: null,
    bmcUpTime: null,
    managersLoading: false,
    managersError: null,
  },
  getters: {
    bmc: (state) => state.bmc,
    Managers: (state) => state.Managers,
    isManagerReady: (state) => state.isManagerReady,
    resetToDefaultsUris: (state) => state.resetToDefaultsUris,
    bmcTime: (state) => state.bmcTime,
    bmcUpTime: (state) => state.bmcUpTime,
    isManagersLoading: (state) => state.managersLoading,
    managersError: (state) => state.managersError,
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
      bmc.health = data?.Status?.Health ?? null;
      bmc.healthRollup = data?.Status?.HealthRollup ?? null;
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
      bmc.serialConsoleConnectTypes = data.SerialConsole?.ConnectTypesSupported;
      bmc.serialConsoleEnabled = data.SerialConsole?.ServiceEnabled;
      bmc.serialConsoleMaxSessions = data.SerialConsole?.MaxConcurrentSessions;
      bmc.serialNumber = data.SerialNumber;
      bmc.serviceEntryPointUuid = data.ServiceEntryPointUUID;
      bmc.sparePartNumber = data.SparePartNumber;
      bmc.statusState = data.Status?.State;
      bmc.uuid = data.UUID;
      bmc.uri = data['@odata.id'];
      Vue.set(state.bmc, data.index, bmc);
    },
    setManagerReady: (state, ready) => {
      state.isManagerReady = ready;
    },
    setResetToDefaultsUris: (state, value) => {
      state.resetToDefaultsUris = value;
    },
    setBmcTime: (state, bmcTime) => {
      state.bmcTime = bmcTime;
    },
    setBmcUpTime: (state, bmcUpTime) => {
      state.bmcUpTime = bmcUpTime;
    },
    setManagers: (state, Managers) => {
      state.Managers = [...Managers];
    },
    setManagersLoading: (state, isLoading) => {
      state.managersLoading = isLoading;
    },
    setManagersError: (state, error) => {
      state.managersError = error;
    },
  },
  actions: {
    async getBmcInfo({ commit, dispatch, state }) {
      try {
        const bmcPath = `${await this.dispatch('global/getBmcPath')}`;
        const { data: { Members = [] } } = await api.get('/redfish/v1/Managers');
        const bmcPromises = Members.map((member, idx) =>
          api.get(member['@odata.id']).then(async ({ data }) => {
            commit('setBmcInfo', { ...data, index: idx });
            const upTimeData = await dispatch('calculateUpTime', { currentDate: data.DateTime, lastResetTime: data.LastResetTime });
            data = { ...data, ...upTimeData };
            if (bmcPath === member['@odata.id']) {
              commit('setBmcTime', upTimeData.date);
              commit('setBmcUpTime', upTimeData.upTime);
            }
            Vue.set(state.Managers, idx, data);
            return data;
          })
        );

        const results = await Promise.all(bmcPromises);
        const allManagersReady = results.every((manager) =>
          manager?.Status?.State === 'Enabled');
        commit('setManagerReady', allManagersReady);
        const resetToDefaultsUris = results.flatMap(
          (bmc) => {
            const uri = bmc.Actions?.["#Manager.ResetToDefaults"]?.['target'];
            if (uri) return { "Id": bmc.Id, "target": uri }
          }
        );
        commit('setResetToDefaultsUris', resetToDefaultsUris);
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
            return i18n.t('pageInventory.toast.successEnableIdentifyLed');
          } else {
            return i18n.t('pageInventory.toast.successDisableIdentifyLed');
          }
        })
        .catch((error) => {
          dispatch('getBmcInfo');
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
    async checkManagerStatus({ dispatch, state }) {
      await dispatch('getBmcInfo');
      return state.isManagerReady
    },
    async calculateUpTime({ commit }, { currentDate, lastResetTime}) {
      // Get BMC path from the global store if needed
      const date = new Date(currentDate);

      //commit('setBmcTime', date);

      const lastDate = new Date(lastResetTime);
    
      const milliseconds = parseInt(date - lastDate);
      if (milliseconds < 0) {
        commit('setBmcUpTime', '0/NA');
        return '0/NA';
      } 

      var seconds = milliseconds / 1000;
      seconds = Number(seconds);

      var d = Math.floor(seconds / (3600 * 24));
      var h = Math.floor((seconds % (3600 * 24)) / 3600);
      var m = Math.floor((seconds % 3600) / 60);
      var s = Math.floor(seconds % 60);

      var dDisplay = d > 0 ? d + (d == 1 ? ' day, ' : ' days, ') : '';
      var hDisplay = h > 0 ? h + (h == 1 ? ' hr ' : ' hrs ') : '';
      var mDisplay = m > 0 ? m + (m == 1 ? ' min, ' : ' mins, ') : '';
      var sDisplay = s > 0 ? s + (s == 1 ? ' sec' : ' secs') : '';
      return { date, lastResetTime: lastDate, upTime: dDisplay + hDisplay + mDisplay + sDisplay };
    },
    async getBmcUpTime({ dispatch, state }) {
      await dispatch('getBmcInfo');
      return state.bmcUpTime;
    },
    async getBmcTime({ dispatch, state }) {
      await dispatch('getBmcUpTime');
      return state.bmcTime;
    }
  },
};

export default BmcStore;