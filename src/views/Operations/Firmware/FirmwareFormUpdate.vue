<template>
  <div>
    <div class="form-background p-3">
      <b-form @submit.prevent="onSubmitUpload">
        <b-form-group
          v-if="isBluefield"
          :label="$t('pageFirmware.form.updateFirmware.target')"
          :disabled="isPageDisabled || isFirmwareUpdateInProgress"
          class="mb-3"
        >
          <div class="d-flex">
            <b-form-radio
              id="bluefield-target-bmc"
              v-model="bluefieldTarget"
              name="bluefield-target"
              value="BMC"
              class="mr-3"
            >
              BMC
            </b-form-radio>
            <b-form-radio
              id="bluefield-target-cec"
              v-model="bluefieldTarget"
              name="bluefield-target"
              value="CEC"
              class="mr-3"
            >
              CEC
            </b-form-radio>
            <b-form-radio
              id="bluefield-target-bios"
              v-model="bluefieldTarget"
              name="bluefield-target"
              value="BIOS"
            >
              BIOS
            </b-form-radio>
          </div>
        </b-form-group>

        <b-form-group
          v-else-if="isNvidiaGB"
          :label="$t('pageFirmware.form.updateFirmware.target')"
          :disabled="isPageDisabled || isFirmwareUpdateInProgress"
          class="mb-3"
        >
          <div class="d-flex">
            <b-form-radio v-model="nvidiaGBTarget" value="BMC" class="mr-3">
              BMC
            </b-form-radio>
            <b-form-radio v-model="nvidiaGBTarget" value="HMC">
              HMC
            </b-form-radio>
          </div>
        </b-form-group>

        <b-form-group
          v-if="isFileAddressUploadAvailable"
          :label="$t('pageFirmware.form.updateFirmware.fileSource')"
          :disabled="isPageDisabled || isFirmwareUpdateInProgress"
        >
          <b-form-radio
            id="upload-file-source-local"
            v-model="fileSource"
            name="upload-file-source"
            value="LOCAL"
            :disabled="!isLocalFileUploadEnabled"
          >
            {{ $t('pageFirmware.form.updateFirmware.workstation') }}
          </b-form-radio>
          <b-form-radio
            v-for="action in allowableActions"
            :id="'upload-file-source-' + action.toLowerCase()"
            :key="action"
            v-model="fileSource"
            name="upload-file-source"
            :value="action"
            :disabled="!isFileAddressUploadEnabled"
          >
            {{ action }} {{ $t('pageFirmware.form.updateFirmware.server') }}
          </b-form-radio>
        </b-form-group>

        <b-form-checkbox
          v-if="isForceUpdateEnabled"
          v-model="forceUpdate"
          class="mb-4"
          :disabled="isPageDisabled || isFirmwareUpdateInProgress"
        >
          {{ $t('pageFirmware.form.updateFirmware.forceUpdate') }}
        </b-form-checkbox>

        <!-- Local File Upload -->
        <template v-if="isLocalSelected">
          <b-form-group
            :label="$t('pageFirmware.form.updateFirmware.imageFile')"
            label-for="image-file"
          >
            <form-file
              id="image-file"
              :disabled="isPageDisabled || isFirmwareUpdateInProgress"
              :state="getValidationState($v.file)"
              aria-describedby="image-file-help-block"
              @input="onFileUpload($event)"
            >
              <template #invalid>
                <b-form-invalid-feedback role="alert">
                  {{ $t('global.form.required') }}
                </b-form-invalid-feedback>
              </template>
            </form-file>
          </b-form-group>
        </template>

        <!-- TFTP/SCP/HTTP/HTTPS Server File Upload -->
        <template v-else>
          <b-form-group label-for="file-address">
            <template #label>
              <div class="d-flex justify-content-between">
                {{ $t('pageFirmware.form.updateFirmware.fileAddress') }}
                <b-link
                  v-if="showConfirmIdentifyLink"
                  :disabled="isPageDisabled || isFirmwareUpdateInProgress"
                  @click="onConfirmIdentity"
                >
                  {{ $t('pageFirmware.form.updateFirmware.confirmIdentity') }}
                </b-link>
              </div>
            </template>
            <b-form-input
              id="file-address"
              v-model="fileAddress"
              type="text"
              :state="getValidationState($v.fileAddress)"
              :disabled="isPageDisabled || isFirmwareUpdateInProgress"
              @input="$v.fileAddress.$touch()"
            />
            <b-form-invalid-feedback role="alert">
              {{ $t('global.form.fieldRequired') }}
            </b-form-invalid-feedback>
          </b-form-group>
          <b-form-group
            v-if="isUsernameNeeded"
            :label="$t('pageFirmware.form.updateFirmware.username')"
            label-for="username"
          >
            <b-form-input
              id="username"
              v-model="username"
              type="text"
              :state="getValidationState($v.username)"
              :disabled="isPageDisabled || isFirmwareUpdateInProgress"
              @input="$v.username.$touch()"
            />
            <b-form-invalid-feedback role="alert">
              {{ $t('global.form.fieldRequired') }}
            </b-form-invalid-feedback>
          </b-form-group>
        </template>
        <div class="progress-wrapper">
          <b-progress
            v-if="isUploading"
            :value="uploadProgress"
            :max="100"
            animated
            class="mt-2 mb-2"
          >
            <b-progress-bar :value="uploadProgress" :max="100">
              <span class="progress-label">
                {{ uploadProgress }}%
              </span>
            </b-progress-bar>
          </b-progress>
        </div>
        <b-btn
          data-test-id="firmware-button-startUpdate"
          type="submit"
          variant="primary"
          :disabled="isPageDisabled || isFirmwareUpdateInProgress"
        >
          {{ $t('pageFirmware.form.updateFirmware.startUpdate') }}
        </b-btn>
      </b-form>
    </div>

    <!-- Modals -->
    <modal-update-firmware :targets="targets" @ok="updateFirmware" />
    <modal-confirm-identity :default-remote-server-ip="remoteServerIp" />
  </div>
