import { maxLength, minLength } from '@vuelidate/validators';

/**
 * AccountService password limits start as null and stay null when the
 * service omits them. Vuelidate compares a null max as 0, which rejects
 * every password, so a missing limit must not become a validator.
 */
export function isPasswordLengthLimit(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function passwordLengthValidators(min, max) {
  const rules = {};
  if (isPasswordLengthLimit(min)) {
    rules.minLength = minLength(min);
  }
  if (isPasswordLengthLimit(max)) {
    rules.maxLength = maxLength(max);
  }
  return rules;
}

/**
 * Copy for the limits the account service actually returned.
 * A missing side is omitted so the message never interpolates null.
 */
export function passwordLengthMessage(min, max) {
  const hasMin = isPasswordLengthLimit(min);
  const hasMax = isPasswordLengthLimit(max);
  if (hasMin && hasMax) {
    return {
      key: 'pageUserManagement.modal.passwordMustBeBetween',
      params: { min, max },
    };
  }
  if (hasMin) {
    return {
      key: 'pageUserManagement.modal.passwordMustBeAtLeast',
      params: { min },
    };
  }
  if (hasMax) {
    return {
      key: 'pageUserManagement.modal.passwordMustBeAtMost',
      params: { max },
    };
  }
  return null;
}
