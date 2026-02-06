<template>
  <b-container fluid="xl">
    <page-title />

    <!-- SSE Disconnected Banner -->
    <b-alert v-if="!isSSEConnected && !isLoading" variant="warning" show>
      {{ $t('pageEventLogs.sseDisconnected') || 'Real-time updates unavailable. Data may be stale.' }}
    </b-alert>
    <b-row class="align-items-start">
      <b-col sm="8" xl="6" class="d-sm-flex align-items-end mb-4">
        <search
          :placeholder="$t('pageEventLogs.table.searchLogs')"
          data-test-id="eventLogs-input-searchLogs"
          @change-search="onChangeSearchInput"
          @clear-search="onClearSearchInput"
        />
        <div class="ms-sm-4">
          <table-cell-count
            :filtered-items-count="filteredRows"
            :total-number-of-cells="allLogs.length"
          ></table-cell-count>
        </div>
      </b-col>
      <b-col sm="8" md="7" xl="6">
        <table-date-filter @change="onChangeDateTimeFilter" />
      </b-col>
    </b-row>
    <b-row>
      <b-col class="text-end">
        <table-filter :filters="tableFilters" @filter-change="onFilterChange" />
        <b-button
          variant="link"
          :disabled="allLogs.length === 0"
          @click="deleteAllLogs"
        >
          <icon-delete /> {{ $t('global.action.deleteAll') }}
        </b-button>
        <b-button
          variant="primary"
          :class="{ disabled: allLogs.length === 0 }"
          :disabled="allLogs.length === 0"
          @click="handleExportAll"
        >
          <icon-export /> {{ $t('global.action.exportAll') }}
        </b-button>
      </b-col>
    </b-row>
    <b-row>
      <b-col>
        <table-toolbar
          ref="toolbar"
          :selected-items-count="selectedRows.length"
          :actions="batchActions"
          @clear-selected="clearSelectedRows($refs.table)"
          @batch-action="onBatchAction"
        >
          <template #toolbar-buttons>
            <b-button v-if="!hideToggle" variant="primary" @click="resolveLogs">
              {{ $t('pageEventLogs.resolve') }}
            </b-button>
            <b-button
              v-if="!hideToggle"
              variant="primary"
              @click="unresolveLogs"
            >
              {{ $t('pageEventLogs.unresolve') }}
            </b-button>
            <table-toolbar-export
              :data="batchExportData"
              :file-name="exportFileNameByDate()"
            />
          </template>
        </table-toolbar>
        <b-table
          id="table-event-logs"
          ref="table"
          responsive="md"
          selectable
          no-select-on-click
          sort-icon-left
          hover
          must-sort
          thead-class="table-light"
          :sort-desc="[true]"
          show-empty
          :sort-by="['Id']"
          :fields="fields"
          :items="filteredLogs"
          :empty-text="$t('global.table.emptyMessage')"
          :empty-filtered-text="$t('global.table.emptySearchMessage')"
          :per-page="perPage"
          :current-page="currentPage"
          :filter="searchFilter"
          :busy="isBusy"
          @filtered="onFiltered"
          @row-selected="onRowSelected($event, filteredLogs.length)"
        >
          <!-- Checkbox column -->
          <template #head(checkbox)>
            <b-form-checkbox
              v-model="tableHeaderCheckboxModel"
              data-test-id="eventLogs-checkbox-selectAll"
              :indeterminate="tableHeaderCheckboxIndeterminate"
              @change="onChangeHeaderCheckbox($refs.table, $event)"
            >
              <span class="visually-hidden-focusable">
                {{ $t('global.table.selectAll') }}
              </span>
            </b-form-checkbox>
          </template>
          <template #cell(checkbox)="row">
            <b-form-checkbox
              v-model="row.rowSelected"
              :data-test-id="`eventLogs-checkbox-selectRow-${row.index}`"
              @change="toggleSelectRow($refs.table, row.index)"
            >
              <span class="visually-hidden-focusable">
                {{ $t('global.table.selectItem') }}
              </span>
            </b-form-checkbox>
          </template>

          <!-- Expand chevron icon -->
          <template #cell(expandRow)="row">
            <b-button
              variant="link"
              :aria-label="expandRowLabel"
              :title="expandRowLabel"
              class="btn-icon-only"
              @click="toggleRowDetails(row)"
            >
              <icon-chevron v-if="!row.detailsShowing" />
              <icon-chevron-up v-else />
            </b-button>
          </template>

          <template #row-details="{ item }">
            <b-container fluid>
              <b-row>
                <b-col>
                  <dl>
                    <!-- Name -->
                    <dt>{{ $t('pageEventLogs.table.name') }}:</dt>
                    <dd>{{ dataFormatter(item.Name) }}</dd>
                  </dl>
                  <dl>
                    <!-- Type -->
                    <dt>{{ $t('pageEventLogs.table.type') }}:</dt>
                    <dd>{{ dataFormatter(item.EntryType) }}</dd>
                  </dl>
                </b-col>
                <b-col>
                  <dl>
                    <!-- Modified date -->
                    <dt>{{ $t('pageEventLogs.table.modifiedDate') }}:</dt>
                    <dd v-if="item.Modified">
                      {{ $filters.formatDate(new Date(item.Modified)) }}
                      {{ $filters.formatTime(new Date(item.Modified)) }}
                    </dd>
                    <dd v-else>--</dd>
                  </dl>
                </b-col>
                <b-col class="text-nowrap">
                  <b-button @click="downloadEntry(item.AdditionalDataURI)">
                    <icon-download />{{ $t('pageEventLogs.additionalDataUri') }}
                  </b-button>
                </b-col>
              </b-row>
            </b-container>
          </template>

          <!-- Severity column -->
          <template #cell(Severity)="{ value }">
            <status-icon v-if="value" :status="statusIcon(value)" />
            {{ value }}
          </template>
          <!-- Date column -->
          <template #cell(date)="{ value }">
            <p class="mb-0">{{ $filters.formatDate(value) }}</p>
            <p class="mb-0">{{ $filters.formatTime(value) }}</p>
          </template>

          <!-- Status column -->
          <template #cell(Resolved)="row">
            <b-form-checkbox
              v-model="row.item.Resolved"
              name="switch"
              switch
              @change="changelogStatus(row.item)"
            >
              <span v-if="row.item.Resolved">
                {{ $t('pageEventLogs.resolved') }}
              </span>
              <span v-else>
                {{ $t('pageEventLogs.unresolved') }}
              </span>
            </b-form-checkbox>
          </template>

          <!-- Actions column -->
          <template #cell(actions)="row">
            <table-row-action
              v-for="(action, index) in row.item.actions"
              :key="index"
              :value="action.value"
              :title="action.title"
              :row-data="row.item"
              :export-name="exportFileNameByDate('export')"
              :data-test-id="`eventLogs-button-deleteRow-${row.index}`"
              @click-table-action="onTableRowAction($event, row.item)"
            >
              <template #icon>
                <icon-export v-if="action.value === 'export'" />
                <icon-trashcan v-if="action.value === 'delete'" />
              </template>
            </table-row-action>
          </template>
        </b-table>
      </b-col>
    </b-row>

    <!-- Table pagination -->
    <b-row>
      <b-col sm="6">
        <b-form-group
          class="table-pagination-select"
          :label="$t('global.table.itemsPerPage')"
          label-for="pagination-items-per-page"
        >
          <b-form-select
            id="pagination-items-per-page"
            v-model="perPage"
            :options="itemsPerPageOptions"
          />
        </b-form-group>
      </b-col>
      <b-col sm="6">
        <b-pagination
          v-model="currentPage"
          first-number
          last-number
          :per-page="perPage"
          :total-rows="getTotalRowCount(filteredRows)"
          aria-controls="table-event-logs"
        />
      </b-col>
    </b-row>
  </b-container>
