<template>
  <overview-card
    :title="$t('pageOverview.serverInformation')"
    :to="`/hardware-status/inventory`"
  >
    <b-row class="mt-3">
      <b-col sm="6">
        <dl>
          <dt>{{ $t('pageOverview.model') }}</dt>
          <dd>{{ dataFormatter(modelType) }}</dd>
          <dt>{{ $t('pageOverview.serialNumber') }}</dt>
          <dd>{{ dataFormatter(serialNumber) }}</dd>
        </dl>
      </b-col>
      <b-col sm="6">
        <dl>
          <dt>{{ $t('pageOverview.serverManufacturer') }}</dt>
          <dd>{{ dataFormatter(manufacturer) }}</dd>
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
  name: 'Server',
  components: {
    OverviewCard,
  },
  mixins: [DataFormatterMixin],
  computed: {
    ...mapGetters('global', ['modelType', 'manufacturer', 'serialNumber']),
  },
  created() {
    this.$store.dispatch('system/getSystem').finally(() => {
      this.$eventBus.$emit('overview-server-complete');
    });
  },
};
</script>
