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
            {{ $t('pageOverview.hostBiosFirmwareVersion') }}
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
import { mapState } from 'vuex';

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
    ...mapState({
      server: (state) => state.system.systems[0],
      backupBmcFirmware() {
        return this.$store.getters['firmware/backupBmcFirmware'];
      },
      backupVersion() {
        return this.backupBmcFirmware?.version;
      },
      activeBmcFirmware() {
        return this.$store.getters[`firmware/activeBmcFirmware`];
      },
      activeHostFirmware() {
        return this.$store.getters[`firmware/activeHostFirmware`];
      },
      firmwareVersion() {
        if (process.env.VUE_APP_ENV_NAME === 'nvidia-bluefield') {
          return this.activeHostFirmware?.version;
        }
        return this.activeHostFirmware?.version;
      },
      runningVersion() {
        return this.activeBmcFirmware?.version;
      },
    }),
  },
  created() {
    this.$store.dispatch('firmware/getFirmwareInformation').finally(() => {
      this.$root.$emit('overview-firmware-complete');
    });
  },
};
</script>
