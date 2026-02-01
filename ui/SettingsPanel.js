/**
 * SettingsPanel - Settings UI with engine selection and model management
 *
 * Provides:
 * - Engine selection: Auto (Recommended), Vosk (Offline), Web Speech API (Online)
 * - Model management: Cache status, download, clear (Vosk only)
 * - Display settings: Highlight toggle, mirror toggle
 * - Device-aware recommendations and capability checks
 *
 * @example
 * const panel = new SettingsPanel(settingsManager, DeviceCapability);
 * panel.render(document.getElementById('settings-container'));
 */

import SettingsManager from '../settings/SettingsManager.js';
import DeviceCapability from '../settings/DeviceCapability.js';
import { ModelCache } from '../src/model/ModelCache.js';
import { ModelLoader } from '../src/model/ModelLoader.js';
import { ModelDownloader } from '../src/model/ModelDownloader.js';
import { ModelValidator } from '../src/model/ModelValidator.js';
import { modelConfig } from '../src/config/modelConfig.js';
import LoadingStates from './LoadingStates.js';

class SettingsPanel {
  /**
   * Create SettingsPanel instance
   *
   * @param {SettingsManager} settingsManager - Settings persistence manager
   * @param {DeviceCapability} deviceCapability - Device capability detector
   */
  constructor(settingsManager, deviceCapability) {
    this.settings = settingsManager;
    this.deviceCapability = deviceCapability;
    this.container = null;
  }

