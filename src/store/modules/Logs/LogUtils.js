import api from '@/store/api';
import i18n from '@/i18n';

/**
 * Downloads a log entry as a blob from the given URI.
 *
 * @param {string} uri - The URI to download from
 * @param {Object} options - Optional configuration
 * @param {string} options.errorKey - i18n key for error message (default: 'global.toast.errorDownloadEntry')
 * @param {boolean} options.useArrayBuffer - Use arraybuffer response type (default: false)
 * @returns {Promise<Blob>} - The downloaded blob
 */
export async function downloadEntry(uri, options = {}) {
  const {
    errorKey = 'global.toast.errorDownloadEntry',
    useArrayBuffer = false,
  } = options;

  const requestConfig = {
    headers: {
      Accept: 'application/octet-stream',
    },
  };

  if (useArrayBuffer) {
    requestConfig.responseType = 'arraybuffer';
  }

  return await api
    .get(uri, requestConfig)
    .then((response) => {
      const contentType = useArrayBuffer
        ? 'application/octet-stream'
        : response.headers['content-type'];

      return new Blob([response.data], { type: contentType });
    })
    .catch((error) => {
      console.log(error);
      throw new Error(i18n.global.t(errorKey));
    });
}
