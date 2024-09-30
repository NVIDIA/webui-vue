import api from '@/store/api';
import { uniqBy } from 'lodash';

const SensorsStore = {
  namespaced: true,
  state: {
    sensors: [],
  },
  getters: {
    sensors: (state) => state.sensors,
    chassis: (state, rootGetters) => {
      return rootGetters['chassis/redfish_chassis'];
    },
  },
  mutations: {
    setSensors: (state, sensors) => {
      state.sensors = uniqBy([...sensors, ...state.sensors], 'name');
    },
    setSensorsDefault: (state) => {
      state.sensors = [];
    },
  },
  actions: {
    async getAllSensors({ dispatch, getters }) {
      let collection = getters.chassis;
      if (!collection || collection.length === 0)
        collection = await dispatch('getChassisCollection');
      if (!collection || collection.length === 0) return;
      dispatch('resetSensors');
      const promises = collection.reduce((acc, chassis) => {
        acc.push(dispatch('getSensors', chassis));
        acc.push(dispatch('getThermalSensors', chassis));
        acc.push(dispatch('getPowerSensors', chassis));
        return acc;
      }, []);
      return await api.all(promises);
    },
    async getChassisCollection({ dispatch, rootGetters }) {
      return await dispatch('chassis/getChassisInfo', null, {
        root: true,
      }).then(() => rootGetters['chassis/redfish_chassis']);
    },
    async resetSensors({ commit }) {
      commit('setSensorsDefault');
    },
    async getSensors({ commit }, chassis) {
      if (!(chassis['Sensors'] && chassis['Sensors']['@odata.id'])) return;
      const sensors = await api
        .get(chassis['Sensors']['@odata.id'])
        .then((response) => response.data.Members)
        .catch((error) => console.log(error));
      if (!sensors) return;
      const promises = sensors.map((sensor) => {
        return api.get(sensor['@odata.id']).catch((error) => {
          console.log(error);
          return error;
        });
      });
      return await api.all(promises).then((responses) => {
        const sensorData = [];
        responses.forEach((response) => {
          if (response.data) {
            sensorData.push({
              name: response.data.Name,
              status: response.data.Status?.Health,
              currentValue: response.data.Reading,
              lowerCaution: response.data.Thresholds?.LowerCaution?.Reading,
              upperCaution: response.data.Thresholds?.UpperCaution?.Reading,
              lowerCritical: response.data.Thresholds?.LowerCritical?.Reading,
              upperCritical: response.data.Thresholds?.UpperCritical?.Reading,
              units: response.data.ReadingUnits,
            });
          }
        });
        commit('setSensors', sensorData);
      });
    },
    async getThermalSensors({ commit }, chassis) {
      if (!(chassis['Thermal'] && chassis['Thermal']['@odata.id'])) return;
      return await api
        .get(chassis['Thermal']['@odata.id'])
        .then(({ data: { Fans = [], Temperatures = [] } }) => {
          const sensorData = [];
          Fans.forEach((sensor) => {
            sensorData.push({
              name: sensor.Name,
              status: sensor.Status.Health,
              currentValue: sensor.Reading,
              lowerCaution: sensor.LowerThresholdNonCritical,
              upperCaution: sensor.UpperThresholdNonCritical,
              lowerCritical: sensor.LowerThresholdCritical,
              upperCritical: sensor.UpperThresholdCritical,
              units: sensor.ReadingUnits,
            });
          });
          Temperatures.forEach((sensor) => {
            sensorData.push({
              name: sensor.Name,
              status: sensor.Status.Health,
              currentValue: sensor.ReadingCelsius,
              lowerCaution: sensor.LowerThresholdNonCritical,
              upperCaution: sensor.UpperThresholdNonCritical,
              lowerCritical: sensor.LowerThresholdCritical,
              upperCritical: sensor.UpperThresholdCritical,
              units: '℃',
            });
          });
          commit('setSensors', sensorData);
        })
        .catch((error) => console.log(error));
    },
    async getPowerSensors({ commit }, chassis) {
      if (!(chassis['Power'] && chassis['Power']['@odata.id'])) return;
      return await api
        .get(chassis['Power']['@odata.id'])
        .then(({ data: { Voltages = [] } }) => {
          const sensorData = Voltages.map((sensor) => {
            return {
              name: sensor.Name,
              status: sensor.Status.Health,
              currentValue: sensor.ReadingVolts,
              lowerCaution: sensor.LowerThresholdNonCritical,
              upperCaution: sensor.UpperThresholdNonCritical,
              lowerCritical: sensor.LowerThresholdCritical,
              upperCritical: sensor.UpperThresholdCritical,
              units: 'V',
            };
          });
          commit('setSensors', sensorData);
        })
        .catch((error) => console.log(error));
    },
  },
};

export default SensorsStore;
