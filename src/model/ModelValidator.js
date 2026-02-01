/**
 * ModelValidator - Validates model integrity using SHA-256 hashing
 *
 * Uses Web Crypto API to hash entire file and compare against expected hash.
 * Note: Cannot stream hashing - must load entire file into memory.
 */

export class ModelValidator {
  constructor() {
    // No configuration needed - stateless validator
  }

  /**
   * Validate file integrity using SHA-256 hash
   *
   * @param {ArrayBuffer} arrayBuffer - File data to validate
   * @param {string} expectedHash - Expected SHA-256 hash (hex string)
   * @returns {Promise<boolean>} - True if hash matches, false otherwise
   * @throws {Error} - On invalid inputs or crypto errors
   */
  async validate(arrayBuffer, expectedHash) {
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      throw new Error('First argument must be an ArrayBuffer');
    }

    if (typeof expectedHash !== 'string' || expectedHash.length === 0) {
      throw new Error('Expected hash must be a non-empty string');
    }

    try {
      // Hash the ArrayBuffer using SHA-256
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);

      // Convert hash to hex string
      // Note: Uint8Array.toHex() proposed for future but not yet available
      const hashArray = new Uint8Array(hashBuffer);
      const hashHex = Array.from(hashArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Compare hashes (case-insensitive)
      const normalizedHash = hashHex.toLowerCase();
      const normalizedExpected = expectedHash.toLowerCase();

      return normalizedHash === normalizedExpected;
    } catch (error) {
      throw new Error(`Error validating hash: ${error.message}`);
    }
  }
}
