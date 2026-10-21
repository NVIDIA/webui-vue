// Managers without ResetToDefaults must be omitted. flatMap keeps an implicit
// undefined return, which the Factory Reset page renders as another copy of
// the BMC description. Identical action targets are one option.
export function resetToDefaultsTargets(managers = []) {
  const seenTargets = new Set();
  return managers.flatMap((manager) => {
    const target = manager?.Actions?.['#Manager.ResetToDefaults']?.target;
    if (!target || seenTargets.has(target)) return [];
    seenTargets.add(target);
    return [{ Id: manager.Id, target }];
  });
}
