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

export default {
  name: 'Firmware',
  components: {
    OverviewCard,
  },
  mixins: [DataFormatterMixin],
  data() {
    return {
      showBackup:
        process.env.VUE_APP_ENV_NAME !== 'nvidia-bluefield' &&
          this.backupVersion,
      showBios: this.firmwareVersion,
    };
  },
  computed: {
    // TODO: Update the template to show an array of bmc images
    backupBmcFirmware() {
      const backupFirmwares =
        this.$store.getters['firmware/backupBmcFirmware'];
      return backupFirmwares && backupFirmwares[0] ? backupFirmwares[0] : null;
    },
    backupVersion() {
      return this.backupBmcFirmware && this.backupBmcFirmware.version ? this.backupBmcFirmware.version : null;
    },
    activeBmcFirmware() {
      return this.$store.getters['firmware/activeBmcFirmware'];
    },
    activeBiosFirmware() {
      return this.$store.getters['firmware/activeBiosFirmware'];
    },
    firmwareVersion() {
      if (process.env.VUE_APP_ENV_NAME === 'nvidia-bluefield') {
        return this.activeBiosFirmware?.version;
      }
      return this.activeBiosFirmware?.version;
    },
    runningVersion() {
      return this.activeBmcFirmware && this.activeBmcFirmware.version ? this.activeBmcFirmware.version : null;
    },
  },
  created() {
    this.$store.dispatch('firmware/getFirmwareInformation').finally(() => {
      this.$eventBus.$emit('overview-firmware-complete');
    });
  },
};
</script>
