<template>
  <b-container fluid="xl">
    <page-title />
    <b-row class="mb-4">
      <b-col md="12">
        <page-section
          :section-title="$t('pageVirtualMedia.virtualMediaSubTitleFirst')"
        >
          <b-row>
            <b-col v-for="(dev, $index) in proxyDevices" :key="$index" md="6">
              <b-form-group
                class="mb-4"
                :label="
                  dev.Inserted
                    ? `${dev.Id}: ${$t('pageVirtualMedia.inserted')}`
                    : `${dev.Id}: ${$t('pageVirtualMedia.defaultDeviceName')}`
                "
                :label-for="dev.Id"
                label-class="bold mt-2 mb-4"
              >
                <form-file
                  v-if="!dev.Inserted"
                  :id="concatId(dev.Id)"
                  v-model="dev.file"
                >
                  <template #invalid>
                    <b-form-invalid-feedback role="alert">
                      {{ $t('global.form.required') }}
                    </b-form-invalid-feedback>
                  </template>
                </form-file>
              </b-form-group>
              <b-button
                v-if="!dev.Inserted"
                variant="primary"
                :disabled="!dev.file"
                @click="startVM(dev)"
              >
                {{ $t('pageVirtualMedia.start') }}
              </b-button>
              <div v-else>
                <!-- Someone else is using this device, show Eject Media button -->
                <div v-if="dev && !dev.nbd || (dev.nbd && dev.nbd.ws && dev.nbd.ws.readyState === 3)">
                  <span>{{ $t('pageVirtualMedia.websocketVMinUse') }}</span>
                  <br /><br />
                  <b-button
                    variant="primary"
                    @click="ejectVM(dev)"
                  >
                    {{ $t('pageVirtualMedia.eject') }}
                  </b-button>
                </div>
                <div v-else>
                  <span>{{ $t('pageFirmware.form.updateFirmware.workstation') }}: {{ dev && dev.file && dev.file.name }}</span>
                  <br /><br />
                  <b-button
                    variant="primary"
                    :disabled="!dev.file"
                    @click="stopVM(dev)"
                  >
                    {{ $t('pageVirtualMedia.stop') }}
                  </b-button>
                </div>
              </div>
            </b-col>
          </b-row>
        </page-section>
      </b-col>
    </b-row>
    <b-row v-if="loadImageFromExternalServer" class="mb-4">
      <b-col md="12">
        <page-section
          :section-title="$t('pageVirtualMedia.virtualMediaSubTitleSecond')"
        >
          <b-row>
            <b-col
              v-for="(device, $index) in legacyDevices"
              :key="$index"
              md="5"
              class="me-5"
            >
              <b-form-group
                class="mb-4"
                :label="
                  device.Inserted
                    ? `${device.Id}: ${$t('pageVirtualMedia.inserted')}`
                    : `${device.Id}: ${$t('pageVirtualMedia.defaultDeviceName')}`
                "
                :label-for="device.Id"
                label-class="bold mt-2 mb-4"
              >
                <b-button
                  v-if="!device.Inserted"
                  variant="secondary"
                  :disabled="device.Inserted"
                  @click="configureConnection(device)"
                >
                  {{ $t('pageVirtualMedia.configureConnection') }}
                </b-button>
              </b-form-group>
              <div
                v-if="device.Inserted"
                class="remote-file px-3 py-3 mt-2 mb-4"
              >
                {{ device.Image ? device.Image : device.serverUri }}
              </div>
              <b-button
                v-if="!device.Inserted"
                variant="primary"
                :disabled="!device.serverUri"
                @click="startLegacy(device)"
              >
                {{ $t('pageVirtualMedia.start') }}
              </b-button>
              <b-button
                v-if="device.Inserted"
                variant="primary"
                @click="stopLegacy(device)"
              >
                {{ $t('pageVirtualMedia.stop') }}
              </b-button>
            </b-col>
          </b-row>
        </page-section>
      </b-col>
    </b-row>
    <modal-configure-connection
      v-model="showConfigureConnectionModal"
      :connection="modalConfigureConnection"
      @ok="saveConnection"
    />
  </b-container>
</template>

<script>
import PageTitle from '@/components/Global/PageTitle';
import PageSection from '@/components/Global/PageSection';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';
import ModalConfigureConnection from './ModalConfigureConnection';
import NbdServer from '@/utilities/NBDServer';
import FormFile from '@/components/Global/FormFile';
import i18n from '@/i18n';
import { useModal } from 'bootstrap-vue-next';
import { useAuthStore } from '@/stores/auth';

/**
 * @component VirtualMedia
 * @description Manages virtual media devices, allowing users to mount and unmount
 * both local files (proxy devices) and remote images via URL (legacy devices).
 * 
 * @requires PageTitle
 * @requires PageSection
 * @requires ModalConfigureConnection
 * @requires FormFile
 * @requires BVToastMixin
 * @requires LoadingBarMixin
 * @requires NBDServer
 */
