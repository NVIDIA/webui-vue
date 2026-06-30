<template>
  <div v-if="showBanner" class="firmware-progress-banner">
    <b-alert variant="info" show class="firmware-progress-banner__alert mb-0">
      <div class="firmware-progress-banner__content">
        <span class="firmware-progress-banner__indicator" />
        <span class="firmware-progress-banner__text">
          {{ bannerStatusText }}
        </span>
        <button
          type="button"
          class="ms-3 btn btn-sm btn-primary"
          :disabled="taskOutputLoading"
          @click="viewTaskOutput"
        >
          {{ $t('pageFirmware.banner.viewDetails') }}
        </button>
      </div>
      <button
        type="button"
        class="btn-close firmware-progress-banner__close"
        :aria-label="$t('global.action.close')"
        @click="dismiss"
      />
    </b-alert>
    <json-modal
      modal-id="firmware-task-json-modal"
      :title="$t('pageFirmware.banner.taskOutput')"
      :content="taskOutputContent"
    />
  </div>
</template>

<script>
import { mapState } from 'vuex';
import { useModal } from 'bootstrap-vue-next';
import api from '@/store/api';
import JsonModal from '@/components/Global/JsonModal.vue';

function firmwareTaskId(taskHandle, taskResponse) {
  if (taskResponse?.Id != null && taskResponse.Id !== '') {
    return String(taskResponse.Id);
  }
  const match = String(taskHandle ?? '').match(/\/Tasks\/([^/]+)$/);
  return match?.[1] ?? '?';
}

export default {
  name: 'FirmwareProgressBanner',
  components: { JsonModal },
  setup() {
    return { bvModal: useModal() };
  },
  data() {
    return {
      dismissed: false,
      taskOutputContent: null,
      taskOutputLoading: false,
    };
  },
  computed: {
    ...mapState('firmware', {
      firmwareUpdateState: (state) => state.firmwareUpdateInfo.state,
      firmwareTaskPercent: (state) => state.firmwareUpdateInfo.taskPercent,
      firmwareTaskResponse: (state) => state.firmwareUpdateInfo.taskResponse,
      firmwareTaskHandle: (state) => state.firmwareUpdateInfo.taskHandle,
    }),
    isFirmwareUpdateInProgress() {
      return this.$store.getters['firmware/isFirmwareUpdateInProgress'];
    },
    bannerStatusText() {
      const taskId = firmwareTaskId(
        this.firmwareTaskHandle,
        this.firmwareTaskResponse,
      );

      if (this.firmwareUpdateState === 'TaskCompleted') {
        return this.$t('pageFirmware.banner.statusActivating', { taskId });
      }

      if (this.firmwareUpdateState === 'TaskStarted') {
        const percent = this.firmwareTaskPercent;
        if (typeof percent === 'number' && percent > 0) {
          return this.$t('pageFirmware.banner.statusWithPercent', {
            taskId,
            percent,
          });
        }
        return this.$t('pageFirmware.banner.statusStarting', { taskId });
      }

      return this.$t('pageFirmware.banner.statusStarting', { taskId });
    },
    showBanner() {
      if (!this.isFirmwareUpdateInProgress) return false;
      if (this.dismissed) return false;
      return true;
    },
  },
  watch: {
    // Re-show the banner when a new update starts after a previous dismiss.
    isFirmwareUpdateInProgress(inProgress, wasInProgress) {
      if (inProgress && !wasInProgress) {
        this.dismissed = false;
      }
    },
  },
  methods: {
    dismiss() {
      this.dismissed = true;
    },
    async viewTaskOutput() {
      this.taskOutputLoading = true;
      try {
        if (this.firmwareTaskHandle) {
          const resp = await api.get(this.firmwareTaskHandle).catch(() => null);
          this.taskOutputContent = resp?.data ?? this.firmwareTaskResponse;
        } else {
          this.taskOutputContent = this.firmwareTaskResponse;
        }
      } finally {
        this.taskOutputLoading = false;
        this.bvModal.get('firmware-task-json-modal')?.show?.();
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.firmware-progress-banner {
  position: sticky;
  top: $header-height;
  left: 0;
  right: 0;
  z-index: $zindex-fixed;
}

.firmware-progress-banner__alert {
  border-radius: 0;
  position: relative;
  padding-right: 2.5rem; // room for the close button
}

.firmware-progress-banner__content {
  display: flex;
  align-items: center;
}

.firmware-progress-banner__text {
  line-height: 1.4;
}

.firmware-progress-banner__close {
  position: absolute;
  top: 0.6rem;
  right: 0.75rem;
}

.firmware-progress-banner__indicator {
  display: inline-block;
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: currentColor;
  margin-right: 0.5rem;
  animation: firmware-banner-pulse 2.5s ease-in-out infinite;
}

@keyframes firmware-banner-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.35;
    transform: scale(0.8);
  }
}
</style>
