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
        process.env.VUE_APP_VIRTUAL_MEDIA_LIST_ENABLED === 'true'
          ? true
          : false;
      if (!virtualMediaListEnabled) {
        const device0 = {
          id: i18n.t('pageVirtualMedia.defaultDeviceNameCD'),
          websocket: '/vm/0/0',
          file: null,
          transferProtocolType: transferProtocolType.OEM,
          isActive: false,
          acceptFile: '.nrg, .iso, .ISO, .NRG',
        };
        const device1 = {
          id: i18n.t('pageVirtualMedia.defaultDeviceNameHD'),
          websocket: '/vm/0/1',
          file: null,
          transferProtocolType: transferProtocolType.OEM,
          isActive: false,
          acceptFile: '.img, .ima, .IMG, .IMA',
        };
        commit('setProxyDevicesData', [device0, device1]);
        return;
      }

      return await api
        .get('/redfish/v1/Managers/bmc/VirtualMedia')
        .then((response) =>
          response.data.Members.map((virtualMedia) => virtualMedia['@odata.id'])
        )
        .then((devices) => api.all(devices.map((device) => api.get(device))))
        .then((devices) => {
          const deviceData = devices.map((device) => {
            const isActive = device.data?.Inserted === true ? true : false;
            return {
              id: device.data?.Id,
              transferProtocolType: device.data?.TransferProtocolType,
              websocket: device.data?.Oem?.OpenBMC?.WebSocketEndpoint,
              isActive: isActive,
            };
          });
          const proxyDevices = deviceData
            .filter((d) => d.transferProtocolType === transferProtocolType.OEM)
            .map((device) => {
              return {
                ...device,
                file: null,
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
          commit('setProxyDevicesData', proxyDevices);
          commit('setLegacyDevicesData', legacyDevices);
        })
        .catch((error) => {
          console.log('Virtual Media:', error);
        });
    },
    async mountImage(_, { id, data }) {
      return await api
        .post(
          `/redfish/v1/Managers/bmc/VirtualMedia/${id}/Actions/VirtualMedia.InsertMedia`,
          data
        )
        .catch((error) => {
          console.log('Mount image:', error);
          throw new Error();
        });
    },
    async unmountImage(_, id) {
      return await api
        .post(
          `/redfish/v1/Managers/bmc/VirtualMedia/${id}/Actions/VirtualMedia.EjectMedia`
        )
        .catch((error) => {
          console.log('Unmount image:', error);
          throw new Error();
        });
    },
  },
};

export default VirtualMediaStore;
