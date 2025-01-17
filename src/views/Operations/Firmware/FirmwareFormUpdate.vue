<template>
  <div>
    <div class="form-background p-3">
      <b-form @submit.stop.prevent="onSubmitUpload">
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
          v-model="form.forceUpdate"
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
                <b-link
                  v-if="showTrustCertificateLink"
                  :disabled="isPageDisabled || isFirmwareUpdateInProgress"
                  to='/security-and-access/certificates'
                >
                  {{ $t('pageFirmware.form.updateFirmware.trustCertificate') }}
                </b-link>
              </div>
            </template>
            <b-form-input
              id="file-address"
              v-model="form.ImageURI"
              type="text"
              :state="!$v.form.ImageURI.$invalid && !serverError"
              :disabled="isPageDisabled || isFirmwareUpdateInProgress"
              @blur="$v.form.ImageURI.$touch()"
              @input="clearServerError"
            />
            <b-form-invalid-feedback role="alert" v-if="$v.form.ImageURI.$error">
              <span v-if="!$v.form.ImageURI.serverError">
                <a href="#"
                  @click.prevent="showDetailServerError"
                  :title="$t('pageFirmware.form.updateFirmware.clickToViewApiResponse')"
                  class="error"
                >
                  {{ errorDetails }}
                </a>
              </span>
            </b-form-invalid-feedback>
          </b-form-group>
          <b-form-group
            v-if="isUsernameNeeded"
            :label="$t('pageFirmware.form.updateFirmware.username')"
            label-for="username"
          >
            <b-form-input
              id="username"
              v-model="form.username"
              type="text"
              :state="getValidationState($v.form.username)"
              :disabled="isPageDisabled || isFirmwareUpdateInProgress"
              @input="$v.form.username.$touch()"
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
        <div class="mb-3">
          <b-form-invalid-feedback role="alert" :state="false" v-if="$v.form.ImageURI.$error">
            <span v-if="!$v.form.ImageURI.required">
              {{ $t('global.form.fieldRequired') }}
            </span>
          </b-form-invalid-feedback>
          <b-form-invalid-feedback role="alert" :state="false" v-if="$v.form.Target.$error">
            <span v-if="!$v.form.Target.serverError">
              <a href="#"
                @click.prevent="showDetailServerError"
                :title="$t('pageFirmware.form.updateFirmware.clickToViewApiResponse')"
                class="error"
              >
                {{ errorDetails }}
              </a>
            </span>
          </b-form-invalid-feedback>
          <b-form-invalid-feedback role="alert" :state="false" v-if="redfishCommonError">
            <span>
              <a href="#"
                @click.prevent="showDetailServerError"
                :title="$t('pageFirmware.form.updateFirmware.clickToViewApiResponse')"
                class="error"
              >
                {{ errorDetails }}
              </a>
            </span>
          </b-form-invalid-feedback>
        </div>
        <b-btn
          data-test-id="firmware-button-startUpdate"
          type="submit"
          variant="primary"
          :disabled="isPageDisabled || isFirmwareUpdateInProgress || hasFormError"
        >
          {{ $t('pageFirmware.form.updateFirmware.startUpdate') }}
        </b-btn>
      </b-form>
    </div>

    <!-- Modals -->
    <modal-update-firmware :targets="form.Target" @ok="updateFirmware" />
    <modal-confirm-identity :default-remote-server-ip="remoteServerIp" />
    <json-modal
      :title="$t('pageFirmware.form.updateFirmware.apiErrorResponse')"
    >
      {{ serverError }}
    </json-modal>
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
import JsonModal from '@/components/Global/JsonModal.vue';
import { generateValidation } from '@/components/Validators/redfishAction';

