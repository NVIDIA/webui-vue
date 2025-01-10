import api from '@/store/api';
import i18n from '@/i18n';

const PowerControlStore = {
  namespaced: true,
  state: {
    powerCapValue: null,
    powerCapUri: '',
    powerConsumptionValue: null,
    hasPowerControl: true,
  },
  getters: {
    powerCapValue: (state) => state.powerCapValue,
    powerCapUri: (state) => state.powerCapUri,
    powerConsumptionValue: (state) => state.powerConsumptionValue,
    hasPowerControl: (state) => state.hasPowerControl,
  },
  mutations: {
    setPowerCapValue: (state, powerCapValue) =>
      (state.powerCapValue = powerCapValue),
    setPowerCapUri: (state, powerCapUri) => (state.powerCapUri = powerCapUri),
    setPowerConsumptionValue: (state, powerConsumptionValue) =>
      (state.powerConsumptionValue = powerConsumptionValue),
    setHasPowerControl: (state, hasPowerControl) =>
      (state.hasPowerControl = hasPowerControl),
  },
  actions: {
    setPowerCapUpdatedValue({ commit }, value) {
      commit('setPowerCapValue', value);
    },
    async getChassisCollection() {
      return await api
        .get('/redfish/v1/')
        .then((response) => api.get(response.data.Chassis['@odata.id']))
        .then(({ data: { Members } }) =>
          Members.map((member) => member['@odata.id']),
        )
        .catch((error) => console.log(error));
    },
    async getPowerControl({ dispatch, commit }) {
      const collection = await dispatch('getChassisCollection');
      if (!collection || collection.length === 0) return;
      return await api
        .get(`${collection[0]}`) //FIXME:  What is this?? It's the BMC Chassis in my case, a terible assumption.
        .then((response) => {
          if (typeof response.data.Power === 'undefined') {
            commit('setHasPowerControl', false);
            throw new Error('noPower');
          }
          return api.get(response.data.Power['@odata.id']);
        })
        .then((response) => {
          const powerControl = response.data.PowerControl;
          if (!powerControl || powerControl.length === 0) return;
          const powerCapUri = response.data['@odata.id'];
          const powerCap = powerControl[0].PowerLimit.LimitInWatts;
          // If system is powered off, power consumption does not exist in the PowerControl
          const powerConsumption = powerControl[0].PowerConsumedWatts || null;
          commit('setPowerCapUri', powerCapUri);
          commit('setPowerCapValue', powerCap);
          commit('setPowerConsumptionValue', powerConsumption);
        })
        .catch((error) => {
          if (error.message === 'noPower')
            console.log('Chassis PowerControl n/a');
          else console.log('Power control', error);
        });
    },
    async setPowerControl({ state }, powerCapValue) {
      const data = {
        PowerControl: [{ PowerLimit: { LimitInWatts: powerCapValue } }],
      };
      return await api
        .patch(state.powerCapUri, data)
        .then(() =>
          i18n.global.t('pageServerPowerOperations.toast.successSaveSettings'),
        )
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.global.t('pageServerPowerOperations.toast.errorSaveSettings'),
          );
        });
    },
  },
};

export default PowerControlStore;
