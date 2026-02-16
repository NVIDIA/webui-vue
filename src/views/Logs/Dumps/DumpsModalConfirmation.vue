<template>
  <b-modal
    id="modal-confirmation"
    ref="modal"
    :title="$t('pageDumps.modal.initiateSystemDump')"
    @hidden="resetForm"
  >
    <p>
      <strong>
        {{ $t('pageDumps.modal.initiateSystemDumpMessage1') }}
      </strong>
    </p>
    <p>
      {{ $t('pageDumps.modal.initiateSystemDumpMessage2') }}
    </p>
    <p>
      <status-icon status="danger" />
      {{ $t('pageDumps.modal.initiateSystemDumpMessage3') }}
    </p>
    <b-form-checkbox v-model="confirmed" @change="v$.confirmed.$touch()">
      {{ $t('pageDumps.modal.initiateSystemDumpMessage4') }}
    </b-form-checkbox>
    <b-form-invalid-feedback
      :state="getValidationState(v$.confirmed)"
      role="alert"
    >
      {{ $t('global.form.required') }}
    </b-form-invalid-feedback>
    <template #footer="{ cancel }">
      <b-button variant="secondary" @click="cancel()">
        {{ $t('global.action.cancel') }}
      </b-button>
      <b-button variant="danger" @click="handleSubmit">
        {{ $t('pageDumps.form.initiateDump') }}
      </b-button>
    </template>
  </b-modal>
</template>

<script>
import StatusIcon from '@/components/Global/StatusIcon';
import VuelidateMixin from '@/components/Mixins/VuelidateMixin.js';
import { useVuelidate } from '@vuelidate/core';

export default {
  components: { StatusIcon },
  mixins: [VuelidateMixin],
  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['ok', 'update:modelValue'],
  setup() {
    return {
      // Keep modal validation local so parent form submit
      // is not blocked by modal-only fields.
      v$: useVuelidate({ $stopPropagation: true }),
    };
  },
  data() {
    return {
      confirmed: false,
    };
  },
  validations() {
    return {
      confirmed: {
        mustBeTrue: (value) => value === true,
      },
    };
  },
  watch: {
    modelValue: {
      handler(newValue) {
        if (newValue) {
          this.$nextTick(() => {
            this.$refs.modal?.show();
          });
        } else {
          this.$nextTick(() => {
            this.$refs.modal?.hide();
          });
        }
      },
      immediate: true,
    },
  },
  methods: {
    closeModal() {
      this.$nextTick(() => {
        this.$refs.modal.hide();
      });
    },
    handleSubmit() {
      this.v$.$touch();
      if (this.v$.$invalid) return;
      this.$emit('ok');
      this.closeModal();
    },
    resetForm() {
      this.confirmed = false;
      this.v$.$reset();
      this.$emit('update:modelValue', false);
    },
  },
};
</script>