export default {
  components: { FormFile, ModalUpdateFirmware, ModalConfirmIdentity, JsonModal },
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
      form: {
        ImageURI: null,
        username: null,
        forceUpdate: false,
        Target: [],
      },
      isUploading: false,
      isServerPowerOffRequired:
        process.env.VUE_APP_SERVER_OFF_REQUIRED === 'true',
      isBluefield: process.env.VUE_APP_ENV_NAME === 'nvidia-bluefield',
      bluefieldTarget: 'BMC',
      isNvidiaGB: process.env.VUE_APP_ENV_NAME === 'nvidia-gb',
      nvidiaGBTarget: 'BMC',
      hideFirmwareTargets:
        process.env.VUE_APP_HIDE_FIRMWARE_TARGETS === 'true',
      serverError: null,
      errorDetails: null,
      redfishCommonError: false,
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

      // Force update is not supported for SimpleUpdate on Bluefield platform
      if (this.isBluefield && !this.isLocalSelected ) return false;
      return true;
    },
    computedTargets() {
      if (this.isBluefield) {
        if (this.fileSource === 'LOCAL') return [];
        else return ['redfish/v1/UpdateService/FirmwareInventory/DPU_OS'];
      } else if (this.isNvidiaGB && this.nvidiaGBTarget === 'HMC') {
        let targets = [...this.$store.state.firmware.checkedItems];
        if (!targets.length) {
          targets.push('/redfish/v1/Chassis/HGX_Chassis_0');
        }
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
    showTrustCertificateLink() {
      return this.fileSource === 'HTTPS';
    },
    remoteServerIp() {
      return this.form.ImageURI?.split('/')?.[0];
    },
    uploadProgress() {
      return this.$store.getters['firmware/getFirmwareUploadProgress'];
    },
    hasFormError() {
      return this.serverError && !this.$v.$dirty && !this.$v.$anyError;
    },
  },
  watch: {
    fileSource: function () {
      this.$v.$reset();
      this.file = null;
      this.form.ImageURI = null;
      this.form.username = null;
      this.serverError = null;
      this.redfishCommonError = false;
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
    computedTargets: {
      handler(newValue) {
        this.clearServerError();
        this.form.Target = newValue;
      },
      immediate: true,
    },
    'form.Target': {
      handler() {
        this.clearServerError();
        this.$v.form.Target.$touch();
      }
    },
  },
  validations() {
    return {
      file: {
        required: requiredIf(function () {
          return this.isLocalSelected;
        }),
      },
      form: {
        ...generateValidation(
          this,
          'ImageURI',
          this.$t('pageFirmware.form.updateFirmware.invalidFileAddress'),
          {
            required: requiredIf(function () {
              return !this.isLocalSelected;
            }),
          }
        ),
        ...generateValidation(
          this,
          'Target',
          this.$t('pageFirmware.form.updateFirmware.invalidTargetSelection')
        ),
        username: {
          required: requiredIf(function () {
            return this.isUsernameNeeded;
          }),
        },
      },
    };
  },
  created() {
    this.$store.dispatch('firmware/getUpdateServiceSettings');
    this.$store.dispatch('firmware/attachExistingUpdateTask');
  },
  methods: {
    clearServerError() {
      this.serverError = null;
      this.redfishCommonError = false;
    },
    showDetailServerError() {
      this.$bvModal.show('json-modal');
    },
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
        .catch(({ message, cause }) => {
          this.serverError = cause?.response?.data?.error || null;
          this.$v.$touch();
          this.validateRedfishError();
          const lastToast = document.querySelector('.toast');
          this.$bvToast.hide(lastToast.id);
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
          forceUpdate: this.form.forceUpdate,
          targets: this.form.Target,
        });
      } else {
        return this.$store.dispatch('firmware/uploadFirmwareSimpleUpdate', {
          protocol: this.fileSource,
          fileAddress: this.form.ImageURI,
          forceUpdate: this.form.forceUpdate,
          username: this.form.username,
          targets: this.form.Target,
        });
      }
    },
    displayUpdateProgress(
      { state, taskPercent, errMsg, jsonErrMsg },
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
        if (oldInitiator) {
          this.serverError = jsonErrMsg || null;
          this.$v.$touch();
          this.validateRedfishError(errMsg);
          const lastToast = document.querySelector('.toast');
          this.$bvToast.hide(lastToast.id);
        }
      }
    },
    onConfirmIdentity() {
      this.$bvModal.show('modal-confirm-identity');
    },
    onSubmitUpload() {
      this.$v.$touch();
      if (this.$v.$invalid) return;
      if (this.hasCheckedTargets) {
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
