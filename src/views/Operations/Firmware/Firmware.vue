<template>
  <b-container fluid="xl">
    <page-title />
    <alerts-server-power
      v-if="isServerPowerOffRequired || isServerPowerOnRequired"
      :is-server-off="isServerOff"
    />

    <!-- Firmware cards -->
    <b-row>
      <b-col xl="10">
        <!-- BMC Firmware -->
        <bmc-cards
          :is-page-disabled="isPageDisabled"
          :is-server-off="isServerOff"
        />

        <!-- Bios Firmware -->
        <bios-cards v-if="isBiosFirmwareAvailable" />
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
import AlertsServerPower from './FirmwareAlertServerPower';
import FirmwareInventory from './FirmwareInventory';
import BmcCards from './FirmwareCardsBmc';
import FormUpdate from './FirmwareFormUpdate';
import BiosCards from './FirmwareCardsBios';
import PageSection from '@/components/Global/PageSection';
import PageTitle from '@/components/Global/PageTitle';

import LoadingBarMixin, { loading } from '@/components/Mixins/LoadingBarMixin';

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
  data() {
    return {
      loading,
      isServerPowerOffRequired:
        process.env.VUE_APP_SERVER_OFF_REQUIRED === 'true',
      isServerPowerOnRequired:
        process.env.VUE_APP_SERVER_ON_REQUIRED === 'true',
    };
  },
  computed: {
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
      if (this.isServerPowerOffRequired) {
        return !this.isServerOff || this.loading || this.isOperationInProgress;
      }
      if (this.isServerPowerOnRequired) {
        return this.isServerOff || this.loading || this.isOperationInProgress;
      }
      return this.loading || this.isOperationInProgress;
    },
    isBiosFirmwareAvailable() {
      return this.$store.getters['firmware/isBiosFirmwareAvailable'];
    },
  },
  created() {
    this.startLoader();
    this.$store
      .dispatch('firmware/getFirmwareInformation')
      .finally(() => this.endLoader());
  },
};
</script>
