<template>
  <b-container fluid="xl">
    <page-title />
    <b-row>
      <b-col>
        <page-section>
          <!-- Error message -->
          <alert
            v-if="managersError"
            variant="danger"
            show
            class="mb-4"
            role="alert"
          >
            <strong>{{ managersError.message }}</strong>
            <p v-if="managersError.details">{{ managersError.details }}</p>
            <template #action>
              <b-button 
                variant="outline-danger" 
                size="sm" 
                @click="retryFetchManagers"
              >
                {{ $t('pageRebootBmc.error.retry') }}
              </b-button>
            </template>
          </alert>

          <b-row>
            <b-col>
              <h3 class="mb-3">{{ $t('pageRebootBmc.lastRebootTimes') }}</h3>
              <div v-if="Managers.length && !isManagersLoading">
                <b-table
                  hover
                  responsive
                  striped
                  bordered
                  class="mb-3"
                  :items="Managers"
                  :fields="managerFields"
                  data-test-id="rebootBmc-table-managers"
                >
                  <template #cell(manager)="data">
                    <strong>{{ data.item.displayName }}</strong>
                  </template>
                  
                  <template #cell(timestamp)="data">
                    <span v-if="data.item.lastRebootTime">
                      {{ $filters.formatDate(data.item.lastRebootTime) }}
                      {{ $filters.formatTime(data.item.lastRebootTime) }}
                    </span>
                    <span v-else-if="data.item.lastResetTime">
                      {{ $filters.formatDate(data.item.lastResetTime) }}
                      {{ $filters.formatTime(data.item.lastResetTime) }}
                    </span>
                    <span v-else class="text-muted">{{ $t('global.unknown') }}</span>
                  </template>
                  
                  <template #cell(upTime)="data">
                    <span v-if="data.item.upTime">
                      {{ data.item.upTime }}
                    </span>
                    <span v-else class="text-muted">{{ $t('global.unknown') }}</span>
                  </template>
                </b-table>
              </div>
              <b-spinner v-else :label="$t('pageRebootBmc.error.loadingManagers')"></b-spinner>
            </b-col>
          </b-row>
          <b-row>
            <b-col md="8" lg="8" xl="6">
          <p class="my-3">
            {{ $t('pageRebootBmc.rebootInformation') }}
          </p>
          <b-form-group
            v-if="availableManagers.length && !isManagersLoading"
            :label="hasOnlyOneOption ? $t('pageRebootBmc.form.resetType') : $t('pageRebootBmc.form.selectResetType')"
            label-for="selectResetType"
            label-class="h4 mb-4"
          >
            <!-- Display static text when only one option is available -->
            <div v-if="hasOnlyOneOption">
              <b-form-text id="selectResetType" tag="div">
                {{ singleOption.label }}: {{ singleOption.type }}
              </b-form-text>
            </div>
            <!-- Otherwise show select dropdown -->
            <b-form-select
              v-else
              id="selectResetType"
              v-model="selectedResetType"
              aria-required="true"
            >
              <template #first>
                <b-form-select-option :value="null" disabled>
                  {{ $t('global.form.selectAnOption') }}
                </b-form-select-option>
              </template>
              <optgroup 
                v-for="(manager, index) in availableManagers" 
                :key="index"
                :label="manager.displayName"
              >
                <option 
                  v-for="(value, valueIndex) in manager && manager.resetOptions && manager.resetOptions.allowableValues" 
                  :key="`${index}-${valueIndex}`"
                  :value="{ type: value, manager: manager.displayName, id: manager.id }"
                >
                  {{ value }}
                </option>
              </optgroup>
            </b-form-select>
            <b-form-invalid-feedback>
              {{ $t('global.form.required') }}
            </b-form-invalid-feedback>
          </b-form-group>
          
          <b-button
            variant="primary"
            class="d-block mt-3"
            data-test-id="rebootBmc-button-reboot"
            :disabled="(!selectedResetType && !hasOnlyOneOption) || isManagersLoading"
            @click="onClick"
          >
            {{ selectedResetType ? $t('pageRebootBmc.reset') + ' ' + selectedResetType.manager : $t('pageRebootBmc.rebootBmc') }}
            </b-button>
          </b-col>
        </b-row>

          <b-row v-if="isNvidia" class="mt-4">
            <b-col md="8" lg="8" xl="6">
              <h4 class="mb-3">{{ $t('pageRebootBmc.auxPowerReset') }}</h4>
              <p class="my-3">
                {{ $t('pageRebootBmc.auxPowerResetInformation') }}
              </p>
              <b-button
                variant="danger"
                class="d-block mt-3"
                data-test-id="rebootBmc-button-auxPowerReset"
                @click="onAuxPowerReset"
              >
                {{ $t('pageRebootBmc.auxPowerReset') }}
              </b-button>
            </b-col>
          </b-row>
        </page-section>
      </b-col>
    </b-row>
  </b-container>
</template>

<script>
import PageTitle from '@/components/Global/PageTitle';
import PageSection from '@/components/Global/PageSection';
import Alert from '@/components/Global/Alert';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';
import { mapGetters } from 'vuex';
import { isNvidiaPlatform } from '@/i18n';

