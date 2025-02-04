import api from '@/store/api';

const PcieSlotsStore = {
  namespaced: true,
  state: {
    pcieSlots: [],
  },
  getters: {
    pcieSlots: (state) => state.pcieSlots,
  },
  mutations: {
    setPcieSlotsInfo: (state, data) => {
      state.pcieSlots = data;
    },
  },
  actions: {
    async getPcieSlotsInfo({ commit, rootGetters }) {
      commit('setPcieSlotsInfo', []);
      let tempPcieSlots = [];
      let collection = rootGetters['chassis/redfish_chassis'];
      if (Array.isArray(collection) && collection.length > 0) {
        await api.all(
          collection.map(async (singleChassis) => {
            let uri = singleChassis?.PCIeSlots?.['@odata.id'];
            if (uri) {
              return await api
                .get(uri)
                .then(({ data }) => {
                  if (Array.isArray(data.Slots) && data.Slots.length > 0) {
                    tempPcieSlots.push(...data.Slots);
                  }
                })
                .catch((error) => console.log(error));
            }
          }),
        );
        commit('setPcieSlotsInfo', tempPcieSlots);
      }
    },
  },
};

export default PcieSlotsStore;
