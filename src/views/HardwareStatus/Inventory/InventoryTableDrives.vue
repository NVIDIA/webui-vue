<template>
  <page-section
    v-if="drives.length"
    :section-title="$t('pageInventory.drives')"
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
          :total-number-of-cells="drives.length"
        ></table-cell-count>
      </b-col>
    </b-row>
    <b-table
      sort-icon-left
      no-sort-reset
      hover
      responsive="md"
      :sort-by="['health']"
      show-empty
      :items="drives"
      :fields="fields"
      :sort-desc="true"
      :sort-compare="sortCompare"
      :filter="searchFilter"
      :empty-text="$t('global.table.emptyMessage')"
      :empty-filtered-text="$t('global.table.emptySearchMessage')"
      :busy="isBusy"
      @filtered="onFiltered"
    >
      <!-- Expand chevron icon -->
      <template #cell(expandRow)="row">
        <b-button
          variant="link"
          data-test-id="hardwareStatus-button-expandDrives"
          :title="expandRowLabel"
          class="btn-icon-only"
          @click="toggleRowDetails(row)"
        >
          <icon-chevron />
          <span class="sr-only">{{ expandRowLabel }}</span>
        </b-button>
      </template>

      <!-- Health -->
      <template #cell(health)="{ value }">
        <status-icon :status="statusIcon(value)" />
        {{ value }}
      </template>

      <template #row-details="{ item }">
        <b-container fluid>
          <b-row>
            <b-col sm="6" xl="4">
              <dl>
                <!-- ID -->
                <dt>{{ $t('pageInventory.table.id') }}:</dt>
                <dd>{{ dataFormatter(item.Id) }}</dd>
              </dl>
              <dl>
                <!-- Serial number -->
                <dt>{{ $t('pageInventory.table.serialNumber') }}:</dt>
                <dd>{{ dataFormatter(item.SerialNumber) }}</dd>
              </dl>
              <dl>
                <!-- Part number -->
                <dt>{{ $t('pageInventory.table.partNumber') }}:</dt>
                <dd>{{ dataFormatter(item.PartNumber) }}</dd>
              </dl>
              <dl>
                <!-- Media Type -->
                <dt>{{ $t('pageInventory.table.mediaType') }}:</dt>
                <dd>{{ dataFormatter(item.MediaType) }}</dd>
              </dl>
              <dl>
                <!-- Form Factor -->
                <dt>{{ $t('pageInventory.table.formFactor') }}:</dt>
                <dd>{{ dataFormatter(item.DriveFormFactor) }}</dd>
              </dl>
            </b-col>
            <b-col sm="6" xl="4">
              <dl>
                <!-- Capacity -->
                <dt>{{ $t('pageInventory.table.capacityBytes') }}:</dt>
                <dd>{{ formatCapacity(item.CapacityBytes) }}</dd>
              </dl>
              <dl>
                <!-- Status state -->
                <dt>{{ $t('pageInventory.table.statusState') }}:</dt>
                <dd>{{ dataFormatter(item.Status && item.Status.State) }}</dd>
              </dl>
              <dl>
                <!-- Status Indicator -->
                <dt>{{ $t('pageInventory.table.statusIndicator') }}:</dt>
                <dd>{{ dataFormatter(item.StatusIndicator) }}</dd>
              </dl>
              <dl>
                <!-- Failure Predicted -->
                <dt>{{ $t('pageInventory.table.failurePredicted') }}:</dt>
                <dd>{{ dataFormatter(item.FailurePredicted) }}</dd>
              </dl>
              <dl>
                <!-- Predicted Media Life Left -->
                <dt>{{ $t('pageInventory.table.predictedLifeLeft') }}:</dt>
                <dd>
                  {{ formatValueWithUnit(item.PredictedMediaLifeLeftPercent, 'unit.percent') }}
                </dd>
              </dl>
            </b-col>
            <b-col sm="6" xl="4">
              <dl>
                <!-- Manufacturer -->
                <dt>{{ $t('pageInventory.table.manufacturer') }}:</dt>
                <dd>{{ dataFormatter(item.Manufacturer) }}</dd>
              </dl>
              <dl>
                <!-- Model -->
                <dt>{{ $t('pageInventory.table.model') }}:</dt>
                <dd>{{ dataFormatter(item.Model) }}</dd>
              </dl>
              <dl>
                <!-- Firmware Version -->
                <dt>{{ $t('pageInventory.table.firmwareVersion') }}:</dt>
                <dd>{{ dataFormatter(item.FirmwareVersion) }}</dd>
              </dl>
              <dl>
                <!-- Physical Location -->
                <dt v-if="item.PhysicalLocation && item.PhysicalLocation.PartLocation">
                  {{ $t('pageInventory.table.locationNumber') }}:
                </dt>
                <dd v-if="item.PhysicalLocation && item.PhysicalLocation.PartLocation">
                  {{ dataFormatter(item.PhysicalLocation.PartLocation.ServiceLabel) }}
                </dd>
              </dl>
              <dl>
                <!-- Capable Speed -->
                <dt>{{ $t('pageInventory.table.capableSpeed') }}:</dt>
                <dd>
                  {{ formatValueWithUnit(item.CapableSpeedGbs, 'unit.gbps') }}
                </dd>
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
import IconChevron from '@carbon/icons-vue/es/chevron--down/20';
import TableCellCount from '@/components/Global/TableCellCount';
import StatusIcon from '@/components/Global/StatusIcon';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';
import TableSortMixin from '@/components/Mixins/TableSortMixin';
import Search from '@/components/Global/Search';
import SearchFilterMixin, {
  searchFilter,
} from '@/components/Mixins/SearchFilterMixin';
import TableRowExpandMixin, {
  expandRowLabel,
} from '@/components/Mixins/TableRowExpandMixin';

