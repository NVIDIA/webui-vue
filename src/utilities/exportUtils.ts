/**
 * Export utilities for downloading data as files.
 *
 * Uses Blob-based downloads to avoid data URI size limits (~2MB in browsers).
 */

/**
 * Download data as a JSON file.
 *
 * @param data - The data to export (will be JSON stringified)
 * @param fileName - The filename (without extension)
 * @param prettyPrint - Whether to format JSON with indentation (default: true)
 */
export function downloadAsJson(
  data: unknown,
  fileName: string,
  prettyPrint = true,
): void {
  const jsonData = prettyPrint
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);
  const blob = new Blob([jsonData], { type: 'application/json' });
  downloadBlob(blob, `${fileName}.json`);
}

/**
 * Download a Blob as a file.
 *
 * @param blob - The Blob to download
 * @param fileName - The filename (including extension)
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Download text content as a file.
 *
 * @param content - The text content to download
 * @param fileName - The filename (including extension)
 * @param mimeType - The MIME type (default: 'text/plain')
 */
export function downloadAsText(
  content: string,
  fileName: string,
  mimeType = 'text/plain',
): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, fileName);
}
