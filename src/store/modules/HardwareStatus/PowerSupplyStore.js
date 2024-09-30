import api from '@/store/api';

const PowerSupplyStore = {
  namespaced: true,
  state: {
    powerSupplies: [],
  },
  getters: {
    powerSupplies: (state) => state.powerSupplies,
    chassis: (state, rootGetters) => {
      return rootGetters['chassis/redfish_chassis'];
    },
  },
  mutations: {
    setPowerSupply: (state, data) => {
      state.powerSupplies = data.map((powerSupply) => {
        const {
          EfficiencyRatings = [],
          FirmwareVersion,
          LocationIndicatorActive,
          Id,
          Manufacturer,
          Model,
          Name,
          PartNumber,
          PowerInputWatts,
          SerialNumber,
          SparePartNumber,
          Location,
          Status = {},
        } = powerSupply;
        return {
          id: Id,
          health: Status.Health,
          partNumber: PartNumber,
          serialNumber: SerialNumber,
          efficiencyPercent: EfficiencyRatings[0].EfficiencyPercent,
          firmwareVersion: FirmwareVersion,
          identifyLed: LocationIndicatorActive,
          manufacturer: Manufacturer,
          model: Model,
          powerInputWatts: PowerInputWatts,
          name: Name,
          sparePartNumber: SparePartNumber,
          locationNumber: Location?.PartLocation?.ServiceLabel,
          statusState: Status.State,
        };
      });
    },
  },
  actions: {
    async getChassisCollection({ dispatch, rootGetters }) {
      return await dispatch('chassis/getChassisInfo', null, {
        root: true,
      }).then(() => rootGetters['chassis/redfish_chassis']);
    },
    async getAllPowerSupplies({ getters, dispatch, commit }) {
      let collection = getters.chassis;
      if (!collection || collection.length === 0)
        collection = await dispatch('getChassisCollection');
      if (!collection || collection.length === 0) return;
      return await api
        .all(
          collection.flatMap((chassis) => dispatch('getChassisPower', chassis)),
        )
        .then((supplies) => {
          if (!supplies || !supplies.length) return [];
          commit(
            'setPowerSupply',
            // remove empty arrays and undefined items in supplies array
            supplies.flatMap((x) => (!x ? [] : x)),
          );
        })
        .catch((error) => console.log(error));
    },
    async getChassisPower(_, chassis) {
      if (
        !(chassis['PowerSubsystem'] && chassis['PowerSubsystem']['@odata.id'])
      )
        return;
      return await api
        .get(chassis['PowerSubsystem']['@odata.id'])
        .then((response) => {
          return api.get(`${response.data.PowerSupplies['@odata.id']}`);
        })
        .then(({ data: { Members } }) => {
          const promises = Members.map((member) =>
            api.get(member['@odata.id']),
          );
          return api.all(promises);
        })
        .then((response) => {
          const data = response.map(({ data }) => data);
          return data;
        })
        .catch((error) => console.log(error));
    },
  },
};

export default PowerSupplyStore;
