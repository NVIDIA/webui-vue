import {
  passwordLengthMessage,
  passwordLengthValidators,
} from '@/components/Validators/passwordLength';

describe('passwordLengthValidators', () => {
  it('omits length checks when the service has not provided limits', () => {
    const rules = passwordLengthValidators(null, null);

    expect(rules.minLength).toBeUndefined();
    expect(rules.maxLength).toBeUndefined();
  });

  it('omits a single side when only that limit is missing', () => {
    expect(passwordLengthValidators(undefined, 20).minLength).toBeUndefined();
    expect(passwordLengthValidators(8, undefined).maxLength).toBeUndefined();
  });

  it('explains a minimum when the maximum is missing', () => {
    expect(passwordLengthMessage(8, null)).toEqual({
      key: 'pageUserManagement.modal.passwordMustBeAtLeast',
      params: { min: 8 },
    });
  });

  it('explains a maximum when the minimum is missing', () => {
    expect(passwordLengthMessage(null, 20)).toEqual({
      key: 'pageUserManagement.modal.passwordMustBeAtMost',
      params: { max: 20 },
    });
  });

  it('explains a range when both limits are present', () => {
    expect(passwordLengthMessage(8, 20)).toEqual({
      key: 'pageUserManagement.modal.passwordMustBeBetween',
      params: { min: 8, max: 20 },
    });
  });

  it('has no message when neither limit is present', () => {
    expect(passwordLengthMessage(null, null)).toBeNull();
  });

  it('enforces limits that the account service did return', () => {
    const rules = passwordLengthValidators(8, 20);

    expect(rules.minLength.$validator('short')).toBe(false);
    expect(rules.minLength.$validator('longenough')).toBe(true);
    expect(rules.maxLength.$validator('a'.repeat(20))).toBe(true);
    expect(rules.maxLength.$validator('a'.repeat(21))).toBe(false);
  });
});
