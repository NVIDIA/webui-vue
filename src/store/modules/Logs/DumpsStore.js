import api, { getResponseCount } from '@/store/api';
import i18n from '@/i18n';
import Vue from 'vue';

const DumpsStore = {
  namespaced: true,
  state: {
    allDumps: [],
    dumpTypeOptions: [],
    dumpServices: [],
    isInitialized: false,
  },
  getters: {
    allDumps: (state) => state.allDumps,
    isInitialized: (state) => state.isInitialized,
  },
  mutations: {
    setAllDumps: (state, dumps) => {
      state.allDumps = dumps;
    },
    setDumpTypeOptions: (state, value) => {
      state.dumpTypeOptions = value;
    },
    setInitialized: (state, value) => {
      state.isInitialized = value;
    },
    setDumpServices: (state, services) => {
      state.dumpServices = services;
    },
  },
  actions: {
    async initializeDumpStore({ dispatch, commit }) {
      try {
        await dispatch('fetchDumpServices');
        commit('setInitialized', true);
      } catch (error) {
        console.error('Failed to initialize dump store:', error);
        throw error;
      }
    },
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
    getDumpTypeOptions_static() { 
      let options = [{
        "AllowableValues": [
          "Manager"
        ],
        "value": "BMC_0",
        "text": "BMC dump",
        "_type": "Bmc"
      }];
      return process.env.VUE_APP_HIDE_SYSTEM_DUMP === 'true'
           ? options
           : [ ...options,
            {
              "AllowableValues": [
                "DiagnosticType=FPGA",
                "DiagnosticType=ROT",
                "DiagnosticType=FirmwareAttributes",
                "DiagnosticType=HardwareCheckout"
              ],
              "value": "HGX_Baseboard_0",
              "text": "System [HGX] dump (disruptive)",
              "_type": "System"
            }
          ];
    },
    async fetchDumpServices({ state, commit }) {
      const systems = process.env.VUE_APP_HIDE_SYSTEM_DUMP === 'true' ? [] :
        await this.dispatch('system/getSystemsWithProp', {
          prop: 'LogServices',
        });
      systems.forEach((element) => element.TYPE="System");
      const managers = await this.dispatch('bmc/getBmcInfo');
      managers.forEach((element) => element.TYPE="Bmc");

      let promises = systems.concat(managers).map(async (service) => {
        let uri = service["LogServices"]?.['@odata.id'];
        if (!uri) return null;
        
        let id = service.Id;
        let translationToken = '';
        if (service.TYPE == "Bmc" && id == "HGX_BMC_0") translationToken = "hmcDump";
        else if (service.TYPE == "Bmc") translationToken = "bmcDump";
        else if (service.TYPE == "System" && id == "System_0") translationToken = "systemBmcDump";
        else if (service.TYPE == "System" && id == "HGX_Baseboard_0") translationToken = "systemHgxDump";
        
        try {
          const { data: { Members = [] } } = await api.get(uri);
          const member = Members.find((o) => o?.['@odata.id']?.endsWith('/Dump'));
          if (!member) return null;
          
          const { data } = await api.get(member['@odata.id']);
          data.TEXT = translationToken;
          data.TYPE = service.TYPE;
          data.VALUE = id;
          return data;
        } catch (error) {
          console.error('Error fetching dump service:', error);
          return null;
        }
      });
      
      const results = await api.allSettled(promises);
      const services = results
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);
      
      commit('setDumpServices', services);
      return services;
    },
    async getDumpTypeOptions({ state, commit, dispatch }) {
      if (!state.isInitialized) {
        await dispatch('initializeDumpStore');
      }
      
      const services = state.dumpServices;
      let promises = services.map(async (service) => {
        let info = service?.Actions?.["#LogService.CollectDiagnosticData"]?.["@Redfish.ActionInfo"];
        let target = service?.Actions?.["#LogService.CollectDiagnosticData"]?.target;
        if (info) return api.get(info)
          .then(({ data: { Parameters = []}}) => {
            return {
              "Parameters": Parameters,
              "target": target,
              "value": service.VALUE,
              "text": service.TEXT,
              "type": service.TYPE
            };
          }).catch((error) => { console.log(error); });
      });

      return await api
        .allSettled(promises.flat())
        .then((response) => {
          const res = response
            .filter((result) => result.status === 'fulfilled' && result.value)
            .map((result) => result.value)
            .flat();

          commit('setDumpTypeOptions', res);
          return res;
        })
        .catch((error) => console.log(error));
    },
    async getBmcDumpEntries() {
      const managers = await this.dispatch('bmc/getBmcInfo');
      managers.forEach((element) => element.TYPE="Bmc");
      return api
        .get(`${await this.dispatch('global/getBmcPath')}`)
        .then((response) => api.get(response.data.LogServices['@odata.id']))
        .then((response) => api.get(`${response.data['@odata.id']}/Dump`))
        .then((response) => api.get(response.data.Entries['@odata.id']))
        .catch((error) => console.log(error));
    },
    async getSystemDumpEntries() {
      return api
        .get(`${await this.dispatch('global/getSystemPath')}`)
        .then((response) => api.get(response.data.LogServices['@odata.id']))
        .then((response) => api.get(`${response.data['@odata.id']}/Dump`))
        .then((response) => api.get(response.data.Entries['@odata.id']))
        .catch((error) => console.log(error));
    },
    async getAllDumps({ state, commit, dispatch }) {
      if (!state.isInitialized) {
        await dispatch('initializeDumpStore');
      }
      
      const services = state.dumpServices;

      let promises = services.map(async (service) => {
        let uri = service["Entries"]?.['@odata.id'];
        if (!uri) return null;

        try {
          const { data: { Members = [] } } = await api.get(uri);
          if (service.TYPE == "System" && !Members.length) {
            return null;
          }
          const members = Members.map((dump) => ({
            data: dump.AdditionalDataURI,
            dateTime: new Date(dump.Created),
            dumpType: dump.Name,
            id: dump.Id,
            location: dump['@odata.id'],
            size: dump.AdditionalDataSizeBytes,
            diagnosticDataType: dump.DiagnosticDataType,
            entryType: dump.EntryType,
          }));
          return {
            "Members": members,
            "value": service.VALUE,
            "text": service.TEXT,
            "type": service.TYPE
          };
        } catch (error) {
          console.error('Error fetching dump Entries:', error);
          return null;
        }
      });

      return await api
        .allSettled(promises.flat())
        .then((response) => {
          const res = response
            .filter((result) => result.status === 'fulfilled' && result.value)
            .map((result) => result.value)
            .flat();

          commit('setAllDumps', res);
          return res;
        })
        .catch((error) => console.log(error));
    },
    async createDump({ commit }, payload) {
      // Extract target and parameters from payload
      const { target, parameters, type } = payload;

      return await api.post(
        target,
        parameters
      ).catch((error) => {
        console.log(error);
        throw new Error(i18n.t(`pageDumps.toast.errorStart${type}Dump`));
      });
    },
    async deleteDumps({ dispatch }, dumps) {
      const promises = dumps.map(({ location }) =>
        api.delete(location).catch((error) => {
          console.log(error);
          return error;
        }),
      );
      return await api
        .all(promises)
        .then((response) => {
          dispatch('getAllDumps');
          return response;
        })
        .then(
          api.spread((...responses) => {
            const { successCount, errorCount } = getResponseCount(responses);
            const toastMessages = [];

            if (successCount) {
              const message = i18n.tc(
                'pageDumps.toast.successDeleteDump',
                successCount,
              );
              toastMessages.push({ type: 'success', message });
            }

            if (errorCount) {
              const message = i18n.tc(
                'pageDumps.toast.errorDeleteDump',
                errorCount,
              );
              toastMessages.push({ type: 'error', message });
            }

            return toastMessages;
          }),
        );
    },
    async deleteAllDumps({ commit, state }) {
      const totalDumpCount = state.allDumps.length;
      return await api
        .post(
          `${await this.dispatch('global/getBmcPath')}/LogServices/Dump/Actions/LogService.ClearLog`,
        )
        .then(() => {
          commit('setAllDumps', []);
          return i18n.tc('pageDumps.toast.successDeleteDump', totalDumpCount);
        })
        .catch((error) => {
          console.log(error);
          throw new Error(
            i18n.tc('pageDumps.toast.errorDeleteDump', totalDumpCount),
          );
        });
    },
    async downloadEntry({dispatch}, uri) {
      return await api
        .get(uri, {
          headers: {
            Accept: 'application/octet-stream',
          },
          responseType: 'arraybuffer',
        })
        .then((response) => {
          // Convert Base64 to Uint8Array using Buffer
          //const bytes = new Uint8Array(Buffer.from(response.data, 'base64'));
          const blob = new Blob([response.data], {
            contentType: 'application/octet-stream',
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

export default DumpsStore;
