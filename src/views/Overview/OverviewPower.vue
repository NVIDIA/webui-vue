<template>
  <overview-card
    :title="$t('pageOverview.powerInformation')"
    :to="`/resource-management/power`"
  >
    <b-row class="mt-3">
      <b-col sm="6">
        <dl v-if="hasPowerControl === false">
          {{ $t('global.status.notAvailable') }}
        </dl>
        <dl v-else>
          <dt>{{ $t('pageOverview.powerConsumption') }}</dt>
          <dd v-if="powerConsumptionValue == null">
            {{ $t('global.status.notAvailable') }}
          </dd>
          <dd v-else>{{ powerConsumptionValue }} W</dd>
          <dt>{{ $t('pageOverview.powerCap') }}</dt>
          <dd v-if="powerCapValue == null">
            {{ $t('global.status.disabled') }}
          </dd>
          <dd v-else>{{ powerCapValue }} W</dd>
        </dl>
      </b-col>
    </b-row>
  </overview-card>
</template>

<script>
import OverviewCard from './OverviewCard';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';
import { mapGetters } from 'vuex';

export default {
  name: 'Power',
  components: {
    OverviewCard,
  },
  mixins: [DataFormatterMixin],
  computed: {
    ...mapGetters({
      powerCapValue: 'powerControl/powerCapValue',
      powerConsumptionValue: 'powerControl/powerConsumptionValue',
      hasPowerControl: 'powerControl/hasPowerControl',
    }),
  },
  created() {
    this.$store.dispatch('powerControl/getPowerControl').finally(() => {
      this.$root.$emit('overview-power-complete');
    });
  },
};
</script>
