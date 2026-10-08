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
