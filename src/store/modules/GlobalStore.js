import api from '@/store/api';

const GlobalStore = {
  namespaced: true,
  state: {
    assetTag: null,
    bmcPath: null,
    bmcTime: null,
    modelType: null,
    serialNumber: null,
    serverStatus: '',
    powerState: '',
    languagePreference: localStorage.getItem('storedLanguage') || 'en-US',
    isUtcDisplay: localStorage.getItem('storedUtcDisplay')
      ? JSON.parse(localStorage.getItem('storedUtcDisplay'))
      : true,
    username: localStorage.getItem('storedUsername'),
    isAuthorized: true,
    userPrivilege: null,
    serviceRoot: null,
    systemPath: null,
  },
  getters: {
    assetTag: (state) => state.assetTag,
    modelType: (state) => state.modelType,
    serialNumber: (state) => state.serialNumber,
    serverStatus: (state) => state.serverStatus,
    powerState: (state) => state.powerState,
    isPowerOff: (state) => state.powerState.toLowerCase() === 'off',
    bmcPath: (state) => state.bmcPath,
    bmcTime: (state) => state.bmcTime,
    languagePreference: (state) => state.languagePreference,
    isUtcDisplay: (state) => state.isUtcDisplay,
    username: (state) => state.username,
    isAuthorized: (state) => state.isAuthorized,
    userPrivilege: (state) => state.userPrivilege,
    serviceRoot: (state) => state.serviceRoot,
    systemPath: (state) => state.systemPath,
  },
  mutations: {
    setAssetTag: (state, assetTag) => (state.assetTag = assetTag),
    setModelType: (state, modelType) => (state.modelType = modelType),
    setSerialNumber: (state, serialNumber) =>
      (state.serialNumber = serialNumber),
    setBmcTime: (state, bmcTime) => (state.bmcTime = bmcTime),
    setServerStatus: (state, serverState) => (state.serverStatus = serverState),
    setPowerState: (state, powerState) => (state.powerState = powerState),
    setServiceRoot: (state, serviceRoot) => {
      state.serviceRoot = serviceRoot.data;
      state.bmcPath = serviceRoot.data?.ManagerProvidingService?.['@odata.id'];
    },
    setLanguagePreference: (state, language) =>
      (state.languagePreference = language),
    setUsername: (state, username) => (state.username = username),
    setUtcTime: (state, isUtcDisplay) => (state.isUtcDisplay = isUtcDisplay),
    setUnauthorized: (state) => {
      state.isAuthorized = false;
      window.setTimeout(() => {
        state.isAuthorized = true;
      }, 100);
    },
    setPrivilege: (state, privilege) => {
      state.userPrivilege = privilege;
    },
    setSystemPath: (state, systemPath) => (state.systemPath = systemPath),
  },
  actions: {
    async fetchServiceRoot({ commit }) {
      try {
        commit('setServiceRoot', await api.get('/redfish/v1'), {timeout: 60 * 1000});
      } catch (error) {
        console.log(error);
      }
    },
    async getBmcPath({ dispatch, state }) {
      if (!state.serviceRoot) dispatch('fetchServiceRoot');
      if (!state.bmcPath) {
        const managers = await api
          .get('/redfish/v1/Managers', {timeout: 60 * 1000})
          .catch((error) => console.log(error));
        state.bmcPath = managers.data?.Members?.[0]?.['@odata.id'];
      }
      return state.bmcPath;
    },
    async getSystemPath({ state, commit }) {
      if (state.systemPath) return state.systemPath;
      const systems = await api
        .get('/redfish/v1/Systems')
        .catch((error) => console.log(error));
      let systemPath = systems.data?.Members?.[0]?.['@odata.id'];
      commit('setSystemPath', systemPath);
      return systemPath;
    },
    async getBmcTime({ commit }) {
      return await api
        .get(`${await this.dispatch('global/getBmcPath')}`)
        .then((response) => {
          const bmcDateTime = response.data.DateTime;
          const date = new Date(bmcDateTime);
          commit('setBmcTime', date);
          return date;
        })
        .catch((error) => console.log(error));
    },
    async getSystemInfo({ commit }) {
      api
        .get(`${await this.dispatch('global/getSystemPath')}`)
        .then(
          ({
            data: {
              AssetTag,
              Model,
              PowerState,
              SerialNumber,
              Status: { State } = {},
            },
          } = {}) => {
            commit('setAssetTag', AssetTag);
            commit('setSerialNumber', SerialNumber);
            commit('setModelType', Model);
            commit('setServerStatus', State);
            commit('setPowerState', PowerState);
          },
        )
        .catch((error) => console.log(error));
    },
  },
};

export default GlobalStore;
