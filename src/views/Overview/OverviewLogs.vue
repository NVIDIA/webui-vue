<template>
  <overview-card
    :data="eventLogData"
    :disabled="eventLogData.length === 0"
    :export-button="true"
    :file-name="exportFileNameByDate()"
    :title="title"
    :to="to"
  >
    <b-row class="mt-3">
      <b-col sm="6">
        <dl>
          <dt>{{ $t('pageOverview.criticalEvents') }}</dt>
          <dd class="h3">
            {{ dataFormatter(criticalEvents.length) }}
            <status-icon status="danger" />
          </dd>
        </dl>
      </b-col>
      <b-col sm="6">
        <dl>
          <dt>{{ $t('pageOverview.warningEvents') }}</dt>
          <dd class="h3">
            {{ dataFormatter(warningEvents.length) }}
            <status-icon status="warning" />
          </dd>
        </dl>
      </b-col>
    </b-row>
  </overview-card>
</template>

<script>
import OverviewCard from './OverviewCard';
import StatusIcon from '@/components/Global/StatusIcon';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';
import { useI18n } from 'vue-i18n';

export default {
  name: 'Events',
  components: { OverviewCard, StatusIcon },
  mixins: [DataFormatterMixin],
  props: {
    title: {
      type: String,
      required: true,
    },
    to: {
      type: String,
      required: true,
    },
    logStore: {
      type: String,
      required: true,
    },
    omitEvent: {
      type: String,
      required: true,
    },
    exportFileName: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      $t: useI18n().t,
    };
  },
  computed: {
    eventLogData() {
      return this.$store.getters[this.logStore + '/allEvents'];
    },
    criticalEvents() {
      return this.eventLogData
        .filter((log) => log.Severity === 'Critical' && !log.Resolved)
        .map((log) => {
          return log;
        });
    },
    warningEvents() {
      return this.eventLogData
        .filter((log) => log.Severity === 'Warning' && !log.Resolved)
        .map((log) => {
          return log;
        });
    },
  },
  created() {
    this.$store.dispatch(this.logStore + '/getLogData').finally(() => {
      this.$root.$emit(this.omitEvent);
    });
  },
  methods: {
    exportFileNameByDate() {
      // Create export file name based on date
      let date = new Date();
      date =
        date.toISOString().slice(0, 10) +
        '_' +
        date.toString().split(':').join('-').split(' ')[4];
      return this.exportFileName + '_' + date;
    },
  },
};
</script>

<style lang="scss" scoped>
@import '@/assets/styles/bmc/helpers/_index.scss';
@import '@/assets/styles/bootstrap/_helpers.scss';

.status-icon {
  vertical-align: text-top;
}
</style>