export default {
  name: 'VirtualMedia',
  components: { PageTitle, PageSection, ModalConfigureConnection, FormFile },
  mixins: [BVToastMixin, LoadingBarMixin],
  setup() {
    const bvModal = useModal();
    const authStore = useAuthStore();
    return { bvModal, authStore };
  },
  data() {
    return {
      modalConfigureConnection: null,
      showConfigureConnectionModal: false,
    };
  },

  computed: {
    /**
     * @returns {Array} List of proxy devices that support local file mounting
     */
    proxyDevices() {
      return this.$store.getters['virtualMedia/proxyDevices'];
    },

    /**
     * @returns {Array} List of legacy devices that support remote image mounting
     */
    legacyDevices() {
      return this.$store.getters['virtualMedia/legacyDevices'];
    },

    /**
     * @returns {boolean} Whether the system supports loading images from external servers
     */
    loadImageFromExternalServer() {
      return this.legacyDevices.length > 0;
    },
  },
  created() {
    this.$store.dispatch('global/getSystemInfo');
    this.loadVirtualMediaData();
  },

  methods: {
    /**
     * Loads virtual media device data from the server
     * @returns {Promise} Promise that resolves when data is loaded
     */
    loadVirtualMediaData() {
      this.startLoader();
      this.$store
        .dispatch('virtualMedia/getData')
        .finally(() => this.endLoader());
    },

    /**
     * Starts a virtual media session for a proxy device
     * @param {Object} device - The device to start the virtual media session for
     * @param {File} device.file - The file to mount
     * @param {string} device.Id - The device identifier
     * @param {string} device.WebSocketEndpoint - WebSocket endpoint for the device
     */
    startVM(device) {
      const token = this.authStore.token;
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      device.nbd = new NbdServer(
        `${wsProtocol}//${window.location.host}${device.WebSocketEndpoint}`,
        device.file,
        device.Id,
        token,
      );
      device.nbd.socketStarted = () =>
        this.successToast(
          i18n.global.t('pageVirtualMedia.toast.serverRunning'),
        );
      device.nbd.errorReadingFile = () =>
        this.errorToast(
          i18n.global.t('pageVirtualMedia.toast.errorReadingFile'),
        );
      device.nbd.socketClosed = (code) => {
        if (code === 1000)
          this.successToast(
            i18n.global.t('pageVirtualMedia.toast.serverClosedSuccessfully'),
          );
        else
          this.errorToast(
            i18n.global.t('pageVirtualMedia.toast.serverClosedWithErrors'),
          );
        device.file = null;
        device.Inserted = false;
      };

      device.nbd.start();
      device.Inserted = true;
    },

    /**
     * Stops a virtual media session for a proxy device
     * @param {Object} device - The device to stop the virtual media session for
     */
    stopVM(device) {
      device.nbd.stop();
      device.file = null;
      this.loadVirtualMediaData();
    },

    /**
     * Ejects media from a device that's in use by another session
     * @param {Object} device - The device to eject media from
     */
    ejectVM(device) {
      this.$store
        .dispatch('virtualMedia/ejectMedia', device)
        .then(() => {
          this.successToast(
            this.$t('pageVirtualMedia.toast.serverClosedSuccessfully'),
          );
          this.loadVirtualMediaData();
        });
    },

    /**
     * Starts a virtual media session for a legacy device using a remote image
     * @param {Object} connectionData - Connection configuration for the remote image
     * @param {string} connectionData.serverUri - URI of the remote image
     * @param {string} [connectionData.username] - Optional username for authentication
     * @param {string} [connectionData.password] - Optional password for authentication
     * @param {boolean} [connectionData.isRW=false] - Whether the mount should be read-write
     */
    startLegacy(connectionData) {
      var data = {
        Image: connectionData.serverUri,
        UserName: connectionData.username,
        Password: connectionData.password,
        WriteProtected: !connectionData.isRW
      };
      this.startLoader();
      this.$store
        .dispatch('virtualMedia/mountImage', {
          device: connectionData,
          data: data,
        })
        .then(() => {
          this.successToast(
            i18n.global.t('pageVirtualMedia.toast.serverConnectionEstablished'),
          );
          connectionData.Inserted = true;
        })
        .catch(({ message }) => {
          this.errorToast(message, {
            title: this.$t('pageVirtualMedia.toast.errorMounting'),
          });
          this.Inserted = false;
        })
        .finally(() => this.endLoader());
    },

    /**
     * Stops a virtual media session for a legacy device
     * @param {Object} connectionData - The device configuration to stop
     */
    stopLegacy(connectionData) {
      this.$store
        .dispatch('virtualMedia/ejectMedia', connectionData)
        .then(() => {
          this.successToast(
            i18n.global.t('pageVirtualMedia.toast.serverClosedSuccessfully'),
          );
          connectionData.Inserted = false;
        })
        .catch(({ message }) => {
          this.errorToast(message, {
            title: this.$t('pageVirtualMedia.toast.errorUnmounting'),
          });
        })

        .finally(() => this.endLoader());
    },
    /**
     * Updates the modal connection data with values from the form
     * @param {Object} connectionData - The form data to save
     * @param {string} connectionData.serverUri - URI of the remote image
     * @param {string} [connectionData.username] - Optional username for authentication
     * @param {string} [connectionData.password] - Optional password for authentication
     * @param {boolean} [connectionData.isRW=false] - Whether the mount should be read-write
     */
    saveConnection(connectionData) {
      Object.assign(this.modalConfigureConnection, connectionData);
    },
    configureConnection(connectionData) {
      this.modalConfigureConnection = connectionData;
      this.showConfigureConnectionModal = true;
    },
    concatId(val) {
      return val.split(' ').join('_').toLowerCase();
    },
  },
};
</script>

<style lang="scss" scoped>
.remote-file {
  display: flex;
  align-items: center;
  background-color: theme-color('light');
}
</style>
