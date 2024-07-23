import api from '@/store/api';
import i18n from '@/i18n';

const FirmwareStore = {
  namespaced: true,
  state: {
    bmcFirmware: [],
    hostFirmware: [],
    firmwareInventory: [],
    bmcActiveFirmwareId: null,
    hostActiveFirmwareId: null,
    bmcSoftwareImageIds: [],
    hostSoftwareImageIds: [],
    applyTime: null,
    httpPushUri: null,
    tftpAvailable: false,
  },
  getters: {
    isTftpUploadAvailable: (state) => state.tftpAvailable,
    isSingleFileUploadEnabled: (state) => state.hostFirmware.length === 0,
    activeBmcFirmware: (state) => {
      return state.bmcFirmware.find(
        (firmware) => firmware.id === state.bmcActiveFirmwareId,
      );
    },
    activeHostFirmware: (state) => {
      return state.hostFirmware.find(
        (firmware) => firmware.id === state.hostActiveFirmwareId,
      );
    },
    backupBmcFirmware: (state) => {
      return state.bmcFirmware.find(
        (firmware) => firmware.id !== state.bmcActiveFirmwareId,
      );
    },
    backupHostFirmware: (state) => {
      return state.hostFirmware.find(
        (firmware) => firmware.id !== state.hostActiveFirmwareId,
      );
    },
    firmwareInventory: (state) => state.firmwareInventory,
  },
  mutations: {
    setActiveBmcFirmwareId: (state, id) => (state.bmcActiveFirmwareId = id),
    setActiveHostFirmwareId: (state, id) => (state.hostActiveFirmwareId = id),
    setBmcFirmware: (state, firmware) => (state.bmcFirmware = firmware),
    setHostFirmware: (state, firmware) => (state.hostFirmware = firmware),
    setBmcSoftwareImageIds: (state, ids) => (state.bmcSoftwareImageIds = ids),
    setHostSoftwareImageIds: (state, ids) => (state.hostSoftwareImageIds = ids),
    setFirmwareInventory(state, firmwareInventory) {
      state.firmwareInventory = firmwareInventory;
    },
    setApplyTime: (state, applyTime) => (state.applyTime = applyTime),
    setHttpPushUri: (state, httpPushUri) => (state.httpPushUri = httpPushUri),
    setTftpUploadAvailable: (state, tftpAvailable) =>
      (state.tftpAvailable = tftpAvailable),
  },
  actions: {
    async getFirmwareInformation({ dispatch }) {
      await dispatch('getActiveHostFirmware');
      await dispatch('getActiveBmcFirmware');
      return await dispatch('getFirmwareInventory');
    },
    async getActiveBmcFirmware({ commit }) {
      return api
        .get(`${await this.dispatch('global/getBmcPath')}`)
        .then(({ data: { Links } }) => {
          const activeImageId = Links?.ActiveSoftwareImage?.['@odata.id'];
          const softwareImageIds =
            Links?.SoftwareImages?.map((image) => image['@odata.id']) || [];

          commit('setActiveBmcFirmwareId', activeImageId);
          commit('setBmcSoftwareImageIds', softwareImageIds);
        })
        .catch((error) => console.log(error));
    },
    async getActiveHostFirmware({ commit }) {
      return api
        .get(`${await this.dispatch('global/getSystemPath')}/Bios`)
        .then(({ data: { Links } }) => {
          const activeImageId = Links?.ActiveSoftwareImage['@odata.id'];
          const softwareImageIds =
            Links?.SoftwareImages?.map((image) => image['@odata.id']) || [];
          commit('setActiveHostFirmwareId', activeImageId);
          commit('setHostSoftwareImageIds', softwareImageIds);
        })
        .catch((error) => console.log(error));
    },
    async getFirmwareInventory({ state, commit }) {
      const inventoryList = await api
        .get('/redfish/v1/UpdateService/FirmwareInventory')
        .then(({ data: { Members = [] } = {} }) =>
          Members.map((item) => api.get(item['@odata.id'])),
        )
        .catch((error) => console.log(error));
      await api
        .all(inventoryList)
        .then((response) => {
          const bmcFirmware = [];
          const hostFirmware = [];
          const firmwareInventory = [];
          response.forEach(({ data }) => {
            const item = {
              version: data?.Version,
              id: data?.['@odata.id'],
              name: data?.Id,
              location: data?.['@odata.id'],
              status: data?.Status?.Health,
              updateable: data?.Updateable,
            };
            firmwareInventory.push(item);

            if (state.bmcSoftwareImageIds.includes(item.id)) {
              bmcFirmware.push(item);
            } else if (state.hostSoftwareImageIds.includes(item.id)) {
              hostFirmware.push(item);
            }
          });
          commit('setFirmwareInventory', firmwareInventory);
          commit('setBmcFirmware', bmcFirmware);
          commit('setHostFirmware', hostFirmware);
        })
        .catch((error) => {
          console.log(error);
        });
    },
    getUpdateServiceSettings({ commit }) {
      api
        .get('/redfish/v1/UpdateService')
        .then(({ data }) => {
          const applyTime =
            data.HttpPushUriOptions.HttpPushUriApplyTime.ApplyTime;
          const allowableActions =
            data?.Actions?.['#UpdateService.SimpleUpdate']?.[
              'TransferProtocol@Redfish.AllowableValues'
            ];
          commit('setApplyTime', applyTime);
          const httpPushUri = data.HttpPushUri;
          commit('setHttpPushUri', httpPushUri);
          if (allowableActions?.includes('TFTP')) {
            commit('setTftpUploadAvailable', true);
          }
        })
        .catch((error) => console.log(error));
    },
    async uploadFirmware({ state }, image) {
      return await api
        .post(state.httpPushUri, image, {
          headers: { 'Content-Type': 'application/octet-stream' },
        })
        .catch((error) => {
          console.log(error);
          throw new Error(i18n.t('pageFirmware.toast.errorUpdateFirmware'));
        });
    },
    async uploadFirmwareTFTP(fileAddress) {
      const data = {
        TransferProtocol: 'TFTP',
        ImageURI: fileAddress,
      };
      return await api
        .post(
          '/redfish/v1/UpdateService/Actions/UpdateService.SimpleUpdate',
          data,
        )
        .catch((error) => {
          console.log(error);
          throw new Error(i18n.t('pageFirmware.toast.errorUpdateFirmware'));
        });
    },
    async switchBmcFirmwareAndReboot({ getters }) {
      const backupLocation = getters.backupBmcFirmware.location;
      const data = {
        Links: {
          ActiveSoftwareImage: {
            '@odata.id': backupLocation,
          },
        },
      };
      return await api
        .patch(`${await this.dispatch('global/getBmcPath')}`, data)
        .catch((error) => {
          console.log(error);
          throw new Error(i18n.t('pageFirmware.toast.errorSwitchImages'));
        });
    },
  },
};

export default FirmwareStore;
