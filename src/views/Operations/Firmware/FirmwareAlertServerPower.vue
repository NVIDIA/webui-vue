<template>
  <b-row>
    <b-col xl="10">
      <!-- Operation in progress alert -->
      <alert v-if="isOperationInProgress" variant="info" class="mb-5">
        <p>
          {{ $t('pageFirmware.alert.operationInProgress') }}
        </p>
      </alert>
      <!-- Power on/off server warning alert -->
      <alert
        v-else-if="
          (isServerPowerOffRequired && !isServerOff) ||
          (isServerPowerOnRequired && isServerOff)
        "
        variant="warning"
        class="mb-5"
      >
        <p class="mb-0">
          {{
            isServerPowerOffRequired && !isServerOff
              ? $t('pageFirmware.alert.serverMustBePoweredOffTo')
              : $t('pageFirmware.alert.serverMustBePoweredOnTo')
          }}
        </p>
        <ul class="m-0">
          <li v-if="supportsBackupImages">
            {{ $t('pageFirmware.alert.switchRunningAndBackupImages') }}
          </li>
          <li>
            {{ $t('pageFirmware.alert.updateFirmware') }}
          </li>
        </ul>
        <template #action>
          <b-link to="/operations/server-power-operations">
            {{ $t('pageFirmware.alert.viewServerPowerOperations') }}
          </b-link>
        </template>
      </alert>
    </b-col>
  </b-row>
</template>

<script>
import Alert from '@/components/Global/Alert';

export default {
  components: { Alert },
  props: {
    isServerOff: {
      required: true,
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      isServerPowerOffRequired:
        process.env.VUE_APP_SERVER_OFF_REQUIRED === 'true',
      isServerPowerOnRequired:
        process.env.VUE_APP_SERVER_ON_REQUIRED === 'true',
    };
  },
  computed: {
    isOperationInProgress() {
      return this.$store.getters['controls/isOperationInProgress'];
    },
    supportsBackupImages() {
      const backupFirmwares = this.$store.getters['firmware/backupBmcFirmware'];
      return backupFirmwares?.length > 0;
    },
  },
};
</script>