export default {
  components: { IconChevron, PageSection, StatusIcon, Search, TableCellCount },
  mixins: [
    TableRowExpandMixin,
    DataFormatterMixin,
    TableSortMixin,
    SearchFilterMixin,
  ],
  props: ['showLeds'],
  data() {
    return {
      isBusy: true,
      fields: [
        {
          key: 'expandRow',
          label: '',
          tdClass: 'table-row-expand',
          sortable: false,
        },
        {
          key: 'Id',
          label: this.$t('pageInventory.table.id'),
          formatter: this.dataFormatter,
          sortable: true,
        },
        {
          key: 'health',
          label: this.$t('pageInventory.table.health'),
          formatter: this.dataFormatter,
          sortable: true,
          tdClass: 'text-nowrap',
        },
        {
          key: 'Model',
          label: this.$t('pageInventory.table.model'),
          formatter: this.dataFormatter,
          sortable: true,
        },
        {
          key: 'MediaType',
          label: this.$t('pageInventory.table.mediaType'),
          formatter: this.dataFormatter,
          sortable: true,
        },
        {
          key: 'location',
          label: this.$t('pageInventory.table.locationNumber'),
          formatter: this.dataFormatter,
          sortable: true,
        },
      ],
      searchFilter: searchFilter,
      searchTotalFilteredRows: 0,
      expandRowLabel: expandRowLabel,
    };
  },
  computed: {
    filteredRows() {
      return this.searchFilter
        ? this.searchTotalFilteredRows
        : this.drives.length;
    },
    drives() {
      const driveList = this.$store.getters['drives/drives'] || [];
      
      return driveList.map(drive => {
        // Map each drive to include a health property based on Status
        let health = 'Unknown';
        
        if (drive.StatusIndicator === 'OK') {
          health = 'OK';
        } else if (drive.StatusIndicator === 'Fail') {
          health = 'Critical';
        } else if (drive.FailurePredicted) {
          health = 'Warning';
        } else if (drive.Status && drive.Status.State === 'Enabled') {
          health = 'OK';
        } else if (drive.Status && drive.Status.State === 'Disabled') {
          health = 'Warning';
        }
        
        // Extract location from PhysicalLocation if available
        const location = drive.PhysicalLocation?.PartLocation?.ServiceLabel || '';
                        
        // Return the original drive with just UI helper properties
        return {
          ...drive,
          health,
          location
        };
      });
    },
  },
  created() {
    this.$store.dispatch('drives/fetchDrives').then(() => {
        this.isBusy = false;
    });
    // Emit that initialization is complete immediately
    this.$eventBus.$emit('hardware-status-drives-complete');
  },
  methods: {
    sortCompare(a, b, key) {
      if (key === 'health') {
        return this.sortStatus(a, b, key);
      }
    },
    onFiltered(filteredItems) {
      this.searchTotalFilteredRows = filteredItems.length;
    },
    formatCapacity(bytes) {
      if (!bytes) return this.dataFormatter(bytes);
      
      // Use translation keys for units
      const units = [
        this.$t('unit.byte'),
        this.$t('unit.kilobyte'),
        this.$t('unit.megabyte'),
        this.$t('unit.gigabyte'),
        this.$t('unit.terabyte'),
        this.$t('unit.petabyte')
      ];
      
      const divisor = 1000; // or 1024 depending on convention
      
      let i = 0;
      let formattedValue = bytes;
      
      // Calculate appropriate unit
      while (formattedValue >= divisor && i < units.length - 1) {
        formattedValue /= divisor;
        i++;
      }
      
      // Use locale-aware number formatting
      const formatter = new Intl.NumberFormat(this.$i18n.locale, {
        maximumFractionDigits: i === 0 ? 0 : 2,
        minimumFractionDigits: 0
      });
      
      return `${formatter.format(formattedValue)} ${units[i]}`;
    },
    formatValueWithUnit(value, unitKey) {
      if (!value) return this.dataFormatter(value);
      return `${this.dataFormatter(value)} ${this.$t(unitKey)}`;
    }
  },
};
</script> 