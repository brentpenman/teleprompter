/**
 * ModelDownloader - Downloads large files using Fetch API with real-time progress tracking
 *
 * Uses ReadableStream to track download progress for large model files.
 * Requires server to send Content-Length header for accurate progress percentage.
 */

export class ModelDownloader {
  constructor() {
    // No configuration needed - stateless downloader
  }

  /**
   * Download a file with progress tracking
   *
   * @param {string} url - URL to download from (must have CORS headers)
   * @param {Function} onProgress - Callback for progress updates
   *   Receives: { loaded: number, total: number, percentage: number }
   * @returns {Promise<ArrayBuffer>} - Downloaded file as ArrayBuffer
   * @throws {Error} - On network errors, missing Content-Length, or non-OK response
   */
  async download(url, onProgress) {
    if (!url) {
      throw new Error('URL is required');
    }

    if (typeof onProgress !== 'function') {
      throw new Error('onProgress callback is required');
    }

    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error(`Network error downloading from ${url}: ${error.message}`);
    }

    // Check response status
    if (!response.ok) {
      throw new Error(`HTTP error downloading from ${url}: ${response.status} ${response.statusText}`);
    }

    // Get total size from Content-Length header
    const contentLength = response.headers.get('Content-Length');
    if (!contentLength) {
      throw new Error('Content-Length header missing - cannot track progress');
    }

    const total = parseInt(contentLength, 10);
    if (isNaN(total) || total <= 0) {
      throw new Error(`Invalid Content-Length: ${contentLength}`);
    }

    // Stream response body and track progress
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Accumulate chunk
        chunks.push(value);
        loaded += value.length;

        // Calculate progress
        // Note: Content-Length may reflect compressed size while we're reading
        // decompressed stream, so cap percentage at 100%
        const percentage = Math.min(100, Math.round((loaded / total) * 100));

        // Fire progress callback
        onProgress({
          loaded,
          total,
          percentage
        });
      }
    } catch (error) {
      throw new Error(`Error reading response stream: ${error.message}`);
    }

    // Concatenate all chunks into single Uint8Array
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    // Return as ArrayBuffer
    return result.buffer;
  }
}
