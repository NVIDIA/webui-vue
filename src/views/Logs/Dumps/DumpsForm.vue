<template>
  <div class="form-background p-3">
    <b-spinner
v-if="!dumpTypeOptions.length"
      class="spinner-wrapper"
      label="Spinning"
      aria-label="Loading dump type options"
    >
      SPINNER
    </b-spinner>
    <b-form 
      v-else 
      id="form-new-dump" 
      novalidate 
      aria-label="Create new dump form"
      @submit.prevent="handleSubmit"
    >
      <b-alert
        v-if="formError"
        variant="danger"
        show
        dismissible
        role="alert"
        @dismissed="formError = null"
      >
        {{ formError }}
      </b-alert>
      <b-form-group
        :label="$t('pageDumps.form.selectDumpType')"
        label-for="selectDumpType"
        :aria-describedby="'dumpType-error'"
      >
        <b-form-select
          id="selectDumpType"
          v-model="selectedDumpType"
          :state="getValidationState(v$.selectedDumpType)"
          :aria-invalid="v$.selectedDumpType.$error"
          aria-required="true"
        >
          <template #first>
            <b-form-select-option :value="null" disabled>
              {{ $t('global.form.selectAnOption') }}
            </b-form-select-option>
          </template>
          <b-form-select-option v-for="option in dumpTypeOptions" :key="option.text" :value="option">
            {{ $t('pageDumps.dumpTypes.' + option.text) }}
          </b-form-select-option>
        </b-form-select>
        <b-form-invalid-feedback 
          id="dumpType-error" 
          role="alert"
        >
          {{ $t('global.form.required') }}
        </b-form-invalid-feedback>
        <template v-if="selectedDumpType && selectedDumpType.Parameters">
          <b-form-group
            v-for="param in selectedDumpType.Parameters"
            :key="param.Name"
            :label="param.Name"
            :label-for="`param-${param.Name}`"
            :aria-describedby="`param-${param.Name}-error param-${param.Name}-description`"
          >
            <!-- Show static text for single-option parameters -->
            <div v-if="param.AllowableValues && param.AllowableValues.length === 1">
              <b-form-text :id="`param-${param.Name}`" tag="div">
                {{ param.AllowableValues[0] }}
              </b-form-text>
            </div>
            <!-- Show select dropdown for multi-option parameters -->
            <b-form-select
              v-else
              :id="`param-${param.Name}`"
              v-model="parameterValues[param.Name]"
              :options="param.AllowableValues"
              :state="getValidationState(v$.parameterValues[param.Name])"
              :aria-required="param.Required"
              @change="resetParameterValidation(param.Name)"
            >
              <template #first>
                <b-form-select-option :value="null" disabled>
                  {{ $t('global.form.selectAnOption') }}
                </b-form-select-option>
              </template>
            </b-form-select>
            <b-form-invalid-feedback 
              v-if="param.Required" 
              :id="`param-${param.Name}-error`" 
              role="alert"
            >
              {{ $t('global.form.required') }}
            </b-form-invalid-feedback>
            <b-form-text 
              v-if="param.Description"
              :id="`param-${param.Name}-description`"
            >
              {{ param.Description }}
            </b-form-text>
          </b-form-group>
        </template>
      </b-form-group>
      <alert 
        variant="info" 
        class="mb-3" 
        :show="selectedDumpType&&selectedDumpType.type === 'System'"
        role="status"
      >
        {{ $t('pageDumps.form.systemDumpInfo') }}
      </alert>
      <b-button
        variant="primary"
        type="submit"
        form="form-new-dump"
        class="mt-3"
        :aria-busy="isSubmitting"
        :disabled="isSubmitting"
      >
        {{ isSubmitting ? $t('global.form.submitting') : $t('pageDumps.form.initiateDump') }}
      </b-button>
    </b-form>
    <modal-confirmation v-model="showConfirmation" @ok="createSystemDump" />
  </div>
</template>

<script>
import { required } from '@vuelidate/validators';
import { useVuelidate } from '@vuelidate/core';
import ModalConfirmation from './DumpsModalConfirmation';
import Alert from '@/components/Global/Alert';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import VuelidateMixin from '@/components/Mixins/VuelidateMixin.js';

/**
 * @component DumpsForm
 * @description Form component for creating new System or BMC dumps. Handles dump type selection,
 * parameter configuration, and submission of dump creation requests.
 * 
 * @mixin BVToastMixin - Provides toast notification functionality
 * @mixin VuelidateMixin - Provides form validation utilities
 * @emits {submit} When form is submitted successfully
 * @emits {error} When an error occurs during submission
 */
