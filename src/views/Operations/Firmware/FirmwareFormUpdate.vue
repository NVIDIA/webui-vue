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
              class="me-3"
            >
              BMC
            </b-form-radio>
            <b-form-radio
              id="bluefield-target-cec"
              v-model="bluefieldTarget"
              name="bluefield-target"
              value="CEC"
              class="me-3"
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
          v-else-if="isNvidiaGB || isNvidiaVR"
          :label="$t('pageFirmware.form.updateFirmware.target')"
          :disabled="isPageDisabled || isFirmwareUpdateInProgress"
          class="mb-3"
        >
          <b-form-radio
            id="nvidia-target-bmc"
            v-model="nvidiaGBTarget"
            name="nvidia-target"
            value="BMC"
            inline
          >
            BMC
          </b-form-radio>
          <b-form-radio
            id="nvidia-target-hmc"
            v-model="nvidiaGBTarget"
            name="nvidia-target"
            value="HMC"
            inline
          >
            HMC
          </b-form-radio>
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

        <b-form-checkbox
          v-if="isApplyTimeOptionEnabled"
          v-model="applyOnReset"
          class="mb-4"
          :disabled="isPageDisabled || isFirmwareUpdateInProgress"
        >
          {{ $t('pageFirmware.form.updateFirmware.applyOnReset') }}
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
              :state="getValidationState(v$.file)"
              aria-describedby="image-file-help-block"
              @input="onFileUpload($event)"
            >
              <template #invalid>
                <b-form-invalid-feedback
                  v-if="v$.file.$error"
                  role="alert"
                  :state="false"
                >
                  {{ $t('global.form.fieldRequired') }}
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
              :state="!v$.form.ImageURI.$invalid && !serverError"
              :disabled="isPageDisabled || isFirmwareUpdateInProgress"
              @blur="v$.form.ImageURI.$touch()"
              @input="clearServerError"
            />
            <b-form-invalid-feedback v-if="v$.form.ImageURI.$error" role="alert">
              <span v-if="v$.form.ImageURI.serverError?.$invalid">
                <a
href="#"
                  :title="$t('pageFirmware.form.updateFirmware.clickToViewApiResponse')"
                  class="error"
                  @click.prevent="showDetailServerError"
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
              :state="getValidationState(v$.form.username)"
              :disabled="isPageDisabled || isFirmwareUpdateInProgress"
              @input="v$.form.username.$touch()"
            />
            <b-form-invalid-feedback role="alert">
              {{ $t('global.form.fieldRequired') }}
            </b-form-invalid-feedback>
          </b-form-group>
        </template>
        <b-alert
          v-if="showTaskProgressAlert"
          variant="info"
          :model-value="true"
          class="mb-2"
        >
          {{ taskProgressLabel }}
        </b-alert>
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
          <b-progress
            v-else-if="isTaskUpdateInProgress"
            animated
            striped
            class="mt-2 mb-2"
          >
            <b-progress-bar
              :value="taskProgressDisplayValue"
              :max="100"
            >
              <span class="progress-label">
                {{ taskProgressLabel }}
              </span>
            </b-progress-bar>
          </b-progress>
        </div>
        <div class="mb-3">
          <b-form-invalid-feedback v-if="v$.form.ImageURI.$error" role="alert" :state="false">
            <span v-if="v$.form.ImageURI.required?.$invalid">
              {{ $t('global.form.fieldRequired') }}
            </span>
          </b-form-invalid-feedback>
          <b-form-invalid-feedback v-if="v$.form.Target.$error" role="alert" :state="false">
            <span v-if="v$.form.Target.serverError?.$invalid">
              <a
href="#"
                :title="$t('pageFirmware.form.updateFirmware.clickToViewApiResponse')"
                class="error"
                @click.prevent="showDetailServerError"
              >
                {{ errorDetails }}
              </a>
            </span>
          </b-form-invalid-feedback>
          <b-form-invalid-feedback v-if="redfishCommonError" role="alert" :state="false">
            <span>
              <a
