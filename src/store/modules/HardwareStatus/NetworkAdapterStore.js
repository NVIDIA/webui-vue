const NetworkAdapterStore = {
  namespaced: true,
  state: {
    networkAdapters: [],
  },
  getters: {
    networkAdapters: (state) => state.networkAdapters,
  },
  mutations: {
    setNetworkAdapters: (state, data) => {
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
    async getNetworkAdapters({ commit }) {
      this.dispatch('system/getSytemsResources', {
        name: 'EthernetInterfaces',
      }).then((results) => commit('setNetworkAdapters', results));
    },
  },
};

export default NetworkAdapterStore;
