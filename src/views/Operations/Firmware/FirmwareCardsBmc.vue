<template>
  <div>
    <page-section :section-title="sectionTitle">
      <b-card-group deck>
        <!-- Running image -->
        <b-card>
          <template #header>
            <p class="font-weight-bold m-0">
              {{ $t('pageFirmware.cardTitleRunning') }}
            </p>
          </template>
          <dl class="mb-0">
            <dt>{{ $t('pageFirmware.cardBodyVersion') }}</dt>
            <dd class="mb-0">{{ runningVersion }}</dd>
          </dl>
        </b-card>

        <!-- Backup image -->
        <b-card v-if="backup">
          <template #header>
            <p class="font-weight-bold m-0">
              {{ $t('pageFirmware.cardTitleBackup') }}
            </p>
          </template>
          <dl>
            <dt>{{ $t('pageFirmware.cardBodyVersion') }}</dt>
            <dd>
              <status-icon v-if="showBackupImageStatus" status="danger" />
              <span v-if="showBackupImageStatus" class="sr-only">
                {{ backupStatus }}
              </span>
              {{ backupVersion }}
            </dd>
          </dl>
          <b-btn
            v-if="!switchToBackupImageDisabled && isBackupUpdateable"
            v-b-modal.modal-switch-to-running
            data-test-id="firmware-button-switchToRunning"
            variant="link"
            size="sm"
            class="py-0 px-1 mt-2"
            :disabled="isPageDisabled || !backup || !isServerOff"
          >
            <icon-switch class="d-none d-sm-inline-block" />
            {{ $t('pageFirmware.cardActionSwitchToRunning') }}
          </b-btn>
        </b-card>
      </b-card-group>
    </page-section>
    <modal-switch-to-running :backup="backupVersion" @ok="switchToRunning" />
  </div>
</template>

<script>
import IconSwitch from '@carbon/icons-vue/es/arrows--horizontal/20';
import PageSection from '@/components/Global/PageSection';
import LoadingBarMixin, { loading } from '@/components/Mixins/LoadingBarMixin';
import BVToastMixin from '@/components/Mixins/BVToastMixin';

import ModalSwitchToRunning from './FirmwareModalSwitchToRunning';

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
  data() {
    return {
      loading,
      switchToBackupImageDisabled:
        process.env.VUE_APP_SWITCH_TO_BACKUP_IMAGE_DISABLED === 'true',
    };
  },
  computed: {
    sectionTitle() {
      return this.$t('pageFirmware.sectionTitleBmcCards');
    },
    running() {
      return this.$store.getters['firmware/activeBmcFirmware'];
    },
    // TODO: Update the template to show an array of bmc images
    backup() {
      const backupFirmwares = this.$store.getters['firmware/backupBmcFirmware'];
      return backupFirmwares?.[0] ?? null;
    },
    runningVersion() {
      return this.running?.version || '--';
    },
    backupVersion() {
      return this.backup?.version || '--';
    },
    backupStatus() {
      return this.backup?.status || null;
    },
    isBackupUpdateable() {
      return (
        typeof this.backup?.updateable === 'undefined' ||
        this.backup?.updateable === true
      );
    },
    showBackupImageStatus() {
      return (
        this.backupStatus === 'Critical' || this.backupStatus === 'Warning'
      );
    },
  },
  methods: {
    // TODO: Modify to accept a specific backup location as a parameter
    switchToRunning() {
      this.startLoader();
      const timerId = setTimeout(() => {
        this.endLoader();
        this.infoToast(this.$t('pageFirmware.toast.verifySwitchMessage'), {
          title: this.$t('pageFirmware.toast.verifySwitch'),
          refreshAction: true,
        });
      }, 60000);

      const backupFirmwares = this.$store.getters['firmware/backupBmcFirmware'];
      if (backupFirmwares?.length === 0) {
        this.errorToast(this.$t('pageFirmware.toast.errorNoBackupImage'));
        clearTimeout(timerId);
        this.endLoader();
        return;
      }
      const backupLocation = backupFirmwares[0].location;
      this.$store
        .dispatch('firmware/switchBmcFirmwareAndReboot', backupLocation)
        .then(() =>
          this.infoToast(this.$t('pageFirmware.toast.rebootStartedMessage'), {
            title: this.$t('pageFirmware.toast.rebootStarted'),
          }),
        )
        .catch(({ message }) => {
          this.errorToast(message);
          clearTimeout(timerId);
          this.endLoader();
        });
    },
  },
};
</script>