export default {
  name: 'RebootBmc',
  components: { PageTitle, PageSection, Alert },
  mixins: [BVToastMixin, LoadingBarMixin],
  beforeRouteLeave(to, from, next) {
    this.hideLoader();
    next();
  },
  data() {
    return {
      selectedResetType: null,
    };
  },
  computed: {
    ...mapGetters('controls', ['Managers', 'managersError', 'isManagersLoading']),

    isNvidia() {
      return isNvidiaPlatform();
    },

    managerFields() {
      return [
        { key: 'manager', label: this.$t('pageRebootBmc.table.manager') },
        { key: 'timestamp', label: this.$t('pageRebootBmc.table.timestamp') },
        { key: 'upTime', label: this.$t('pageRebootBmc.table.upTime') },
      ];
    },
    
    // Managers with reset options
    availableManagers() {
      return this.Managers.filter(manager => 
        manager.resetOptions && manager.resetOptions.allowableValues && 
        manager.resetOptions.allowableValues.length > 0
      );
    },
    
    // Check if there's only a single option available
    hasOnlyOneOption() {
      if (this.availableManagers.length !== 1) return false;
      return this.availableManagers[0].resetOptions.allowableValues.length === 1;
    },
    
    // Get the single option object for direct use
    singleOption() {
      if (!this.hasOnlyOneOption) return null;
      const manager = this.availableManagers[0];
      return {
        id: manager.id,
        label: manager.displayName,
        type: manager.resetOptions && manager.resetOptions.allowableValues ? manager.resetOptions.allowableValues[0] : '',
        target: manager.resetOptions && manager.resetOptions.target ? manager.resetOptions.target : ''
      };
    }
  },
  created() {
    this.startLoader();
    this.$store
      .dispatch('controls/fetchManagersInfo')
      .finally(() => {
        this.stopManagersLoading();
        // Auto-select the single option if available
        if (this.hasOnlyOneOption) {
          this.selectedResetType = { 
            id: this.singleOption.id,
            type: this.singleOption.type, 
            manager: this.singleOption.label 
          };
        }
      });
  },
  methods: {
    onClick() {
      // Use either selected or single option
      const resetOption = this.selectedResetType || 
        (this.hasOnlyOneOption ? { 
          id: this.singleOption.id,
          type: this.singleOption.type, 
          manager: this.singleOption.label 
        } : null);
      
      if (!resetOption) {
        this.errorToast(this.$t('global.form.required'));
        return;
      }
      
      this.$confirm(this.$t('pageRebootBmc.modal.dynamicConfirmMessage', {
        manager: resetOption.manager,
        type: resetOption.type
      }), {
        okVariant: 'danger',
        cancelVariant: 'secondary',
        title: this.$t('pageRebootBmc.modal.confirmTitle'),
        okTitle: this.$t('global.action.confirm'),
        cancelTitle: this.$t('global.action.cancel'),
        autoFocusButton: 'ok',
      }).then((confirmed) => {
        if (confirmed) this.rebootBmc(resetOption);
      });
    },
    rebootBmc(resetOption = this.selectedResetType) {
      const managerId = resetOption.id;
      const resetType = resetOption.type;
      
      // Find the appropriate manager in Managers
      const manager = this.Managers.find(m => m.id === managerId || m.displayName === resetOption.manager);
      
      if (!manager || !manager.resetOptions) {
        this.errorToast(this.$t('pageRebootBmc.toast.errorInvalidManager'));
        return;
      }
      
      // Create payload with target and parameters
      const payload = {
        target: manager.resetOptions.target,
        parameters: { ResetType: resetType },
        managerId: manager.id
      };
      
      this.$store
        .dispatch('controls/rebootBmc', payload)
        .then(async (message) => {
          this.successToast(message);
          // If we reset the BMC that serves this UI, show the recovery modal
          // and refresh once it's back. Resetting the HMC doesn't take the UI
          // offline, so skip recovery in that case. Compare Redfish Id values,
          // not URL path segments (e.g. "bmc" vs "BMC_0").
          const { data: primaryManager } =
            await this.$store.dispatch('global/getManagerProvidingService');
          if (manager.id === primaryManager?.Id) {
            this.$store.dispatch('global/waitForBmcRecovery');
          }
        })
        .catch(({ message }) => this.errorToast(message));
    },
    onAuxPowerReset() {
      this.$confirm(
        this.$t('pageRebootBmc.modal.auxPowerResetConfirmMessage'),
        {
          okVariant: 'danger',
          cancelVariant: 'secondary',
          title: this.$t('pageRebootBmc.auxPowerReset'),
          okTitle: this.$t('global.action.confirm'),
          cancelTitle: this.$t('global.action.cancel'),
          autoFocusButton: 'ok',
        },
      ).then((confirmed) => {
        if (!confirmed) return;
        this.$store
          .dispatch('firmware/auxPowerResetSystem')
          .then((message) => this.successToast(message))
          .catch(({ message }) => this.errorToast(message));
      });
    },
    retryFetchManagers() {
      // Clear the error state to hide the alert
      this.$store.commit('controls/setManagersError', null);
      
      // Clear manager data to show spinner
      this.$store.commit('controls/setManagers', []);
      
      // Set loading state to true
      this.$store.commit('controls/setManagersLoading', true);
      
      // Start loader to show the spinner
      this.startLoader();
      this.$store
        .dispatch('controls/fetchManagersInfo')
        .finally(() => this.stopManagersLoading());
    },
    stopManagersLoading() {
      this.$store.commit('controls/setManagersLoading', false);
      this.endLoader()
    },
  },
};
</script>

<style lang="scss" scoped>
.form-group {
  margin-top: 1rem;
}
</style>