export default {
  name: 'DumpsForm',
  components: { Alert, ModalConfirmation },
  mixins: [BVToastMixin, VuelidateMixin],

  props: {
    // Add if needed based on component requirements
  },
  setup() {
    return {
      v$: useVuelidate(),
    };
  },
  data() {
    return {
      selectedDumpType: null,
      parameterValues: {},
      isSubmitting: false,
      formError: null,
      showConfirmation: false,
    };
  },

  /**
   * @computed
   * @property {Array} dumpTypeOptions - All dump API information needed to populate the select options in the form.
   */
  computed: {
    dumpTypeOptions() {
      return this.$store.state.dumps.dumpTypeOptions;
    },

  },

  /**
   * @method validations
   * @description Defines validation rules for the form fields
   * @returns {Object} Validation configuration object with:
   *   - selectedDumpType: Required validation
   *   - parameterValues: Dynamic validations based on Parameters configuration
   */
  validations() {
    // Build dynamic validations object for parameters
    const paramValidations = {};
    if (this.selectedDumpType && this.selectedDumpType.Parameters) {
      this.selectedDumpType.Parameters.forEach(param => {
        if (param.Required) {
          paramValidations[param.Name] = { required };
        }
      });
    }

    return {
      selectedDumpType: { required },
      parameterValues: paramValidations
    };
  },

  /**
   * @watch
   * @description Watches for changes in selectedDumpType and updates parameter values accordingly
   */
  watch: {
    selectedDumpType: {
      immediate: true,
      handler(newVal) {
        // Clear existing values
        this.parameterValues = {};
        
        if (newVal && newVal.Parameters) {
          newVal.Parameters.forEach(param => {
            // Always set single-option parameters immediately
            if (param.AllowableValues.length === 1) {
              this.parameterValues[param.Name] = param.AllowableValues[0];
            } else {
              this.parameterValues[param.Name] = null;
            }
          });
        }
      }
    }
  },

  /**
   * @lifecycle
   * @description Fetches dump type options when component is created
   */
  created() {
    this.$store.dispatch('dumps/getDumpTypeOptions');
    // Add listener once during component creation
    this.modalListener = (bvEvent, modalId) => {
      if (modalId === 'modal-confirmation') {
        this.isSubmitting = false;
      }
    };
    this.$eventBus.$on('bv::modal::hide', this.modalListener);
  },

  beforeUnmount() {
    // Clean up listener
    this.$eventBus.$off('bv::modal::hide', this.modalListener);
  },

  /**
   * @method handleSubmit
   * @description Handles form submission, validates input, and dispatches appropriate dump creation action
   */
  methods: {
    // Public methods
    handleSubmit() {
      this.v$.$touch();
      if (this.v$.$invalid) return;

      this.isSubmitting = true;
      this.formError = null;

      try {
        const selectedType = this.selectedDumpType?.type?.toLowerCase();

        if (selectedType === 'system') {
          this.showConfirmationModal();
        } else if (selectedType === 'bmc') {
          const payload = this._createPayload();
          this.$store
            .dispatch('dumps/createDump', payload)
            .then(() => {
              this.infoToast(this.$t('pageDumps.toast.successStartBmcDump'), {
                title: this.$t('pageDumps.toast.successStartBmcDumpTitle'),
                timestamp: true,
              });
              this.resetForm();
            })
            .catch(({ message }) => {
              this.formError = message;
            })
            .finally(() => {
              this.isSubmitting = false;
            });
        } else {
          this.formError = this.$t('global.form.invalidFormat');
          this.isSubmitting = false;
        }
      } catch (error) {
        this.formError = error.message;
        this.isSubmitting = false;
      }
    },

    /**
     * @method showConfirmationModal
     * @description Shows confirmation modal for System dump creation
     */
    showConfirmationModal() {
      // Always toggle to force a re-open even if already true.
      this.showConfirmation = false;
      this.$nextTick(() => {
        this.showConfirmation = true;
        this.$bvModal?.show('modal-confirmation');
      });
    },

    /** @group Form Submission */
    createSystemDump() {
      this.isSubmitting = true;
      this.formError = null;
      const payload = this._createPayload();
      
      this.$store
        .dispatch('dumps/createDump', payload)
        .then(() => {
          this.infoToast(this.$t('pageDumps.toast.successStartSystemDump'), {
            title: this.$t('pageDumps.toast.successStartSystemDumpTitle'),
            timestamp: true,
          });
          this.resetForm();
        })
        .catch(({ message }) => {
          this.formError = message;
        })
        .finally(() => {
          this.isSubmitting = false;
        });
    },

    /** @group Validation */
    resetParameterValidation(paramName) {
      if (this.v$.parameterValues[paramName]) {
        this.v$.parameterValues[paramName].$reset();
      }
    },

    /** @group Utilities */
    getSingleParameterValue(param) {
      // If there's only one option, return it, otherwise return null
      return param.AllowableValues.length === 1 ? param.AllowableValues[0] : null;
    },

    /**
     * @method createPayload
     * @description Creates the payload object for dump creation
     * @returns {Object} Formatted payload for the API
     */
    _createPayload() {
      const payload = {
        target: this.selectedDumpType.target,
        type: this.selectedDumpType.type,
        parameters: {},
      };

      if (this.selectedDumpType.Parameters) {
        this.selectedDumpType.Parameters.forEach(param => {
          payload.parameters[param.Name] = this.parameterValues[param.Name];
        });
      }

      return payload;
    },

    resetForm() {
      this.selectedDumpType = null;
      this.parameterValues = {};
      this.v$.$reset();
    },

  },
};
</script>

<style scoped>
.spinner-wrapper {
  display: block;
  margin-left: auto;
  margin-right: auto;
}
#selectDumpType {
  margin-bottom: 2rem;
}
</style>