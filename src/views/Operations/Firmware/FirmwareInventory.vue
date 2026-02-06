<template>
  <div>
    <page-section>
      <h2>
        {{ $t('pageFirmware.sectionTitleFirmwareInventory') }}
        <span v-if="firmwareInventory.length" class="h6 text-muted ms-2">
          ({{ firmwareInventory.length }})
        </span>
      </h2>
      <div class="mb-3">
        <b-table
          :items="firmwareInventory"
          :fields="fields"
          responsive="sm"
        >
          <template #cell(select)="data">
            <b-form-checkbox
              v-if="hasFirmwareInventoryCheckbox"
              v-model="data.item.checked"
              v-b-tooltip.hover.top="
                data.item.updateable === false ? 'Not updateable' : ''
              "
              :disabled="data.item.updateable === false"
              @change="handleCheckboxChange(data.item)"
            ></b-form-checkbox>
          </template>
          <template #cell(name)="data">
            {{ data.item.name }}
          </template>
          <template #cell(version)="data">
            {{ dataFormatter(data.item.version) }}
          </template>
          <template #cell(health)="data">
            <status-icon :status="statusIcon(data.item.status)" />
            {{ data.item.status }}
          </template>
        </b-table>
      </div>
    </page-section>
  </div>
</template>

<script>
import { computed } from 'vue';
import PageSection from '@/components/Global/PageSection';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import StatusIcon from '@/components/Global/StatusIcon';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';
import { useRedfishCollection } from '@/api/composables/useRedfishCollection';

export default {
  components: { PageSection, StatusIcon },
  mixins: [BVToastMixin, DataFormatterMixin],
  setup() {
    // Fetch firmware inventory via Vue Query (deduplicates with Firmware.vue)
    const { data } = useRedfishCollection(
      '/redfish/v1/UpdateService/FirmwareInventory',
      { $expand: '.' },
    );

    // Map raw Redfish SoftwareInventory to table rows
    const firmwareInventory = computed(() => {
      const members = data.value?.Members ?? [];
      return members.map((item) => ({
        name: item.Id || item['@odata.id']?.split('/').pop() || '',
        version: item.Version || '--',
        status: item.Status?.Health || 'N/A',
        id: item['@odata.id'] || '',
        updateable: item.Updateable !== false,
        checked: false,
      }));
    });

    return { firmwareInventory };
  },
  data() {
    return {
      fields: [
        { key: 'select', label: '' },
        { key: 'name', label: this.$t('pageFirmware.tableHeaderFirmware') },
        { key: 'version', label: this.$t('pageFirmware.tableHeaderVersion') },
        {
          key: 'health',
          label: this.$t('pageFirmware.tableHeaderHealthStatus'),
        },
      ],
      hasFirmwareInventoryCheckbox:
        import.meta.env.VITE_HIDE_FIRMWARE_INVENTORY_CHECKBOX !== 'true',
    };
  },
  beforeUnmount() {
    this.$store.commit('firmware/setCheckedItems', []);
  },
  methods: {
    handleCheckboxChange(item) {
      if (item.updateable === true) {
        this.updateCheckedItems();
      }
    },
    updateCheckedItems() {
      const checkedItems = this.firmwareInventory
        .filter((item) => item.checked && item.id)
        .map((item) => item.id);
      this.$store.commit('firmware/setCheckedItems', checkedItems);
    },
  },
};
</script>
