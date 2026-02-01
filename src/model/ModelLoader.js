/**
 * ModelLoader - High-level orchestrator for model loading workflow
 *
 * Coordinates cache checking, quota verification, downloading, validation, and caching.
 * Provides simple async loadModel() interface with progress callbacks.
 *
 * Workflow:
 * 1. Check cache for existing model with matching hash
 * 2. Check storage quota before downloading
 * 3. Download model with progress tracking
 * 4. Validate model hash
 * 5. Cache validated model
 * 6. Return ArrayBuffer
 */

import { ModelCache } from './ModelCache.js';
import { ModelDownloader } from './ModelDownloader.js';
import { ModelValidator } from './ModelValidator.js';
import { checkStorageQuota, formatBytes } from './StorageQuota.js';

export class ModelLoader {
  constructor(cache, downloader, validator) {
    if (!cache || !downloader || !validator) {
      throw new Error('ModelLoader requires cache, downloader, and validator instances');
    }

    this.cache = cache;
    this.downloader = downloader;
    this.validator = validator;
  }

  /**
   * Load a model (from cache or download)
   *
   * @param {Object} modelConfig - Model configuration
   *   @param {string} modelConfig.id - Unique model identifier
   *   @param {string} modelConfig.name - Model name
   *   @param {string} modelConfig.version - Model version
   *   @param {string} modelConfig.url - Download URL
   *   @param {number} modelConfig.size - Expected size in bytes
   *   @param {string} modelConfig.hash - Expected SHA-256 hash (hex string)
   * @param {Function} onProgress - Progress callback
   *   Receives: { status: string, loaded?: number, total?: number, percentage?: number }
   *   Status values: 'cached', 'checking-quota', 'downloading', 'validating', 'caching', 'complete'
   * @returns {Promise<ArrayBuffer>} - Model data
   * @throws {Error} - On quota exceeded, network errors, validation failures, or cache errors
   */
  async loadModel(modelConfig, onProgress) {
    const { id, name, version, url, size, hash } = modelConfig;

    // Validate required fields
    if (!id || !name || !version || !url || !size || !hash) {
      throw new Error('Model config must include id, name, version, url, size, and hash');
    }

    if (typeof onProgress !== 'function') {
      throw new Error('onProgress callback is required');
    }

    // Step 1: Check cache for existing model
    const cached = await this.cache.getModel(id);
    if (cached && cached.hash === hash) {
      // Cache hit with matching hash - return immediately
      onProgress({
        status: 'cached',
        loaded: cached.data.byteLength,
        total: cached.data.byteLength,
        percentage: 100
      });
      return cached.data;
    }

    // Step 2: Check storage quota before downloading
    onProgress({ status: 'checking-quota' });

    const quotaInfo = await checkStorageQuota(size);
    if (!quotaInfo.hasSpace) {
      const availableMB = (quotaInfo.available / (1024 * 1024)).toFixed(1);
      const requiredMB = (size / (1024 * 1024)).toFixed(1);
      throw new Error(
        `Insufficient storage: ${availableMB} MB available, ${requiredMB} MB required. ` +
        `Please free up space by clearing browser data or deleting cached models.`
      );
    }

    if (quotaInfo.warning) {
      console.warn('Storage quota check:', quotaInfo.warning);
    }

    // Step 3: Download model with progress tracking
    const arrayBuffer = await this.downloader.download(url, (downloadProgress) => {
      onProgress({
        status: 'downloading',
        loaded: downloadProgress.loaded,
        total: downloadProgress.total,
        percentage: downloadProgress.percentage
      });
    });

    // Step 4: Validate hash
    onProgress({ status: 'validating' });

    const isValid = await this.validator.validate(arrayBuffer, hash);
    if (!isValid) {
      throw new Error(
        `Model validation failed: hash mismatch. ` +
        `The downloaded file may be corrupted or the expected hash is incorrect.`
      );
    }

    // Step 5: Cache the validated model
    onProgress({ status: 'caching' });

    try {
      await this.cache.saveModel(id, name, version, hash, arrayBuffer);
    } catch (error) {
      // If caching fails due to quota, warn but don't fail
      // (model was successfully downloaded and validated)
      if (error.message.includes('quota')) {
        console.warn('Failed to cache model (quota exceeded):', error.message);
        console.warn('Model will need to be re-downloaded on next visit');
      } else {
        // Other cache errors: propagate
        throw new Error(`Failed to cache model: ${error.message}`);
      }
    }

    // Step 6: Return model
    onProgress({ status: 'complete' });
    return arrayBuffer;
  }

  /**
   * Clear all cached models
   * Useful for debugging and testing
   * @returns {Promise<void>}
   */
  async clearCache() {
    const models = await this.cache.listModels();

    for (const model of models) {
      try {
        await this.cache.deleteModel(model.id);
        console.log(`Deleted cached model: ${model.name} (${model.version})`);
      } catch (error) {
        console.warn(`Failed to delete model ${model.id}:`, error.message);
      }
    }
  }
}
