<template>
  <page-section :section-title="$t('pageFirmware.sectionTitleBiosCards')">
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
        <dl class="mb-0">
          <dt>{{ $t('pageFirmware.cardBodyVersion') }}</dt>
          <dd class="mb-0">
            <status-icon v-if="showBackupImageStatus" status="danger" />
            <span v-if="showBackupImageStatus" class="sr-only">
              {{ backupStatus }}
            </span>
            {{ backupVersion }}
          </dd>
        </dl>
      </b-card>
    </b-card-group>
  </page-section>
</template>

<script>
import PageSection from '@/components/Global/PageSection';

export default {
  components: { PageSection },
  computed: {
    running() {
      return this.$store.getters['firmware/activeBiosFirmware'];
    },
    // TODO: Update the template to show an array of bmc images
    backup() {
      const biosFirmwares = this.$store.getters['firmware/backupBiosFirmware'];
      return biosFirmwares?.[0] ?? null;
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
    showBackupImageStatus() {
      return (
        this.backupStatus === 'Critical' || this.backupStatus === 'Warning'
      );
    },
  },
};
</script>

<style lang="scss" scoped>
.page-section {
  margin-top: -$spacer * 1.5;
}
</style>