</template>

<script>
import { requiredIf } from 'vuelidate/lib/validators';

import BVToastMixin from '@/components/Mixins/BVToastMixin';
import LoadingBarMixin, { loading } from '@/components/Mixins/LoadingBarMixin';
import VuelidateMixin from '@/components/Mixins/VuelidateMixin.js';

import FormFile from '@/components/Global/FormFile';
import ModalUpdateFirmware from './FirmwareModalUpdateFirmware';
import ModalConfirmIdentity from './FirmwareModalConfirmIdentity';

export default {
  components: { FormFile, ModalUpdateFirmware, ModalConfirmIdentity },
  mixins: [BVToastMixin, LoadingBarMixin, VuelidateMixin],
  props: {
    isPageDisabled: {
      required: true,
      type: Boolean,
      default: false,
    },
    isServerOff: {
      required: true,
      type: Boolean,
    },
  },
  data() {
    return {
      loading,
      fileSource: 'LOCAL',
      file: null,
      fileAddress: null,
      username: null,
      forceUpdate: false,
      isUploading: false,
      isServerPowerOffRequired:
        process.env.VUE_APP_SERVER_OFF_REQUIRED === 'true',
      isBluefield: process.env.VUE_APP_ENV_NAME === 'nvidia-bluefield',
      bluefieldTarget: 'BMC',
      isNvidiaGB: process.env.VUE_APP_ENV_NAME === 'nvidia-gb',
      nvidiaGBTarget: 'BMC',
      hideFirmwareTargets:
        process.env.VUE_APP_HIDE_FIRMWARE_TARGETS === 'true',
    };
  },
  computed: {
    firmwareInventory() {
      return this.$store.getters['firmware/firmwareInventory'];
    },
    allowableActions() {
      return this.$store.getters['firmware/allowableActions'];
    },
    isFileAddressUploadAvailable() {
      return this.allowableActions?.length > 0;
    },
    isFileAddressUploadEnabled() {
      if (this.isBluefield) return this.bluefieldTarget === 'BIOS';
      return true;
    },
    isLocalFileUploadEnabled() {
      if (this.isBluefield)
        return this.bluefieldTarget === 'BMC' || this.bluefieldTarget === 'CEC';
      return true;
    },
    isLocalSelected() {
      return this.fileSource === 'LOCAL';
    },
    isUsernameNeeded() {
      return this.fileSource === 'SCP';
    },
    firmwareUpdateInfo() {
      const info = this.$store.getters['firmware/firmwareUpdateInfo'];
      return JSON.parse(JSON.stringify(info));
    },
    isFirmwareUpdateInProgress() {
      return (
        this.isUploading ||
        this.$store.getters['firmware/isFirmwareUpdateInProgress']
      );
    },
    isForceUpdateEnabled() {
      // Deprecated http push does not support Force update
      if (
        this.isLocalSelected &&
        this.$store.getters['firmware/multipartHttpPushUri'] == null
      )
        return false;
      return true;
    },
    targets() {
      if (this.isBluefield) {
        if (this.fileSource === 'LOCAL') return [];
        else return ['redfish/v1/UpdateService/FirmwareInventory/DPU_OS'];
      } else if (this.isNvidiaGB && this.nvidiaGBTarget === 'HMC') {
        let targets = [...this.$store.state.firmware.checkedItems];
        targets.push('/redfish/v1/Chassis/HGX_Chassis_0');
        return targets;
      }
      return this.$store.state.firmware.checkedItems;
    },
    hasCheckedTargets() {
      return this.$store.state.firmware.checkedItems.length > 0;
    },
    sshAuthenticationMethods() {
      return this.$store.getters['firmware/sshAuthenticationMethods'];
    },
    showConfirmIdentifyLink() {
      return (
        this.fileSource === 'SCP' &&
        this.sshAuthenticationMethods?.includes('PublicKey')
      );
    },
    remoteServerIp() {
      return this.fileAddress?.split('/')?.[0];
    },
    uploadProgress() {
      return this.$store.getters['firmware/getFirmwareUploadProgress'];
    },
  },
  watch: {
    fileSource: function () {
      this.$v.$reset();
      this.file = null;
      this.fileAddress = null;
      this.username = null;
    },
    firmwareUpdateInfo: {
      handler(newInfo, oldInfo) {
        this.displayUpdateProgress(newInfo, oldInfo);
      },
      immdiate: true,
      deep: true,
    },
    bluefieldTarget: {
      handler(newValue) {
        if (!this.isBluefield) return;
        if (newValue === 'BMC' || newValue === 'CEC') {
          this.fileSource = 'LOCAL';
        } else if (newValue === 'BIOS') {
          if (this.fileSource === 'LOCAL')
            this.fileSource = this.allowableActions?.[0];
        }
      },
      immdiate: true,
    },
  },
  validations() {
    return {
      file: {
        required: requiredIf(function () {
          return this.isLocalSelected;
        }),
      },
      fileAddress: {
        required: requiredIf(function () {
          return !this.isLocalSelected;
        }),
      },
      username: {
        required: requiredIf(function () {
          return this.isUsernameNeeded;
        }),
      },
    };
  },
  created() {
    this.$store.dispatch('firmware/getUpdateServiceSettings');
    this.$store.dispatch('firmware/attachExistingUpdateTask');
  },
  methods: {
    updateFirmware() {
      this.isUploading = true;
      this.$store.commit('firmware/setFirmwareUploadProgress', 0);
      this.startLoader();
      this.infoToast(this.$t('pageFirmware.toast.updateStartedMessage'), {
        title: this.$t('pageFirmware.toast.updateStarted'),
        timestamp: true,
      });
      this.dispatchFileUpload()
        .then((resp) => {
          const taskHandle = resp?.data?.['@odata.id'];
          this.$store.dispatch('firmware/setFirmwareUpdateTask', {
            taskHandle: taskHandle,
            initiator: true,
          });
        })
        .catch(({ message }) => {
          this.errorToast(message);
        })
        .finally(() => {
          this.isUploading = false;
          this.$store.commit('firmware/setFirmwareUploadProgress', 0);
          this.endLoader();
        });
    },
    dispatchFileUpload() {
      if (this.fileSource === 'LOCAL') {
        return this.$store.dispatch('firmware/uploadFirmware', {
          image: this.file,
          forceUpdate: this.forceUpdate,
          targets: this.targets,
        });
      } else {
        return this.$store.dispatch('firmware/uploadFirmwareSimpleUpdate', {
          protocol: this.fileSource,
          fileAddress: this.fileAddress,
          forceUpdate: this.forceUpdate,
          username: this.username,
          targets: this.targets,
        });
      }
    },
    displayUpdateProgress(
      { state, taskPercent, errMsg },
      { state: oldState, initiator: oldInitiator },
    ) {
      if (state === 'TaskStarted') {
        // Avoid too much time at 0%(no loading bar)
        if (taskPercent <= 1) taskPercent = 1;
        this.progressLoader([taskPercent, taskPercent]);
      } else if (state === 'TaskCompleted' && oldState !== state) {
        // End loader for polling task, then start new loader for waiting for ready
        this.endLoader();
        this.startLoader();
      } else if (state === 'Done' && oldState !== state) {
        this.endLoader();
        if (oldInitiator) {
          this.infoToast(this.$t('pageFirmware.toast.verifyUpdateMessage'), {
            title: this.$t('pageFirmware.toast.verifyUpdate'),
            refreshAction: true,
          });
        }
      } else if (state === 'ResetFailed' && oldState !== state) {
        this.endLoader();
        if (oldInitiator)
          this.errorToast(this.$t('pageFirmware.toast.resetFailedMessage'));
      } else if (state === 'WaitReadyFailed' && state !== state) {
        this.endLoader();
        if (oldInitiator)
          this.errorToast(this.$t('pageFirmware.toast.waitReadyFailedMessage'));
      } else if (state === 'TaskFailed' && oldState !== state) {
        this.endLoader();
        if (oldInitiator) this.errorToast(errMsg);
      }
    },
    onConfirmIdentity() {
      this.$bvModal.show('modal-confirm-identity');
    },
    onSubmitUpload() {
      this.$v.$touch();
      if (this.$v.$invalid) return;
      if (this.hideFirmwareTargets && this.hasCheckedTargets) {
        this.$bvModal.msgBoxConfirm(
          this.$t('pageFirmware.form.updateFirmware.confirmCheckedMessage'),
          {
            buttonSize: 'sm',
            okVariant: 'danger',
            okTitle: this.$t('global.action.confirm'),
            cancelTitle: this.$t('global.action.cancel'),
            cancelVariant: 'secondary',
          },
        ).then(confirmed => {
          if (confirmed) {
            this.$bvModal.show('modal-update-firmware');
          }
        });
      } else {
        this.$bvModal.show('modal-update-firmware');
      }
    },
    onFileUpload(file) {
      this.file = file;
      this.$v.file.$touch();
    },
  },
};
</script>

<style scoped>
.progress-wrapper {
  position: relative;
}
.progress-label {
  position: absolute;
  width: 100%;
  color: #000;
  font-weight: bold;
  text-align: center;
  line-height: 1rem;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}
</style>
