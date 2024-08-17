<template>
  <page-section
    v-if="items.length"
    :section-title="$t('pageInventory.assemblies')"
  >
    <b-table
      sort-icon-left
      no-sort-reset
      hover
      responsive="md"
      :items="items"
      :fields="fields"
      show-empty
      :empty-text="$t('global.table.emptyMessage')"
      :busy="isBusy"
    >
      <!-- Expand chevron icon -->
      <template #cell(expandRow)="row">
        <b-button
          variant="link"
          data-test-id="hardwareStatus-button-expandAssembly"
          :title="expandRowLabel"
          class="btn-icon-only"
          @click="toggleRowDetails(row)"
        >
          <icon-chevron />
          <span class="sr-only">{{ expandRowLabel }}</span>
        </b-button>
      </template>

      <!-- Toggle identify LED -->
      <template #cell(identifyLed)="row">
        <b-form-checkbox
          v-if="hasIdentifyLed(row.item.identifyLed)"
          v-model="row.item.identifyLed"
          name="switch"
          switch
          @change="toggleIdentifyLedValue(row.item)"
        >
          <span v-if="row.item.identifyLed">
            {{ $t('global.status.on') }}
          </span>
          <span v-else> {{ $t('global.status.off') }} </span>
        </b-form-checkbox>
        <div v-else>--</div>
      </template>

      <template #row-details="{ item }">
        <b-container fluid>
          <b-row v-if="!showFru">
            <b-col class="mt-2" sm="6" xl="6">
              <!-- Nmae -->
              <dt>{{ $t('pageInventory.table.name') }}:</dt>
              <dd>{{ dataFormatter(item.name) }}</dd>
              <!-- Serial number -->
              <dt>{{ $t('pageInventory.table.serialNumber') }}:</dt>
              <dd>{{ dataFormatter(item.serialNumber) }}</dd>
            </b-col>
            <b-col class="mt-2" sm="6" xl="6">
              <!-- Model-->
              <dt>Model</dt>
              <dd>{{ dataFormatter(item.model) }}</dd>
              <!-- Spare Part Number -->
              <dt>Spare Part Number</dt>
              <dd>{{ dataFormatter(item.sparePartNumber) }}</dd>
            </b-col>
          </b-row>
          <b-row v-else>
            <b-col class="mt-2" sm="6" xl="6">
              <!-- Board Manufacture Date -->
              <dt>{{ $t('pageInventory.table.boardManufatureDate') }}:</dt>
              <dd v-if="item.boardManufatureDate">
                {{ item.boardManufatureDate | formatDate }}
                {{ item.boardManufatureDate | formatTime }}
              </dd>
              <dd v-else>{{ dataFormatter(item.boardManufatureDate) }}</dd>
              <!-- Board Manufacturer -->
              <dt>{{ $t('pageInventory.table.boardManufacturer') }}:</dt>
              <dd>{{ dataFormatter(item.boardManufacturer) }}</dd>
              <!-- Board Product -->
              <dt>{{ $t('pageInventory.table.boardProductName') }}:</dt>
              <dd>{{ dataFormatter(item.boardProductName) }}</dd>
              <!-- Board Part Number -->
              <dt>{{ $t('pageInventory.table.boardPartNumber') }}:</dt>
              <dd>{{ dataFormatter(item.boardPartNumber) }}</dd>
              <!-- Board Serial Number -->
              <dt>{{ $t('pageInventory.table.boardSerialNumber') }}:</dt>
              <dd>{{ dataFormatter(item.boardSerialNumber) }}</dd>
              <!-- Board FRU File ID -->
              <dt>{{ $t('pageInventory.table.boardFruFileId') }}:</dt>
              <dd>{{ dataFormatter(item.boardFruFileId) }}</dd>
              <!-- Board Extra -->
              <dt>{{ $t('pageInventory.table.boardExtra') }}:</dt>
              <dd>{{ dataFormatter(item.boardExtra) }}</dd>
            </b-col>
            <b-col class="mt-2" sm="6" xl="6">
              <!-- Product Manufacturer -->
              <dt>{{ $t('pageInventory.table.productManufacturer') }}:</dt>
              <dd>{{ dataFormatter(item.productManufacturer) }}</dd>
              <!-- Product Name -->
              <dt>{{ $t('pageInventory.table.productProductName') }}:</dt>
              <dd>{{ dataFormatter(item.productProductName) }}</dd>
              <!-- Product Part Number -->
              <dt>{{ $t('pageInventory.table.productPartNumber') }}:</dt>
              <dd>{{ dataFormatter(item.productPartNumber) }}</dd>
              <!-- Product Version -->
              <dt>{{ $t('pageInventory.table.productVersion') }}:</dt>
              <dd>{{ dataFormatter(item.productVersion) }}</dd>
              <!-- Product Serial Number -->
              <dt>{{ $t('pageInventory.table.productSerialNumber') }}:</dt>
              <dd>{{ dataFormatter(item.productSerialNumber) }}</dd>
              <!-- Product Asset Tag -->
              <dt>{{ $t('pageInventory.table.productAssetTag') }}:</dt>
              <dd>{{ dataFormatter(item.productAssetTag) }}</dd>
              <!-- Product Extra -->
              <dt>{{ $t('pageInventory.table.productExtra') }}:</dt>
              <dd>{{ dataFormatter(item.productExtra) }}</dd>
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
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import TableRowExpandMixin, {
  expandRowLabel,
} from '@/components/Mixins/TableRowExpandMixin';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';

