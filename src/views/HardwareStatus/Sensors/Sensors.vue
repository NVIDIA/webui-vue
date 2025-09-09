<template>
  <b-container fluid="xl">
    <page-title />
    <b-row v-if="isBusy" class="justify-content-center mb-3">
      <b-spinner 
        label="Spinning"
        aria-label="Loading dump type options"
      >
        SPINNER
      </b-spinner>
    </b-row>
    <b-row v-else class="align-items-end">
      <b-col sm="6" md="5" xl="4">
        <search
          :placeholder="$t('pageSensors.searchForSensors')"
          data-test-id="sensors-input-searchForSensors"
          @change-search="onChangeSearchInput"
          @clear-search="onClearSearchInput"
        />
      </b-col>
      <b-col sm="3" md="3" xl="2">
        <table-cell-count
          :filtered-items-count="filteredRows"
          :total-number-of-cells="allSensors.length"
        ></table-cell-count>
      </b-col>
      <b-col sm="3" md="4" xl="6" class="text-right">
        <table-filter :filters="tableFilters" @filter-change="onFilterChange" />
        <b-button v-if="supportMore" variant="link" @click="toggleShowMore">
          <span v-if="showMore">
            {{ $t('pageSensors.showLess') }}
          </span>
          <span v-else> {{ $t('pageSensors.showMore') }} </span>
        </b-button>
      </b-col>
    </b-row>
    <b-row>
      <b-col xl="12">
        <table-toolbar
          ref="toolbar"
          :selected-items-count="selectedRows.length"
          @clear-selected="clearSelectedRows($refs.table)"
        >
          <template #toolbar-buttons>
            <table-toolbar-export
              :data="selectedRows"
              :file-name="exportFileNameByDate()"
            />
          </template>
        </table-toolbar>
        <b-table v-if="allSensors.length" 
          ref="table"
          responsive="md"
          selectable
          no-select-on-click
          sort-icon-left
          hover
          no-sort-reset
          sticky-header="75vh"
          sort-by="status"
          show-empty
          :no-border-collapse="true"
          :items="filteredSensors"
          :fields="fields"
          :sort-desc="true"
          :sort-compare="sortCompare"
          :filter="searchFilter"
          :empty-text="$t('global.table.emptyMessage')"
          :empty-filtered-text="$t('global.table.emptySearchMessage')"
          :busy="isBusy"
          @filtered="onFiltered"
          @row-selected="onRowSelected($event, filteredSensors.length)"
        >
          <!-- Checkbox header -->
          <template #head(checkbox)>
            <b-form-checkbox
              v-model="tableHeaderCheckboxModel"
              :indeterminate="tableHeaderCheckboxIndeterminate"
              @change="onChangeHeaderCheckbox($refs.table)"
            >
              <span class="sr-only">{{ $t('global.table.selectAll') }}</span>
            </b-form-checkbox>
          </template>

          <!-- Checkbox column -->
          <template #cell(checkbox)="data">
            <b-form-checkbox
              v-model="data.rowSelected"
              @change="toggleSelectRow($refs.table, data.index)"
            >
              <span class="sr-only">{{ $t('global.table.selectItem') }}</span>
            </b-form-checkbox>
          </template>

          <!-- Id column -->
          <template #cell(id)="data">
            {{ data.value }}
          </template>

          <!-- Name column -->
          <template #cell(name)="data">
            {{ data.value }}
          </template>

          <!-- Status column -->
          <template #cell(status)="data">
            <template v-if="data.item.state === 'Absent'">
              <status-icon status="secondary" /> {{ data.item.state }}
            </template>
            <template v-else>
              <status-icon :status="statusIcon(data.value)" /> {{ data.value }}
            </template>
          </template>

          <!-- Value columns (except name) -->
          <template #cell()="data">
            <template v-if="data.item.state === 'Absent'">--</template>
            <template v-else>
              {{ data.value }} {{ data.item.units }}
            </template>
          </template>
        </b-table>
      </b-col>
    </b-row>
  </b-container>
</template>

<script>
import PageTitle from '@/components/Global/PageTitle';
import Search from '@/components/Global/Search';
import StatusIcon from '@/components/Global/StatusIcon';
import TableFilter from '@/components/Global/TableFilter';
import TableToolbar from '@/components/Global/TableToolbar';
import TableToolbarExport from '@/components/Global/TableToolbarExport';
import TableCellCount from '@/components/Global/TableCellCount';

import BVTableSelectableMixin, {
  selectedRows,
  tableHeaderCheckboxModel,
  tableHeaderCheckboxIndeterminate,
} from '@/components/Mixins/BVTableSelectableMixin';
import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';
import TableFilterMixin from '@/components/Mixins/TableFilterMixin';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';
import TableSortMixin from '@/components/Mixins/TableSortMixin';
import SearchFilterMixin, {
  searchFilter,
} from '@/components/Mixins/SearchFilterMixin';
import { BSpinner } from 'bootstrap-vue';

