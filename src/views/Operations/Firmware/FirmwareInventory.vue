<template>
  <div>
    <page-section>
      <div style="display: flex; align-items: baseline;">
        <h2 style="margin: 0;">{{ $t('pageFirmware.sectionTitleFirmwareInventory') }}</h2>
        <b-button
          variant="link"
          :title="
            isExpanded ? $t('pageFirmware.viewLess') : $t('pageFirmware.viewMore')
          "
          v-show="showViewButton"
          class="btn-icon-only p-0 ml-3"
          style="margin: 0"
          @click="toggleExpand"
        >
          (
            <u>
              {{ firmwareInventory.length }}
              {{
                isExpanded ? $t('pageFirmware.collapse') : $t('pageFirmware.expand')
              }}
            </u>
          )
        </b-button>
      </div>
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
      <div class="mb-3">
        <b-table
          :items="displayedFirmwareInventory"
          :fields="fields"
          :style="tableStyle"
          responsive="sm"
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
    },
    showViewButton() {
      return this.firmwareInventory.length > 5;
    },
    tableStyle() {
      if (this.isExpanded) {
        return { display: 'block', overflowY: 'hidden' };
      } else {
        return { display: 'block', overflowY: 'scroll' };
      }
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
    toggleAdvanced() {
      this.showAdvanced = !this.showAdvanced;
    },
  },
  beforeDestroy() {
    this.$store.commit('firmware/setCheckedItems', []);
  },
};
</script>
