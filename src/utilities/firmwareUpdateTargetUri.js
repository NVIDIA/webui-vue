/**
 * Determine whether a task Payload.TargetUri belongs to a firmware update.
 *
 * Prefers an exact match against loaded UpdateService URIs, with substring
 * fallback when those URIs are not yet populated.
 */
export function isFirmwareUpdateTargetUri(targetUri, firmwareState = {}) {
  if (typeof targetUri !== 'string') return false;

  const {
    multipartHttpPushUri,
    simpleUpdateUri,
    httpPushUri,
  } = firmwareState ?? {};

  if (
    targetUri === multipartHttpPushUri ||
    targetUri === simpleUpdateUri ||
    targetUri === httpPushUri
  ) {
    return true;
  }
  return (
    targetUri.includes('/UpdateService/update') ||
    targetUri.includes('/UpdateService/Actions/UpdateService.SimpleUpdate') ||
    targetUri.includes('/UpdateService/Actions/UpdateService.StartUpdate')
  );
}