href="#"
                :title="$t('pageFirmware.form.updateFirmware.clickToViewApiResponse')"
                class="error"
                @click.prevent="showDetailServerError"
              >
                {{ errorDetails }}
              </a>
            </span>
          </b-form-invalid-feedback>
        </div>
        <!-- Offer a force retry when an update failed without Force Update -->
        <div v-if="showRetryWithForce" class="mb-3">
          <b-btn variant="primary" @click="retryWithForce">
            {{ $t('pageFirmware.form.updateFirmware.retryWithForce') }}
          </b-btn>
        </div>

        <!-- Offer activation actions once an update completes -->
        <div
          v-if="showCompletionActions && (showRestartBmcAction || showAuxResetAction)"
          class="mb-3"
        >
          <b-btn
            v-if="showRestartBmcAction"
            variant="secondary"
            class="me-2"
            @click="onRestartBmc"
          >
            {{ $t('pageFirmware.form.updateFirmware.restartBmc') }}
          </b-btn>
          <b-btn
            v-if="showAuxResetAction"
            variant="secondary"
            @click="onAuxResetSystem"
          >
            {{ $t('pageFirmware.form.updateFirmware.auxResetSystem') }}
          </b-btn>
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
    <modal-update-firmware
      v-model="isUpdateModalVisible"
      :targets="form.Target"
      @ok="updateFirmware"
    />
    <modal-confirm-identity :default-remote-server-ip="remoteServerIp" />
    <json-modal
      :title="$t('pageFirmware.form.updateFirmware.apiErrorResponse')"
      :content="serverError"
    >
      {{ serverError }}
    </json-modal>
  </div>
</template>

<script>
import { requiredIf, helpers } from '@vuelidate/validators';

import BVToastMixin from '@/components/Mixins/BVToastMixin';
import LoadingBarMixin, { loading } from '@/components/Mixins/LoadingBarMixin';
import VuelidateMixin from '@/components/Mixins/VuelidateMixin.js';
import { useVuelidate } from '@vuelidate/core';
import { useModal } from 'bootstrap-vue-next';
import { getOdataId } from '@/utilities/redfishUtils';

import FormFile from '@/components/Global/FormFile';
import ModalUpdateFirmware from './FirmwareModalUpdateFirmware';
import ModalConfirmIdentity from './FirmwareModalConfirmIdentity';
import JsonModal from '@/components/Global/JsonModal.vue';
import { generateValidation } from '@/components/Validators/redfishAction';
import { mapState } from 'vuex';
import { isNvidiaPlatform } from '@/i18n';

