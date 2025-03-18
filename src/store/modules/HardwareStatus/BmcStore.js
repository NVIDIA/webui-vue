import api from '@/store/api';
import i18n from '@/i18n';
import Vue from 'vue';

// Helper function to format uptime seconds into a human-readable string
const formatUptime = (seconds) => {
  seconds = Number(seconds);
  
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  const dDisplay = d > 0 ? d + (d == 1 ? ' day, ' : ' days, ') : '';
  const hDisplay = h > 0 ? h + (h == 1 ? ' hr ' : ' hrs ') : '';
  const mDisplay = m > 0 ? m + (m == 1 ? ' min, ' : ' mins, ') : '';
  const sDisplay = s > 0 ? s + (s == 1 ? ' sec' : ' secs') : '';
  
  // Combine the parts and trim any trailing commas and spaces
  const result = (dDisplay + hDisplay + mDisplay + sDisplay).replace(/,\s*$/, '');
  return result.length > 0 ? result : '0 secs';
};

const BmcStore = {
  namespaced: true,
  state: {
    bmc: [],
    isManagerReady: false,
    resetToDefaultsUris: [],
  },
  getters: {
    bmc: (state) => state.bmc,
    isManagerReady: (state) => state.isManagerReady,
    resetToDefaultsUris: (state) => state.resetToDefaultsUris,
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
    setResetToDefaultsUris: (state, value) => {
      state.resetToDefaultsUris = value;
    },
  },
  actions: {
    async getBmcInfo({ commit }) {
      try {
        const { data: { Members = [] } } = await api.get('/redfish/v1/Managers');
        const bmcPromises = Members.map((member, idx) =>
          api.get(member['@odata.id']).then(async ({ data }) => {
            commit('setBmcInfo', { ...data, index: idx });
            
            // Check if UptimeSeconds is available in any OEM section
            let upTimeData;
            let uptimeSeconds = null;
            let date = null;
            
            // Look for UptimeSeconds in any OEM provider
            if (data.Oem) {
              // Check each OEM provider
              for (const provider in data.Oem) {
                if (data.Oem[provider]?.UptimeSeconds !== undefined) {
                  uptimeSeconds = data.Oem[provider].UptimeSeconds;
                  date = new Date(data.DateTime);
                  break;
                }
              }
            }
            
            if (uptimeSeconds !== null && !isNaN(date.getTime())) {
              // Use the server-provided uptime value
              const lastResetTime = new Date(date.getTime() - (uptimeSeconds * 1000));
              
              // Format the uptime using the helper function
              const upTime = formatUptime(uptimeSeconds);
              
              upTimeData = { 
                date, 
                lastResetTime, 
                upTime,
                uptimeSeconds
              };
            } else {
              // Calculate uptime manually if UptimeSeconds is not available
              upTimeData = await dispatch('calculateUpTime', { 
                currentDate: data.DateTime, 
                lastResetTime: data.LastResetTime 
              });
            }
            
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
      return state.isManagerReady
    },
    async calculateUpTime({ commit }, { currentDate, lastResetTime}) {
      // Get BMC path from the global store if needed
      const date = new Date(currentDate);
      const lastDate = new Date(lastResetTime);
      const milliseconds = parseInt(date - lastDate);
      if (milliseconds < 0) {
        commit('setBmcUpTime', '0/NA');
        return { date, lastResetTime: lastDate, upTime: '0/NA', uptimeSeconds: 0 };
      } 

      const seconds = milliseconds / 1000;
      const upTime = formatUptime(seconds);
      
      return { 
        date, 
        lastResetTime: lastDate, 
        upTime,
        uptimeSeconds: seconds
      };
    },
    async getBmcUpTime({ dispatch, state }) {
      await dispatch('getBmcInfo');
    },
  },
};

export default BmcStore;