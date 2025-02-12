<template>
  <b-container fluid="xl">
    <page-title />
    <overview-quick-links class="mb-4" />
    <page-section
      :section-title="$t('pageOverview.systemInformation')"
      class="mb-1"
    >
      <b-card-group deck>
        <overview-server />
        <overview-firmware />
      </b-card-group>
      <b-card-group deck>
        <overview-network />
        <overview-power v-if="showPower" />
      </b-card-group>
    </page-section>
    <page-section :section-title="$t('pageOverview.statusInformation')">
      <b-card-group deck>
        <overview-logs
          :title="$t('pageOverview.eventLogs')"
          :to="`/logs/event-logs`"
          :log-store="`eventLog`"
          :omit-event="`overview-events-complete`"
          :export-file-name="`all_event_logs`"
        />
        <overview-logs
          v-if="showSelLog"
          :title="$t('pageOverview.selLogs')"
          :to="`/logs/sel-logs`"
          :log-store="`selLog`"
          :omit-event="`overview-sel-complete`"
          :export-file-name="`all_sel_logs`"
        />
        <overview-inventory v-if="showInventory" />
        <overview-dumps v-if="showDumps" />
      </b-card-group>
    </page-section>
  </b-container>
</template>

<script>
import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';
import OverviewDumps from './OverviewDumps.vue';
import OverviewLogs from './OverviewLogs.vue';
import OverviewFirmware from './OverviewFirmware.vue';
import OverviewInventory from './OverviewInventory.vue';
import OverviewNetwork from './OverviewNetwork';
import OverviewPower from './OverviewPower';
import OverviewQuickLinks from './OverviewQuickLinks';
import OverviewServer from './OverviewServer';
import PageSection from '@/components/Global/PageSection';
import PageTitle from '@/components/Global/PageTitle';

export default {
  name: 'Overview',
  components: {
    OverviewDumps,
    OverviewLogs,
    OverviewFirmware,
    OverviewInventory,
    OverviewNetwork,
    OverviewPower,
    OverviewQuickLinks,
    OverviewServer,
    PageSection,
    PageTitle,
  },
  mixins: [LoadingBarMixin],
  data() {
    return {
      showDumps: process.env.VUE_APP_ENV_NAME === 'ibm',
      showPower: !['nvidia-bluefield', 'nvidia-igx'].includes(
        process.env.VUE_APP_ENV_NAME,
      ),
      showInventory: !['nvidia-bluefield', 'nvidia-igx'].includes(
        process.env.VUE_APP_ENV_NAME,
      ),
      showSelLog: ['nvidia-bluefield', 'nvidia-igx', 'nvidia-gb'].includes(
        process.env.VUE_APP_ENV_NAME,
      ),
    };
  },
  created() {
    this.startLoader();
    const dumpsPromise = new Promise((resolve) => {
      this.$root.$on('overview-dumps-complete', () => resolve());
    });
    const eventsPromise = new Promise((resolve) => {
      this.$root.$on('overview-events-complete', () => resolve());
    });
    const selPromise = new Promise((resolve) => {
      this.$root.$on('overview-sel-complete', () => resolve());
    });
    const firmwarePromise = new Promise((resolve) => {
      this.$root.$on('overview-firmware-complete', () => resolve());
    });
    const inventoryPromise = new Promise((resolve) => {
      this.$root.$on('overview-inventory-complete', () => resolve());
    });
    const networkPromise = new Promise((resolve) => {
      this.$root.$on('overview-network-complete', () => resolve());
    });
    const powerPromise = new Promise((resolve) => {
      this.$root.$on('overview-power-complete', () => resolve());
    });
    const quicklinksPromise = new Promise((resolve) => {
      this.$root.$on('overview-quicklinks-complete', () => resolve());
    });
    const serverPromise = new Promise((resolve) => {
      this.$root.$on('overview-server-complete', () => resolve());
    });

    const promises = [
      eventsPromise,
      firmwarePromise,
      networkPromise,
      quicklinksPromise,
      serverPromise,
    ];
    if (this.showDumps) promises.push(dumpsPromise);
    if (this.showInventory) promises.push(inventoryPromise);
    if (this.showPower) promises.push(powerPromise);
    if (this.showSelLog) promises.push(selPromise);
    Promise.all(promises).finally(() => this.endLoader());
  },
};
</script>