const FIRMWARE_UPDATE_STARTED_TOAST_ID = 'firmware-update-started-toast';

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
  setup() {
    const bvModal = useModal();
    return {
      v$: useVuelidate(),
      bvModal,
    };
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
        import.meta.env.VITE_SERVER_OFF_REQUIRED === 'true',
      isBluefield: import.meta.env.VITE_ENV_NAME === 'nvidia-bluefield',
      bluefieldTarget: 'BMC',
      isNvidiaGB: import.meta.env.VITE_ENV_NAME === 'nvidia-gb',
      isNvidiaVR: import.meta.env.VITE_ENV_NAME === 'nvidia-vr',
      nvidiaGBTarget: 'BMC',
      hideFirmwareTargets:
        import.meta.env.VITE_HIDE_FIRMWARE_TARGETS === 'true',
      serverError: null,
      errorDetails: null,
      redfishCommonError: false,
      isUpdateModalVisible: false,
      applyOnReset: false,
      showRetryWithForce: false,
      showCompletionActions: false,
      trackedUpdateInitiator: false,
      prevFirmwareUpdateSnapshot: null,
    };
  },
  computed: {
    ...mapState('firmware', {
      firmwareUpdateState: (state) => state.firmwareUpdateInfo.state,
      firmwareTaskPercent: (state) => state.firmwareUpdateInfo.taskPercent,
    }),
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
      return this.$store.state.firmware.firmwareUpdateInfo;
    },
    isFirmwareUpdateInProgress() {
      return (
        this.isUploading ||
        this.$store.getters['firmware/isFirmwareUpdateInProgress']
      );
    },
    showTaskProgressAlert() {
      return (
        !this.isUploading &&
        (this.firmwareUpdateState === 'TaskStarted' ||
          this.firmwareUpdateState === 'TaskCompleted')
      );
    },
    isTaskUpdateInProgress() {
      return this.firmwareUpdateState === 'TaskStarted' && !this.isUploading;
    },
    taskProgressPercent() {
      return this.firmwareTaskPercent ?? 0;
    },
    // BMC may report PercentComplete 0 during transfer; show indeterminate bar.
    taskProgressDisplayValue() {
      const percent = this.taskProgressPercent;
      return percent > 0 ? percent : 100;
    },
    taskProgressLabel() {
      const percent = this.taskProgressPercent;
      if (percent > 0) return `${percent}%`;
      return this.$t('pageFirmware.form.updateFirmware.taskInProgress');
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
    isApplyTimeOptionEnabled() {
      // @Redfish.OperationApplyTime is only honored on the multipart push path
      return (
        this.isLocalSelected &&
        this.$store.getters['firmware/multipartHttpPushUri'] != null
      );
    },
    computedTargets() {
      if (this.isBluefield) {
        if (this.fileSource === 'LOCAL') return [];
        else return ['redfish/v1/UpdateService/FirmwareInventory/DPU_OS'];
      } else if ((this.isNvidiaGB || this.isNvidiaVR) && this.nvidiaGBTarget === 'HMC') {
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
      return this.serverError && !this.v$.$dirty && !this.v$.$anyError;
    },
    showRestartBmcAction() {
      if ((this.isNvidiaGB || this.isNvidiaVR) && this.nvidiaGBTarget === 'HMC') {
        return false;
      }
      return true;
    },
    showAuxResetAction() {
      return isNvidiaPlatform();
    },
  },
  watch: {
    fileSource: function () {
      this.v$.$reset();
      this.file = null;
      this.form.ImageURI = null;
      this.form.username = null;
      this.serverError = null;
      this.redfishCommonError = false;
    },
    'firmwareUpdateInfo.initiator'(initiator) {
      if (initiator) {
        this.trackedUpdateInitiator = true;
      } else if (this.isActiveFirmwareUpdateState(this.firmwareUpdateState)) {
        this.trackedUpdateInitiator = false;
        this.showCompletionActions = false;
        this.showRetryWithForce = false;
      }
    },
    firmwareUpdateState: {
      handler(newState, oldState) {
        const info = this.firmwareUpdateInfo;
        const isInitialRun = oldState === undefined;
        const prev = this.prevFirmwareUpdateSnapshot ?? info;

        if (newState === 'TaskStarted' && oldState !== 'TaskStarted') {
          this.trackedUpdateInitiator = !!info.initiator;
        }

        // immediate: true runs before we have a prior state; seed the snapshot
        // only so reload/rehydrate does not look like a fresh transition.
        if (!isInitialRun) {
          this.displayUpdateProgress(info, {
            state: oldState ?? prev.state,
            initiator:
              oldState == null ? prev.initiator : this.trackedUpdateInitiator,
            activationResetPerformed: prev.activationResetPerformed,
          });
        }

        this.prevFirmwareUpdateSnapshot = {
          state: info.state,
          initiator: info.initiator,
          activationResetPerformed: info.activationResetPerformed,
        };
      },
      immediate: true,
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
      immediate: true,
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
        this.v$.form.Target.$touch();
      },
    },
  },
  async created() {
    this.syncTrackedUpdateInitiator(this.firmwareUpdateInfo);
    // Load the UpdateService URIs first: attachExistingUpdateTask matches an
    // in-progress task's Payload.TargetUri against multipartHttpPushUri (et al),
    // so those must be populated before the scan runs. This is the page-load
    // fallback that surfaces a flash started by another session when SSE isn't
    // delivering events (e.g. SSE-over-HTTP/2 unavailable).
    try {
      await this.$store.dispatch('firmware/getUpdateServiceSettings');
    } catch (error) {
      console.error(
        '[FirmwareFormUpdate] getUpdateServiceSettings failed:',
        error,
      );
    }
    this.$store
      .dispatch('firmware/attachExistingUpdateTask')
      .catch((error) =>
        console.error(
          '[FirmwareFormUpdate] attachExistingUpdateTask failed:',
          error,
        ),
      );
  },
  validations() {
    // Vuelidate v2 `required` treats File objects as empty because File has no enumerable keys.
    // Use a custom "required" check for file inputs.
    const requiredLocalFile = helpers.withMessage(
      this.$t('global.form.fieldRequired'),
      (value) => !this.isLocalSelected || value != null,
    );
    return {
      file: {
        required: requiredLocalFile,
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
  methods: {
    isActiveFirmwareUpdateState(state) {
      return (
        state != null &&
        state !== 'Done' &&
        state !== 'ResetFailed' &&
        state !== 'WaitReadyFailed' &&
        state !== 'TaskFailed'
      );
    },
    syncTrackedUpdateInitiator(info) {
      if (info.initiator) {
        this.trackedUpdateInitiator = true;
      } else if (this.isActiveFirmwareUpdateState(info.state)) {
        this.trackedUpdateInitiator = false;
      } else if (
        sessionStorage.getItem('firmwareUpdateInitiator') === 'true'
      ) {
        this.trackedUpdateInitiator = true;
      } else {
        this.trackedUpdateInitiator = false;
      }
    },
    clearServerError() {
      this.serverError = null;
      this.redfishCommonError = false;
    },
    showDetailServerError() {
      const modal = this.bvModal.get('json-modal');
      modal?.show?.();
    },
    updateFirmware() {
      this.showRetryWithForce = false;
      this.showCompletionActions = false;
      this.trackedUpdateInitiator = false;
      this.isUploading = true;
      this.$store.commit('firmware/setFirmwareUploadProgress', 0);
      this.infoToast(this.$t('pageFirmware.toast.updateStartedMessage'), {
        title: this.$t('pageFirmware.toast.updateStarted'),
        timestamp: true,
        id: FIRMWARE_UPDATE_STARTED_TOAST_ID,
      });
      this.dispatchFileUpload()
        .then((resp) => {
          const taskHandle = getOdataId(resp?.data);
          this.$store.dispatch('firmware/setFirmwareUpdateTask', {
            taskHandle: taskHandle,
            initiator: true,
          });
        })
        .catch(({ message, cause }) => {
          this.serverError = cause?.response?.data?.error || null;
          this.v$.$touch();
          this.validateRedfishError();
          this.$toast?.hide?.(FIRMWARE_UPDATE_STARTED_TOAST_ID);
        })
        .finally(() => {
          this.isUploading = false;
          this.$store.commit('firmware/setFirmwareUploadProgress', 0);
        });
    },
    dispatchFileUpload() {
      if (this.fileSource === 'LOCAL') {
        return this.$store.dispatch('firmware/uploadFirmware', {
          image: this.file,
          forceUpdate: this.form.forceUpdate,
          targets: this.form.Target,
          applyTime: this.applyOnReset ? 'OnReset' : 'Immediate',
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
    displayUpdateProgress(newInfo = {}, oldInfo = {}) {
      const { state, errMsg, jsonErrMsg } = newInfo;
      const { state: oldState, initiator: oldInitiator } = oldInfo;
      if (!state) return;
      // Ignore transitions from an unset prior state (e.g. attachExistingUpdateTask
      // rehydrating a task that already finished in a previous session).
      const isStateTransition =
        oldState != null && oldState !== state;
      if (state === 'TaskStarted') {
        // Task polling progress is shown via the global banner / store only.
      } else if (state === 'TaskCompleted' && isStateTransition) {
        // Waiting for activation — no global loading bar.
      } else if (state === 'Done' && isStateTransition) {
        this.endLoader();
        if (oldInitiator) {
          this.showCompletionActions =
            !this.applyOnReset && !newInfo.activationResetPerformed;
          this.infoToast(this.$t('pageFirmware.toast.verifyUpdateMessage'), {
            title: this.$t('pageFirmware.toast.verifyUpdate'),
            refreshAction: true,
          });
        }
      } else if (state === 'ResetFailed' && isStateTransition) {
        this.endLoader();
        if (oldInitiator)
          this.errorToast(this.$t('pageFirmware.toast.resetFailedMessage'));
      } else if (state === 'WaitReadyFailed' && isStateTransition) {
        this.endLoader();
        if (oldInitiator) {
          if (!this.applyOnReset && !newInfo.activationResetPerformed) {
            this.showCompletionActions = true;
          } else {
            this.errorToast(this.$t('pageFirmware.toast.waitReadyFailedMessage'));
          }
        }
      } else if (state === 'TaskFailed' && isStateTransition) {
        this.endLoader();
        if (oldInitiator) {
          // Offer a force retry when the failure wasn't already a forced update
          this.showRetryWithForce = !this.form.forceUpdate;
          this.serverError = jsonErrMsg || null;
          this.v$.$touch();
          this.validateRedfishError(errMsg);
          this.$toast?.hide?.(FIRMWARE_UPDATE_STARTED_TOAST_ID);
          if (errMsg) {
            this.warningToast(errMsg, {
              title: this.$t('pageFirmware.toast.updateSkipped'),
            });
          }
        }
      }
    },
    onConfirmIdentity() {
      const modal = this.bvModal.get('modal-confirm-identity');
      modal?.show?.();
    },
    onSubmitUpload() {
      this.v$.$touch();
      if (this.v$.$invalid) {
        return;
      }
      if (this.hasCheckedTargets) {
        this.$confirm({
          message: this.$t('pageFirmware.form.updateFirmware.confirmCheckedMessage'),
          buttonSize: 'sm',
          okVariant: 'danger',
          okTitle: this.$t('global.action.confirm'),
          cancelTitle: this.$t('global.action.cancel'),
          cancelVariant: 'secondary',
        }).then((confirmed) => {
          if (confirmed) {
            this.isUpdateModalVisible = true;
          }
        });
      } else {
        this.isUpdateModalVisible = true;
      }
    },
    onFileUpload(file) {
      this.file = file;
      this.v$.file.$touch();
    },
    retryWithForce() {
      this.form.forceUpdate = true;
      this.showRetryWithForce = false;
      this.clearServerError();
      this.updateFirmware();
    },
    onRestartBmc() {
      this.$confirm({
        message: this.$t(
          'pageFirmware.form.updateFirmware.confirmRestartBmcMessage',
        ),
        okTitle: this.$t('global.action.confirm'),
        cancelTitle: this.$t('global.action.cancel'),
        okVariant: 'danger',
        cancelVariant: 'secondary',
      }).then((confirmed) => {
        if (!confirmed) return;
        this.$store
          .dispatch('firmware/restartBmc')
          .then((message) => this.successToast(message))
          .catch((error) => this.errorToast(error.message));
      });
    },
    onAuxResetSystem() {
      this.$confirm({
        message: this.$t(
          'pageFirmware.form.updateFirmware.confirmAuxResetMessage',
        ),
        okTitle: this.$t('global.action.confirm'),
        cancelTitle: this.$t('global.action.cancel'),
        okVariant: 'danger',
        cancelVariant: 'secondary',
      }).then((confirmed) => {
        if (!confirmed) return;
        this.$store
          .dispatch('firmware/auxPowerResetSystem')
          .then((message) =>
            this.successToast(message, {
              title: this.$t('pageFirmware.toast.auxResetStarted'),
            }),
          )
          .catch((error) => this.errorToast(error.message));
      });
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
