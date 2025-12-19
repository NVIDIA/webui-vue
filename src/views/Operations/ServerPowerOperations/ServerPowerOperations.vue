<template>
  <b-container fluid="xl">
    <page-title />
    <b-row class="mb-4">
      <b-col md="8" xl="6">
        <page-section
          :section-title="$t('pageServerPowerOperations.currentStatus')"
        >
          <b-row>
            <b-col>
              <dl>
                <dt>{{ $t('pageServerPowerOperations.systemStatus') }}</dt>
                <dd data-test-id="powerServerOps-text-hostStatus">
                  {{ serverStatus ? $t(`global.statusState.${serverStatus.State}`) : '' }}
                </dd>
              </dl>
            </b-col>
            <b-col>
              <dl>
                <dt>{{ $t('pageServerPowerOperations.powerState') }}</dt>
                <dd data-test-id="powerServerOps-text-powerState">
                  {{ powerState ? $t(`global.powerState.${powerState}`) : '' }}
                </dd>
              </dl>
            </b-col>
          </b-row>
          <b-row>
            <b-col>
              <dl>
                <dt>
                  {{ $t('pageServerPowerOperations.lastPowerOperation') }}
                </dt>
                <dd
                  v-if="lastPowerOperationTime"
                  data-test-id="powerServerOps-text-lastPowerOp"
                >
                  {{ $filters.formatDate(lastPowerOperationTime) }}
                  {{ $filters.formatTime(lastPowerOperationTime) }}
                </dd>
                <dd v-else>--</dd>
              </dl>
            </b-col>
          </b-row>
        </page-section>
      </b-col>
    </b-row>
    <b-row>
      <b-col v-if="hasBootSourceOptions" sm="8" md="6" xl="4">
        <page-section
          :section-title="$t('pageServerPowerOperations.serverBootSettings')"
        >
          <boot-settings :is-button-disable="isButtonDisable" />
        </page-section>
      </b-col>
      <b-col sm="8" md="6" xl="7">
        <page-section
          :section-title="$t('pageServerPowerOperations.operations')"
        >
          <alert :show="oneTimeBootEnabled" variant="warning">
            {{ $t('pageServerPowerOperations.oneTimeBootWarning') }}
          </alert>
          <template v-if="isOperationInProgress">
            <alert variant="info">
              {{ $t('pageServerPowerOperations.operationInProgress') }}
            </alert>
          </template>
          <template v-else-if="!systemActions || !systemActions['ComputerSystem.Reset']">
            <alert variant="info">
              {{ $t('pageServerPowerOperations.loadingActions') }}
            </alert>
          </template>
          <template v-else-if="systemActions['ComputerSystem.Reset'] && availableResetTypes.length === 0">
            <alert variant="danger">
              {{ $t('pageServerPowerOperations.error.failedToLoadActions') }}
            </alert>
          </template>
          <template v-else>
            <!-- System Reset Options -->
            <b-form novalidate @submit.prevent="executeReset">
              <b-form-group
                :label="$t('pageServerPowerOperations.operations')"
                label-for="selectResetType"
                label-class="h4 mb-4"
              >
                <b-form-select
                  id="selectResetType"
                  v-model="selectedResetType"
                  aria-required="true"
                  data-test-id="serverPowerOperations-select-resetType"
                  @change="onResetTypeChange"
                >
                  <template #first>
                    <b-form-select-option :value="null" disabled>
                      {{ $t('global.form.selectAnOption') }}
                    </b-form-select-option>
                  </template>
                  
                  <!-- Group reset types by category -->
                  <optgroup 
                    v-if="resetTypeGroups.powerOn && resetTypeGroups.powerOn.length > 0" 
                    :label="$t('global.powerState.On')"
                  >
                    <option 
                      v-for="resetType in resetTypeGroups.powerOn" 
                      :key="resetType"
                      :value="resetType"
                    >
                      {{ getResetTypeLabel(resetType) }}
                    </option>
                  </optgroup>
                  
                  <optgroup 
                    v-if="resetTypeGroups.restart && resetTypeGroups.restart.length > 0" 
                    :label="$t('pageServerPowerOperations.rebootServer')"
                  >
                    <option 
                      v-for="resetType in resetTypeGroups.restart" 
                      :key="resetType"
                      :value="resetType"
                    >
                      {{ getResetTypeLabel(resetType) }}
                    </option>
                  </optgroup>
                  
                  <optgroup 
                    v-if="resetTypeGroups.powerCycle && resetTypeGroups.powerCycle.length > 0" 
                    :label="$t('pageServerPowerOperations.powerCycleOperations')"
                  >
                    <option 
                      v-for="resetType in resetTypeGroups.powerCycle" 
                      :key="resetType"
                      :value="resetType"
                    >
                      {{ getResetTypeLabel(resetType) }}
                    </option>
                  </optgroup>
                  
                  <optgroup 
                    v-if="resetTypeGroups.shutdown && resetTypeGroups.shutdown.length > 0" 
                    :label="$t('pageServerPowerOperations.shutdownServer')"
                  >
                    <option 
                      v-for="resetType in resetTypeGroups.shutdown" 
                      :key="resetType"
                      :value="resetType"
                    >
                      {{ getResetTypeLabel(resetType) }}
                    </option>
                  </optgroup>
                  
                  <optgroup 
                    v-if="resetTypeGroups.special && resetTypeGroups.special.length > 0" 
                    :label="$t('pageServerPowerOperations.specialOperations')"
                  >
                    <option 
                      v-for="resetType in resetTypeGroups.special" 
                      :key="resetType"
                      :value="resetType"
                    >
                      {{ getResetTypeLabel(resetType) }}
                    </option>
                  </optgroup>
                  
                  <optgroup 
                    v-if="resetTypeGroups.virtualMachine && resetTypeGroups.virtualMachine.length > 0" 
                    :label="$t('pageServerPowerOperations.vmOperations')"
                  >
                    <option 
                      v-for="resetType in resetTypeGroups.virtualMachine" 
                      :key="resetType"
                      :value="resetType"
                    >
                      {{ getResetTypeLabel(resetType) }}
                    </option>
                  </optgroup>
                  
                  <optgroup 
                    v-if="resetTypeGroups.other && resetTypeGroups.other.length > 0" 
                    :label="$t('pageServerPowerOperations.otherOperations')"
                  >
                    <option 
                      v-for="resetType in resetTypeGroups.other" 
                      :key="resetType"
                      :value="resetType"
                    >
                      {{ getResetTypeLabel(resetType) }}
                    </option>
                  </optgroup>
                </b-form-select>
                <b-form-invalid-feedback>
                  {{ $t('global.form.required') }}
                </b-form-invalid-feedback>
                
                <div v-if="selectedResetType" class="mt-3 arial-label">
                  <h5>{{ $t('global.description') }}</h5>
                  <p>{{ getResetTypeDescription(selectedResetType) }}</p>
                  <b-badge v-if="selectedAutomatically" variant="info" class="mb-2">
                    {{ $t('pageServerPowerOperations.recommendedOperation') }}
                  </b-badge>
                </div>
              </b-form-group>
              <b-button
                variant="primary"
                type="submit"
                data-test-id="serverPowerOperations-button-executeReset"
                :disabled="isButtonDisable || !selectedResetType"
              >
                {{ getButtonLabel() }}
              </b-button>
            </b-form>
          </template>
        </page-section>
      </b-col>
    </b-row>
  </b-container>
