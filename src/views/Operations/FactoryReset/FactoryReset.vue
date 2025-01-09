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
              v-model="resetOption"
              stacked
            >
            <div v-for="(item, index) in resetBiosUris">
              <b-form-radio
                class="mb-1"
                :value="{ ...item, value: 'resetBios' }"
                :target="item.target"
                aria-describedby="reset-bios"
                :data-test-id="'factoryReset-radio-resetBios-' + index"
              >
                {{ (resetBiosUris.length < 2) ? $t('pageFactoryReset.form.resetBiosOptionLabel') :
                 $t('pageFactoryReset.form.resetBiosOptionLabel') + ': ['+item.Id+']' }}
              </b-form-radio>
              <b-form-text
                :id="'reset-bios-' +index"
                class="ml-4 mb-3"
              >
                {{ $t('pageFactoryReset.form.resetBiosOptionHelperText') }}
              </b-form-text>
            </div>

            <div v-for="(item, index) in bmcResetToDefaultsUris">
              <b-form-radio
                class="mb-1"
                :value="{ ...item, value: 'resetToDefaults' }"
                aria-describedby="reset-to-defaults"
                data-test-id="'factoryReset-radio-resetToDefaults' + index"
              >
                {{ (bmcResetToDefaultsUris.length < 2) ? $t('pageFactoryReset.form.resetToDefaultsOptionLabel') :
                 $t('pageFactoryReset.form.resetToDefaultsOptionLabel') + ': ['+item.Id+']' }}
              </b-form-radio>
              <b-form-text id="reset-to-defaults" class="ml-4 mb-3">
                {{
                  $t('pageFactoryReset.form.resetToDefaultsOptionHelperText')
                }}
              </b-form-text>
            </div>
            </b-form-radio-group>
          </b-form-group>
          <b-button
            type="submit"
            variant="primary"
            data-test-id="factoryReset-button-submit"
          >
            {{ $t('global.action.reset') }}
          </b-button>
        </b-col>
      </b-row>
    </b-form>

    <!-- Modals -->
    <modal-reset :reset-type="resetOption.value" @okConfirm="onOkConfirm" />
  </b-container>
</template>

<script>
import PageTitle from '@/components/Global/PageTitle';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';
import ModalReset from './FactoryResetModal';

export default {
  name: 'FactoryReset',
  components: { PageTitle, ModalReset },
  mixins: [LoadingBarMixin, BVToastMixin],
  data() {
    return {
      resetOption: {value:'resetBios'},
    };
  },
  computed: {
    resetBiosUris() {
      return this.$store.getters['factoryReset/resetBiosUris'];
    },
    bmcResetToDefaultsUris() {
      return this.$store.getters['bmc/resetToDefaultsUris'];
    },
  },
  created() {
    this.hideLoader();
    this.$store.dispatch('factoryReset/preloadResetBiosTargets');
    this.$store.dispatch('bmc/getBmcInfo');
  },
  methods: {
    onResetSubmit() {
      this.$bvModal.show('modal-reset');
    },
    onOkConfirm() {
      if (this.resetOption.value == 'resetBios') {
        this.onResetBiosConfirm();
      } else {
        this.onResetToDefaultsConfirm();
      }
    },
    onResetBiosConfirm() {
      this.$store
        .dispatch('factoryReset/resetBios', this.resetOption.target)
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
    onResetToDefaultsConfirm() {
      this.$store
        .dispatch('factoryReset/resetToDefaults', this.resetOption.target)
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
