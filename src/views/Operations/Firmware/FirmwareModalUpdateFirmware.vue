<template>
  <b-modal
    id="modal-update-firmware"
    :title="$t('pageFirmware.sectionTitleUpdateFirmware')"
    :ok-title="$t('pageFirmware.form.updateFirmware.startUpdate')"
    :cancel-title="$t('global.action.cancel')"
    @ok="$emit('ok')"
  >
    <template>
      <p>
        {{ $t('pageFirmware.modal.updateFirmwareInfoDefault1') }}
      </p>
      <p v-if="showBackupBmcMessage">
        {{
          $t('pageFirmware.modal.updateFirmwareInfoTargetBackup', {
            running: runningBmcVersion,
          })
        }}
      </p>
      <p v-if="showBackupBiosMessage">
        {{
          $t('pageFirmware.modal.updateFirmwareInfoTargetBackup', {
            running: runningBiosVersion,
          })
        }}
      </p>
      <p v-if="showBackup">
        {{ $t('pageFirmware.modal.updateFirmwareInfoBackup') }}
      </p>
      <p>
      {{ $t('pageFirmware.modal.updateFirmwareInfoDefault2') }}
      </p>
    </template>
  </b-modal>
</template>

<script>
export default {
  props: {
    targets: {
      type: Array,
      required: true,
    },
  },
  computed: {
    activeBmcFirmware() {
      return this.$store.getters['firmware/activeBmcFirmware'];
    },
    backupBmcFirmware() {
      return this.$store.getters['firmware/backupBmcFirmware'];
    },
    activeBiosFirmware() {
      return this.$store.getters['firmware/activeBiosFirmware'];
    },
    backupBiosFirmware() {
      return this.$store.getters['firmware/backupBiosFirmware'];
    },
    runningBmcVersion() {
      return this.activeBmcFirmware?.version || '--';
    },
    runningBiosVersion() {
      return this.activeBiosFirmware?.version || '--';
    },
    showBackup() {
      if (
        this.backupBmcFirmware?.length > 0 ||
          this.backupBiosFirmware?.length > 0
      )
        return true;
      else return false;
    },
    showBackupBmcMessage() {
      // Only show the backup message when BMC(which has backup) is in targets
      if (
        this.targets?.includes(this.activeBmcFirmware?.id) &&
          this.backupBmcFirmware != null &&
          this.backupBmcFirmware?.length > 0
      )
        return true;
      else return false;
    },
    showBackupBiosMessage() {
      // Only show the backup message when BIOS(which has backup) is in targets
      if (
        this.targets?.includes(this.activeBiosFirmware?.id) &&
          this.backupBiosFirmware != null &&
          this.backupBiosFirmware?.length > 0
      )
        return true;
      else return false;
    },
  },
};
</script>
