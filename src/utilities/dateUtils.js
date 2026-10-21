// `new Date(undefined)` is an Invalid Date object: it is truthy and
// `instanceof Date`, but `toISOString()` throws RangeError.
export function toValidDate(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// formatDate and formatTime accept Date instances only. A string or number
// stays blank, including a bare number that `new Date()` would treat as a
// 1970 timestamp. Call sites that have an ISO string wrap it in `new Date`.
export function toFormatDate(value) {
  if (!(value instanceof Date)) return null;
  return toValidDate(value);
}
