<template>
  <b-container fluid="xl">
    <page-title :description="$t('pageFactoryReset.description')" />

    <!-- Reset Form -->
    <b-form id="factory-reset" @submit.prevent="onResetSubmit">
      <b-row>
        <b-col md="8">
          <b-form-group :label="$t('pageFactoryReset.form.resetOptionsLabel')">
            <b-form-radio-group
              id="factory-reset-options"
              v-model="selectedTarget"
              stacked
              @change="onResetTargetChange"
            >
            <div
              v-for="(item, index) in biosOptions"
              :key="'bios-' + item.target"
            >
              <b-form-radio
                class="mb-1"
                :value="item.target"
                aria-describedby="reset-bios"
                :data-test-id="'factoryReset-radio-resetBios-' + index"
              >
                {{
                  biosOptions.length < 2
                    ? $t('pageFactoryReset.form.resetBiosOptionLabel')
                    : $t('pageFactoryReset.form.resetBiosOptionLabel') +
                      ': [' +
                      item.Id +
                      ']'
                }}
              </b-form-radio>
            </div>
            <b-form-text
              v-if="biosOptions.length"
              id="reset-bios"
              class="ms-4 mb-3"
            >
              {{ $t('pageFactoryReset.form.resetBiosOptionHelperText') }}
            </b-form-text>

            <div
              v-for="(item, index) in bmcOptions"
              :key="'defaults-' + item.target"
            >
              <b-form-radio
                class="mb-1"
                :value="item.target"
                aria-describedby="reset-to-defaults"
                :data-test-id="'factoryReset-radio-resetToDefaults-' + index"
              >
                {{
                  bmcOptions.length < 2
                    ? $t('pageFactoryReset.form.resetToDefaultsOptionLabel')
                    : $t('pageFactoryReset.form.resetToDefaultsOptionLabel') +
                      ': [' +
                      item.Id +
                      ']'
                }}
              </b-form-radio>
            </div>
            <b-form-text
              v-if="bmcOptions.length"
              id="reset-to-defaults"
              class="ms-4 mb-3"
            >
              {{ $t('pageFactoryReset.form.resetToDefaultsOptionHelperText') }}
            </b-form-text>
            </b-form-radio-group>
          </b-form-group>
          <b-button
            type="submit"
            variant="primary"
            data-test-id="factoryReset-button-submit"
            :disabled="!resetOption.value"
          >
            {{ $t('global.action.reset') }}
          </b-button>
        </b-col>
      </b-row>
    </b-form>

    <!-- Modals -->
    <modal-reset
      v-model="showResetModal"
      :reset-type="confirmResetType"
      @ok-confirm="onOkConfirm"
    />
  </b-container>
</template>

<script>
import PageTitle from '@/components/Global/PageTitle';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';
import ModalReset from './FactoryResetModal';
import { mapGetters } from 'vuex';

function uniqueResetTargets(targets) {
  const seenTargets = new Set();
  return (targets || []).flatMap((item) => {
    if (!item?.target || seenTargets.has(item.target)) return [];
    seenTargets.add(item.target);
    return [item];
  });
}

export default {
  name: 'FactoryReset',
  components: { PageTitle, ModalReset },
  mixins: [LoadingBarMixin, BVToastMixin],
  data() {
    return {
      showResetModal: false,
      selectedTarget: null,
      // Set from the radio group's change event, which fires for a click
      // or keypress that picks a value, and from Submit so accepting the
      // current single-target default counts. A programmatic write does
      // not emit change.
      userHasSelected: false,
      // Action captured when Submit opens the modal. Confirm uses this so
      // a later BIOS/BMC list cannot change the reset already in review.
      pendingReset: null,
    };
  },
  computed: {
    ...mapGetters('factoryReset', ['resetBiosUris']),
    ...mapGetters('bmc', { bmcResetToDefaultsUris: 'resetToDefaultsUris' }),
    biosOptions() {
      return uniqueResetTargets(this.resetBiosUris);
    },
    bmcOptions() {
      return uniqueResetTargets(this.bmcResetToDefaultsUris);
    },
    resetChoices() {
      return [
        ...this.biosOptions.map((item) => ({ ...item, value: 'resetBios' })),
        ...this.bmcOptions.map((item) => ({
          ...item,
          value: 'resetToDefaults',
        })),
      ];
    },
    resetOption() {
      const selected = this.resetChoices.find(
        (item) => item.target === this.selectedTarget,
      );
      return selected ?? { value: null };
    },
    confirmResetType() {
      return this.pendingReset?.value ?? this.resetOption.value;
    },
  },
  watch: {
    resetChoices: {
      immediate: true,
      handler(choices) {
        const userPickRemains =
          this.userHasSelected &&
          choices.some((item) => item.target === this.selectedTarget);
        if (userPickRemains) return;
        // One target is selected for the user. Two or more stay empty so
        // a destructive reset is not preselected while another target is
        // still loading or already listed.
        this.selectedTarget = choices.length === 1 ? choices[0].target : null;
      },
    },
    showResetModal(open) {
      if (!open) this.pendingReset = null;
    },
  },
  created() {
    this.hideLoader();
    this.$store.dispatch('factoryReset/preloadResetBiosTargets');
    this.$store.dispatch('bmc/getBmcInfo');
  },
  methods: {
    onResetTargetChange() {
      this.userHasSelected = true;
    },
    onResetSubmit() {
      const option = this.resetOption;
      if (!option.value) return;
      this.userHasSelected = true;
      this.pendingReset = { value: option.value, target: option.target };
      this.showResetModal = true;
    },
    onOkConfirm() {
      const option = this.pendingReset;
      if (!option?.value) return;
      if (option.value === 'resetBios') {
        this.onResetBiosConfirm(option.target);
      } else {
        this.onResetToDefaultsConfirm(option.target);
      }
    },
    onResetBiosConfirm(target) {
      this.$store
        .dispatch('factoryReset/resetBios', target)
        .then((title) => {
          this.successToast('', {
            title,
          });
        })
        .catch(({ message }) => {
          this.errorToast('', {
            title: message,
          });
        });
    },
    onResetToDefaultsConfirm(target) {
      this.$store
        .dispatch('factoryReset/resetToDefaults', target)
        .then((title) => {
          this.successToast('', {
            title,
          });
        })
        .catch(({ message }) => {
          this.errorToast('', {
            title: message,
          });
        });
    },
  },
};
</script>
