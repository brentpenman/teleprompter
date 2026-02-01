/**
 * ModelCache - IndexedDB wrapper for storing and retrieving large binary models
 *
 * Handles 40MB+ binary models with efficient storage and retrieval.
 * Does NOT index binary data to avoid performance degradation.
 * Provides clear error messages for quota exceeded scenarios.
 */
export class ModelCache {
  constructor(dbName = 'vosk-models', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  /**
   * Open IndexedDB connection and create object store if needed
   * @returns {Promise<void>}
   */
  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message || 'Unknown error'}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains('models')) {
          const objectStore = db.createObjectStore('models', { keyPath: 'id' });

          // Create indexes for metadata only (NOT for binary data)
          objectStore.createIndex('name', 'name', { unique: false });
          objectStore.createIndex('version', 'version', { unique: false });
          // DO NOT index 'data' field - it's 40MB binary and would cause severe performance issues
        }
      };
    });
  }

  /**
   * Save a model to IndexedDB
   * @param {string} id - Unique model identifier
   * @param {string} name - Model name
   * @param {string} version - Model version
   * @param {string} hash - Model hash for integrity verification
   * @param {ArrayBuffer} arrayBuffer - Binary model data (40MB+)
   * @returns {Promise<void>}
   */
  async saveModel(id, name, version, hash, arrayBuffer) {
    if (!this.db) {
      throw new Error('Database not opened. Call open() first.');
    }

    const model = {
      id,
      name,
      version,
      hash,
      data: arrayBuffer,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['models'], 'readwrite');
      const objectStore = transaction.objectStore('models');
      const request = objectStore.put(model);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        const error = request.error;

        // Provide user-actionable error message for quota exceeded
        if (error?.name === 'QuotaExceededError') {
          reject(new Error(
            'Storage quota exceeded. Please free up space by deleting other cached models or clearing browser data.'
          ));
        } else {
          reject(new Error(`Failed to save model: ${error?.message || 'Unknown error'}`));
        }
      };

      transaction.onerror = () => {
        reject(new Error(`Transaction failed: ${transaction.error?.message || 'Unknown error'}`));
      };
    });
  }

  /**
   * Retrieve a model from IndexedDB
   * @param {string} id - Model identifier
   * @returns {Promise<Object|null>} Model object or null if not found
   */
  async getModel(id) {
    if (!this.db) {
      throw new Error('Database not opened. Call open() first.');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['models'], 'readonly');
      const objectStore = transaction.objectStore('models');
      const request = objectStore.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to retrieve model: ${request.error?.message || 'Unknown error'}`));
      };
    });
  }

  /**
   * Delete a model from IndexedDB
   * @param {string} id - Model identifier
   * @returns {Promise<void>}
   */
  async deleteModel(id) {
    if (!this.db) {
      throw new Error('Database not opened. Call open() first.');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['models'], 'readwrite');
      const objectStore = transaction.objectStore('models');
      const request = objectStore.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete model: ${request.error?.message || 'Unknown error'}`));
      };
    });
  }

  /**
   * List all cached models (metadata only, excludes binary data for performance)
   * @returns {Promise<Array>} Array of model metadata objects
   */
  async listModels() {
    if (!this.db) {
      throw new Error('Database not opened. Call open() first.');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['models'], 'readonly');
      const objectStore = transaction.objectStore('models');
      const request = objectStore.getAllKeys();

      request.onsuccess = async () => {
        const keys = request.result;
        const models = [];

        // Fetch metadata for each model (excluding large binary data initially)
        for (const key of keys) {
          try {
            const model = await this.getModel(key);
            if (model) {
              // Return metadata only (exclude large binary data from list)
              models.push({
                id: model.id,
                name: model.name,
                version: model.version,
                hash: model.hash,
                timestamp: model.timestamp,
                size: model.data ? model.data.byteLength : 0
              });
            }
          } catch (err) {
            // Skip models that fail to load
            console.warn(`Failed to load model ${key}:`, err);
          }
        }

        resolve(models);
      };

      request.onerror = () => {
        reject(new Error(`Failed to list models: ${request.error?.message || 'Unknown error'}`));
      };
    });
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
