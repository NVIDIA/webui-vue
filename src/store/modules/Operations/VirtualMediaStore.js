import api from '@/store/api';
import i18n from '@/i18n';

const transferProtocolType = Object.freeze({
  CIFS: 'CIFS',
  FTP: 'FTP',
  SFTP: 'SFTP',
  HTTP: 'HTTP',
  HTTPS: 'HTTPS',
  NFS: 'NFS',
  SCP: 'SCP',
  TFTP: 'TFTP',
  OEM: 'OEM',
});

/**
 * @typedef {Object} VirtualMediaDevice
 * @property {string} Id - Device identifier
 * @property {string} WebSocketEndpoint - WebSocket endpoint for the device
 * @property {File|null} file - File object for local media
 * @property {string} TransferProtocolType - Protocol type for the device
 * @property {boolean} Inserted - Whether media is currently inserted
 */

/**
 * Default virtual media device configuration
 * @type {VirtualMediaDevice}
 */
const defaultDevice = {
  Id: i18n.t('pageVirtualMedia.defaultDeviceName'),
  WebSocketEndpoint: '/vm/0/0',
  file: null,
  TransferProtocolType: transferProtocolType.OEM,
  Inserted: false,
};

/**
 * Vuex store module for managing virtual media devices and operations
 * @type {import('vuex').Module}
 */
const VirtualMediaStore = {
  namespaced: true,
  state: {
    /** @type {VirtualMediaDevice[]} - Devices that support browser File objects via WebSocket */
    proxyDevices: [],
    /** @type {VirtualMediaDevice[]} - URL-based devices mounted from BMC */
    legacyDevices: [],
    /** @type {Array} - Active connections */
    connections: [],
  },
  getters: {
    /**
     * Devices that support browser File objects via WebSocket
     * @param {Object} state - Vuex state
     * @returns {VirtualMediaDevice[]} Array of proxy devices
     */
    proxyDevices: (state) => state.proxyDevices,

    /**
     * Devices that support URL-based devices mounted from BMC
     * @param {Object} state - Vuex state
     * @returns {VirtualMediaDevice[]} Array of legacy devices
     */
    legacyDevices: (state) => state.legacyDevices,

    /**
     * Check if a device is a proxy device
     * @returns {Function} Function to determine if device is a proxy device
     */
    isProxyDevice: () => (device) => {
      return device.TransferProtocolType === transferProtocolType.OEM 
             || device.Id.startsWith('Slot_'); // FIXME: remove once we have better detection
    },
  },
  mutations: {
    setProxyDevicesData: (state, deviceData) =>
      (state.proxyDevices = deviceData),
    setLegacyDevicesData: (state, deviceData) =>
      (state.legacyDevices = deviceData),
  },
  actions: {
    /**
     * Fetch virtual media devices data
     * @throws {Error} When unable to load virtual media data
     */
    async getData({ state, getters, commit, dispatch }) {
      try {
        // If the virtual media list is disabled, we need to show the default device
        // This is hardcoded to a single Local Device
        const virtualMediaListEnabled =
          process.env.VUE_APP_VIRTUAL_MEDIA_LIST_ENABLED === 'false'
            ? false
            : true;
        if (!virtualMediaListEnabled) {
          // Don't kill current connections on a refresh
          // do this once, don't override the current proxyDevice
          if (state.proxyDevices.length === 0) {
            commit('setProxyDevicesData', [defaultDevice]);
          }
          return;
        }

        const devices = await api
          .get(`${await this.dispatch('global/getBmcPath')}/VirtualMedia`)
          .then((response) =>
            response.data.Members.map(
              (virtualMedia) => virtualMedia['@odata.id'],
            ),
          )
          .then((devices) => api.all(devices.map((device) => api.get(device))));
        
        const proxyDevices = devices
          .filter((d) => getters['isProxyDevice'](d.data))
          .map((device) => ({
            ...device.data,
            WebSocketEndpoint: device.data?.Oem?.OpenBMC?.WebSocketEndpoint ?? defaultDevice.WebSocketEndpoint,
            file: null,
          }));
        // if there are no proxy devices, add the default device
        if (proxyDevices.length === 0) {
          proxyDevices=[defaultDevice];
        }
        // Don't kill current connections on a reload of data
        // override items in the proxyDevices array with current active devices
        // Keep the current file and nbd objects
        proxyDevices.forEach((device) => {
          const currentDevice = state.proxyDevices.find((d) => d.Id === device.Id);
          if (currentDevice) {
            Object.assign(device, {
              file: currentDevice?.file,
              nbd: currentDevice?.nbd,
            });
          }
        });
        const legacyDevices = devices
          .filter((d) => !getters['isProxyDevice'](d.data))
          .map((device) => {
            return {
              ...device.data,
              serverUri: '',
              username: '',
              password: '',
              isRW: false,
            };
          });
        commit('setProxyDevicesData', proxyDevices.sort((a, b) => a.Id.localeCompare(b.Id)));
        commit('setLegacyDevicesData', legacyDevices.sort((a, b) => a.Id.localeCompare(b.Id)));
      } catch (error) {
        console.error('Virtual Media Error:', error);
        throw new Error(i18n.t('pageVirtualMedia.toast.errorLoadingData'));
      }
    },

    /**
     * Execute a media action on a device
     * @param {Object} context - Vuex action context
     * @param {Object} params - Action parameters
     * @param {VirtualMediaDevice} params.device - Target device
     * @param {string} params.action - Action to execute
     * @param {string} params.errorMessage - Error message to display on failure
     * @param {Object} [params.data] - Optional data to send with the action
     * @throws {Error} When action fails or is not supported
     */
    async executeMediaAction(context, { device, action, errorMessage, data }) {
      const uri = device?.Actions?.[action]?.target;
      if (!uri) {
        throw new Error(errorMessage);
      }
      try {
        return await api.post(uri, data);
      } catch (error) {
        const message = error.response?.data?.error?.message || errorMessage;
        throw new Error(message);
      }
    },

    /**
     * Eject media from a device
     * @param {Object} context - Vuex action context
     * @param {VirtualMediaDevice} device - Target device
     * @throws {Error} When eject operation fails
     */
    async ejectMedia(context, device) {
      return await context.dispatch('executeMediaAction',
        { device: device,
        action: '#VirtualMedia.EjectMedia',
        errorMessage: i18n.t('pageVirtualMedia.toast.errorUnmounting') })
    },

    /**
     * Mount an image to a device
     * @param {Object} context - Vuex action context
     * @param {Object} params - Mount parameters
     * @param {VirtualMediaDevice} params.device - Target device
     * @param {Object} params.data - Mount configuration data
     * @throws {Error} When mount operation fails
     */
    async mountImage(context, { device, data }) {
      return await context.dispatch('executeMediaAction', {
        device,
        action: '#VirtualMedia.InsertMedia',
        errorMessage: i18n.t('pageVirtualMedia.toast.errorMounting'),
        data
      });
    },
  },
};

export default VirtualMediaStore;
