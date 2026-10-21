function managerDisplayName(manager) {
  if (manager?.Id === 'BMC_0') return 'BMC';
  if (manager?.Id === 'HGX_BMC_0') return 'HMC';
  return manager?.Id;
}

// A manager is a reset target when it exposes Manager.Reset. ManagerType is
// not a substitute: SMM and the storage backplane are in /Managers and have
// no reset action, while an HMC is a BMC that does.
export function describeManagerReset(
  manager,
  managerActions,
  { forceGracefulRestart = false } = {},
) {
  const displayName = managerDisplayName(manager);
  const resetAction = managerActions?.['Manager.Reset'];
  const hasReset = !!resetAction?.target;
  let allowableValues = [];
  if (hasReset) {
    allowableValues = resetAction.parameters?.ResetType?.allowableValues ?? [];
    // NVIDIA builds show only GracefulRestart when the manager advertises
    // it. A list that does not include it is left unchanged so the UI does
    // not post a ResetType the manager rejects.
    if (
      forceGracefulRestart &&
      allowableValues.includes('GracefulRestart')
    ) {
      allowableValues = ['GracefulRestart'];
    }
  }

  return {
    id: manager?.Id,
    displayName,
    resetOptions:
      hasReset && allowableValues.length > 0
        ? {
            label: displayName,
            allowableValues,
            target: resetAction.target,
          }
        : null,
  };
}
