<template>
  <div>
    <page-section
      :section-title="$t('pageFirmware.sectionTitleFirmwareInventory')"
    >
      <b-table
        :items="displayedFirmwareInventory"
        :fields="fields"
        responsive="sm"
      >
        <template #cell(select)="data">
          <b-form-checkbox
            v-model="data.item.checked"
            :disabled="data.item.updateable === false"
            @change="handleCheckboxChange(data.item)"
            v-b-tooltip.hover.top="
              data.item.updateable === false ? 'Not updateable' : ''
            "
          ></b-form-checkbox>
        </template>
        <template #cell(name)="data">
          {{ data.item.name }}
        </template>
        <template #cell(version)="data">
          {{ data.item.version }}
        </template>
        <template #cell(health)="data">
          <status-icon :status="statusIcon(data.item.status)" />
          {{ data.item.status }}
        </template>
      </b-table>
      <b-button
        variant="link"
        :title="isExpanded ? 'View Less' : 'View More'"
        class="btn-icon-only p-0"
        @click="toggleExpand"
      >
        {{ isExpanded ? 'View Less' : 'View More' }}
      </b-button>
    </page-section>
  </div>
</template>

<script>
import PageSection from '@/components/Global/PageSection';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import StatusIcon from '@/components/Global/StatusIcon';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';

export default {
  components: { PageSection, StatusIcon },
  mixins: [BVToastMixin, DataFormatterMixin],
  data() {
    return {
      isExpanded: false,
      fields: [
        { key: 'select', label: '' },
        { key: 'name', label: this.$t('pageFirmware.tableHeaderFirmware') },
        { key: 'version', label: this.$t('pageFirmware.tableHeaderVersion') },
        {
          key: 'health',
          label: this.$t('pageFirmware.tableHeaderHealthStatus'),
        },
      ],
      firmwareInventory: [],
    };
  },
  computed: {
    displayedFirmwareInventory() {
      return this.isExpanded
        ? this.firmwareInventory
        : this.firmwareInventory.slice(0, 5);
    },
  },
  methods: {
    toggleExpand() {
      this.isExpanded = !this.isExpanded;
    },
    handleCheckboxChange(item) {
      if (item.updateable === true) {
        this.updateCheckedItems();
        return; // Add logic here for checkbox changes
      }
    },
    updateCheckedItems() {
      const checkedItems = this.firmwareInventory
        .filter((item) => item.checked && item.id)
        .map((item) => item.id);
      this.$store.commit('firmware/setCheckedItems', checkedItems);
    },
  },
  created() {
    this.$store.dispatch('firmware/getFirmwareInventory').then(() => {
      this.firmwareInventory =
        this.$store.getters['firmware/firmwareInventory'];
    });
  },
};
</script>
