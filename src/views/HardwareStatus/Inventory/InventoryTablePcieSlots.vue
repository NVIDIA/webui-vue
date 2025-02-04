<template>
  <page-section 
     v-if="pcieSlots.length"
     :section-title="$t('pageInventory.pcieSlots')"
  >
    <b-row class="align-items-end">
      <b-col sm="6" md="5" xl="4">
        <search
          @change-search="onChangeSearchInput"
          @clear-search="onClearSearchInput"
        />
      </b-col>
      <b-col sm="6" md="3" xl="2">
        <table-cell-count
          :filtered-items-count="filteredRows"
          :total-number-of-cells="pcieSlots.length"
        ></table-cell-count>
      </b-col>
    </b-row>
    <b-table
      sort-icon-left
      no-sort-reset
      hover
      responsive="md"
      sort-by="name"
      show-empty
      :items="pcieSlots"
      :fields="fields"
      :sort-desc="false"
      :sort-compare="sortCompare"
      :filter="searchFilter"
      :empty-text="$t('global.table.emptyMessage')"
      :empty-filtered-text="$t('global.table.emptySearchMessage')"
      :busy="isBusy"
      @filtered="onFiltered"
    >
      <!-- StatusState -->
      <template #cell(Status.State)="{ value }">
        <status-icon v-if="(''+ value).trim() !== '--'" :status="statusStateIcon(value)" />
        {{ value }}
      </template>
      <template #row-details="{ Slot }">
        <b-container fluid>
          <b-row>
            <b-col sm="6" xl="6">
              <dl>
                <dt>
                  {{ $t('pageInventory.table.slotType') }}
                </dt>
                <dd>{{ dataFormatter(Slot.SlotType) }}</dd>
              </dl>
            </b-col>
          </b-row>
        </b-container>
      </template>
    </b-table>
  </page-section>
</template>
<script>
import PageSection from '@/components/Global/PageSection';
import TableCellCount from '@/components/Global/TableCellCount';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';
import TableSortMixin from '@/components/Mixins/TableSortMixin';
import Search from '@/components/Global/Search';
import SearchFilterMixin, {
  searchFilter,
} from '@/components/Mixins/SearchFilterMixin';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import { mapState } from 'vuex';
import i18n from '@/i18n';
import { useI18n } from 'vue-i18n';
export default {
  components: { PageSection, Search, TableCellCount },
  mixins: [BVToastMixin, DataFormatterMixin, TableSortMixin, SearchFilterMixin],
  data() {
    return {
      $t: useI18n().t,
      isBusy: true,
      fields: [
        {
          key: 'SlotType',
          label: i18n.global.t('pageInventory.table.slotType'),
          formatter: this.dataFormatter,
          sortable: true,
        },
        {
          key: 'PCIeType',
          label: i18n.global.t('pageInventory.table.pcieType'),
          formatter: this.dataFormatter,
          sortable: true,
        },
        {
          key: 'Status.State',
          label: i18n.global.t('pageInventory.table.state'),
          formatter: this.dataFormatter,
          sortable: true,
        },
        {
          key: 'Lanes',
          label: i18n.global.t('pageInventory.table.lanes'),
          formatter: this.dataFormatter,
          sortable: true,
        },
        {
          key: 'Location.PartLocation.ServiceLabel',
          label: i18n.global.t('pageInventory.table.locationNumber'),
          formatter: this.dataFormatter,
          sortable: true,
        },
      ],
      searchFilter: searchFilter,
      searchTotalFilteredRows: 0,
    };
  },
  watch: {
    'chassis': async function(oldValue, newValue) {
      if (newValue.length) {
        this.fetchPcieSlots();
      }
    }
  },
  computed: {
    filteredRows() {
      return this.searchFilter
        ? this.searchTotalFilteredRows
        : this.pcieSlots.length;
    },
    pcieSlots() {
      let slotsList = [];

      const slots = this.$store.getters['pcieSlots/pcieSlots'];
      slots.map((slot) => {
        //if (slot.SlotType !== 'OEM') {
          slotsList.push(slot);
        //}
      });
      return slotsList;
    },
    ...mapState('chassis', {
      chassis: state => state.redfish_chassis,
    }),
  },
  created() {
    this.fetchPcieSlots();
  },
  methods: {
    async fetchPcieSlots() {
      this.isBusy = true;
      await this.$store.dispatch('pcieSlots/getPcieSlotsInfo').finally(() => {
        this.isBusy = false;
      });
    },
    sortCompare(a, b, key) {
      if (key === 'health') {
        return this.sortStatus(a, b, key);
      }
    },
    onFiltered(filteredItems) {
      this.searchTotalFilteredRows = filteredItems.length;
    },
    statusStateIcon(status) {
      switch (status) {
        case 'Enabled':
          return 'success';
        case 'Absent':
          return 'warning';
        default:
          return '';
      }
    },
  },
};
</script>
