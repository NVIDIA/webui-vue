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
                      {{ data.item.lastRebootTime | formatDate }}
                      {{ data.item.lastRebootTime | formatTime }}
                    </span>
                    <span v-else-if="data.item.lastResetTime">
                      {{ data.item.lastResetTime | formatDate }}
                      {{ data.item.lastResetTime | formatTime }}
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
            :label="hasOnlyOneOption ? $t('pageRebootBmc.form.resetType') : $t('pageRebootBmc.form.selectResetType')"
            label-for="selectResetType"
            label-class="h4 mb-4"
            v-if="availableManagers.length && !isManagersLoading"
          >
            <!-- Display static text when only one option is available -->
            <div v-if="hasOnlyOneOption">
              <b-form-text tag="div" id="selectResetType">
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
            @click="onClick"
            :disabled="(!selectedResetType && !hasOnlyOneOption) || isManagersLoading"
          >
            {{ selectedResetType ? $t('pageRebootBmc.reset') + ' ' + selectedResetType.manager : $t('pageRebootBmc.rebootBmc') }}
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
import { BSpinner } from 'bootstrap-vue'
import { mapState, mapGetters } from 'vuex';

export default {
  name: 'RebootBmc',
  components: { 
    PageTitle, 
    PageSection, 
    Alert,
    'b-spinner': BSpinner 
  },
  mixins: [BVToastMixin, LoadingBarMixin],
  beforeRouteLeave(to, from, next) {
    this.hideLoader();
    next();
  },
  computed: {
    ...mapGetters('controls', ['Managers', 'managersError', 'isManagersLoading']),
    
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
  data() {
    return {
      selectedResetType: null,
      managerFields: [
        { key: 'manager', label: this.$t('pageRebootBmc.table.manager') || 'Manager' },
        { key: 'timestamp', label: this.$t('pageRebootBmc.table.timestamp') || 'Timestamp' },
        { key: 'upTime', label: this.$t('pageRebootBmc.table.upTime') || 'Up time' }
      ],
    };
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
      
      this.$bvModal
        .msgBoxConfirm(this.$t('pageRebootBmc.modal.dynamicConfirmMessage', {
          manager: resetOption.manager,
          type: resetOption.type
        }), {
          title: this.$t('pageRebootBmc.modal.confirmTitle'),
          okTitle: this.$t('global.action.confirm'),
          cancelTitle: this.$t('global.action.cancel'),
          autoFocusButton: 'ok',
        })
        .then((confirmed) => {
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
        .then((message) => this.successToast(message))
        .catch(({ message }) => this.errorToast(message));
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