  /**
   * Render settings panel into container
   *
   * @param {HTMLElement} container - Container element
   */
  render(container) {
    this.container = container;

    // Load current settings
    const currentSettings = this.settings.load();

    // Get device capabilities and recommendation
    const capabilities = this.deviceCapability.detect();
    const recommendation = this.deviceCapability.recommendEngine();

    // Build settings panel HTML
    container.innerHTML = `
      <div class="settings-panel">
        <div class="settings-header">
          <h2>Settings</h2>
          <button class="close-btn" id="settings-close-btn">×</button>
        </div>

        <div class="settings-content">
          <!-- Engine Selection -->
          <div class="settings-section">
            <h3>Recognition Engine</h3>
            <p class="help-text">${recommendation.reason}</p>
            <div class="radio-group">
              <label class="${currentSettings.recognitionEngine === 'auto' ? 'selected' : ''}">
                <input type="radio" name="engine" value="auto" ${currentSettings.recognitionEngine === 'auto' ? 'checked' : ''}>
                <span>Auto (Recommended)</span>
              </label>
              <label class="${!capabilities.voskSupported ? 'disabled' : ''} ${currentSettings.recognitionEngine === 'vosk' ? 'selected' : ''}">
                <input type="radio" name="engine" value="vosk" ${currentSettings.recognitionEngine === 'vosk' ? 'checked' : ''} ${!capabilities.voskSupported ? 'disabled' : ''}>
                <span>Vosk (Offline)</span>
                ${!capabilities.voskSupported ? '<span class="label-note">Not supported</span>' : ''}
              </label>
              <label class="${!capabilities.webSpeechSupported ? 'disabled' : ''} ${currentSettings.recognitionEngine === 'webspeech' ? 'selected' : ''}">
                <input type="radio" name="engine" value="webspeech" ${currentSettings.recognitionEngine === 'webspeech' ? 'checked' : ''} ${!capabilities.webSpeechSupported ? 'disabled' : ''}>
                <span>Web Speech API (Online)</span>
                ${!capabilities.webSpeechSupported ? '<span class="label-note">Not supported</span>' : ''}
              </label>
            </div>
          </div>

          <!-- Model Management (Vosk only) -->
          ${capabilities.voskSupported ? `
            <div class="settings-section" id="model-management">
              <h3>Model Management</h3>
              <div class="model-info">
                <div class="model-detail">
                  <strong>Model:</strong> ${modelConfig.name}
                </div>
                <div class="model-detail">
                  <strong>Size:</strong> ${(modelConfig.size / (1024 * 1024)).toFixed(1)} MB
                </div>
                <div class="model-detail" id="cache-status">
                  <strong>Cache:</strong> <span id="cache-status-text">Checking...</span>
                </div>
              </div>
              <div class="model-actions">
                <button class="btn btn-primary" id="download-model-btn">Download for Offline Use</button>
                <button class="btn btn-secondary" id="clear-model-btn">Clear Cached Model</button>
              </div>
              <div id="download-progress-container"></div>
            </div>
          ` : ''}

          <!-- Display Settings -->
          <div class="settings-section">
            <h3>Display Settings</h3>
            <div class="toggle-group">
              <div class="toggle-switch">
                <input type="checkbox" id="highlight-toggle-setting" ${currentSettings.highlightEnabled ? 'checked' : ''}>
                <label for="highlight-toggle-setting">
                  <span class="toggle-slider"></span>
                  <span class="toggle-label">Highlight text during voice tracking</span>
                </label>
              </div>
              <div class="toggle-switch">
                <input type="checkbox" id="mirror-toggle-setting" ${currentSettings.mirrorEnabled ? 'checked' : ''}>
                <label for="mirror-toggle-setting">
                  <span class="toggle-slider"></span>
                  <span class="toggle-label">Mirror mode (for beam-splitter setups)</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach event listeners
    this._attachEventListeners(container);

    // Update cache status if Vosk supported
    if (capabilities.voskSupported) {
      this._updateCacheStatus();
    }
  }

  /**
   * Attach event listeners to settings panel elements
   *
   * @param {HTMLElement} container - Container element
   * @private
   */
  _attachEventListeners(container) {
    // Engine radio buttons
    const engineRadios = container.querySelectorAll('input[name="engine"]');
    engineRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.settings.set('recognitionEngine', e.target.value);
        // Update selected visual state
        container.querySelectorAll('.radio-group label').forEach(label => {
          label.classList.remove('selected');
        });
        e.target.closest('label').classList.add('selected');
      });
    });

    // Highlight toggle
    const highlightToggle = container.querySelector('#highlight-toggle-setting');
    if (highlightToggle) {
      highlightToggle.addEventListener('change', (e) => {
        this.settings.set('highlightEnabled', e.target.checked);
        // Dispatch custom event for immediate UI update
        window.dispatchEvent(new CustomEvent('settings-changed', {
          detail: { key: 'highlightEnabled', value: e.target.checked }
        }));
      });
    }

    // Mirror toggle
    const mirrorToggle = container.querySelector('#mirror-toggle-setting');
    if (mirrorToggle) {
      mirrorToggle.addEventListener('change', (e) => {
        this.settings.set('mirrorEnabled', e.target.checked);
        // Dispatch custom event for immediate UI update
        window.dispatchEvent(new CustomEvent('settings-changed', {
          detail: { key: 'mirrorEnabled', value: e.target.checked }
        }));
      });
    }

    // Download model button
    const downloadBtn = container.querySelector('#download-model-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this._downloadModel());
    }

    // Clear model button
    const clearBtn = container.querySelector('#clear-model-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this._clearModel());
    }

    // Close button
    const closeBtn = container.querySelector('#settings-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        // Hide overlay
        const overlay = document.getElementById('settings-overlay');
        if (overlay) {
          overlay.classList.add('hidden');
        }
        // Dispatch close event
        window.dispatchEvent(new CustomEvent('settings-closed'));
      });
    }
  }

  /**
   * Update cache status display
   *
   * @private
   */
  async _updateCacheStatus() {
    const statusText = this.container?.querySelector('#cache-status-text');
    if (!statusText) return;

    try {
      const cache = new ModelCache();
      await cache.open();

      const model = await cache.getModel(modelConfig.id);
      cache.close();

      if (model) {
        const sizeMB = (model.data.byteLength / (1024 * 1024)).toFixed(1);
        const date = new Date(model.timestamp).toLocaleDateString();
        statusText.innerHTML = `Cached: ${sizeMB} MB (${date})`;
        statusText.className = 'cache-status-cached';
      } else {
        statusText.innerHTML = 'Not cached - download required for offline use';
        statusText.className = 'cache-status-not-cached';
      }
    } catch (error) {
      console.error('Failed to check cache status:', error);
      statusText.innerHTML = 'Unable to check cache';
      statusText.className = 'cache-status-error';
    }
  }

  /**
   * Download model with progress tracking
   *
   * @private
   */
  async _downloadModel() {
    const progressContainer = this.container?.querySelector('#download-progress-container');
    const downloadBtn = this.container?.querySelector('#download-model-btn');
    if (!progressContainer) return;

    try {
      // Disable download button
      if (downloadBtn) downloadBtn.disabled = true;

      // Create ModelLoader
      const loader = new ModelLoader(
        new ModelCache(),
        new ModelDownloader(),
        new ModelValidator()
      );

      // Initialize cache
      await loader.cache.open();

      // Load model with progress updates
      await loader.loadModel(modelConfig, (progress) => {
        LoadingStates.showDownloadProgress(progressContainer, progress);
      });

      // Close cache connection
      loader.cache.close();

      // Update cache status
      await this._updateCacheStatus();

      // Show success message
      setTimeout(() => {
        progressContainer.innerHTML = '<div class="success-message">✓ Model downloaded and cached successfully!</div>';
        setTimeout(() => {
          progressContainer.innerHTML = '';
        }, 3000);
      }, 500);

    } catch (error) {
      console.error('Model download failed:', error);
      LoadingStates.showError(progressContainer, error.message, true, () => {
        progressContainer.innerHTML = '';
        this._downloadModel();
      });
    } finally {
      // Re-enable download button
      if (downloadBtn) downloadBtn.disabled = false;
    }
  }

  /**
   * Clear cached model
   *
   * @private
   */
  async _clearModel() {
    const statusText = this.container?.querySelector('#cache-status-text');
    if (!statusText) return;

    // Confirm action
    if (!confirm('Are you sure you want to clear the cached model? It will need to be re-downloaded for offline use.')) {
      return;
    }

    try {
      const cache = new ModelCache();
      await cache.open();
      await cache.deleteModel(modelConfig.id);
      cache.close();

      // Update status
      await this._updateCacheStatus();

      // Show confirmation
      const confirmMsg = document.createElement('div');
      confirmMsg.className = 'success-message';
      confirmMsg.textContent = '✓ Cached model cleared';
      statusText.parentElement.appendChild(confirmMsg);

      setTimeout(() => {
        confirmMsg.remove();
      }, 3000);

    } catch (error) {
      console.error('Failed to clear model:', error);
      alert(`Failed to clear model: ${error.message}`);
    }
  }
}

export default SettingsPanel;
