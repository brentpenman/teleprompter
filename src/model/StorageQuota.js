/**
 * StorageQuota - Utility for checking available storage before large downloads
 *
 * Uses StorageManager API to verify sufficient space for 40MB+ model downloads.
 * Includes 10% safety buffer to account for imprecise compression estimates.
 * Gracefully falls back on browsers without StorageManager API support.
 */

/**
 * Check if sufficient storage quota is available
 * @param {number} requiredBytes - Bytes required for operation (e.g., 40MB model)
 * @returns {Promise<Object>} Quota information object
 */
export async function checkStorageQuota(requiredBytes) {
  // Fallback for browsers without StorageManager API (optimistic)
  if (!navigator.storage || !navigator.storage.estimate) {
    return {
      hasSpace: true,
      available: Infinity,
      required: requiredBytes,
      percentUsed: 0,
      quota: Infinity,
      usage: 0,
      warning: 'Cannot verify storage quota on this browser. Proceeding optimistically.'
    };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota || 0;
    const usage = estimate.usage || 0;
    const available = quota - usage;

    // Add 10% safety buffer to account for compression imprecision
    const requiredWithBuffer = requiredBytes * 1.1;

    const percentUsed = quota > 0 ? Math.round((usage / quota) * 100) : 0;
    const hasSpace = available >= requiredWithBuffer;

    return {
      hasSpace,
      available,
      required: requiredBytes,
      percentUsed,
      quota,
      usage
    };
  } catch (error) {
    // If estimate() fails, fall back to optimistic approach
    return {
      hasSpace: true,
      available: Infinity,
      required: requiredBytes,
      percentUsed: 0,
      quota: Infinity,
      usage: 0,
      warning: `Storage quota check failed: ${error.message}. Proceeding optimistically.`
    };
  }
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string (e.g., "42.5 MB")
 */
export function formatBytes(bytes) {
  if (bytes === Infinity) return '∞';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}