export default {
  components: { IconChevron, PageSection },
  mixins: [BVToastMixin, TableRowExpandMixin, DataFormatterMixin],
  data() {
    return {
      isBusy: true,
      expandRowLabel: expandRowLabel,
      showFru: process.env.VUE_APP_SHOW_FRU === 'true',
    };
  },
  computed: {
    assemblies() {
      return this.$store.getters['assemblies/assemblies'];
    },
    items() {
      if (this.assemblies) {
        return this.assemblies;
      } else {
        return [];
      }
    },
    fields() {
      if (this.showFru) {
        return [
          {
            key: 'expandRow',
            label: '',
            tdClass: 'table-row-expand',
          },
          {
            key: 'name',
            label: this.$t('pageInventory.table.name'),
            formatter: this.dataFormatter,
          },
          {
            key: 'chassisType',
            label: this.$t('pageInventory.table.chassisType'),
            formatter: this.dataFormatter,
          },
          {
            key: 'chassisPartNumber',
            label: this.$t('pageInventory.table.chassisPartNumber'),
            formatter: this.dataFormatter,
          },
          {
            key: 'chassisSerialNumber',
            label: this.$t('pageInventory.table.chassisSerialNumber'),
            formatter: this.dataFormatter,
          },
        ];
      }
      return [
        {
          key: 'expandRow',
          label: '',
          tdClass: 'table-row-expand',
        },
        {
          key: 'name',
          label: this.$t('pageInventory.table.id'),
          formatter: this.dataFormatter,
          sortable: true,
        },
        {
          key: 'partNumber',
          label: this.$t('pageInventory.table.partNumber'),
          formatter: this.dataFormatter,
          sortable: true,
        },
        {
          key: 'locationNumber',
          label: this.$t('pageInventory.table.locationNumber'),
          formatter: this.dataFormatter,
          sortable: true,
        },
        {
          key: 'identifyLed',
          label: this.$t('pageInventory.table.identifyLed'),
          formatter: this.dataFormatter,
        },
      ];
    },
  },
  created() {
    if (this.showFru) {
      this.$store.dispatch('assemblies/getFruInfo').finally(() => {
        // Emit initial data fetch complete to parent component
        this.$root.$emit('hardware-status-assembly-complete');
        this.isBusy = false;
      });
    } else {
      this.$store.dispatch('assemblies/getAssemblyInfo').finally(() => {
        // Emit initial data fetch complete to parent component
        this.$root.$emit('hardware-status-assembly-complete');
        this.isBusy = false;
      });
    }
  },
  methods: {
    toggleIdentifyLedValue(row) {
      this.$store
        .dispatch('assemblies/updateIdentifyLedValue', {
          uri: row.uri,
          memberId: row.id,
          identifyLed: row.identifyLed,
        })
        .then((message) => this.successToast(message))
        .catch(({ message }) => this.errorToast(message));
    },
    hasIdentifyLed(identifyLed) {
      return typeof identifyLed === 'boolean';
    },
  },
};
</script>