export default {
  name: 'Sensors',
  components: {
    PageTitle,
    Search,
    StatusIcon,
    TableCellCount,
    TableFilter,
    TableToolbar,
    TableToolbarExport,
    'b-spinner': BSpinner,
  },
  mixins: [
    TableFilterMixin,
    BVTableSelectableMixin,
    LoadingBarMixin,
    DataFormatterMixin,
    TableSortMixin,
    SearchFilterMixin,
  ],
  beforeRouteLeave(to, from, next) {
    this.hideLoader();
    next();
  },
  data() {
    return {
      isBusy: true,
      supportMore: process.env.VUE_APP_SHOW_MORE_SENSOR_INFO === 'true',
      showMore: false,
      tableFilters: [
        {
          key: 'status',
          label: this.$t('pageSensors.table.status'),
          values: [
            this.$t('global.action.ok'),
            this.$t('global.action.warning'),
            this.$t('global.action.critical'),
          ],
        },
        {
          key: 'state',
          label: this.$t('pageSensors.table.state'),
          values: [
            this.$t('global.action.absent')
          ],
        },
      ],
      activeFilters: [],
      searchFilter: searchFilter,
      searchTotalFilteredRows: 0,
      selectedRows: selectedRows,
      tableHeaderCheckboxModel: tableHeaderCheckboxModel,
      tableHeaderCheckboxIndeterminate: tableHeaderCheckboxIndeterminate,
    };
  },
  computed: {
    fields() {
      if (this.showMore) {
        return [
          {
            key: 'checkbox',
            sortable: false,
            label: '',
          },
          {
            key: 'id',
            sortable: true,
            label: this.$t('pageSensors.table.id'),
          },
          {
            key: 'name',
            sortable: true,
            label: this.$t('pageSensors.table.name'),
          },
          {
            key: 'status',
            sortable: true,
            label: this.$t('pageSensors.table.status'),
            tdClass: 'text-nowrap',
          },
          {
            key: 'lowerFatal',
            formatter: this.dataFormatter,
            label: this.$t('pageSensors.table.lowerFatal'),
          },
          {
            key: 'lowerCritical',
            formatter: this.dataFormatter,
            label: this.$t('pageSensors.table.lowerCritical'),
          },
          {
            key: 'lowerCaution',
            formatter: this.dataFormatter,
            label: this.$t('pageSensors.table.lowerWarning'),
          },
          {
            key: 'currentValue',
            formatter: this.dataFormatter,
            label: this.$t('pageSensors.table.currentValue'),
          },
          {
            key: 'upperCaution',
            formatter: this.dataFormatter,
            label: this.$t('pageSensors.table.upperWarning'),
          },
          {
            key: 'upperCritical',
            formatter: this.dataFormatter,
            label: this.$t('pageSensors.table.upperCritical'),
          },
          {
            key: 'upperFatal',
            formatter: this.dataFormatter,
            label: this.$t('pageSensors.table.upperFatal'),
          },
        ];
      } else {
        return [
          {
            key: 'checkbox',
            sortable: false,
            label: '',
          },
          {
            key: 'name',
            sortable: true,
            label: this.$t('pageSensors.table.name'),
          },
          {
            key: 'status',
            sortable: true,
            label: this.$t('pageSensors.table.status'),
            tdClass: 'text-nowrap',
          },
          {
            key: 'lowerCritical',
            formatter: this.dataFormatter,
            label: this.$t('pageSensors.table.lowerCritical'),
          },
          {
            key: 'lowerCaution',
            formatter: this.dataFormatter,
            label: this.$t('pageSensors.table.lowerWarning'),
          },

          {
            key: 'currentValue',
            formatter: this.dataFormatter,
            label: this.$t('pageSensors.table.currentValue'),
          },
          {
            key: 'upperCaution',
            formatter: this.dataFormatter,
            label: this.$t('pageSensors.table.upperWarning'),
          },
          {
            key: 'upperCritical',
            formatter: this.dataFormatter,
            label: this.$t('pageSensors.table.upperCritical'),
          },
        ];
      }
    },
    allSensors() {
      return this.$store.getters['sensors/sensors'];
    },
    filteredRows() {
      return this.searchFilter
        ? this.searchTotalFilteredRows
        : this.filteredSensors.length;
    },
    filteredSensors() {
      // First filter out absent sensors unless explicitly included in filters
      const showAbsent = this.activeFilters.some(filter => 
        filter.key === 'state' && filter.values.includes(this.$t('global.action.absent'))
      );
      
      const nonAbsentSensors = showAbsent 
        ? this.allSensors 
        : this.allSensors.filter(sensor => sensor.state !== this.$t('global.action.absent'));
      
      // Then apply any other active filters
      return this.getFilteredTableData(nonAbsentSensors, this.activeFilters);
    },
  },
  created() {
    this.isBusy = true;
    this.startLoader();
    this.$store.dispatch('sensors/getAllSensors').finally(() => {
      this.endLoader();
      this.isBusy = false;
    });
  },
  methods: {
    sortCompare(a, b, key) {
      if (key === 'status') {
        return this.sortStatus(a, b, key);
      }
    },
    onFilterChange({ activeFilters }) {
      this.activeFilters = activeFilters;
    },
    onFiltered(filteredItems) {
      this.searchTotalFilteredRows = filteredItems.length;
    },
    onChangeSearchInput(event) {
      this.searchFilter = event;
    },
    exportFileNameByDate() {
      // Create export file name based on date
      let date = new Date();
      date =
        date.toISOString().slice(0, 10) +
        '_' +
        date.toString().split(':').join('-').split(' ')[4];
      return this.$t('pageSensors.exportFilePrefix') + date;
    },
    toggleShowMore() {
      this.showMore = !this.showMore;
    },
  },
};
</script>
