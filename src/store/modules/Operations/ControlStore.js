import api from '@/store/api';
import i18n from '@/i18n';

/**
 * Watch for serverStatus changes in GlobalStore module
 * to set isOperationInProgress state
 * Allows run get API from redfish function starting
 * after the interval of 5 seconds time, then repeating continuously
 * at that interval until serverStatus value matches passed argument
 * then Stop watching status changes and resolve Promise.
 * @param {string} serverStatus
 * @returns {Promise}
 */
const checkForServerStatus = function (serverStatus) {
  return new Promise((resolve) => {
    const timer = setInterval(async () => {
      this.dispatch('global/getSystemInfo');
      resolve();
      unwatch();
    }, 5000 /*5seconds*/);
    const unwatch = this.watch(
      (state) => state.global.serverStatus,
      (value) => {
        if (value === serverStatus) {
          resolve();
          unwatch();
          clearInterval(timer);
        }
      },
    );
  });
};

const ControlStore = {
  namespaced: true,
  state: {
    isOperationInProgress: false,
    lastPowerOperationTime: null,
    lastBmcRebootTime: null,
  },
  getters: {
    isOperationInProgress: (state) => state.isOperationInProgress,
    lastPowerOperationTime: (state) => state.lastPowerOperationTime,
    lastBmcRebootTime: (state) => state.lastBmcRebootTime,
  },
  mutations: {
    setOperationInProgress: (state, inProgress) =>
      (state.isOperationInProgress = inProgress),
    setLastPowerOperationTime: (state, lastPowerOperationTime) =>
      (state.lastPowerOperationTime = lastPowerOperationTime),
    setLastBmcRebootTime: (state, lastBmcRebootTime) =>
      (state.lastBmcRebootTime = lastBmcRebootTime),
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
    async getLastBmcRebootTime({ commit }) {
      return api
        .get(`${await this.dispatch('global/getBmcPath')}`)
        .then((response) => {
          const lastBmcReset = response.data.LastResetTime;
          const lastBmcRebootTime = new Date(lastBmcReset);
          commit('setLastBmcRebootTime', lastBmcRebootTime);
        })
        .catch((error) => console.log(error));
    },
    async rebootBmc() {
      const data = { ResetType: 'GracefulRestart' };
      return await api
        .post(
          `${await this.dispatch('global/getBmcPath')}/Actions/Manager.Reset`,
          data,
        )
        .then(() => i18n.t('pageRebootBmc.toast.successRebootStart'))
        .catch((error) => {
          console.log(error);
          throw new Error(i18n.t('pageRebootBmc.toast.errorRebootStart'));
        });
    },
    async serverPowerOn({ dispatch, commit }) {
      const data = { ResetType: 'On' };
      dispatch('serverPowerChange', data);
      await checkForServerStatus.bind(this, 'on')();
      commit('setOperationInProgress', false);
      dispatch('getLastPowerOperationTime');
    },
    async serverSoftReboot({ dispatch, commit }) {
      const data = { ResetType: 'GracefulRestart' };
      dispatch('serverPowerChange', data);
      await checkForServerStatus.bind(this, 'on')();
      commit('setOperationInProgress', false);
      dispatch('getLastPowerOperationTime');
    },
    async serverHardReboot({ dispatch, commit }) {
      const data = { ResetType: 'ForceRestart' };
      dispatch('serverPowerChange', data);
      await checkForServerStatus.bind(this, 'on')();
      commit('setOperationInProgress', false);
      dispatch('getLastPowerOperationTime');
    },
    async serverPowerCycle({ dispatch, commit }) {
      const data = { ResetType: 'PowerCycle' };
      dispatch('serverPowerChange', data);
      await checkForServerStatus.bind(this, 'on')();
      commit('setOperationInProgress', false);
      dispatch('getLastPowerOperationTime');
    },
    async serverSoftPowerOff({ dispatch, commit }) {
      const data = { ResetType: 'GracefulShutdown' };
      dispatch('serverPowerChange', data);
      await checkForServerStatus.bind(this, 'off')();
      commit('setOperationInProgress', false);
      dispatch('getLastPowerOperationTime');
    },
    async serverHardPowerOff({ dispatch, commit }) {
      const data = { ResetType: 'ForceOff' };
      dispatch('serverPowerChange', data);
      await checkForServerStatus.bind(this, 'off')();
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
  },
};

export default ControlStore;