</template>

<script>
import IconDelete from '@carbon/icons-vue/es/trash-can/20';
import IconTrashcan from '@carbon/icons-vue/es/trash-can/20';
import IconExport from '@carbon/icons-vue/es/document--export/20';
import IconChevron from '@carbon/icons-vue/es/chevron--down/20';
import IconChevronUp from '@carbon/icons-vue/es/chevron--up/20';
import IconDownload from '@carbon/icons-vue/es/download/20';
import { omit } from 'lodash';

import PageTitle from '@/components/Global/PageTitle';
import StatusIcon from '@/components/Global/StatusIcon';
import Search from '@/components/Global/Search';
import TableCellCount from '@/components/Global/TableCellCount';
import TableDateFilter from '@/components/Global/TableDateFilter';
import TableFilter from '@/components/Global/TableFilter';
import TableRowAction from '@/components/Global/TableRowAction';
import TableToolbar from '@/components/Global/TableToolbar';
import TableToolbarExport from '@/components/Global/TableToolbarExport';

import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';
import TableFilterMixin from '@/components/Mixins/TableFilterMixin';
import BVPaginationMixin, {
  currentPage,
  perPage,
  itemsPerPageOptions,
} from '@/components/Mixins/BVPaginationMixin';
import BVTableSelectableMixin, {
  selectedRows,
  tableHeaderCheckboxModel,
  tableHeaderCheckboxIndeterminate,
} from '@/components/Mixins/BVTableSelectableMixin';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';
import TableSortMixin from '@/components/Mixins/TableSortMixin';
import TableRowExpandMixin, {
  expandRowLabel,
} from '@/components/Mixins/TableRowExpandMixin';
import SearchFilterMixin, {
  searchFilter,
} from '@/components/Mixins/SearchFilterMixin';
import i18n from '@/i18n';
import { useModal } from 'bootstrap-vue-next';
import { useEventLog } from '@/api/composables/useEventLog';
import { downloadAsJson, downloadBlob } from '@/utilities/exportUtils';
import { computed, toRefs } from 'vue';

