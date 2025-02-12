import api from '@/store/api';
import i18n from '@/i18n';
import Vue from 'vue';

const SystemStore = {
  namespaced: true,
  state: {
    systems: [],
    redfish_systems: [],
    isLoaded: false,
  },
  getters: {
    systems: (state) => state.systems,
    redfish_systems: (state) => state.redfish_systems,
    isLoaded: (state) => state.isLoaded,
  },
  mutations: {
    updateIsLoaded(state, bool) {
      Vue.set(state, 'isLoaded', bool);
    },
    setSystemInfo: (state, data) => {
      const system = {};
      system.assetTag = data.AssetTag;
      system.description = data.Description;
      system.firmwareVersion = data.BiosVersion;
      system.hardwareType = data.Name;
      system.health = data.Status?.Health;
      system.totalSystemMemoryGiB = data.MemorySummary?.TotalSystemMemoryGiB;
      system.id = data.Id;
      system.locationIndicatorActive = data.LocationIndicatorActive;
      system.locationNumber = data.Location?.PartLocation?.ServiceLabel;
      system.manufacturer = data.Manufacturer;
      system.model = data.Model;
      system.processorSummaryCount = data.ProcessorSummary?.Count;
      system.processorSummaryCoreCount = data.ProcessorSummary?.CoreCount;
      system.powerState = data.PowerState;
      system.serialNumber = data.SerialNumber;
      system.partNumber = data.PartNumber;
      system.healthRollup = data.Status?.HealthRollup;
      system.subModel = data.SubModel;
      system.statusState = data.Status?.State;
      system.systemType = data.SystemType;
      state.systems[data.index] = system;
      Vue.set(state.systems, data.index, system);
    },
  },
  actions: {
    async getSystem({ state, commit }) {
      return await api
        .get('/redfish/v1/Systems')
        .then(({ data: { Members = [] } }) =>
          Members.map((member, idx) =>
            api.get(member['@odata.id']).then(({ data }) => {
              commit('setSystemInfo', { ...data, index: idx });
              state.redfish_systems.splice(idx, 1, data);
              return data;
            }),
          ),
        )
        .then((promises) => api.allSettled(promises))
        .then(() => {
          commit('updateIsLoaded', true);
          return state.redfish_systems;
        })
        .catch((error) => console.log(error));
    },
    async getSystemsResources({ getters, dispatch }, { name, callback }) {
      if (!getters.isLoaded) await dispatch('getSystem');
      let Systems = getters.redfish_systems;
      let promises = Systems.flatMap(async (system) => {
        if (!(system[name] && system[name]['@odata.id'])) return;
        return await api
          .get(system[name]['@odata.id'])
          .then(async ({data}) => {
            if (data?.Members?.length) {
              const gets = data.Members.map((member) =>
                api
                  .get(member['@odata.id'])
                  .then((data) => {
                    if (callback) callback(data.data);
                    return data.data;
                  })
                  .catch(() => {}),
              );
              return await api.allSettled(gets);
            } 
            else return api.allSettled([data]);
          });
      });
      return await api
        .allSettled(promises.flat())
        .then((response) => {
          // resolved/fulfilled Promises' values
          var results = response
            .filter((result) => result.status === 'fulfilled' && result.value)
            .map((result) => result.value)
            .flat()
            .filter((result) => result.status === 'fulfilled' && result.value)
            .map((result) => result.value);
          return results;
        })
        .catch((error) => console.log(error));
    },
    async getSystemsWithProp({ getters, dispatch }, { prop }) {
      if (!getters.isLoaded) await dispatch('getSystem');
      let Systems = getters.redfish_systems;
      return Systems.filter(system => system.hasOwnProperty(prop));
    },
    async changeIdentifyLedState({ commit }, ledState) {
      return await api
        .patch(`${await this.dispatch('global/getSystemPath')}`, {
          LocationIndicatorActive: ledState,
        })
        .then(() => {
          if (ledState) {
            return i18n.t('pageInventory.toast.successEnableIdentifyLed');
          } else {
            return i18n.t('pageInventory.toast.successDisableIdentifyLed');
          }
        })
        .catch((error) => {
          commit('setSystemInfo', this.state.system.systems[0]);
          console.log('error', error);
          if (ledState) {
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

export default SystemStore;
