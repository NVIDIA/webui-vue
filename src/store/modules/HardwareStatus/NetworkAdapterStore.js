import api from '@/store/api';

const NetworkAdapterStore = {
  namespaced: true,
  state: {
    networkAdapters: [],
  },
  getters: {
    networkAdapters: (state) => state.networkAdapters,
  },
  mutations: {
    setNetworkAdapter: (state, data) => {
      state.networkAdapters = data.map((networkAdapter) => {
        const { Id, Status } = networkAdapter;
        return {
          name: Id,
          status: Status?.State === 'Enabled' ? 'OK' : 'ERROR',
        };
      });
    },
  },
  actions: {
    async getNetworkAdapter({ commit }) {
      return await api
        .get(
          `${await this.dispatch('global/getSystemPath')}/EthernetInterfaces`,
        )
        .then((response) =>
          response.data.Members.map(
            (networkAdapter) => networkAdapter['@odata.id'],
          ),
        )
        .then((networkAdapters) =>
          api.all(
            networkAdapters.map((networkAdapter) => api.get(networkAdapter)),
          ),
        )
        .then((networkAdapters) => {
          const networkAdapter = networkAdapters.map(
            (networkAdapter) => networkAdapter.data,
          );
          commit('setNetworkAdapter', networkAdapter);
        })
        .catch((error) => {
          console.log('Network Adapter:', error);
        });
    },
  },
};

export default NetworkAdapterStore;
