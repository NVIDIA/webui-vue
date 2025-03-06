<template>
  <overview-card
    :data="eventLogDataArray"
    :disabled="!eventLogDataArray || eventLogDataArray.length === 0"
    :export-button="true"
    :file-name="exportFileNameByDate()"
    :title="title"
    :to="to"
  >
    <b-row v-for="(service, key) in logServices" :key="key" class="mt-3 align-items-center">
      <b-col sm="4" md="4" v-if="Object.keys(logServices).length > 1">
        <dl>
          <dd class="small text-muted my-auto d-flex align-items-center">{{ service.value }}</dd>
        </dl>
      </b-col>
      <b-col :sm="Object.keys(logServices).length > 1 ? '4' : '6'">
        <dl>
          <dt>{{ $t('pageOverview.criticalEvents') }}</dt>
          <dd class="h3 d-flex align-items-center">
            {{ dataFormatter(criticalEvents(key).length) }}
            <status-icon status="danger" class="ml-2" />
          </dd>
        </dl>
      </b-col>
      <b-col :sm="Object.keys(logServices).length > 1 ? '4' : '6'">
        <dl>
          <dt>{{ $t('pageOverview.warningEvents') }}</dt>
          <dd class="h3 d-flex align-items-center">
            {{ dataFormatter(warningEvents(key).length) }}
            <status-icon status="warning" class="ml-2" />
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
      logService: null,
      eventLogData: {},
    };
  },
  computed: {
    eventLogDataArray() {
      return Object.values(this.eventLogData);
    },
    logServices() {
      return this.$store.getters[this.logStore + '/logServices'];
    },
    criticalEvents() {
      return (logService) => (this.eventLogData[logService] || [])
        .filter((log) => log.Severity === 'Critical' && !log.Resolved)
        .map((log) => {
          return log;
        });
    },
    warningEvents() {
      return (logService) => (this.eventLogData[logService] || [])
        .filter((log) => log.Severity === 'Warning' && !log.Resolved)
        .map((log) => {
          return log;
        });
    },
  },
  async created() {
    if (!this.$store.getters[this.logStore + '/isInitialized']) {
      await this.$store.dispatch(this.logStore + '/initializeLogStore');
    }
    
    // Set first option as default when data is loaded
    const logServices = this.$store.getters[this.logStore + '/logServices'];
    if (logServices && Object.keys(logServices).length > 0) {
      let lastCall = null;
      for (const key in logServices) {
        if (logServices.hasOwnProperty(key)) {
          this.logService = logServices[key].value;
          lastCall = this.getLogData(this.logService);
        }
      }
      // Only call finally if lastCall exists
      if (lastCall) {
        lastCall.finally(() => {
          this.$root.$emit(this.omitEvent);
        });
      } else {
        this.$root.$emit(this.omitEvent);
      }
    } else {
      this.$root.$emit(this.omitEvent);
    }
  },
  methods: {
    getLogData(logService) {
      this.logService = logService;
      return this.$store.dispatch(this.logStore + '/getLogData', this.logServices[logService]).finally(() => {
        this.$set(this.eventLogData, logService, this.$store.getters[this.logStore + '/getAllEventsByValue'](logService));
      });
    },
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
