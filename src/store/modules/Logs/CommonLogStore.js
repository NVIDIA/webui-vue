import api, { getResponseCount } from '@/store/api';
import i18n from '@/i18n';
import Vue from 'vue';

const getHealthStatus = (events, loadedEvents) => {
  let status = loadedEvents ? 'OK' : '';
  if (!events) events = Object.values(CommonLogStore.state.allEvents).flat();
  // Check if events exists and is iterable before looping
  if (!events || !Array.isArray(events)) {
    return status;
  }
  
  for (const event of events) {
    if (!event.Resolved) {
      if (event.Severity === 'Warning') {
        status = 'Warning';
      }
      if (event.Severity === 'Critical') {
        status = 'Critical';
        break;
      }
    }
  }

  return status;
};

// TODO: High priority events should also check if Log
// is resolved when the property is available in Redfish
const getHighPriorityEvents = (events) =>
  events.filter(({ Severity }) => Severity === 'Critical');

const CommonLogStore = {
  namespaced: true,
  state: {
    logType: '',
    allEvents: {},
    loadedEvents: false,
    logServiceUris: null,
    logServices: {},
    isInitialized: false,
    systemId: null,
  },
  getters: {
    getAllEventsByValue: (state) => (value = state.systemId) => state.allEvents[value] ?? [],
    highPriorityEvents: (state) => (value = state.systemId) => getHighPriorityEvents(state.allEvents[value]),
    healthStatus: (state) => getHealthStatus(null, state.loadedEvents),
    isInitialized: (state) => state.isInitialized,
    logServices: (state) => state.logServices,
  },
  mutations: {
    setAllEvents: (state, { Members, value }) => (
      (Vue.set(state.allEvents, value, Members)), (state.loadedEvents = true)
    ),
    setLogServiceUris: (state, uris) => (state.logServiceUris = uris),
    setInitialized: (state, value) => (state.isInitialized = value),
    setLogServices: (state, services) => {
      state.logServices = services;
    },
  },
  actions: {
    async initializeLogStore({ dispatch, commit, rootGetters, state }) {
      try {
        state.systemId = await rootGetters['global/systemId'];
        if (!state.systemId) await dispatch('global/getSystemInfo', null, { root: true });
        state.systemId = await rootGetters['global/systemId'];
        await dispatch('fetchLogServices');
        commit('setInitialized', true);
      } catch (error) {
        console.log('Failed to initialize log store:', error);
        throw error;
      }
    },
    async fetchLogServices({ state, commit }) {
      const systems = 
        await this.dispatch('system/getSystemsWithProp', {
          prop: 'LogServices',
        });
      systems.forEach((element) => element.TYPE="System");
      let promises = systems.map(async (service) => {
        let uri = service["LogServices"]?.['@odata.id'];
        if (!uri) return null;
        
        let id = service.Id;
        let translationToken = '';
        if (service.TYPE == "System" && id == state.systemId) translationToken = "system" + state.logType;
        else if (service.TYPE == "System" && id == "HGX_Baseboard_0") translationToken = "systemHgx" + state.logType;
        
        try {
          const { data: { Members = [] } } = await api.get(uri);
          const member = Members.find((o) => o?.['@odata.id']?.endsWith('/' + state.logType));
          if (!member) return null;
          const { data } = await api.get(member['@odata.id']);
          data.text = translationToken;
          data.type = service.TYPE;
          data.value = id;
          return data;
        } catch (error) {
          console.error('Error fetching log service:', error);
          return null;
        }
      });
      const results = await api.allSettled(promises);
      const servicesArray = results
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);
      
      // Convert array to object with service.value as keys
      const servicesObject = {};
      servicesArray.forEach(service => {
        if (service && service.value) {
          servicesObject[service.value] = service;
        }
      });
      
      commit('setLogServices', servicesObject);
      return servicesObject;
    },
    async getLogData({ dispatch, commit, state }, LogService) {
      state.loadedEvents = false;
      if (!state.isInitialized) {
        await dispatch('initializeLogStore');
      }

      let entries = LogService?.Entries?.['@odata.id'];
      if (!entries) {
         LogService = state.logServices[state.systemId];
         entries = LogService?.Entries?.['@odata.id'];
      }
      if (!entries) return;

      return await api
        .get(entries)
        .then(({ data: { Members = [] } = {} }) => {
          if (Members.length > 0) {
            commit('setAllEvents', { Members: Members, value: LogService.value });
          }
        })
        .catch((error) => {
          console.log('Event Log Data:', error);
        });
    },
    async deleteAllLogs({ dispatch }, { data, LogService = state.logServices[state.systemId] }) {
      let clearLog = LogService?.Actions?.['#LogService.ClearLog']?.target;
      if (!clearLog) throw new Error(i18n.global.t('pageEventLogs.toast.errorDelete', data.length));
      return await api
        .post(clearLog)
        .then(() => dispatch('getLogData'))
        .then(() => i18n.global.t('pageEventLogs.toast.successDelete', data.length))
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.global.t('pageEventLogs.toast.errorDelete', data.length),
          );
        });
    },
    async deleteLogs({ dispatch }, uris = []) {
      const promises = uris.map((uri) =>
        api.delete(uri).catch((error) => {
          console.log(error);
          return error;
        }),
      );
      return await api
        .all(promises)
        .then((response) => {
          dispatch('getLogData');
          return response;
        })
        .then(
          api.spread((...responses) => {
            const { successCount, errorCount } = getResponseCount(responses);
            const toastMessages = [];

            if (successCount) {
              const message = i18n.global.t(
                'pageEventLogs.toast.successDelete',
                successCount,
              );
              toastMessages.push({ type: 'success', message });
            }

            if (errorCount) {
              const message = i18n.global.t(
                'pageEventLogs.toast.errorDelete',
                errorCount,
              );
              toastMessages.push({ type: 'error', message });
            }

            return toastMessages;
          }),
        );
    },
    async toggleLogsResolvedStatus({ dispatch }, { logs, resolved = true }) {
      const promises = logs.map((log) =>
        api.patch(log?.['@odata.id'], { Resolved: resolved }).catch((error) => {
          console.log(error);
          return error;
        }),
      );
      return await api
        .all(promises)
        .then((response) => {
          dispatch('getLogData');
          return response;
        })
        .then(
          api.spread((...responses) => {
            const { successCount, errorCount } = getResponseCount(responses);
            const toastMessages = [];
            if (successCount) {
              const successKey = resolved
                ? 'pageEventLogs.toast.successResolveLogs'
                : 'pageEventLogs.toast.successUnresolveLogs';
              const message = i18n.global.t(successKey, successCount);
              toastMessages.push({ type: 'success', message });
            }
            if (errorCount) {
              const errorKey = resolved
                ? 'pageEventLogs.toast.errorResolveLogs'
                : 'pageEventLogs.toast.errorUnresolveLogs';
              const message = i18n.global.t(errorKey, errorCount);
              toastMessages.push({ type: 'error', message });
            }
            return toastMessages;
          }),
        );
    },
    // Single log entry
    async updateLogStatus({ dispatch }, log) {
      const updatedEventLogStatus = log.status;
      return await api
        .patch(log.uri, { Resolved: updatedEventLogStatus })
        .then(() => {
          dispatch('getLogData');
        })
        .then(() => {
          if (log.status) {
            return i18n.global.t('pageEventLogs.toast.successResolveLogs', 1);
          } else {
            return i18n.global.t('pageEventLogs.toast.successUnresolveLogs', 1);
          }
        })
        .catch((error) => {
          console.log(error);
          throw new Error(i18n.global.t('pageEventLogs.toast.errorLogStatusUpdate'));
        });
    },
    async downloadEntry(_, uri) {
      return await api
        .get(uri, {
          headers: {
            Accept: 'application/octet-stream',
          },
        })
        .then((response) => {
          const blob = new Blob([response.data], {
            type: response.headers['content-type'],
          });
          return blob;
        })
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.global.t('pageEventLogs.toast.errorDownloadEventEntry'),
          );
        });
    },
  },
};

export default CommonLogStore;
