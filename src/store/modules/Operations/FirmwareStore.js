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
    multipartHttpPushUri: null,
    httpPushUri: null,
    allowableActions: [],
  },
  getters: {
    allowableActions: (state) => state.allowableActions,
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
    setMultipartHttpPushUri: (state, multipartHttpPushUri) =>
      (state.multipartHttpPushUri = multipartHttpPushUri),
    setAllowableActions: (state, allowableActions) =>
      (state.allowableActions = allowableActions),
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
          const multipartHttpPushUri = data.MultipartHttpPushUri;
          commit('setMultipartHttpPushUri', multipartHttpPushUri);
          commit('setAllowableActions', allowableActions);
        })
        .catch((error) => console.log(error));
    },
    async uploadFirmware({ state, dispatch }, params) {
      if (state.multipartHttpPushUri != null) {
        return dispatch('uploadFirmwareMultipartHttpPush', params);
      } else if (state.httpPushUri != null) {
        return dispatch('uploadFirmwareHttpPush', params);
      } else {
        console.log('Do not support firmware push update');
      }
    },
    async uploadFirmwareHttpPush({ state }, { image }) {
      return await api
        .post(state.httpPushUri, image, {
          headers: { 'Content-Type': 'application/octet-stream' },
        })
        .catch((error) => {
          console.log(error);
          throw new Error(i18n.t('pageFirmware.toast.errorUpdateFirmware'));
        });
    },
    async uploadFirmwareMultipartHttpPush({ state }, { image, targets }) {
      const formData = new FormData();
      formData.append('UpdateFile', image);
      let params = {};
      if (targets != null && targets.length > 0) params.Targets = targets;
      formData.append('UpdateParameters', JSON.stringify(params));
      return await api
        .post(state.multipartHttpPushUri, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .catch((error) => {
          console.log(error);
          throw new Error(i18n.t('pageFirmware.toast.errorUpdateFirmware'));
        });
    },
    async uploadFirmwareSimpleUpdate(
      // eslint-disable-next-line no-unused-vars
      { state },
      { protocol, fileAddress, targets, username },
    ) {
      const data = {
        TransferProtocol: protocol,
        ImageURI: fileAddress,
      };
      if (targets != null && targets.length > 0) data.Targets = targets;
      if (username != null) data.Username = username;
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
