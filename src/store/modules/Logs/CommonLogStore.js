import api, { getResponseCount } from '@/store/api';
import i18n from '@/i18n';

const getHealthStatus = (events, loadedEvents) => {
  let status = loadedEvents ? 'OK' : '';
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
    allEvents: [],
    loadedEvents: false,
    logServiceUris: null,
  },
  getters: {
    allEvents: (state) => state.allEvents,
    highPriorityEvents: (state) => getHighPriorityEvents(state.allEvents),
    healthStatus: (state) =>
      getHealthStatus(state.allEvents, state.loadedEvents),
  },
  mutations: {
    setAllEvents: (state, allEvents) => (
      (state.allEvents = allEvents), (state.loadedEvents = true)
    ),
    setLogServiceUris: (state, uris) => (state.logServiceUris = uris),
  },
  actions: {
    async getLogServiceBaseUri({ state }) {
      return await api
        .get(`${await this.dispatch('global/getSystemPath')}`)
        .then(({ data: { LogServices } }) =>
          api.get(LogServices?.['@odata.id']),
        )
        .then(({ data: { Members = [] } }) => {
          const member = Members.find((o) =>
            o?.['@odata.id']?.endsWith('/' + state.logType),
          );
          return member?.['@odata.id'];
        })
        .catch((error) => {
          console.log(error);
        });
    },
    async getLogServiceUris({ state, dispatch, commit }) {
      if (state.logServiceUris != null) return state.logServiceUris;

      const logUri = await dispatch('getLogServiceBaseUri');
      return await api
        .get(logUri)
        .then(({ data: { Entries = {}, Actions = {} } }) => {
          const uris = {
            entries: Entries?.['@odata.id'],
            clearLog: Actions?.['#LogService.ClearLog']?.target,
          };
          commit('setLogServiceUris', uris);
          return uris;
        })
        .catch((error) => {
          console.log(error);
        });
    },
    async getLogData({ dispatch, commit }) {
      return await api
        .get((await dispatch('getLogServiceUris'))?.entries)
        .then(({ data: { Members = [] } = {} }) => {
          commit('setAllEvents', Members);
        })
        .catch((error) => {
          console.log('Event Log Data:', error);
        });
    },
    async deleteAllLogs({ dispatch }, data) {
      return await api
        .post((await dispatch('getLogServiceUris'))?.clearLog)
        .then(() => dispatch('getLogData'))
        .then(() => i18n.tc('pageEventLogs.toast.successDelete', data.length))
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.tc('pageEventLogs.toast.errorDelete', data.length),
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
              const message = i18n.tc(
                'pageEventLogs.toast.successDelete',
                successCount,
              );
              toastMessages.push({ type: 'success', message });
            }

            if (errorCount) {
              const message = i18n.tc(
                'pageEventLogs.toast.errorDelete',
                errorCount,
              );
              toastMessages.push({ type: 'error', message });
            }

            return toastMessages;
          }),
        );
    },
    async resolveLogs({ dispatch }, logs) {
      const promises = logs.map((log) =>
        api.patch(log?.['@odata.id'], { Resolved: true }).catch((error) => {
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
              const message = i18n.tc(
                'pageEventLogs.toast.successResolveLogs',
                successCount,
              );
              toastMessages.push({ type: 'success', message });
            }
            if (errorCount) {
              const message = i18n.tc(
                'pageEventLogs.toast.errorResolveLogs',
                errorCount,
              );
              toastMessages.push({ type: 'error', message });
            }
            return toastMessages;
          }),
        );
    },
    async unresolveLogs({ dispatch }, logs) {
      const promises = logs.map((log) =>
        api.patch(log?.['@odata.id'], { Resolved: false }).catch((error) => {
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
              const message = i18n.tc(
                'pageEventLogs.toast.successUnresolveLogs',
                successCount,
              );
              toastMessages.push({ type: 'success', message });
            }
            if (errorCount) {
              const message = i18n.tc(
                'pageEventLogs.toast.errorUnresolveLogs',
                errorCount,
              );
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
            return i18n.tc('pageEventLogs.toast.successResolveLogs', 1);
          } else {
            return i18n.tc('pageEventLogs.toast.successUnresolveLogs', 1);
          }
        })
        .catch((error) => {
          console.log(error);
          throw new Error(i18n.t('pageEventLogs.toast.errorLogStatusUpdate'));
        });
    },
    async downloadEntry(_, uri) {
      return await api
        .get(uri)
        .then((response) => {
          const blob = new Blob([response.data], {
            type: response.headers['content-type'],
          });
          return blob;
        })
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.t('pageEventLogs.toast.errorDownloadEventEntry'),
          );
        });
    },
  },
};

export default CommonLogStore;
