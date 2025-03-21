import api from '@/store/api';
import i18n from '@/i18n';
import { startManagerStatusCheck } from '@/services/ManagerStatusService';
/**
 * Watch for serverStatus changes in GlobalStore module
 * to set isOperationInProgress state
 * Allows run get API from redfish function starting
 * after the interval of 5 seconds time, then repeating continuously
 * at that interval until serverStatus.State value matches passed argument
 * then Stop watching status changes and resolve Promise.
 * @param {string} serverState
 * @returns {Promise}
 */
const checkForServerState = function (serverState) {
  let unwatch = null;
  let timer = null;

  const cleanup = () => {
    if (unwatch) unwatch();
    if (timer) clearInterval(timer);
  };

  return new Promise((resolve) => {
    unwatch = this.watch(
      (state) => state.global.serverStatus,
      (value) => {
        if (value && value.State === serverState) {
          cleanup();
          resolve();
        }
      },
    );

    timer = setInterval(() => {
      this.dispatch('global/getSystemInfo');
    }, 5000);

    this.dispatch('global/getSystemInfo');
  }).finally(cleanup);
};

const ControlStore = {
  namespaced: true,
  state: {
    isOperationInProgress: false,
    lastPowerOperationTime: null,
    Managers: [],
    managersLoading: false,
    managersError: null,
  },
  getters: {
    isOperationInProgress: (state) => state.isOperationInProgress,
    lastPowerOperationTime: (state) => state.lastPowerOperationTime,
    Managers: (state) => state.Managers,
    isManagersLoading: (state) => state.managersLoading,
    managersError: (state) => state.managersError,
  },
  mutations: {
    setOperationInProgress: (state, inProgress) => {
      state.isOperationInProgress = inProgress;
    },
    setLastPowerOperationTime: (state, lastPowerOperationTime) => {
      state.lastPowerOperationTime = lastPowerOperationTime;
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
    async getLastPowerOperationTime({ commit }) {
      return await api
        .get(`${await this.dispatch('global/getSystemPath')}`)
        .then((response) => {
          const lastReset = response.data.LastResetTime;
          if (lastReset) {
            const lastPowerOperationTime = new Date(lastReset);
            commit('setLastPowerOperationTime', lastPowerOperationTime);
          }
        })
        .catch((error) => console.log(error));
    },
    async rebootBmc({ commit, dispatch }, payload) {
      // Extract target and parameters from payload
      const { target, parameters= { ResetType: 'GracefulRestart' } } = payload;
      const managerId = payload.managerId;

      return await api
        .post(target, parameters)
        // FIXME: Wait a moment for the BMC to reboot?
        .then(() => {
          setTimeout(() => {
            try {
              startManagerStatusCheck();
            } catch (error) {
              console.log(error);
            }
          }, 5000);
          return i18n.global.t('pageRebootBmc.toast.successRebootStart')
        })
        .catch((error) => console.log(error));
    },
    async rebootBmc() {
      const data = { ResetType: 'GracefulRestart' };
      return await api
        .post(target, parameters)
        // FIXME: Wait a moment for the BMC to reboot?
        .then(() => {
          setTimeout(() => {
            startManagerStatusCheck();
          }, 5000);
          return i18n.global.t('pageRebootBmc.toast.successRebootStart')
        })
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.global.t('pageRebootBmc.toast.errorRebootStart'),
          );
        });
    },
    async serverPowerOn({ dispatch, commit }) {
      const data = { ResetType: 'On' };
      dispatch('serverPowerChange', data);
      await checkForServerState.bind(this, 'Enabled')();
      commit('setOperationInProgress', false);
      dispatch('getLastPowerOperationTime');
    },
    async serverSoftReboot({ dispatch, commit }) {
      const data = { ResetType: 'GracefulRestart' };
      dispatch('serverPowerChange', data);
      await checkForServerState.bind(this, 'Enabled')();
      commit('setOperationInProgress', false);
      dispatch('getLastPowerOperationTime');
    },
    async serverHardReboot({ dispatch, commit }) {
      const data = { ResetType: 'ForceRestart' };
      dispatch('serverPowerChange', data);
      await checkForServerState.bind(this, 'Enabled')();
      commit('setOperationInProgress', false);
      dispatch('getLastPowerOperationTime');
    },
    async serverPowerCycle({ dispatch, commit }) {
      const data = { ResetType: 'PowerCycle' };
      dispatch('serverPowerChange', data);
      await checkForServerState.bind(this, 'Enabled')();
      commit('setOperationInProgress', false);
      dispatch('getLastPowerOperationTime');
    },
    async serverSoftPowerOff({ dispatch, commit }) {
      const data = { ResetType: 'GracefulShutdown' };
      dispatch('serverPowerChange', data);
      await checkForServerState.bind(this, 'Disabled')();
      commit('setOperationInProgress', false);
      dispatch('getLastPowerOperationTime');
    },
    async serverHardPowerOff({ dispatch, commit }) {
      const data = { ResetType: 'ForceOff' };
      dispatch('serverPowerChange', data);
      await checkForServerState.bind(this, 'Disabled')();
      commit('setOperationInProgress', false);
      dispatch('getLastPowerOperationTime');
    },
    async serverPowerChange({ commit }, data) {
      commit('setOperationInProgress', true);
      api
        .post(
          `${await this.dispatch('global/getSystemPath')}/Actions/ComputerSystem.Reset`,
          data,
        )
        .catch((error) => {
          console.log(error);
          commit('setOperationInProgress', false);
        });
    },
    async fetchManagersInfo({ commit, dispatch, state }) {
      // Set a loading state
      commit('setManagersLoading', true);
      
      try {
        const managers = await this.dispatch('bmc/getBmcInfo');
        const managersInfo = await Promise.all(managers.map(async (manager) => {
          // Get the reset action info
          const actionInfoUri = manager?.Actions['#Manager.Reset']?.['@Redfish.ActionInfo'];
          const target = manager?.Actions['#Manager.Reset']?.target;
          //FIXME: Check if the actionInfoUri is valid. Otherwise, look for other metadata like:
          /* "ResetType@Redfish.AllowableValues": ["ResetAll" ],*/
          const actionInfoResponse = await api.get(actionInfoUri);
          
          // Extract allowable values for ResetType
          let allowableValues = actionInfoResponse.data.Parameters.find(
            //FIXME: Dynamically find *all* parameters
            param => param.Name === 'ResetType'
          ).AllowableValues || ['GracefulRestart'];

          if (process.env.VUE_APP_ENV_NAME === 'nvidia-gb') {
            allowableValues = ['GracefulRestart'];
          }
          
          // Determine label based on manager ID
          const displayName = manager.Id === 'BMC_0' ? 'BMC' : 
                            manager.Id === 'HGX_BMC_0' ? 'HMC' : 
                            manager.Id;
          
          return {
            ...manager,
            id: manager.Id,
            displayName,
            resetOptions: {
              label: displayName,
              allowableValues,
              target
            }
          };
        }));

        commit('setManagers', managersInfo);
        commit('setManagersError', null);
        return managersInfo;
      } catch (error) {
        console.error('Failed to fetch manager information:', error);
        
        // Set an error state that the UI can display
        commit('setManagersError', {
          message: i18n.global.t('pageRebootBmc.error.failedToLoadManagers'),
          details: error.message,
          timestamp: new Date()
        });
        
        // Use any cached data if available
        if (state.Managers.length === 0) {
          // Fallback to a minimal default state if no data exists
          const bmcPath = await this.dispatch('global/getBmcPath');
          commit('setManagers', [{
            id: 'default',
            displayName: 'BMC',
            lastRebootTime: null,
            resetOptions: {
              label: 'BMC',
              allowableValues: ['GracefulRestart'],
              target: `${bmcPath}/Actions/Manager.Reset`
            }
          }]);
        }
        
        // Schedule a retry
        setTimeout(() => {
          dispatch('fetchManagersInfo');
        }, 30000); // Retry after 30 seconds
        
        return state.Managers;
      } finally {
        commit('setManagersLoading', false);
      }
    },
  },
};

export default ControlStore;