</template>

<script>
import PageTitle from '@/components/Global/PageTitle';
import PageSection from '@/components/Global/PageSection';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import BootSettings from './BootSettings';
import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';
import Alert from '@/components/Global/Alert';
import InfoTooltip from '@/components/Global/InfoTooltip';
import { privilegesId } from '@/store/modules/GlobalStore';
import { mapGetters } from 'vuex';

export default {
  name: 'ServerPowerOperations',
  components: { PageTitle, PageSection, BootSettings, Alert, InfoTooltip },
  mixins: [BVToastMixin, LoadingBarMixin],
  beforeRouteLeave(to, from, next) {
    this.hideLoader();
    next();
  },
  data() {
    return {
      selectedResetType: null,
      selectedAutomatically: false,
      isBluefield: process.env.VUE_APP_ENV_NAME === 'nvidia-bluefield',
    };
  },
  computed: {
    ...mapGetters('global', ['userPrivilege']),
    isButtonDisable() {
      return this.userPrivilege === privilegesId.readOnly;
    },
    // Debug property - comment out in production
    /*
    debug() {
      return {
        powerState: this.powerState,
        availableResetTypes: this.availableResetTypes,
        recommendedOperation: this.recommendedOperation,
        selectedResetType: this.selectedResetType,
        selectedAutomatically: this.selectedAutomatically
      };
    },
    */
    // Centralized reset type information
    resetTypeInfo() {
      return {
        'On': {
          labelKey: 'pageServerPowerOperations.powerOn',
          descriptionKey: 'pageServerPowerOperations.powerOnInfo',
          description: 'Turn on the unit.',
          category: 'powerOn',
          waitForState: 'Enabled'
        },
        'ForceOn': {
          labelKey: 'pageServerPowerOperations.forceOn',
          descriptionKey: 'pageServerPowerOperations.forceOnInfo',
          description: 'Turn on the unit immediately.',
          category: 'powerOn',
          waitForState: 'Enabled'
        },
        'GracefulRestart': {
          labelKey: 'pageServerPowerOperations.gracefulRestart',
          descriptionKey: 'pageServerPowerOperations.gracefulRestartInfo',
          description: 'Shut down gracefully and restart the unit.',
          category: 'restart',
          waitForState: 'Enabled'
        },
        'ForceRestart': {
          labelKey: 'pageServerPowerOperations.forceRestart',
          descriptionKey: 'pageServerPowerOperations.forceRestartInfo',
          description: 'Shut down immediately and non-gracefully and restart the unit.',
          category: 'restart',
          waitForState: 'Enabled'
        },
        'PowerCycle': {
          labelKey: 'pageServerPowerOperations.powerCycle',
          descriptionKey: 'pageServerPowerOperations.powerCycleInfo',
          description: 'Power cycle the unit. Behaves like a power removal, followed by a power restore to the resource.',
          category: 'powerCycle',
          waitForState: 'Enabled'
        },
        'FullPowerCycle': {
          labelKey: 'pageServerPowerOperations.fullPowerCycle',
          descriptionKey: 'pageServerPowerOperations.fullPowerCycleInfo',
          description: 'Full power cycle the unit. Behaves like removing utility lines, followed by restoring utility lines to the resource.',
          category: 'powerCycle',
          waitForState: 'Enabled'
        },
        'GracefulShutdown': {
          labelKey: 'pageServerPowerOperations.gracefulShutdown',
          descriptionKey: 'pageServerPowerOperations.gracefulShutdownInfo',
          description: 'System power operations will be according to the host OS setting ( Ignore, power off, reboot, halt ... etc. )',
          category: 'shutdown',
          waitForState: this.isBluefield ? 'StandbyOffline' : 'Disabled'
        },
        'ForceOff': {
          labelKey: 'pageServerPowerOperations.forceOff',
          descriptionKey: 'pageServerPowerOperations.forceOffInfo',
          description: 'Turn off the unit immediately (non-graceful shutdown).',
          category: 'shutdown',
          waitForState: 'Disabled'
        },
        'Nmi': {
          labelKey: 'pageServerPowerOperations.nmi',
          descriptionKey: 'pageServerPowerOperations.nmiInfo',
          description: 'Generate a diagnostic interrupt, which is usually an NMI on x86 systems, to stop normal operations, complete diagnostic actions, and, typically, halt the system.',
          category: 'special',
          waitForState: null
        },
        'PushPowerButton': {
          labelKey: 'pageServerPowerOperations.pushPowerButton',
          descriptionKey: 'pageServerPowerOperations.pushPowerButtonInfo',
          description: 'Simulate the pressing of the physical power button on this unit.',
          category: 'special',
          waitForState: null
        },
        'Suspend': {
          labelKey: 'pageServerPowerOperations.suspend',
          descriptionKey: 'pageServerPowerOperations.suspendInfo',
          description: 'Write the state of the unit to disk before powering off. This allows for the state to be restored when powered back on.',
          category: 'virtualMachine',
          waitForState: null
        },
        'Pause': {
          labelKey: 'pageServerPowerOperations.pause',
          descriptionKey: 'pageServerPowerOperations.pauseInfo',
          description: 'Pause execution on the unit but do not remove power. This is typically a feature of virtual machine hypervisors.',
          category: 'virtualMachine',
          waitForState: null
        },
        'Resume': {
          labelKey: 'pageServerPowerOperations.resume',
          descriptionKey: 'pageServerPowerOperations.resumeInfo',
          description: 'Resume execution on the paused unit. This is typically a feature of virtual machine hypervisors.',
          category: 'virtualMachine',
          waitForState: 'Enabled'
        }
      };
    },
    serverStatus() {
      return this.$store.getters['global/serverStatus'];
    },
    powerState() {
      return this.$store.getters['global/powerState'];
    },
    isPowerOff() {
      return this.$store.getters['global/isPowerOff'];
    },
    isOperationInProgress() {
      return this.$store.getters['controls/isOperationInProgress'];
    },
    lastPowerOperationTime() {
      return this.$store.getters['global/lastPowerOperationTime'];
    },
    oneTimeBootEnabled() {
      return this.$store.getters['serverBootSettings/overrideEnabled'];
    },
    hasBootSourceOptions() {
      let bootOptions =
        this.$store.getters['serverBootSettings/bootSourceOptions'];
      return bootOptions.length !== 0;
    },
    systemActions() {
      return this.$store.getters['controls/systemActions'];
    },
    availableResetTypes() {
      const resetAction = this.systemActions['ComputerSystem.Reset'];
      if (resetAction && resetAction.parameters && resetAction.parameters.ResetType) {
        return resetAction.parameters.ResetType.allowableValues || [];
      }
      return [];
    },
    // Group reset types by category for display in the UI
    resetTypeGroups() {
      const available = this.availableResetTypes;
      
      // Initialize categories based on the resetTypeInfo structure
      const categories = {};
      
      // First pass: categorize known reset types from resetTypeInfo
      available.forEach(type => {
        const info = this.resetTypeInfo[type];
        if (info && info.category) {
          if (!categories[info.category]) {
            categories[info.category] = [];
          }
          categories[info.category].push(type);
        }
      });
      
      // Second pass: handle non-standard types
      available.forEach(type => {
        // Skip types already categorized
        if (Object.values(categories).some(types => types.includes(type))) {
          return;
        }
        
        // Try to categorize based on name patterns
        const typeLower = type.toLowerCase();
        let categorized = false;
        
        if (typeLower.includes('on') && !typeLower.includes('off')) {
          if (!categories.powerOn) categories.powerOn = [];
          categories.powerOn.push(type);
          categorized = true;
        } else if (typeLower.includes('restart') || typeLower.includes('reboot')) {
          if (!categories.restart) categories.restart = [];
          categories.restart.push(type);
          categorized = true;
        } else if (typeLower.includes('cycle')) {
          if (!categories.powerCycle) categories.powerCycle = [];
          categories.powerCycle.push(type);
          categorized = true;
        } else if (typeLower.includes('off') || typeLower.includes('shutdown') || typeLower.includes('halt')) {
          if (!categories.shutdown) categories.shutdown = [];
          categories.shutdown.push(type);
          categorized = true;
        } else if (typeLower.includes('suspend') || typeLower.includes('pause')) {
          if (!categories.virtualMachine) categories.virtualMachine = [];
          categories.virtualMachine.push(type);
          categorized = true;
        } else if (typeLower.includes('resume')) {
          if (!categories.virtualMachine) categories.virtualMachine = [];
          categories.virtualMachine.push(type);
          categorized = true;
        } else if (typeLower.includes('nmi') || typeLower.includes('button')) {
          if (!categories.special) categories.special = [];
          categories.special.push(type);
          categorized = true;
        }
        
        // If we couldn't categorize, put in "other"
        if (!categorized) {
          if (!categories.other) categories.other = [];
          categories.other.push(type);
        }
      });
      
      // Clean up: Remove empty categories
      return Object.entries(categories).reduce((acc, [key, value]) => {
        if (value.length > 0) {
          acc[key] = value;
        }
        return acc;
      }, {});
    },
    // Determine the recommended operation based on current power state
    recommendedOperation() {
      // Don't recommend anything if no reset types are available
      if (!this.availableResetTypes || this.availableResetTypes.length === 0) {
        return null;
      }
      
      const { availableResetTypes, powerState } = this;
      
      // Map power states to their recommended operations in order of preference
      const powerStateOperationMap = {
        'On': ['GracefulShutdown', 'PushPowerButton', 'ForceOff'],
        'Off': ['On', 'PushPowerButton', 'ForceOn'],
        'PoweringOn': [], // Don't recommend operations during transitional states
        'PoweringOff': [], // Don't recommend operations during transitional states
        'Paused': ['Resume', 'GracefulRestart', 'ForceRestart']
      };
      
      // Get the recommended operations for the current power state
      const recommendations = powerStateOperationMap[powerState] || [];
      
      // Return the first available recommended operation
      return recommendations.find(op => availableResetTypes.includes(op)) || null;
    },
  },
  created() {
    this.startLoader();
    Promise.all([
      this.$store.dispatch('global/getSystemInfo'),
      this.$store.dispatch('serverBootSettings/getBootSettings'),
      this.$store.dispatch('controls/fetchSystemActions')
    ]).finally(() => {
      this.endLoader();
      // After data is loaded, select the recommended operation
      this.autoSelectRecommendedOperation();
    });
  },
  watch: {
    // Watch for changes in recommendedOperation 
    // (which happens when reset types or power state changes)
    recommendedOperation(newRecommendation) {
      // Only auto-select if no selection has been made yet
      if (!this.selectedResetType && newRecommendation) {
        this.selectedResetType = newRecommendation;
        this.selectedAutomatically = true;
      } 
      // If the selection was automatic, update it when the recommendation changes
      else if (this.selectedAutomatically && newRecommendation) {
        this.selectedResetType = newRecommendation;
      }
    },
    // When available reset types change (like after loading)
    availableResetTypes(newResetTypes) {
      if (newResetTypes.length > 0) {
        this.autoSelectRecommendedOperation();
      }
    },
    // When power state changes, update selection if it was automatic
    powerState(newPowerState, oldPowerState) {
      if (newPowerState !== oldPowerState && this.selectedAutomatically) {
        // Give the recommendedOperation computed property time to update
        this.$nextTick(() => {
          if (this.recommendedOperation) {
            this.selectedResetType = this.recommendedOperation;
          }
        });
      }
    }
  },
  methods: {
    executeReset() {
      let modalMessage = '';
      let modalTitle = '';
      let waitForState = 'Enabled'; // Default wait state
      
      // First check if this is a known reset type
      const resetInfo = this.resetTypeInfo[this.selectedResetType];
      
      if (resetInfo) {
        // Use the predefined waitForState if available
        waitForState = resetInfo.waitForState;
        
        // Determine appropriate message based on the category
        if (resetInfo.category === 'shutdown') {
          modalMessage = this.$t('pageServerPowerOperations.modal.confirmShutdownMessage');
          modalTitle = this.$t('pageServerPowerOperations.modal.confirmShutdownTitle');
        } else if (resetInfo.category === 'virtualMachine' && ['Pause', 'Suspend'].includes(this.selectedResetType)) {
          modalMessage = this.$t('pageServerPowerOperations.modal.confirmPauseMessage', 
            { operation: this.getResetTypeLabel(this.selectedResetType) });
          modalTitle = this.$t('pageServerPowerOperations.modal.confirmPauseTitle');
        } else if (resetInfo.category === 'virtualMachine' && this.selectedResetType === 'Resume') {
          modalMessage = this.$t('pageServerPowerOperations.modal.confirmResumeMessage');
          modalTitle = this.$t('pageServerPowerOperations.modal.confirmResumeTitle');
        } else if (resetInfo.category === 'special') {
          modalMessage = this.$t('pageServerPowerOperations.modal.confirmSpecialOperationMessage', 
            { operation: this.getResetTypeLabel(this.selectedResetType) });
          modalTitle = this.$t('pageServerPowerOperations.modal.confirmSpecialOperationTitle');
        } else if (resetInfo.category === 'powerOn') {
          modalMessage = this.$t('pageServerPowerOperations.modal.confirmPowerOnMessage', 
            { operation: this.getResetTypeLabel(this.selectedResetType) });
          modalTitle = this.$t('pageServerPowerOperations.modal.confirmPowerOnTitle');
        } else {
          // Default for restart and power cycle
          modalMessage = this.$t('pageServerPowerOperations.modal.confirmRebootMessage');
          modalTitle = this.$t('pageServerPowerOperations.modal.confirmRebootTitle');
        }
      } else {
        // For unknown reset types, use heuristics based on the type name
        const typeLower = this.selectedResetType.toLowerCase();
        
        if (typeLower.includes('off') || typeLower.includes('shutdown') || typeLower.includes('halt')) {
          modalMessage = this.$t('pageServerPowerOperations.modal.confirmShutdownMessage');
          modalTitle = this.$t('pageServerPowerOperations.modal.confirmShutdownTitle');
          waitForState = this.isBluefield ? 'StandbyOffline' : 'Disabled';
        } else if (typeLower.includes('pause') || typeLower.includes('suspend')) {
          modalMessage = this.$t('pageServerPowerOperations.modal.confirmPauseMessage', 
            { operation: this.getResetTypeLabel(this.selectedResetType) });
          modalTitle = this.$t('pageServerPowerOperations.modal.confirmPauseTitle');
          waitForState = null; // No predictable state for pause operations
        } else if (typeLower.includes('resume')) {
          modalMessage = this.$t('pageServerPowerOperations.modal.confirmResumeMessage');
          modalTitle = this.$t('pageServerPowerOperations.modal.confirmResumeTitle');
        } else if (typeLower.includes('nmi') || typeLower.includes('button')) {
          modalMessage = this.$t('pageServerPowerOperations.modal.confirmSpecialOperationMessage', 
            { operation: this.getResetTypeLabel(this.selectedResetType) });
          modalTitle = this.$t('pageServerPowerOperations.modal.confirmSpecialOperationTitle');
          waitForState = null; // No predictable state for special operations
        } else if (typeLower.includes('on') && !typeLower.includes('off')) {
          modalMessage = this.$t('pageServerPowerOperations.modal.confirmPowerOnMessage', 
            { operation: this.getResetTypeLabel(this.selectedResetType) });
          modalTitle = this.$t('pageServerPowerOperations.modal.confirmPowerOnTitle');
        } else {
          // Generic operation message for any other type
          modalMessage = this.$t('pageServerPowerOperations.modal.confirmGenericOperationMessage', 
            { operation: this.getResetTypeLabel(this.selectedResetType) });
          modalTitle = this.$t('pageServerPowerOperations.modal.confirmGenericOperationTitle');
        }
      }
      
      const modalOptions = {
        title: modalTitle,
        okTitle: this.$t('global.action.confirm'),
        cancelTitle: this.$t('global.action.cancel'),
        autoFocusButton: 'ok',
      };

      this.$bvModal
        .msgBoxConfirm(modalMessage, modalOptions)
        .then((confirmed) => {
          if (confirmed) {
            const actionPayload = {
              actionName: 'ComputerSystem.Reset',
              parameters: { ResetType: this.selectedResetType }
            };
            
            // Only include waitForState if specified
            if (waitForState !== null) {
              actionPayload.waitForState = waitForState;
            }
            
            this.$store.dispatch('controls/executeSystemAction', actionPayload);
          }
        });
    },
    getButtonLabel() {
      return this.getResetTypeLabel(this.selectedResetType);
    },
    getResetTypeLabel(resetType) {
      if (!resetType) return '';
      
      // Check if we have info for this reset type
      const info = this.resetTypeInfo[resetType];
      
      if (info && info.labelKey) {
        // Use the translation if available
        return this.$t(info.labelKey);
      } else {
        // Format unknown types to be more user-friendly
        // Example: "ForceSystemReset" becomes "Force System Reset"
        return resetType
          .replace(/([A-Z])/g, ' $1') // Add space before capital letters
          .replace(/^./, match => match.toUpperCase()) // Capitalize first letter
          .trim(); // Remove any extra spaces
      }
    },
    getResetTypeDescription(resetType) {
      if (!resetType) return '';
      
      // Check if we have info for this reset type
      const info = this.resetTypeInfo[resetType];
      
      if (info) {
        // First try to use a custom translation
        if (info.descriptionKey && this.$te(info.descriptionKey)) {
          return this.$t(info.descriptionKey);
        } 
        // Then use the standard description
        else if (info.description) {
          return info.description;
        }
      }
      
      // For unknown reset types, generate a generic description based on the type name
      const typeLower = resetType.toLowerCase();
      
      if (typeLower.includes('on') && !typeLower.includes('off')) {
        return `Turn on the system using the ${this.getResetTypeLabel(resetType)} method.`;
      } else if (typeLower.includes('restart') || typeLower.includes('reboot')) {
        return `Restart the system using the ${this.getResetTypeLabel(resetType)} method.`;
      } else if (typeLower.includes('cycle')) {
        return `Power cycle the system using the ${this.getResetTypeLabel(resetType)} method.`;
      } else if (typeLower.includes('off') || typeLower.includes('shutdown') || typeLower.includes('halt')) {
        return `Shut down the system using the ${this.getResetTypeLabel(resetType)} method.`;
      } else if (typeLower.includes('suspend') || typeLower.includes('pause')) {
        return `Pause the system using the ${this.getResetTypeLabel(resetType)} method.`;
      } else if (typeLower.includes('resume')) {
        return `Resume the paused system using the ${this.getResetTypeLabel(resetType)} method.`;
      } else {
        // Generic fallback
        return `Perform the ${this.getResetTypeLabel(resetType)} operation on the system.`;
      }
    },
    autoSelectRecommendedOperation() {
      // Only auto-select if no user selection has been made
      if (!this.selectedResetType && this.recommendedOperation) {
        this.selectedResetType = this.recommendedOperation;
        this.selectedAutomatically = true;
      }
    },
    onResetTypeChange() {
      this.selectedAutomatically = false;
    },
    confirmDialog(message, options = {}) {
      return this.$confirm({ message, ...options });
    },
  },
};
</script>

<style lang="scss" scoped>
.arial-label {
  font-family: Arial, sans-serif;
}
</style>
