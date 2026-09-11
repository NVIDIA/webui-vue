<template>
  <div>
    <page-section
      v-for="group in BmcGroups"
      :key="group.key"
      :section-title="sectionTitle(group)"
    >
      <b-row class="row-cols-1 row-cols-md-2">
        <!-- Running image -->
        <b-col class="mb-3">
          <b-card class="h-100">
            <template #header>
              <div class="d-flex justify-content-between align-items-center">
                <p class="fw-bold m-0">
                  {{ $t('pageFirmware.cardTitleRunning') }}
                </p>
                <b-button
                  v-if="showSlotDetails(group.activeSlot)"
                  variant="link"
                  class="btn-icon-only"
                  :data-test-id="`firmware-button-expandRunningSlot-${group.key}`"
                  :class="{ collapsed: !isSlotExpanded(group, 'running') }"
                  :title="slotToggleLabel(group, 'running')"
                  :aria-expanded="isSlotExpanded(group, 'running')"
                  :aria-controls="slotDetailsId(group, 'running')"
                  @click="toggleSlotDetails(group, 'running')"
                >
                  <icon-chevron />
                  <span class="visually-hidden">
                    {{ slotToggleLabel(group, 'running') }}
                  </span>
                </b-button>
              </div>
            </template>
            <dl class="mb-0">
              <dt>{{ $t('pageFirmware.cardBodyVersion') }}</dt>
              <dd class="mb-0">{{ runningVersion(group) }}</dd>
            </dl>
            <dl
              v-if="showSlotDetails(group.activeSlot)"
              v-show="isSlotExpanded(group, 'running')"
              :id="slotDetailsId(group, 'running')"
              class="slot-details mt-2"
            >
              <template
                v-for="detail in slotDetails(group.activeSlot)"
                :key="detail.labelKey"
              >
                <dt>{{ $t(detail.labelKey) }}:</dt>
                <dd>{{ detail.value }}</dd>
              </template>
            </dl>
          </b-card>
        </b-col>

        <!-- Backup image -->
        <b-col v-if="group.backupFirmware" class="mb-3">
          <b-card class="h-100">
            <template #header>
              <div class="d-flex justify-content-between align-items-center">
                <p class="fw-bold m-0">
                  {{ $t('pageFirmware.cardTitleBackup') }}
                </p>
                <b-button
                  v-if="showSlotDetails(group.backupSlot)"
                  variant="link"
                  class="btn-icon-only"
                  :data-test-id="`firmware-button-expandBackupSlot-${group.key}`"
                  :class="{ collapsed: !isSlotExpanded(group, 'backup') }"
                  :title="slotToggleLabel(group, 'backup')"
                  :aria-expanded="isSlotExpanded(group, 'backup')"
                  :aria-controls="slotDetailsId(group, 'backup')"
                  @click="toggleSlotDetails(group, 'backup')"
                >
                  <icon-chevron />
                  <span class="visually-hidden">
                    {{ slotToggleLabel(group, 'backup') }}
                  </span>
                </b-button>
              </div>
            </template>
            <dl>
              <dt>{{ $t('pageFirmware.cardBodyVersion') }}</dt>
              <dd>
                <status-icon
                  v-if="showBackupImageStatus(group)"
                  status="danger"
                />
                <span
                  v-if="showBackupImageStatus(group)"
                  class="visually-hidden-focusable"
                >
                  {{ backupStatus(group) }}
                </span>
                {{ backupVersion(group) }}
              </dd>
            </dl>
            <dl
              v-if="showSlotDetails(group.backupSlot)"
              v-show="isSlotExpanded(group, 'backup')"
              :id="slotDetailsId(group, 'backup')"
              class="slot-details mt-2"
            >
              <template
                v-for="detail in slotDetails(group.backupSlot)"
                :key="detail.labelKey"
              >
                <dt>{{ $t(detail.labelKey) }}:</dt>
                <dd>{{ detail.value }}</dd>
              </template>
            </dl>
            <b-btn
              v-if="
                group.switchSupported &&
                  !switchToBackupImageDisabled &&
                  isBackupUpdateable(group)
              "
              data-test-id="firmware-button-switchToRunning"
              variant="link"
              size="sm"
              class="py-0 px-1 mt-2"
              :disabled="
                isPageDisabled ||
                  !group.backupFirmware ||
                  !isServerOff
              "
              @click="switchToRunning(group)"
            >
              <icon-switch class="d-none d-sm-inline-block" />
              {{ $t('pageFirmware.cardActionSwitchToRunning') }}
            </b-btn>
          </b-card>
        </b-col>
      </b-row>
    </page-section>
    <modal-switch-to-running
      v-model="showSwitchToRunning"
      :backup="switchBackupVersion"
      @ok="confirmSwitchToRunning"
    />
  </div>
</template>

<script>
import IconSwitch from '@carbon/icons-vue/es/arrows--horizontal/20';
import IconChevron from '@carbon/icons-vue/es/chevron--down/20';
import PageSection from '@/components/Global/PageSection';
import LoadingBarMixin, { loading } from '@/components/Mixins/LoadingBarMixin';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import { useFirmwareInventory } from '@/api/composables/useFirmwareInventory';

import ModalSwitchToRunning from './FirmwareModalSwitchToRunning';
import i18n from '@/i18n';

