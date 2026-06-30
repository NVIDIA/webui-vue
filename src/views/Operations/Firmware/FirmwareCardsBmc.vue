<template>
  <div>
    <page-section
      v-for="group in BmcGroups"
      :key="group.key"
      :section-title="$t(group.sectionTitleKey)"
    >
      <b-row class="row-cols-1 row-cols-md-2">
        <!-- Running image -->
        <b-col class="mb-3">
          <b-card class="h-100">
            <template #header>
              <p class="fw-bold m-0">
                {{ $t('pageFirmware.cardTitleRunning') }}
              </p>
            </template>
            <dl class="mb-0">
              <dt>{{ $t('pageFirmware.cardBodyVersion') }}</dt>
              <dd class="mb-0">{{ runningVersion(group) }}</dd>
            </dl>
          </b-card>
        </b-col>

        <!-- Backup image -->
        <b-col v-if="group.backupFirmware" class="mb-3">
          <b-card class="h-100">
            <template #header>
              <p class="fw-bold m-0">
                {{ $t('pageFirmware.cardTitleBackup') }}
              </p>
            </template>
            <dl>
              <dt>{{ $t('pageFirmware.cardBodyVersion') }}</dt>
              <dd>
                <status-icon
                  v-if="showBackupImageStatus(group)"
                  status="danger"
                />
                <span
                  v-if="showBackupImageStatus(group)"
                  class="visually-hidden-focusable"
                >
                  {{ backupStatus(group) }}
                </span>
                {{ backupVersion(group) }}
              </dd>
            </dl>
            <b-btn
              v-if="
                group.switchSupported &&
                  !switchToBackupImageDisabled &&
                  isBackupUpdateable(group)
              "
              data-test-id="firmware-button-switchToRunning"
              variant="link"
              size="sm"
              class="py-0 px-1 mt-2"
              :disabled="
                isPageDisabled ||
                  !group.backupFirmware ||
                  !isServerOff
              "
              @click="switchToRunning(group)"
            >
              <icon-switch class="d-none d-sm-inline-block" />
              {{ $t('pageFirmware.cardActionSwitchToRunning') }}
            </b-btn>
          </b-card>
        </b-col>
      </b-row>
    </page-section>
    <modal-switch-to-running
      v-model="showSwitchToRunning"
      :backup="switchBackupVersion"
      @ok="confirmSwitchToRunning"
    />
  </div>
</template>

<script>
import IconSwitch from '@carbon/icons-vue/es/arrows--horizontal/20';
import PageSection from '@/components/Global/PageSection';
import LoadingBarMixin, { loading } from '@/components/Mixins/LoadingBarMixin';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import { useFirmwareInventory } from '@/api/composables/useFirmwareInventory';

import ModalSwitchToRunning from './FirmwareModalSwitchToRunning';
import i18n from '@/i18n';

export default {
  components: { IconSwitch, ModalSwitchToRunning, PageSection },
  mixins: [BVToastMixin, LoadingBarMixin],
  props: {
    isPageDisabled: {
      required: true,
      type: Boolean,
      default: false,
    },
    isServerOff: {
      required: true,
      type: Boolean,
      default: false,
    },
  },
  setup() {
    const firmware = useFirmwareInventory();
    return {
      BmcGroups: firmware.BmcGroups,
      isSingleFileUploadEnabled: firmware.isSingleFileUploadEnabled,
    };
  },
  data() {
    return {
      loading,
      switchToBackupImageDisabled:
        import.meta.env.VITE_SWITCH_TO_BACKUP_IMAGE_DISABLED === 'true',
      showSwitchToRunning: false,
      switchBackupVersion: '--',
      pendingSwitchGroup: null,
    };
  },
  methods: {
    runningVersion(group) {
      return group.activeFirmware?.Version || '--';
    },
    backupVersion(group) {
      return group.backupFirmware?.Version || '--';
    },
    backupStatus(group) {
      return group.backupFirmware?.Status?.Health || null;
    },
    isBackupUpdateable(group) {
      const backup = group.backupFirmware;
      return (
        typeof backup?.Updateable === 'undefined' ||
        backup?.Updateable === true
      );
    },
    showBackupImageStatus(group) {
      const status = this.backupStatus(group);
      return status === 'Critical' || status === 'Warning';
    },
    switchToRunning(group) {
      this.pendingSwitchGroup = group;
      this.switchBackupVersion = this.backupVersion(group);
      this.showSwitchToRunning = true;
    },
    confirmSwitchToRunning() {
      const group = this.pendingSwitchGroup;
      if (!group?.backupFirmware) {
        this.errorToast(this.$t('pageFirmware.toast.errorNoBackupImage'));
        return;
      }

      const backupLocation = group.backupFirmware['@odata.id'];
      if (!backupLocation) {
        this.errorToast(this.$t('pageFirmware.toast.errorNoBackupImage'));
        return;
      }

      this.startLoader();
      const timerId = setTimeout(() => {
        this.endLoader();
        this.infoToast(
          i18n.global.t('pageFirmware.toast.verifySwitchMessage'),
          {
            title: i18n.global.t('pageFirmware.toast.verifySwitch'),
            refreshAction: true,
          },
        );
      }, 60000);

      this.$store
        .dispatch('firmware/switchBmcFirmwareAndReboot', backupLocation)
        .then(() =>
          this.infoToast(
            i18n.global.t('pageFirmware.toast.rebootStartedMessage'),
            {
              title: i18n.global.t('pageFirmware.toast.rebootStarted'),
            },
          ),
        )
        .catch(({ message }) => {
          this.errorToast(message);
          clearTimeout(timerId);
          this.endLoader();
        })
        .finally(() => {
          this.pendingSwitchGroup = null;
        });
    },
  },
};
</script>
