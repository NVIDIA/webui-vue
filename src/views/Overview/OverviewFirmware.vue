<template>
  <overview-card
    :title="$t('pageOverview.firmwareInformation')"
    :to="`/operations/firmware`"
  >
    <b-row class="mt-3">
      <b-col sm="12">
        <dl>
          <dt>{{ $t('pageOverview.bmcFirmwareVersion') }}</dt>
          <dd>{{ dataFormatter(runningVersion) }}</dd>
        </dl>
        <dl v-if="showBackup">
          <dt v-if="showBackup">{{ $t('pageOverview.backupVersion') }}</dt>
          <dd v-if="showBackup">{{ dataFormatter(backupVersion) }}</dd>
        </dl>
        <dl v-if="showBios">
          <dt v-if="showBios">
            {{ $t('pageOverview.biosFirmwareVersion') }}
          </dt>
          <dd v-if="showBios">{{ dataFormatter(firmwareVersion) }}</dd>
        </dl>
      </b-col>
    </b-row>
  </overview-card>
</template>

<script>
import OverviewCard from './OverviewCard';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';
import { useFirmwareInventory } from '@/api/composables/useFirmwareInventory';

export default {
  name: 'Firmware',
  components: {
    OverviewCard,
  },
  mixins: [DataFormatterMixin],
  setup() {
    const firmware = useFirmwareInventory();

    return {
      ActiveBmcFirmware: firmware.ActiveBmcFirmware,
      BackupBmcFirmware: firmware.BackupBmcFirmware,
      firmwareLoading: firmware.isLoading,
    };
  },
  computed: {
    showBackup() {
      return (
        import.meta.env.VITE_ENV_NAME !== 'nvidia-bluefield' &&
        this.backupVersion
      );
    },
    showBios() {
      return !!this.firmwareVersion;
    },
    server() {
      return this.$store.state.system.systems[0];
    },
    backupVersion() {
      return this.BackupBmcFirmware?.Version;
    },
    firmwareVersion() {
      return this.server?.firmwareVersion;
    },
    runningVersion() {
      return this.ActiveBmcFirmware?.Version;
    },
  },
  created() {
    // Watch for loading completion and emit event
    this.$watch(
      'firmwareLoading',
      (loading) => {
        if (!loading) {
          this.$eventBus.$emit('overview-firmware-complete');
        }
      },
      { immediate: true },
    );
  },
};
</script>
