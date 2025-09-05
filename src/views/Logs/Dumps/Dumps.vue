<template>
  <b-container fluid="xl">
    <page-title />
    <b-row>
      <b-col sm="6" lg="5" xl="4">
        <page-section :section-title="$t('pageDumps.initiateDump')">
          <dumps-form />
        </page-section>
      </b-col>
    </b-row>
    <b-row v-if="isBusy" class="justify-content-center">
      <b-spinner 
        
        label="Spinning"
        aria-label="Loading dump type options"
      >
        SPINNER
      </b-spinner>
    </b-row>

    <div v-for="(dumpLog, index) in allDumps" :key="index">
      <b-row>
        <b-col xl="10">
          <page-section :section-title="dumpLog.title ? $t('pageDumps.dumpTypes.' + dumpLog.title) : $t('pageDumps.dumpsAvailableOnBmc')">
            <b-row class="align-items-start">
              <b-col sm="8" xl="6" class="d-sm-flex align-items-end">
                <search
                  :placeholder="$t('pageDumps.table.searchDumps')"
                  @change-search="onChangeSearchInput($event, index)"
                  @clear-search="onClearSearchInput($event, index)"
                />
                <div class="ml-sm-4">
                  <table-cell-count
                    :filtered-items-count="getFilteredRows(index)"
                    :total-number-of-cells="dumpLog.dumps.length"
                  ></table-cell-count>
                </div>
              </b-col>
              <b-col sm="8" md="7" xl="6">
                <table-date-filter @change="onChangeDateTimeFilter($event, index)" />
              </b-col>
            </b-row>
            <b-row>
              <b-col class="text-right">
                <table-filter
                  v-if="showTableFilters"
                  :filters="tableFilters"
                  @filter-change="onFilterChange($event, index)"
                />
              </b-col>
            </b-row>
            <table-toolbar
              :selected-items-count="selectedRowsMap[index] ? selectedRowsMap[index].length : 0"
              :actions="batchActions"
              @clear-selected="clearSelectedRows($refs.tables[index])"
              @batch-action="onTableBatchAction($event, index)"
            />
            <b-table
              ref="tables"
              show-empty
              hover
              sort-icon-left
              no-sort-reset
              sort-desc
              selectable
              no-select-on-click
              responsive="md"
              sort-by="dateTime"
              :fields="fields"
              :items="getFilteredDumps(index)"
              :empty-text="$t('global.table.emptyMessage')"
              :empty-filtered-text="$t('global.table.emptySearchMessage')"
              :filter="searchFilters[index]"
              :busy="isBusy"
              @filtered="onFiltered($event, index)"
              @row-selected="onRowSelected($event, getFilteredDumps(index).length, index)"
            >
              <!-- Checkbox column -->
              <template #head(checkbox)>
                <b-form-checkbox
                  v-model="tableHeaderCheckboxModelMap[index]"
                  :indeterminate="tableHeaderCheckboxIndeterminateMap[index]"
                  @change="onChangeHeaderCheckbox($refs.tables[index])"
                >
                  <span class="sr-only">{{ $t('global.table.selectAll') }}</span>
                </b-form-checkbox>
              </template>
              <template #cell(checkbox)="row">
                <b-form-checkbox
                  v-model="row.rowSelected"
                  @change="toggleSelectRow($refs.tables[index], row.index)"
                >
                  <span class="sr-only">{{ $t('global.table.selectItem') }}</span>
                </b-form-checkbox>
              </template>

            <!-- Date and Time column -->
            <template #cell(dateTime)="{ value }">
              <p class="mb-0">{{ $filters.formatDate(value) }}</p>
              <p class="mb-0">{{ $filters.formatTime(value) }}</p>
            </template>

              <!-- Size column -->
              <template #cell(size)="{ value }">
                {{ convertBytesToMegabytes(value) }} MB
              </template>

              <!-- Actions column -->
              <template #cell(actions)="row">
                <table-row-action
                  v-for="(action, index) in row.item.actions"
                  :key="index"
                  :value="action.value"
                  :title="action.title"
                  @click-table-action="onTableRowAction($event, row.item)"
                >
                  <template #icon>
                    <icon-download v-if="action.value === 'download'" />
                    <icon-delete v-if="action.value === 'delete'" />
                  </template>
                </table-row-action>
              </template>
            </b-table>
          </page-section>
        </b-col>
      </b-row>
    <!-- Table pagination -->
      <b-row key="pagination">
        <b-col sm="6" xl="5">
          <b-form-group
            class="table-pagination-select"
            :label="$t('global.table.itemsPerPage')"
            label-for="'pagination-items-per-page-' + index"
          >
            <b-form-select
              :id="'pagination-items-per-page-' +index"
              v-model="perPageMap[index]"
              :options="itemsPerPageOptions"
            />
          </b-form-group>
        </b-col>
        <b-col sm="6" xl="5">
          <b-pagination
            v-model="currentPageMap[index]"
            first-number
            last-number
            :per-page="perPageMap[index]"
            :total-rows="getTotalRowCount()"
            :aria-controls="'table-dump-entries-' + index"
          />
        </b-col>
      </b-row>
    </div>
  </b-container>
