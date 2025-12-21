import api from '@/store/api';
import { getOdataId } from '@/utilities/redfishUtils';

const HOST_STATE = {
  on: 'xyz.openbmc_project.State.Host.HostState.Running',
  off: 'xyz.openbmc_project.State.Host.HostState.Off',
  error: 'xyz.openbmc_project.State.Host.HostState.Quiesced',
  diagnosticMode: 'xyz.openbmc_project.State.Host.HostState.DiagnosticMode',
};

const privilegesId = {
  admin: 'Administrator',
  operator: 'Operator',
  readOnly: 'ReadOnly',
};

const serverStateMapper = (hostState) => {
  switch (hostState) {
    case HOST_STATE.on:
    case 'On': // Redfish PowerState
      return 'on';
    case HOST_STATE.off:
    case 'Off': // Redfish PowerState
      return 'off';
    case HOST_STATE.error:
    case 'Quiesced': // Redfish Status
      return 'error';
    case HOST_STATE.diagnosticMode:
    case 'InTest': // Redfish Status
      return 'diagnosticMode';
    default:
      return 'unreachable';
  }
};
const GlobalStore = {
  namespaced: true,
  state: {
    ManagerProvidingService: null,
    bmcPath: null,
    languagePreference: localStorage.getItem('storedLanguage') || 'en-US',
    isUtcDisplay: localStorage.getItem('storedUtcDisplay')
      ? JSON.parse(localStorage.getItem('storedUtcDisplay'))
      : true,
    username: localStorage.getItem('storedUsername'),
    healthStatus: null, //"enum": ["OK","Warning","Critical"] || null
    isAuthorized: true,
    userPrivilege: null,
    serviceRoot: null,
    systemPath: null,
    system: null,
    chassisPath: null,
    lastPowerOperationTime: null,
  },
  getters: {
    assetTag: (state) => state.system?.AssetTag || null,
    modelType: (state) => state.system?.Model || null,
    serialNumber: (state) => state.system?.SerialNumber || null,
    serverStatus: (state) => state.system?.Status || null,
    powerState: (state) => state.system?.PowerState || null,
    isPowerOff: (state, getters) => getters.powerState?.toLowerCase() === 'off',
    bmcPath: (state) => state.bmcPath,
    languagePreference: (state) => state.languagePreference,
    isUtcDisplay: (state) => state.isUtcDisplay,
    username: (state) => state.username,
    healthStatus: (state) => state.healthStatus,
    isAuthorized: (state) => state.isAuthorized,
    userPrivilege: (state) => state.userPrivilege,
    serviceRoot: (state) => state.serviceRoot,
    systemPath: (state) => state.systemPath,
    chassisPath: (state) => state.chassisPath,
    systemId: (state) => state.system?.Id || null,
    locationIndicatorActive: (state) => state.system?.LocationIndicatorActive || null,
    lastPowerOperationTime: (state) => state.lastPowerOperationTime,
    manufacturer: (state) => state.system?.Manufacturer || null,
  },
  mutations: {
    setServiceRoot: (state, serviceRoot) => {
      state.serviceRoot = serviceRoot.data;
      state.bmcPath = getOdataId(serviceRoot.data?.ManagerProvidingService);
    },
    setHealthStatus: (state, healthStatus) => (state.healthStatus = healthStatus),
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
    setChassisPath: (state, chassisPath) => (state.chassisPath = chassisPath),
    setSystem: (state, system) => (state.system = system),
    setLastPowerOperationTime: (state, lastPowerOperationTime) => 
      (state.lastPowerOperationTime = lastPowerOperationTime),
  },
  actions: {
    async fetchServiceRoot({ commit }) {
      try {
        commit(
          'setServiceRoot',
          await api.get('/redfish/v1', { timeout: 60 * 1000 }),
        );
      } catch (error) {
        console.log(error);
      }
    },
    async fetchHealthStatus({ commit, dispatch, state, rootGetters }) {
      try {
        const systemResponse = await dispatch('getSystemInfo');
        const healthRollup = systemResponse?.Status?.HealthRollup;
        if (healthRollup) {
          return healthRollup;
        }

        // Step 1: Fetch the MetricReports URI
        const telemetryResponse = await api.get('/redfish/v1/TelemetryService/');
        const metricReportsUri = getOdataId(telemetryResponse?.data?.MetricReports);
        if (!metricReportsUri) throw new Error('MetricReports URI not found');

        // Step 2: Fetch the MetricReports
        const metricReportsResponse = await api.get(metricReportsUri);
        if (!metricReportsResponse) throw new Error('MetricReports response is undefined');

        const healthMetricsMember = metricReportsResponse?.data?.Members?.find(member => {
          const uriSegments = getOdataId(member)?.split('/') || [];
          const lastSegment = uriSegments[uriSegments.length - 1];
          return lastSegment.includes('HealthMetrics');
        });
        const healthMetricsUri = getOdataId(healthMetricsMember);

        if (!healthMetricsUri) throw new Error('HealthMetrics URI not found');

        // Step 3: Fetch the HealthMetrics data
        const healthMetricsResponse = await api.get(healthMetricsUri);
        if (!healthMetricsResponse) throw new Error('HealthMetrics response is undefined');

        const healthMetrics = healthMetricsResponse.data;

        // Step 4: Determine the health status
        let healthStatus = 'OK';
        for (const metric of healthMetrics.MetricValues) {
          if (metric.MetricValue === 'Critical') {
            healthStatus = 'Critical';
            break;
          } else if (metric.MetricValue === 'Warning') {
            healthStatus = 'Warning';
          }
        }

        // Commit the health status to the store
        commit('setHealthStatus', healthStatus);
      } catch (error) {
        console.log(error);

        // Ensure eventLog store is initialized
        if (!rootGetters['eventLog/isInitialized'] || rootGetters['eventLog/healthStatus'] === "") {
          await dispatch('eventLog/initializeLogStore', null, { root: true });
          // Wait for log data to be fetched
          await dispatch('eventLog/getLogData', null, { root: true });
        }

        // Fallback: Get health status from eventLog store
        const eventLogHealthStatus = rootGetters['eventLog/healthStatus'];
        if (eventLogHealthStatus) {
          commit('setHealthStatus', eventLogHealthStatus);
        } else {
          commit('setHealthStatus', null);
        }
      }
      return state.healthStatus;
    },
    async getBmcPath({ dispatch, state }) {
      if (!state.serviceRoot) await dispatch('fetchServiceRoot');
      if (!state.bmcPath) {
        const managers = await api
          .get('/redfish/v1/Managers', {timeout: 60 * 1000})
          .catch((error) => console.log(error));
        // Note: This is only set here if ManagerProvidingService is not found in the service root
        state.bmcPath = getOdataId(managers?.data?.Members?.[0]);
      }
      return state.bmcPath;
    },
    async getSystemPath({ state, commit, dispatch }) {
      // Ensure serviceRoot is available
      if (!state.serviceRoot) await dispatch('fetchServiceRoot');
      if (state.systemPath) return state.systemPath;
      if (!state.bmcPath) await dispatch('getBmcPath');
      if (!state.ManagerProvidingService) state.ManagerProvidingService = (await api.get(state.bmcPath)).data;
      if (!state.ManagerProvidingService) throw new Error('BMC not found');
      let systemPath = state.ManagerProvidingService && state.ManagerProvidingService.Links && state.ManagerProvidingService.Links.ManagerForServers && state.ManagerProvidingService.Links.ManagerForServers[0] ? getOdataId(state.ManagerProvidingService.Links.ManagerForServers[0]) : null;
      if (!systemPath) {
        const systems = await api
          .get('/redfish/v1/Systems')
          .catch((error) => console.log(error));
        // Note: This is only set here if ManagerForServers is not found in the ManagerProvidingService
        systemPath = systems && systems.data && systems.data.Members && systems.data.Members[0] ? getOdataId(systems.data.Members[0]) : null;
      }
      
      commit('setSystemPath', systemPath);
      return systemPath;
    },
    async getChassisPath({ state, commit, dispatch }) {
      if (state.chassisPath) return state.chassisPath;
      if (!state.bmcPath) await dispatch('getBmcPath');
      if (!state.ManagerProvidingService) state.ManagerProvidingService = (await api.get(state.bmcPath)).data;
      if (!state.ManagerProvidingService) throw new Error('BMC not found');
      let chassisPath = state.ManagerProvidingService && state.ManagerProvidingService.Links && state.ManagerProvidingService.Links.ManagerForChassis && state.ManagerProvidingService.Links.ManagerForChassis[0] ? getOdataId(state.ManagerProvidingService.Links.ManagerForChassis[0]) : null;
      if (!chassisPath) {
        const chassis = await api
          .get('/redfish/v1/Chassis')
          .catch((error) => console.log(error));
        // Note: This is only set here if ManagerForChassis is not found in the ManagerProvidingService
        chassisPath = chassis && chassis.data && chassis.data.Members && chassis.data.Members[0] ? getOdataId(chassis.data.Members[0]) : null;
      }
      commit('setChassisPath', chassisPath);
      return chassisPath;
    },
    async getSystemInfo({ commit, dispatch, state }) {
      if (!state.systemPath) await dispatch('getSystemPath');
      return api
        .get(state.systemPath)
        .then(({ data }) => {
          commit('setSystem', data);
          // See if the root system has a valid Status.healthRollup property
          const healthRollup = data && data.Status && data.Status.HealthRollup ? data.Status.HealthRollup : null;
          if (healthRollup) {
            commit('setHealthStatus', healthRollup);
          }
          // See if the root system has a valid LastResetTime property
          const lastReset = data && data.LastResetTime ? data.LastResetTime : null;
          if (lastReset) {
            const lastPowerOperationTime = new Date(lastReset);
            commit('setLastPowerOperationTime', lastPowerOperationTime);
          }
          return data;
        })
        .catch((error) => console.log(error));
    },
  },
};
export { GlobalStore, serverStateMapper, privilegesId };

export default GlobalStore;