export default {
  components: {
    IconDelete,
    IconExport,
    IconTrashcan,
    IconChevron,
    IconChevronUp,
    IconDownload,
    PageTitle,
    Search,
    StatusIcon,
    TableCellCount,
    TableFilter,
    TableRowAction,
    TableToolbar,
    TableToolbarExport,
    TableDateFilter,
  },
  mixins: [
    BVPaginationMixin,
    BVTableSelectableMixin,
    BVToastMixin,
    LoadingBarMixin,
    TableFilterMixin,
    DataFormatterMixin,
    TableSortMixin,
    TableRowExpandMixin,
    SearchFilterMixin,
  ],
  beforeRouteLeave(to, from, next) {
    // Hide loader if the user navigates to another page
    // before request is fulfilled.
    this.hideLoader();
    next();
  },
  setup() {
    const bvModal = useModal();

    // Use the new Vue Query + SSE composable for event logs
    const eventLog = useEventLog();

    return {
      bvModal,
      // Event log data and state from composable
      eventLogEntries: eventLog.entries,
      isLoading: eventLog.isLoading,
      isFetching: eventLog.isFetching,
      isSSEConnected: eventLog.isSSEConnected,
      // Event log actions from composable
      eventLogDeleteLog: eventLog.deleteLog,
      eventLogDeleteLogs: eventLog.deleteLogs,
      eventLogDeleteAllLogs: eventLog.deleteAllLogs,
      eventLogResolveLogs: eventLog.resolveLogs,
      eventLogUnresolveLogs: eventLog.unresolveLogs,
      eventLogUpdateLogStatus: eventLog.updateLogStatus,
      eventLogDownloadEntry: eventLog.downloadEntry,
      eventLogRefetch: eventLog.refetch,
    };
  },
  data() {
    return {
      fields: [
        {
          key: 'expandRow',
          label: '',
          tdClass: 'table-row-expand',
        },
        {
          key: 'checkbox',
          sortable: false,
        },
        {
          key: 'Id',
          label: i18n.global.t('pageEventLogs.table.id'),
          sortable: true,
        },
        {
          key: 'Severity',
          label: i18n.global.t('pageEventLogs.table.severity'),
          sortable: true,
          tdClass: 'text-nowrap',
        },
        {
          key: 'date',
          label: i18n.global.t('pageEventLogs.table.date'),
          sortable: true,
          tdClass: 'text-nowrap',
        },
        {
          key: 'Message',
          label: i18n.global.t('pageEventLogs.table.description'),
          tdClass: 'text-break',
        },
        import.meta.env.VITE_EVENT_LOGS_TOGGLE_BUTTON_DISABLED === 'true'
          ? {}
          : {
              key: 'Resolved',
              label: i18n.global.t('pageEventLogs.table.status'),
            },
        {
          key: 'actions',
          sortable: false,
          label: '',
          tdClass: 'text-end text-nowrap',
        },
      ],
      tableFilters:
        import.meta.env.VITE_EVENT_LOGS_TOGGLE_BUTTON_DISABLED === 'true'
          ? [
              {
                key: 'Severity',
                label: i18n.global.t('pageEventLogs.table.severity'),
                values: ['OK', 'Warning', 'Critical'],
              },
            ]
          : [
              {
                key: 'Severity',
                label: i18n.global.t('pageEventLogs.table.severity'),
                values: ['OK', 'Warning', 'Critical'],
              },
              {
                key: 'Resolved',
                label: i18n.global.t('pageEventLogs.table.status'),
                values: [true, false],
                labels: ['Resolved', 'Unresolved'],
              },
            ],
      expandRowLabel,
      activeFilters: [],
      batchActions:
        import.meta.env.VITE_EVENT_LOGS_DELETE_BUTTON_DISABLED === 'true'
          ? []
          : [
              {
                value: 'delete',
                label: i18n.global.t('global.action.delete'),
              },
            ],
      currentPage: currentPage,
      filterStartDate: null,
      filterEndDate: null,
      itemsPerPageOptions: itemsPerPageOptions,
      perPage: perPage,
      searchFilter: searchFilter,
      searchTotalFilteredRows: 0,
      selectedRows: selectedRows,
      tableHeaderCheckboxModel: tableHeaderCheckboxModel,
      tableHeaderCheckboxIndeterminate: tableHeaderCheckboxIndeterminate,
      hideToggle:
        import.meta.env.VITE_EVENT_LOGS_TOGGLE_BUTTON_DISABLED === 'true',
      hideDelete:
        import.meta.env.VITE_EVENT_LOGS_DELETE_BUTTON_DISABLED === 'true',
    };
  },
  computed: {
    // isBusy reflects the loading state from Vue Query
    isBusy() {
      return this.isLoading;
    },
    filteredRows() {
      return this.searchFilter
        ? this.searchTotalFilteredRows
        : this.filteredLogs.length;
    },
    allLogs() {
      // Use Vue Query data from the composable instead of Vuex
      return this.eventLogEntries.map((event) => {
        return {
          ...event,
          // Parse Created to Date for table filtering and display
          date: event.Created ? new Date(event.Created) : new Date(),
          actions: this.hideDelete
            ? [
                {
                  value: 'export',
                  title: i18n.global.t('global.action.export'),
                },
              ]
            : [
                {
                  value: 'export',
                  title: i18n.global.t('global.action.export'),
                },
                {
                  value: 'delete',
                  title: i18n.global.t('global.action.delete'),
                },
              ],
        };
      });
    },
    batchExportData() {
      return this.selectedRows.map((row) => omit(row, 'actions'));
    },
    filteredLogsByDate() {
      return this.getFilteredTableDataByDate(
        this.allLogs,
        this.filterStartDate,
        this.filterEndDate,
      );
    },
    filteredLogs() {
      return this.getFilteredTableData(
        this.filteredLogsByDate,
        this.activeFilters,
      );
    },
  },
  // Vue Query handles data fetching automatically, no need for created() hook
  methods: {
    handleExportAll() {
      // Export all logs using Blob (avoids data URI size limits)
      // Omit UI-computed fields (date is parsed from Created, actions are UI-only)
      const logsToExport = this.allLogs.map((log) =>
        omit(log, ['actions', 'date']),
      );
      downloadAsJson(logsToExport, this.exportFileNameByDate());
    },
    downloadEntry(uri) {
      let filename = uri?.split('LogServices/')?.[1];
      filename = filename?.replace(RegExp('/', 'g'), '_') || 'download';
      this.eventLogDownloadEntry(uri)
        .then((blob) => downloadBlob(blob, filename))
        .catch(({ message }) => this.errorToast(message));
    },
    changelogStatus(row) {
      this.eventLogUpdateLogStatus({
        uri: row['@odata.id'],
        Resolved: row.Resolved,
      })
        .then((success) => {
          this.successToast(success);
        })
        .catch(({ message }) => this.errorToast(message));
    },
    async deleteAllLogs() {
      const ok = await this.confirmDialog(
        i18n.global.t('pageEventLogs.modal.deleteAllMessage'),
        {
          title: i18n.global.t('pageEventLogs.modal.deleteAllTitle'),
          okTitle: i18n.global.t('global.action.delete'),
          okVariant: 'danger',
          cancelTitle: i18n.global.t('global.action.cancel'),
          autoFocusButton: 'cancel',
        },
      );
      if (ok) {
        this.eventLogDeleteAllLogs()
          .then((message) => this.successToast(message))
          .catch(({ message }) => this.errorToast(message));
      }
    },
    deleteLogs(uris) {
      this.eventLogDeleteLogs(uris).then((messages) => {
        messages.forEach(({ type, message }) => {
          if (type === 'success') {
            this.successToast(message);
          } else if (type === 'error') {
            this.errorToast(message);
          }
        });
      });
    },
    onFilterChange({ activeFilters }) {
      this.activeFilters = activeFilters;
    },
    onTableRowAction(action, row) {
      if (action === 'delete') {
        this.confirmDialog(i18n.global.t('pageEventLogs.modal.deleteMessage'), {
          title: i18n.global.t('pageEventLogs.modal.deleteTitle'),
          okTitle: i18n.global.t('global.action.delete'),
          cancelTitle: i18n.global.t('global.action.cancel'),
          autoFocusButton: 'ok',
        }).then((deleteConfirmed) => {
          if (deleteConfirmed) this.deleteLogs([row['@odata.id']]);
        });
      }
    },
    async onBatchAction(action) {
      if (action === 'delete') {
        const uris = this.selectedRows.map((row) => row['@odata.id']);
        const count = this.selectedRows.length;
        const ok = await this.confirmDialog(
          i18n.global.t('pageEventLogs.modal.deleteMessage', count),
          {
            title: i18n.global.t('pageEventLogs.modal.deleteTitle', count),
            okTitle: i18n.global.t('global.action.delete'),
            cancelTitle: i18n.global.t('global.action.cancel'),
            autoFocusButton: 'ok',
          },
        );
        if (ok) {
          if (this.selectedRows.length === this.allLogs.length) {
            this.eventLogDeleteAllLogs()
              .then((message) => {
                this.successToast(message);
              })
              .catch(({ message }) => this.errorToast(message));
          } else {
            this.deleteLogs(uris);
          }
        }
      }
    },
    onChangeDateTimeFilter({ fromDate, toDate }) {
      this.filterStartDate = fromDate;
      this.filterEndDate = toDate;
    },
    onFiltered(filteredItems) {
      this.searchTotalFilteredRows = filteredItems.length;
    },
    // Create export file name based on date
    exportFileNameByDate(value) {
      let date = new Date();
      date =
        date.toISOString().slice(0, 10) +
        '_' +
        date.toString().split(':').join('-').split(' ')[4];
      let fileName;
      if (value === 'export') {
        fileName = 'event_log_';
      } else {
        fileName = 'all_event_logs_';
      }
      return fileName + date;
    },
    resolveLogs() {
      this.eventLogResolveLogs(this.selectedRows).then((messages) => {
        messages.forEach(({ type, message }) => {
          if (type === 'success') {
            this.successToast(message);
          } else if (type === 'error') {
            this.errorToast(message);
          }
        });
      });
    },
    unresolveLogs() {
      this.eventLogUnresolveLogs(this.selectedRows).then((messages) => {
        messages.forEach(({ type, message }) => {
          if (type === 'success') {
            this.successToast(message);
          } else if (type === 'error') {
            this.errorToast(message);
          }
        });
      });
    },
    confirmDialog(message, options = {}) {
      return this.$confirm({ message, ...options });
    },
  },
};
</script>
