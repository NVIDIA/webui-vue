<template>
  <b-card bg-variant="light" border-variant="light">
    <b-row class="d-flex justify-content-between align-items-center">
      <b-col sm="6" lg="4" class="mb-2 mt-2">
        <dl>
          <dt>{{ $t('pageOverview.bmcTime') }}</dt>
          <dd v-if="bmcTime" data-test-id="overviewQuickLinks-text-bmcTime">
            {{ bmcTime | formatDate }} {{ bmcTime | formatTime }}
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
import { mapState, mapActions } from 'vuex';

export default {
  name: 'QuickLinks',
  components: {
    IconArrowRight: ArrowRight16,
  },
  mixins: [BVToastMixin],
  computed: {
    ...mapState('bmc', ['bmcTime', 'bmcUpTime']),

  },
  created() {
    this.$store.dispatch('bmc/getBmcUpTime');
    this.$root.$emit('overview-quicklinks-complete');
  },
};
</script>

<style lang="scss" scoped>
dd,
dl {
  margin: 0;
}
</style>
