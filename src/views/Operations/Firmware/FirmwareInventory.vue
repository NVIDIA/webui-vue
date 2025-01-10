<template>
  <div>
    <page-section
      :section-title="$t('pageFirmware.sectionTitleFirmwareInventory')"
    >
      <b-button
        v-if="hideFirmwareTargets && hasFirmwareInventoryCheckbox && inventoryLoaded"
        variant="link"
        @click="toggleAdvanced"
      >
        {{
          showAdvanced
            ? $t('pageFirmware.hideAdvanced')
            : $t('pageFirmware.showAdvanced')
        }}
      </b-button>
      <div class="firmware-table-container">
        <b-table
          :items="displayedFirmwareInventory"
          :fields="fields"
          responsive="sm"
          sticky-header="310px"
        >
          <template
            v-if="hasFirmwareInventoryCheckbox && (!hideFirmwareTargets || showAdvanced)"
            #cell(select)="data"
          >
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
          :title="
            isExpanded ? $t('pageFirmware.viewLess') : $t('pageFirmware.viewMore')
          "
          v-show="inventoryLoaded"
          class="btn-icon-only p-0 ml-3"
          @click="toggleExpand"
        >
          {{
            isExpanded ? $t('pageFirmware.viewLess') : $t('pageFirmware.viewMore')
          }}
        </b-button>
      </div>
    </page-section>
  </div>
</template>

<script>
import PageSection from '@/components/Global/PageSection';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import StatusIcon from '@/components/Global/StatusIcon';
import DataFormatterMixin from '@/components/Mixins/DataFormatterMixin';
import { useI18n } from 'vue-i18n';
import i18n from '@/i18n';

export default {
  components: { PageSection, StatusIcon },
  mixins: [BVToastMixin, DataFormatterMixin],
  data() {
    return {
      $t: useI18n().t,
      isExpanded: false,
      fields: [
        { key: 'select', label: '' },
        { key: 'name', label: i18n.global.t('pageFirmware.tableHeaderFirmware') },
        { key: 'version', label: i18n.global.t('pageFirmware.tableHeaderVersion') },
        {
          key: 'health',
          label: i18n.global.t('pageFirmware.tableHeaderHealthStatus'),
        },
      ],
      hasFirmwareInventoryCheckbox:
        process.env.VUE_APP_HIDE_FIRMWARE_INVENTORY_CHECKBOX !== 'true',
      hideFirmwareTargets:
        process.env.VUE_APP_HIDE_FIRMWARE_TARGETS === 'true',
      showAdvanced: false,
    };
  },
  computed: {
    displayedFirmwareInventory() {
      return this.isExpanded
        ? this.firmwareInventory
        : this.firmwareInventory.slice(0, 5);
    },
    firmwareInventory() {
      return this.$store.getters['firmware/firmwareInventory'];
    },
    inventoryLoaded() {
      return this.firmwareInventory.length > 0;
    }
  },
  created() {
    this.$store.dispatch('firmware/getFirmwareInventory').then(() => {
      this.firmwareInventory =
        this.$store.getters['firmware/firmwareInventory'];
    });
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
    toggleAdvanced() {
      this.showAdvanced = !this.showAdvanced;
    },
  },
};
</script>

<style lang="scss" scoped>
.firmware-table-container {
  border: 1px solid #d8d8d8;
  border-radius: 4px;
  margin-bottom: 1rem;
}
</style>