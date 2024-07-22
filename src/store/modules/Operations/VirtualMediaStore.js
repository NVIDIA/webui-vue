import api from '@/store/api';
import i18n from '@/i18n';

const transferProtocolType = {
  CIFS: 'CIFS',
  FTP: 'FTP',
  SFTP: 'SFTP',
  HTTP: 'HTTP',
  HTTPS: 'HTTPS',
  NFS: 'NFS',
  SCP: 'SCP',
  TFTP: 'TFTP',
  OEM: 'OEM',
};

const VirtualMediaStore = {
  namespaced: true,
  state: {
    proxyDevices: [],
    legacyDevices: [],
    connections: [],
  },
  getters: {
    proxyDevices: (state) => state.proxyDevices,
    legacyDevices: (state) => state.legacyDevices,
  },
  mutations: {
    setProxyDevicesData: (state, deviceData) =>
      (state.proxyDevices = deviceData),
    setLegacyDevicesData: (state, deviceData) =>
      (state.legacyDevices = deviceData),
  },
  actions: {
    async getData({ commit }) {
      const virtualMediaListEnabled =
        process.env.VUE_APP_VIRTUAL_MEDIA_LIST_ENABLED === 'false'
          ? false
          : true;

      const device = {
        id: i18n.t('pageVirtualMedia.defaultDeviceName'),
        websocket: '/vm/0/0',
        file: null,
        transferProtocolType: transferProtocolType.OEM,
        isActive: false,
      };
      commit('setProxyDevicesData', [device]);

      if (!virtualMediaListEnabled) return; // Legacy Virtual Media disabled.

      return await api
        .get(`${await this.dispatch('global/getBmcPath')}/VirtualMedia`)
        .then((response) =>
          response.data.Members.map(
            (virtualMedia) => virtualMedia['@odata.id'],
          ),
        )
        .then((devices) => api.all(devices.map((device) => api.get(device))))
        .then((devices) => {
          const deviceData = devices.map((device) => {
            const isActive = device.data?.Inserted === true ? true : false;
            return {
              id: device.data?.Id,
              image: device.data?.Image,
              transferProtocolType: device.data?.TransferProtocolType,
              websocket: device.data?.Oem?.OpenBMC?.WebSocketEndpoint,
              isActive: isActive,
            };
          });
          const legacyDevices = deviceData
            .filter((d) => d.transferProtocolType !== transferProtocolType.OEM)
            .map((device) => {
              return {
                ...device,
                serverUri: '',
                username: '',
                password: '',
                isRW: false,
              };
            });
          commit('setLegacyDevicesData', legacyDevices.reverse());
        })
        .catch((error) => {
          console.log('Virtual Media:', error);
        });
    },
    async mountImage(_, { id, data }) {
      return await api
        .post(
          `${await this.dispatch('global/getBmcPath')}/VirtualMedia/${id}/Actions/VirtualMedia.InsertMedia`,
          data,
        )
        .catch((e) => {
          let message = i18n.t('pageVirtualMedia.toast.errorMounting');
          if (
            e.response &&
            e.response.data &&
            e.response.data.error &&
            e.response.data.error.message
          ) {
            message = e.response.data.error.message;
          }
          throw new Error(message);
        });
    },
    async unmountImage(_, id) {
      return await api
        .post(
          `${await this.dispatch('global/getBmcPath')}/VirtualMedia/${id}/Actions/VirtualMedia.EjectMedia`,
        )
        .catch((e) => {
          let message = i18n.t('pageVirtualMedia.toast.errorUnmounting');
          if (
            e.response &&
            e.response.data &&
            e.response.data.error &&
            e.response.data.error.message
          ) {
            message = e.response.data.error.message;
          }
          throw new Error(message);
        });
    },
  },
};

export default VirtualMediaStore;
