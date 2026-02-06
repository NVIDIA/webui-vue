<template>
  <overview-card
    :data="eventLogData"
    :disabled="eventLogData.length === 0"
    :export-button="true"
    :file-name="exportFileNameByDate()"
    :title="$t('pageOverview.eventLogs')"
    :to="`/logs/event-logs`"
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
import { computed, watch } from 'vue';
import OverviewCard from './OverviewCard';
import StatusIcon from '@/components/Global/StatusIcon';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';
import { useEventLog } from '@/api/composables/useEventLog';
import eventBus from '@/eventBus';

export default {
  name: 'Events',
  components: { OverviewCard, StatusIcon },
  mixins: [DataFormatterMixin],
  setup() {
    // Use the new Vue Query + SSE composable for event logs
    const { entries, isLoading } = useEventLog();

    // Emit event when loading completes (equivalent to old created() behavior)
    watch(
      isLoading,
      (loading, wasLoading) => {
        if (wasLoading && !loading) {
          eventBus.$emit('overview-events-complete');
        }
      },
      { immediate: true },
    );

    return {
      eventLogEntries: entries,
      isEventLogLoading: isLoading,
    };
  },
  computed: {
    eventLogData() {
      // Use Vue Query data from composable
      return this.eventLogEntries;
    },
    criticalEvents() {
      return this.eventLogData.filter(
        (log) =>
          log.Severity === 'Critical' && !log.Resolved,
      );
    },
    warningEvents() {
      return this.eventLogData.filter(
        (log) =>
          log.Severity === 'Warning' && !log.Resolved,
      );
    },
  },
  // Vue Query handles data fetching automatically, no need for created() hook
  methods: {
    exportFileNameByDate() {
      // Create export file name based on date
      let date = new Date();
      date =
        date.toISOString().slice(0, 10) +
        '_' +
        date.toString().split(':').join('-').split(' ')[4];
      let fileName = 'all_event_logs_';
      return fileName + date;
    },
  },
};
</script>

<style lang="scss" scoped>
.status-icon {
  vertical-align: text-top;
}
</style>
