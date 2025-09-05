/**
 * Deeply merge two plain objects (or arrays) without mutating the inputs.
 *
 * Rules:
 * - Arrays from the source replace arrays on the target.
 * - Plain objects are merged recursively.
 * - Primitive values from the source overwrite the target.
 *
 * This function is intentionally small and dependency-free so it can be
 * used anywhere (stores, services, components) without pulling in a utility
 * library like lodash.
 *
 * @param {any} target The base object to merge into.
 * @param {any} source The override object to merge from.
 * @returns {any} A new object containing the merged result.
 */
export function deepMerge(target, source) {
  if (typeof target !== 'object' || target === null) return source;
  if (typeof source !== 'object' || source === null) return target;
  const output = Array.isArray(target) ? target.slice() : { ...target };
  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = output[key];
    if (Array.isArray(sourceValue)) {
      output[key] = sourceValue.slice();
    } else if (
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      output[key] = deepMerge(targetValue, sourceValue);
    } else {
      output[key] = sourceValue;
    }
  });
  return output;
}