/** Oem.Nvidia firmware slot fields shown behind the expand toggle. */
const SLOT_DETAIL_FIELDS = [
  { property: 'SlotId', labelKey: 'pageFirmware.cardBodySlotId' },
  {
    property: 'FirmwareState',
    labelKey: 'pageFirmware.cardBodyFirmwareState',
  },
  { property: 'BuildType', labelKey: 'pageFirmware.cardBodyBuildType' },
  {
    property: 'FirmwareComparisonNumber',
    labelKey: 'pageFirmware.cardBodyComparisonNumber',
  },
];

export default {
  components: { IconChevron, IconSwitch, ModalSwitchToRunning, PageSection },
  mixins: [BVToastMixin, LoadingBarMixin],
  props: {
    isPageDisabled: {
      required: true,
      type: Boolean,
      default: false,
    },
    isServerOff: {
      required: true,
      type: Boolean,
      default: false,
    },
  },
  setup() {
    const firmware = useFirmwareInventory();
    return {
      BmcGroups: firmware.BmcGroups,
      isSingleFileUploadEnabled: firmware.isSingleFileUploadEnabled,
    };
  },
  data() {
    return {
      loading,
      switchToBackupImageDisabled:
        import.meta.env.VITE_SWITCH_TO_BACKUP_IMAGE_DISABLED === 'true',
      showSwitchToRunning: false,
      switchBackupVersion: '--',
      pendingSwitchGroup: null,
      expandedSlots: {},
    };
  },
  methods: {
    sectionTitle(group) {
      const title = this.$t(group.sectionTitleKey);
      return group.sectionTitleSuffix
        ? `${title} (${group.sectionTitleSuffix})`
        : title;
    },
    slotDetails(slot) {
      if (!slot) return [];
      return SLOT_DETAIL_FIELDS.filter(
        ({ property }) => slot[property] != null && slot[property] !== '',
      ).map(({ property, labelKey }) => ({
        labelKey,
        value: String(slot[property]),
      }));
    },
    // Slot details only exist in Oem.Nvidia, so their presence is the platform
    // check — VITE_ENV_NAME is unset in some dev builds.
    showSlotDetails(slot) {
      return this.slotDetails(slot).length > 0;
    },
    slotDetailsId(group, image) {
      return `firmware-slot-details-${group.key}-${image}`;
    },
    isSlotExpanded(group, image) {
      return !!this.expandedSlots[this.slotDetailsId(group, image)];
    },
    toggleSlotDetails(group, image) {
      const id = this.slotDetailsId(group, image);
      this.expandedSlots[id] = !this.expandedSlots[id];
    },
    slotToggleLabel(group, image) {
      return this.isSlotExpanded(group, image)
        ? this.$t('pageFirmware.collapse')
        : this.$t('pageFirmware.expand');
    },
    runningVersion(group) {
      return group.activeFirmware?.Version || '--';
    },
    backupVersion(group) {
      return group.backupFirmware?.Version || '--';
    },
    backupStatus(group) {
      return group.backupFirmware?.Status?.Health || null;
    },
    isBackupUpdateable(group) {
      const backup = group.backupFirmware;
      return (
        typeof backup?.Updateable === 'undefined' ||
        backup?.Updateable === true
      );
    },
    showBackupImageStatus(group) {
      const status = this.backupStatus(group);
      return status === 'Critical' || status === 'Warning';
    },
    switchToRunning(group) {
      this.pendingSwitchGroup = group;
      this.switchBackupVersion = this.backupVersion(group);
      this.showSwitchToRunning = true;
    },
    confirmSwitchToRunning() {
      const group = this.pendingSwitchGroup;
      if (!group?.backupFirmware) {
        this.errorToast(this.$t('pageFirmware.toast.errorNoBackupImage'));
        return;
      }

      const backupLocation = group.backupFirmware['@odata.id'];
      if (!backupLocation) {
        this.errorToast(this.$t('pageFirmware.toast.errorNoBackupImage'));
        return;
      }

      this.startLoader();
      const timerId = setTimeout(() => {
        this.endLoader();
        this.infoToast(
          i18n.global.t('pageFirmware.toast.verifySwitchMessage'),
          {
            title: i18n.global.t('pageFirmware.toast.verifySwitch'),
            refreshAction: true,
          },
        );
      }, 60000);

      this.$store
        .dispatch('firmware/switchBmcFirmwareAndReboot', backupLocation)
        .then(() =>
          this.infoToast(
            i18n.global.t('pageFirmware.toast.rebootStartedMessage'),
            {
              title: i18n.global.t('pageFirmware.toast.rebootStarted'),
            },
          ),
        )
        .catch(({ message }) => {
          this.errorToast(message);
          clearTimeout(timerId);
          this.endLoader();
        })
        .finally(() => {
          this.pendingSwitchGroup = null;
        });
    },
  },
};
</script>

<style lang="scss" scoped>
// Chevron points right while the slot details are collapsed, matching the
// expandable table rows elsewhere in the UI.
.btn.collapsed svg {
  transform: rotate(-90deg);
}

// Keep each slot value on one line as "Label: value", matching the expanded
// rows in the inventory tables.
.slot-details {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: calc($spacer / 2);
  margin-bottom: 0;

  dt {
    grid-column: 1;
  }

  dd {
    grid-column: 2;
    margin-bottom: 0;
    line-height: 1.4;
  }
}
</style>
