<template>
  <b-container fluid="xl">
    <page-title />
    <overview-quick-links class="mb-4" />
    <page-section
      :section-title="$t('pageOverview.systemInformation')"
      class="mb-1"
    >
      <b-row class="row-cols-1 row-cols-md-2">
        <b-col class="mb-3">
          <overview-server class="h-100" />
        </b-col>
        <b-col class="mb-3">
          <overview-firmware class="h-100" />
        </b-col>
      </b-row>
      <b-row class="row-cols-1 row-cols-md-2">
        <b-col class="mb-3">
          <overview-network class="h-100" />
        </b-col>
        <b-col v-if="showPower" class="mb-3">
          <overview-power class="h-100" />
        </b-col>
      </b-row>
    </page-section>
    <page-section :section-title="$t('pageOverview.statusInformation')">
      <b-row class="row-cols-1 row-cols-md-2">
        <b-col class="mb-3">
          <overview-logs
            class="h-100"
            :title="$t('pageOverview.eventLogs')"
            :to="`/logs/event-logs`"
            :log-store="`eventLog`"
            :omit-event="`overview-events-complete`"
            :export-file-name="`all_event_logs`"
          />
        </b-col>
        <b-col v-if="showSelLog" class="mb-3">
          <overview-logs
            class="h-100"
            :title="$t('pageOverview.selLogs')"
            :to="`/logs/sel-logs`"
            :log-store="`selLog`"
            :omit-event="`overview-sel-complete`"
            :export-file-name="`all_sel_logs`"
          />
        </b-col>
      </b-row>
      <b-row class="row-cols-1 row-cols-md-2">
        <b-col v-if="showInventory" class="mb-3">
          <overview-inventory class="h-100" />
        </b-col>
        <b-col v-if="showDumps" class="mb-3">
          <overview-dumps class="h-100" />
        </b-col>
      </b-row>
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
import { useI18n } from 'vue-i18n';

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
      $t: useI18n().t,
      showDumps: process.env.VUE_APP_ENV_NAME === 'ibm',
      showPower: !['nvidia-bluefield', 'nvidia-igx', 'nvidia-gb'].includes(
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

    const waitFor = (eventName) =>
      new Promise((resolve) => {
        this.$eventBus.$once(eventName, resolve);
      });

    const promises = [
      waitFor('overview-events-complete'),
      waitFor('overview-firmware-complete'),
      waitFor('overview-network-complete'),
      waitFor('overview-quicklinks-complete'),
      waitFor('overview-server-complete'),
    ];
    if (this.showDumps) promises.push(waitFor('overview-dumps-complete'));
    if (this.showInventory) promises.push(waitFor('overview-inventory-complete'));
    if (this.showPower) promises.push(waitFor('overview-power-complete'));
    if (this.showSelLog) promises.push(waitFor('overview-sel-complete'));

    Promise.all(promises).finally(() => {
      this.endLoader();
    });
  },
};
</script>
