export function redfishAction(serverError, fieldName, customErrorMessage) {
  if (!serverError) {
    return {
      isValid: true,
      errorDetails: null,
    };
  }

  const extendedInfo = serverError['@Message.ExtendedInfo'];

  if (!Array.isArray(extendedInfo) || extendedInfo.length === 0) {
    if (fieldName) {
      return {
        isValid: true,
        errorDetails: null,
      };
    } else {
      return {
        isValid: false,
        errorDetails: serverError.message,
      };
    }
  }

  if (!fieldName) {
    return {
      isValid: false,
      errorDetails: serverError.message,
    };
  }

  let paramFound = false;
  let errorDetails = '';

  for (const info of extendedInfo) {
    if (info?.MessageId?.includes('ActionParameterValueTypeError')) {
      const [, paramName] = info?.MessageArgs ?? [];
      if (fieldName === paramName) {
        paramFound = true;
        errorDetails = customErrorMessage;
        break;
      }
    }
    if (info?.MessageId?.includes('InvalidObject')) {
      const [paramTarget] = info?.MessageArgs ?? [];
      if (fieldName === paramTarget) {
        paramFound = true;
        errorDetails = customErrorMessage;
        break;
      }
    }
  }

  if (paramFound) {
    return {
      isValid: false,
      errorDetails: errorDetails,
    };
  } else {
    return {
      isValid: true,
      errorDetails: null,
    };
  }
};

export function generateValidation(context, fieldName, customErrorMessage, customValidations = {}) {
  const validationRules = { ...customValidations };
  validationRules.serverError = function() {
    const result = redfishAction(context.serverError, fieldName, customErrorMessage);
    if (result.isValid) {
      return true;
    } else {
      context.errorDetails = result.errorDetails;
      return false;
    }
  };

  return {
    [fieldName]: validationRules,
  };
};
