import api from '@/store/api';

const FanStore = {
  namespaced: true,
  state: {
    fans: [],
  },
  getters: {
    fans: (state) => state.fans,
    chassis: (rootGetters) => {
      return rootGetters['chassis/redfish_chassis'];
    },
  },
  mutations: {
    setFanInfo: (state, data) => {
      state.fans = data.map((fan) => {
        const {
          Id,
          Name,
          PartNumber,
          SerialNumber,
          SpeedPercent = {},
          Status = {},
        } = fan;
        return {
          id: Id,
          health: Status.Health,
          name: Name,
          speed: SpeedPercent.Reading,
          statusState: Status.State,
          healthRollup: Status.HealthRollup,
          partNumber: PartNumber,
          serialNumber: SerialNumber,
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
    async getFanInfo({ dispatch, commit, getters }) {
      let collection = getters.chassis;
      if (!collection || collection.length === 0)
        collection = await dispatch('getChassisCollection');
      if (!collection || !collection.length) return;
      return await api
        .all(collection.map((chassis) => dispatch('getChassisFans', chassis)))
        .then((fansFromChassis) =>
          commit(
            'setFanInfo',
            fansFromChassis.flat().filter(function (element) {
              return !!element;
            }),
          ),
        )
        .catch((error) => console.log(error));
    },
    async getChassisFans(_, chassis) {
      if (!chassis.ThermalSubsystem) return;
      return await api
        .get(chassis.ThermalSubsystem['@odata.id'])
        .then((response) => {
          if (!response?.data?.Fans) throw new Error('skip');
          return api.get(`${response.data.Fans['@odata.id']}`);
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
        .catch((error) => {
          if (error.message !== 'skip') console.log(error);
        });
    },
  },
};

export default FanStore;
