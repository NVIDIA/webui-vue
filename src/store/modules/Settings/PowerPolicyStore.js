import api from '@/store/api';
import i18n from '@/i18n';

const PowerPolicyStore = {
  namespaced: true,
  state: {
    powerRestoreCurrentPolicy: null,
    powerRestorePolicies: [],
  },
  getters: {
    powerRestoreCurrentPolicy: (state) => state.powerRestoreCurrentPolicy,
    powerRestorePolicies: (state) => state.powerRestorePolicies,
  },
  mutations: {
    setPowerRestoreCurrentPolicy: (state, powerRestoreCurrentPolicy) =>
      (state.powerRestoreCurrentPolicy = powerRestoreCurrentPolicy),
    setPowerRestorePolicies: (state, PowerRestorePolicyTypes) => {
      const PowerTypes = PowerRestorePolicyTypes ||  {
        "description": "The enumerations of `PowerRestorePolicyTypes` specify the choice of power state for the system when power is applied.",
        "enum": [
            "AlwaysOn",
            "AlwaysOff",
            "LastState"
        ],
        "enumDescriptions": {
            "AlwaysOff": "The system always remains powered off when power is applied.",
            "AlwaysOn": "The system always powers on when power is applied.",
            "LastState": "The system returns to its last on or off power state when power is applied."
        },
        "type": "string"
      };
      const powerPoliciesData = PowerTypes.enum.map(
        (powerState) => {
          let desc = `${i18n.t(
            `pagePowerRestorePolicy.policies.${powerState}`,
          )} - ${PowerTypes.enumDescriptions[powerState]}`;
          return {
            state: powerState,
            desc,
          };
        },
      );
      state.powerRestorePolicies = powerPoliciesData;
    }
  },
  actions: {
    async getPowerRestorePolicies({ commit }) {
      return await api
        .get('/redfish/v1/JsonSchemas/ComputerSystem/')
        .then(
          ({
            data: {
              Location
            }
          }) => api.get(Location[0].Uri)
        )
        .then(
          ({
            data: {
              definitions: { PowerRestorePolicyTypes = {} },
            },
          }) => {
            commit('setPowerRestorePolicies', PowerRestorePolicyTypes);
          },
        ).catch(_error => {
          commit('setPowerRestorePolicies', null);
        });
    },
    async getPowerRestoreCurrentPolicy({ commit }) {
      return await api
        .get(`${await this.dispatch('global/getSystemPath')}`)
        .then(({ data: { PowerRestorePolicy } }) => {
          commit('setPowerRestoreCurrentPolicy', PowerRestorePolicy);
        })
        .catch((error) => console.log(error));
    },
    async setPowerRestorePolicy({ dispatch }, powerPolicy) {
      const data = { PowerRestorePolicy: powerPolicy };

      return await api
        .patch(`${await this.dispatch('global/getSystemPath')}`, data)
        .then(() => {
          dispatch('getPowerRestoreCurrentPolicy');
          return i18n.t('pagePowerRestorePolicy.toast.successSaveSettings');
        })
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.t('pagePowerRestorePolicy.toast.errorSaveSettings'),
          );
        });
    },
  },
};

export default PowerPolicyStore;
