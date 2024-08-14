<template>
  <b-modal
    id="modal-update-firmware"
    :title="$t('pageFirmware.sectionTitleUpdateFirmware')"
    :ok-title="$t('pageFirmware.form.updateFirmware.startUpdate')"
    :cancel-title="$t('global.action.cancel')"
    @ok="$emit('ok')"
  >
    <template v-if="isSingleFileUploadEnabled">
      <p>
        {{ $t('pageFirmware.modal.updateFirmwareInfo') }}
      </p>
      <p v-if="showBackupMessage">
        {{
          $t('pageFirmware.modal.updateFirmwareInfo2', {
            running: runningBmcVersion,
          })
        }}
      </p>
      <p class="m-0">
        {{ $t('pageFirmware.modal.updateFirmwareInfo3') }}
      </p>
    </template>
    <template v-else>
      {{ $t('pageFirmware.modal.updateFirmwareInfoDefault') }}
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
    runningBmc() {
      return this.$store.getters['firmware/activeBmcFirmware'];
    },
    runningBmcVersion() {
      return this.runningBmc?.version || '--';
    },
    isSingleFileUploadEnabled() {
      return this.$store.getters['firmware/isSingleFileUploadEnabled'];
    },
    activeBmcFirmware() {
      return this.$store.getters['firmware/activeBmcFirmware'];
    },
    backupBmcFirmware() {
      return this.$store.getters['firmware/backupBmcFirmware'];
    },
    activeHostFirmware() {
      return this.$store.getters['firmware/activeHostFirmware'];
    },
    backupHostFirmware() {
      return this.$store.getters['firmware/backupHostFirmware'];
    },
    showBackupMessage() {
      // Only show the backup message when BMC/BIOS(which has backup) is in targets
      if (
        (this.targets?.includes(this.activeBmcFirmware?.id) &&
          this.backupBmcFirmware != null &&
          this.backupBmcFirmware?.length > 0) ||
        (this.targets?.includes(this.activeHostFirmware?.id) &&
          this.backupHostFirmware != null &&
          this.backupHostFirmware?.length > 0)
      )
        return true;
      else return false;
    },
  },
};
</script>