</template>

<script>
import IconDelete from '@carbon/icons-vue/es/trash-can/20';
import IconDownload from '@carbon/icons-vue/es/download/20';
import IconExport from '@carbon/icons-vue/es/document--export/20';
import DumpsForm from './DumpsForm';
import PageSection from '@/components/Global/PageSection';
import PageTitle from '@/components/Global/PageTitle';
import Search from '@/components/Global/Search';
import TableCellCount from '@/components/Global/TableCellCount';
import TableDateFilter from '@/components/Global/TableDateFilter';
import TableRowAction from '@/components/Global/TableRowAction';
import TableToolbar from '@/components/Global/TableToolbar';
import TableToolbarExport from '@/components/Global/TableToolbarExport';
/* this mixin fork supports multiple tables */
import BVMultiTableSelectableMixin, {
  selectedRowsMap,
  tableHeaderCheckboxModelMap,
  tableHeaderCheckboxIndeterminateMap,
} from '@/components/Mixins/BVMultiTableSelectableMixin';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import BVPaginationMixin, {
  currentPage,
  perPage,
  itemsPerPageOptions,
} from '@/components/Mixins/BVPaginationMixin';
import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';
import SearchFilterMixin, {
  searchFilter,
} from '@/components/Mixins/SearchFilterMixin';
import TableFilter from '@/components/Global/TableFilter';
import TableFilterMixin from '@/components/Mixins/TableFilterMixin';
import { useI18n } from 'vue-i18n';
import i18n from '@/i18n';
import { BSpinner } from 'bootstrap-vue'

