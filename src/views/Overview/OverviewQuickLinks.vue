<template>
  <b-card bg-variant="light" border-variant="light">
    <b-row class="d-flex justify-content-between align-items-center">
      <b-col sm="6" lg="4" class="mb-2 mt-2">
        <dl>
          <dt>{{ $t('pageOverview.bmcTime') }}</dt>
          <dd v-if="bmcTime" data-test-id="overviewQuickLinks-text-bmcTime">
            {{ $filters.formatDate(bmcTime) }}
            {{ $filters.formatDate(bmcTime) }}
          </dd>
          <dd v-else>--</dd>
        </dl>
      </b-col>
      <b-col sm="6" lg="4" class="mb-2 mt-2">
        <dl>
          <dt>{{ $t('pageOverview.bmcUpTime') }}</dt>
          <dd v-if="bmcTime" ata-test-id="overviewQuickLinks-text-bmcUpTime">
            {{ bmcUpTime }}
          </dd>
          <dd v-else>--</dd>
        </dl>
      </b-col>
      <b-col sm="6" lg="3" class="mb-2 mt-2">
        <b-button
          to="/operations/serial-over-lan"
          variant="secondary"
          data-test-id="overviewQuickLinks-button-solConsole"
          class="d-flex justify-content-between align-items-center"
        >
          {{ $t('pageOverview.solConsole') }}
          <icon-arrow-right />
        </b-button>
      </b-col>
    </b-row>
  </b-card>
</template>

<script>
import ArrowRight16 from '@carbon/icons-vue/es/arrow--right/16';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import { useI18n } from 'vue-i18n';

export default {
  name: 'QuickLinks',
  components: {
    IconArrowRight: ArrowRight16,
  },
  mixins: [BVToastMixin],
  data() {
    return {
      $t: useI18n().t,
    };
  },
  computed: {
    bmcTime() {
      return this.$store.getters['global/bmcTime'];
    },
    bmcUpTime() {
      var a = this.$store.getters['global/bmcTime'];
      var b = this.$store.getters['controls/lastBmcRebootTime'];
      var milliseconds = parseInt(a - b);
      if (milliseconds < 0) return '0/NA';

      var seconds = milliseconds / 1000;
      seconds = Number(seconds);

      var d = Math.floor(seconds / (3600 * 24));
      var h = Math.floor((seconds % (3600 * 24)) / 3600);
      var m = Math.floor((seconds % 3600) / 60);
      var s = Math.floor(seconds % 60);

      var dDisplay = d > 0 ? d + (d == 1 ? ' day, ' : ' days, ') : '';
      var hDisplay = h > 0 ? h + (h == 1 ? ' hr ' : ' hrs ') : '';
      var mDisplay = m > 0 ? m + (m == 1 ? ' min, ' : ' mins, ') : '';
      var sDisplay = s > 0 ? s + (s == 1 ? ' sec' : ' secs') : '';
      return dDisplay + hDisplay + mDisplay + sDisplay;
    },
  },
  created() {
    Promise.all([this.$store.dispatch('global/getBmcTime')]).finally(() => {
      this.$root.$emit('overview-quicklinks-complete');
    });

    this.$store.dispatch('controls/getLastBmcRebootTime');
  },
};
</script>

<style lang="scss" scoped>
@import '@/assets/styles/bmc/helpers/_index.scss';
@import '@/assets/styles/bootstrap/_helpers.scss';

dd,
dl {
  margin: 0;
}
</style>
