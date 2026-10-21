// The Managers collection includes the host BMC, an HMC, and software
// services such as SMM and storage backplanes. Only ManagerType BMC gates
// the "BMC is still initializing" banner. An HMC is also ManagerType BMC.
export function isBmcManager(manager) {
  const type = manager?.ManagerType ?? manager?.managerType;
  return type === 'BMC';
}

export function isManagerEnabled(manager) {
  const state = manager?.Status?.State ?? manager?.statusState;
  return state === 'Enabled';
}

export function bmcManagersAwaitingEnabled(managers) {
  return (managers ?? []).filter(
    (manager) => isBmcManager(manager) && !isManagerEnabled(manager),
  );
}

export function hasMultipleBmcManagers(managers) {
  return (managers ?? []).filter((manager) => isBmcManager(manager)).length > 1;
}
