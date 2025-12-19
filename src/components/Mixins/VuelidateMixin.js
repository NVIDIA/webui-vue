import { redfishAction } from '@/components/Validators/redfishAction';

const VuelidateMixin = {
  methods: {
    getValidationState(model) {
      if (!model) return null;
      const { $dirty, $error } = model;
      return $dirty ? !$error : null;
    },
    validateRedfishError(customErrorMessage = null) {
      if (this.serverError && !this.v$.$anyError) {
        const result = redfishAction(this.serverError, null, null);
        if (!result.isValid) {
          this.redfishCommonError = true;
          this.errorDetails = customErrorMessage || result.errorDetails;
        }
      }
    },
  },
};

export default VuelidateMixin;
