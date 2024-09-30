<template>
  <page-section
    v-if="networkAdapters.length"
    :section-title="$t('pageInventory.networkAdapters')"
  >
    <b-table
      sort-icon-left
      no-sort-reset
      hover
      responsive="md"
      :items="networkAdapters"
      :fields="fields"
      show-empty
      :empty-text="$t('global.table.emptyMessage')"
      :busy="isBusy"
    >
      <!-- Status -->
      <template #cell(status)="{ value }">
        <status-icon :status="statusIcon(value)" />
        {{ value }}
      </template>
    </b-table>
  </page-section>
</template>

<script>
import PageSection from '@/components/Global/PageSection';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';

export default {
  components: { PageSection },
  mixins: [BVToastMixin, DataFormatterMixin],
  props: ['showLeds'],
  data() {
    return {
      isBusy: true,
      fields: [
        {
          key: 'name',
          label: this.$t('pageInventory.table.name'),
          formatter: this.dataFormatter,
        },
        {
          key: 'status',
          label: 'Status',
          formatter: this.dataFormatter,
        },
      ],
    };
  },
  computed: {
    networkAdapters() {
      return this.$store.getters['networkAdapters/networkAdapters'];
    },
  },
  created() {
    this.$store.dispatch('networkAdapters/getNetworkAdapters').finally(() => {
      // Emit initial data fetch complete to parent component
      this.$root.$emit('hardware-status-network-adapter-complete');
      this.isBusy = false;
    });
  },
};
</script>