export default {
  name: 'Dumps',
  components: {
    DumpsForm,
    IconDelete,
    IconDownload,
    PageSection,
    PageTitle,
    Search,
    TableCellCount,
    TableDateFilter,
    TableRowAction,
    TableToolbar,
    TableFilter,
    'b-spinner': BSpinner 
  },
  mixins: [
    BVMultiTableSelectableMixin,
    BVToastMixin,
    BVPaginationMixin,
    LoadingBarMixin,
    SearchFilterMixin,
    TableFilterMixin,
  ],
  beforeRouteEnter(to, from, next) {
    next(function(vm) {
      if (!vm.$store.getters['dumps/isInitialized']) {
        vm.$store.dispatch('dumps/initializeDumpStore');
      }
    });
  },
  beforeRouteLeave(to, from, next) {
    // Hide loader if the user navigates to another page
    // before request is fulfilled.
    this.hideLoader();
    next();
  },
  data() {
    return {
      $t: useI18n().t,
      isBusy: true,
      fields: [
        {
          key: 'checkbox',
          sortable: false,
        },
        {
          key: 'dateTime',
          label: i18n.global.t('pageDumps.table.dateAndTime'),
          sortable: true,
        },
        {
          key: 'dumpType',
          label: i18n.global.t('pageDumps.table.dumpType'),
          sortable: true,
        },
        {
          key: 'id',
          label: i18n.global.t('pageDumps.table.id'),
          sortable: true,
        },
        {
          key: 'size',
          label: i18n.global.t('pageDumps.table.size'),
          sortable: true,
        },
        {
          key: 'actions',
          sortable: false,
          label: '',
          tdClass: 'text-right text-nowrap',
        },
      ],
      batchActions: [
        {
          value: 'delete',
          label: i18n.global.t('global.action.delete'),
        },
      ],
      tableFilters: [
        {
          key: 'dumpType',
          label: i18n.global.t('pageDumps.table.dumpType'),
          values: [
            'BMC Dump Entry',
            'Hostboot Dump Entry',
            'Resource Dump Entry',
            'System Dump Entry',
          ],
        },
      ],
      showTableFilters: process.env.VUE_APP_ENV_NAME !== 'nvidia-bluefield',
      activeFiltersMap: {},
      currentPageMap: {},
      perPageMap: { 0: this.perPage },
      filterEndDates: {},
      filterStartDates: {},
      searchFilters: {},
      searchTotalFilteredRowsMap: {},
      selectedRowsMap: selectedRowsMap,
      tableHeaderCheckboxModelMap: tableHeaderCheckboxModelMap,
      tableHeaderCheckboxIndeterminateMap: tableHeaderCheckboxIndeterminateMap,

    };
  },
  computed: {
    allDumps() {
      return this.$store.getters['dumps/allDumps'].map((dumpLog, index) => {
            // Initialize perPageMap immediately for each dump
        this.$set(this.perPageMap, index, this.perPage); // Set explicit default value
        return {
          title: dumpLog.text,
          dumps: dumpLog.Members.map((item) => ({
            ...item,
            actions: [
              {
                value: 'download',
                title: i18n.global.t('global.action.download'),
              },
              {
                value: 'delete',
                title: i18n.global.t('global.action.delete'),
              },
            ],
          })),
        };
      });
    },
    isInitialized() {
      return this.$store.getters['dumps/isInitialized'];
    }
  },
  async created() {
    this.startLoader();  
    this.$store.dispatch('dumps/getAllDumps').finally(() => {
      this.endLoader();
      this.isBusy = false;
    });
  },
  methods: {
    convertBytesToMegabytes(bytes) {
      return parseFloat((bytes / 1000000).toFixed(3));
    },
    onFilterChange({ activeFilters }, index) {
      this.$set(this.activeFiltersMap, index, activeFilters);
    },
    onFiltered(items, index) {
      this.$set(this.searchTotalFilteredRowsMap, index, items.length);
    },
    onChangeDateTimeFilter({ fromDate, toDate }, index) {
      this.$set(this.filterStartDates, index, fromDate);
      this.$set(this.filterEndDates, index, toDate);
    },
    onTableRowAction(action, dump) {
      if (action === 'delete') {
        this.$bvModal
          .msgBoxConfirm(
            i18n.global.t('pageDumps.modal.deleteDumpConfirmation'),
            {
              title: i18n.global.t('pageDumps.modal.deleteDump'),
              okTitle: i18n.global.t('pageDumps.modal.deleteDump'),
              cancelTitle: i18n.global.t('global.action.cancel'),
              autoFocusButton: 'ok',
            },
          )
          .then((deleteConfrimed) => {
            if (deleteConfrimed) {
              this.$store
                .dispatch('dumps/deleteDumps', [dump])
                .then((messages) => {
                  messages.forEach(({ type, message }) => {
                    if (type === 'success') {
                      this.successToast(message);
                    } else if (type === 'error') {
                      this.errorToast(message);
                    }
                  });
                });
            }
          });
      }
      else if (action === 'download') {
        this.downloadEntry(dump.data);
      }
    },
    onTableBatchAction(action, index) {
      if (action === 'delete') {
        const selectedCount = this.selectedRowsMap[index]?.length || 0;
        this.$bvModal
          .msgBoxConfirm(
            i18n.global.t('pageDumps.modal.deleteDumpConfirmation', selectedCount),
            {
              title: i18n.global.t('pageDumps.modal.deleteDump', selectedCount),
              okTitle: i18n.global.t('pageDumps.modal.deleteDump', selectedCount),
              cancelTitle: i18n.global.t('global.action.cancel'),
              autoFocusButton: 'cancel',
              centered: true,
            }
          )
          .then((deleteConfirmed) => {
            if (deleteConfirmed) {
              if (selectedCount === this.allDumps[index].dumps.length) {
                this.$store
                  .dispatch('dumps/deleteAllDumps')
                  .then(function(success) { this.successToast(success); }.bind(this))
                  .catch(function(error) { this.errorToast(error.message); }.bind(this));
              } else {
                this.$store
                  .dispatch('dumps/deleteDumps', this.selectedRowsMap[index])
                  .then(function(messages) {
                    messages.forEach(function(message) {
                      if (message.type === 'success') {
                        this.successToast(message.message);
                      } else if (message.type === 'error') {
                        this.errorToast(message.message);
                      }
                    }.bind(this));
                  }.bind(this));
              }
            }
          });
      }
    },
    exportFileName(row) {
      let filename = row.item.dumpType + '_' + row.item.id + '.tar.xz';
      filename = filename.replace(RegExp(' ', 'g'), '_');
      return filename;
    },
    getFilteredRows(index) {
      return this.searchFilters[index]
        ? this.searchTotalFilteredRowsMap[index]
        : this.getFilteredDumps(index).length;
    },
    downloadEntry(uri) {
      let filename = uri?.split('LogServices/')?.[1]+ '.tar.xz';
      filename.replace(RegExp('/', 'g'), '_');
      this.$store
        .dispatch('dumps/downloadEntry', uri)
        .then((blob) => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = filename;
          link.click();
          URL.revokeObjectURL(link.href);
        })
        .catch(({ message }) => this.errorToast(message));
    },
    getFilteredDumps(index) {
      const dumpLog = this.allDumps[index];
      const filteredByDate = this.getFilteredTableDataByDate(
        dumpLog.dumps,
        this.filterStartDates[index],
        this.filterEndDates[index],
        'dateTime',
      );
      return this.getFilteredTableData(
        filteredByDate,
        this.activeFiltersMap[index] || [],
      );
    },
    onChangeRowCheckbox(checked, tableRefs, rowIndex, index) {
      // tableRefs is an array since it's a ref in v-for
      const tableRef = tableRefs[0];
      if (tableRef) {
        tableRef.selectRow(rowIndex, checked);
        // Update selected rows map based on all currently selected rows
        const selectedRows = tableRef.selectedRows;
        this.$set(this.selectedRowsMap, index, selectedRows);
        
        // Update header checkbox state
        const totalItems = this.getFilteredDumps(index).length;
        const selectedCount = selectedRows.length;
        this.$set(this.tableHeaderCheckboxModelMap, index, selectedCount > 0);
        this.$set(
          this.tableHeaderCheckboxIndeterminateMap,
          index,
          selectedCount > 0 && selectedCount < totalItems
        );
      }
    },
  },
};
</script>
