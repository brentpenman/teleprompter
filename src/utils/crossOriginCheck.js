/**
 * Cross-Origin Isolation Verification Utility
 *
 * Verifies that cross-origin isolation is enabled and SharedArrayBuffer is available.
 * Required for Vosk WASM's threading implementation.
 */

/**
 * Checks if cross-origin isolation is properly enabled
 *
 * @returns {{ isolated: boolean, error?: string }} - Result object with isolation status
 */
export function checkCrossOriginIsolation() {
  // Check if we're in a browser environment
  if (typeof self === 'undefined') {
    return {
      isolated: false,
      error: 'Not in browser environment (self is undefined)'
    };
  }

  // Check if crossOriginIsolated property exists (modern browsers)
  if (typeof self.crossOriginIsolated === 'undefined') {
    return {
      isolated: false,
      error: 'crossOriginIsolated property not available (old browser or insecure context)'
    };
  }

  // Check if cross-origin isolation is actually enabled
  if (!self.crossOriginIsolated) {
    return {
      isolated: false,
      error: 'Cross-origin isolation not enabled. COOP/COEP headers required for SharedArrayBuffer.'
    };
  }

  // Verify SharedArrayBuffer is actually available via try-catch instantiation
  try {
    // Try to create a minimal SharedArrayBuffer (1 byte)
    new SharedArrayBuffer(1);

    return {
      isolated: true
    };
  } catch (error) {
    return {
      isolated: false,
      error: `SharedArrayBuffer not available: ${error.message}`
    };
  }
}
