<template>
  <b-container fluid="xl">
    <page-title />

    <b-alert
      v-if="showFirmwareUpdateAlert"
      variant="info"
      :model-value="true"
      class="mb-3"
    >
      {{ firmwareUpdateAlertMessage }}
    </b-alert>

    <!-- Privilege alert - shown when user lacks required privileges -->
    <b-alert v-if="!privilegeCheck.allowed" variant="warning" :model-value="true">
      <strong>{{ $t('global.status.insufficientPrivileges') }}</strong>
      {{ $t('pageFirmware.alert.missingPrivileges', {
        privileges: privilegeCheck.missingPrivileges.join(', ')
      }) }}
    </b-alert>

    <alerts-server-power
      v-if="isServerPowerOffRequired || isServerPowerOnRequired"
      :is-server-off="isServerOff"
    />

    <!-- Firmware cards -->
    <b-row>
      <b-col xl="10">
        <div class="firmware-card-sections">
          <bmc-cards
            :is-page-disabled="isPageDisabled"
            :is-server-off="isServerOff"
          />
          <bios-cards v-if="isBiosFirmwareAvailable" />
        </div>
      </b-col>
    </b-row>

    <!-- Firmware Inventory -->
    <b-row>
      <b-col xl="10">
        <firmware-inventory />
      </b-col>
    </b-row>

    <!-- Update firmware-->
    <page-section
      :section-title="$t('pageFirmware.sectionTitleUpdateFirmware')"
    >
      <b-row>
        <b-col sm="8" md="6" xl="4">
          <!-- Update form -->
          <form-update
            :is-server-off="isServerOff"
            :is-page-disabled="isPageDisabled"
          />
        </b-col>
      </b-row>
    </page-section>
  </b-container>
</template>

<script>
import { computed } from 'vue';
import AlertsServerPower from './FirmwareAlertServerPower';
import FirmwareInventory from './FirmwareInventory';
import BmcCards from './FirmwareCardsBmc';
import FormUpdate from './FirmwareFormUpdate';
import BiosCards from './FirmwareCardsBios';
import PageSection from '@/components/Global/PageSection';
import PageTitle from '@/components/Global/PageTitle';
import { usePrivilegeCheckEntity } from '@/api/privilege/endpointPrivileges';
import { useFirmwareInventory } from '@/api/composables/useFirmwareInventory';

import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';

export default {
  name: 'FirmwareSingleImage',
  components: {
    AlertsServerPower,
    BmcCards,
    FirmwareInventory,
    FormUpdate,
    BiosCards,
    PageSection,
    PageTitle,
  },
  mixins: [LoadingBarMixin],
  beforeRouteLeave(to, from, next) {
    this.hideLoader();
    next();
  },
  setup() {
    // Firmware upload uses dynamically discovered HttpPushUri/MultipartHttpPushUri
    // Check privileges for UpdateService POST operations
    const privilegeCheck = usePrivilegeCheckEntity('UpdateService', 'POST');

    // Use Vue Query composable for firmware inventory (replaces Vuex dispatch)
    const firmware = useFirmwareInventory();

    return {
      privilegeCheck: computed(() => privilegeCheck.value),
      isSingleFileUploadEnabled: firmware.isSingleFileUploadEnabled,
      isBiosFirmwareAvailable: firmware.isBiosFirmwareAvailable,
      firmwareLoading: firmware.isLoading,
    };
  },
  data() {
    return {
      isServerPowerOffRequired:
        import.meta.env.VITE_SERVER_OFF_REQUIRED === 'true',
      isServerPowerOnRequired:
        import.meta.env.VITE_SERVER_ON_REQUIRED === 'true',
    };
  },
  computed: {
    firmwareUpdateState() {
      return this.$store.state.firmware.firmwareUpdateInfo.state;
    },
    firmwareTaskPercent() {
      return this.$store.state.firmware.firmwareUpdateInfo.taskPercent;
    },
    showFirmwareUpdateAlert() {
      return (
        this.firmwareUpdateState === 'TaskStarted' ||
        this.firmwareUpdateState === 'TaskCompleted'
      );
    },
    firmwareUpdateAlertMessage() {
      if (this.firmwareUpdateState === 'TaskCompleted') {
        return this.$t('pageFirmware.form.updateFirmware.waitingForActivation');
      }
      const percent = this.firmwareTaskPercent;
      if (percent > 0) {
        return `${this.$t('pageFirmware.form.updateFirmware.taskInProgress')} — ${percent}%`;
      }
      return this.$t('pageFirmware.form.updateFirmware.taskInProgress');
    },
    powerState() {
      return this.$store.getters['global/powerState'];
    },
    isPowerOff() {
      return this.$store.getters['global/isPowerOff'];
    },
    isOperationInProgress() {
      return this.$store.getters['controls/isOperationInProgress'];
    },
    isServerOff() {
      return this.isPowerOff;
    },
    isPageDisabled() {
      // Disable if user lacks required privileges for firmware upload
      if (!this.privilegeCheck.allowed) return true;

      if (this.isServerPowerOffRequired) {
        return !this.isServerOff || this.firmwareLoading || this.isOperationInProgress;
      }
      return this.firmwareLoading || this.isOperationInProgress;
    },
  },
  created() {
    // Loading bar is now managed by Vue Query's isLoading state
    // Show loader while firmware data is being fetched
    this.startLoader();
    this.$watch('firmwareLoading', (loading) => {
      if (!loading) this.endLoader();
    }, { immediate: true });
  },
};
</script>

<style lang="scss" scoped>
// Uniform 16px spacing between BMC/HMC/BIOS card sections.
.firmware-card-sections :deep(.page-section) {
  margin-bottom: $spacer;
}
</style>
