/**
 * LoadingStates - UI components for loading indicators and progress feedback
 *
 * Provides static methods for rendering loading states:
 * - Model download progress with percentage and data transfer
 * - Spinner for quick operations
 * - Engine indicator showing active engine and model status
 * - Error messages with optional retry functionality
 *
 * All methods manipulate DOM directly, no state management.
 *
 * @example
 * LoadingStates.showDownloadProgress(container, {
 *   status: 'downloading',
 *   percentage: 42,
 *   loaded: 17000000,
 *   total: 40000000
 * });
 */

class LoadingStates {
  /**
   * Show download progress for model loading
   *
   * @param {HTMLElement} container - Container element to render progress in
   * @param {Object} progress - Progress information
   *   @param {string} progress.status - Status: 'checking-quota', 'downloading', 'validating', 'caching', 'complete'
   *   @param {number} [progress.percentage] - Percentage complete (0-100)
   *   @param {number} [progress.loaded] - Bytes loaded
   *   @param {number} [progress.total] - Total bytes
   */
  static showDownloadProgress(container, progress) {
    const { status, percentage = 0, loaded = 0, total = 0 } = progress;

    // Convert bytes to MB
    const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
    const totalMB = (total / (1024 * 1024)).toFixed(1);

    // Status text based on current state
    let statusText = '';
    let showProgressBar = false;

    switch (status) {
      case 'checking-quota':
        statusText = 'Checking storage availability...';
        break;
      case 'downloading':
        statusText = `Downloading model: ${loadedMB}MB / ${totalMB}MB (${Math.round(percentage)}%)`;
        showProgressBar = true;
        break;
      case 'validating':
        statusText = 'Validating model integrity...';
        break;
      case 'caching':
        statusText = 'Caching model for offline use...';
        break;
      case 'complete':
        statusText = 'Model ready!';
        break;
      case 'cached':
        statusText = 'Using cached model';
        break;
      default:
        statusText = 'Loading...';
    }

    // Render loading state HTML
    container.innerHTML = `
      <div class="loading-state">
        ${showProgressBar ? `
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(percentage || 0, 100)}%"></div>
          </div>
        ` : `
          <div class="skeleton-loader"></div>
        `}
        <div class="status-text">${statusText}</div>
      </div>
    `;
  }

  /**
   * Show spinner with message for quick operations
   *
   * @param {HTMLElement} container - Container element
   * @param {string} [message='Initializing...'] - Message to display
   */
  static showSpinner(container, message = 'Initializing...') {
    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <div class="status-text">${message}</div>
      </div>
    `;
  }

  /**
   * Show/update the full-width top progress bar during model download
   *
   * @param {HTMLElement} barEl - The bar container (#model-loading-bar)
   * @param {HTMLElement} fillEl - The fill element (#model-loading-fill)
   * @param {HTMLElement} textEl - The text element (#model-loading-text)
   * @param {Object} progress - Progress info { status, percentage, loaded, total }
   */
  static showTopProgressBar(barEl, fillEl, textEl, progress) {
    if (!barEl || !fillEl || !textEl) return;

    const { status, percentage = 0, loaded = 0, total = 0 } = progress;
    const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
    const totalMB = (total / (1024 * 1024)).toFixed(1);

    // Show the bar
    barEl.classList.remove('hidden');

    // Update fill width
    fillEl.style.width = `${Math.min(percentage || 0, 100)}%`;

    // Status text
    switch (status) {
      case 'checking-quota':
        textEl.textContent = 'Checking storage...';
        break;
      case 'downloading':
        textEl.textContent = `Downloading model: ${loadedMB}/${totalMB} MB (${Math.round(percentage)}%)`;
        break;
      case 'validating':
        textEl.textContent = 'Validating model...';
        fillEl.style.width = '100%';
        break;
      case 'caching':
        textEl.textContent = 'Caching for offline use...';
        fillEl.style.width = '100%';
        break;
      case 'complete':
      case 'cached':
        textEl.textContent = 'Model ready!';
        fillEl.style.width = '100%';
        // Auto-hide after 1 second
        setTimeout(() => {
          barEl.classList.add('hidden');
        }, 1000);
        break;
      default:
        textEl.textContent = 'Loading model...';
    }
  }

  /**
   * Hide the top progress bar
   *
   * @param {HTMLElement} barEl - The bar container (#model-loading-bar)
   */
  static hideTopProgressBar(barEl) {
    if (barEl) barEl.classList.add('hidden');
  }

  /**
   * Show engine label as small text (for inline display under tracking indicator)
   *
   * @param {HTMLElement} sublabelEl - The sublabel span (#engine-sublabel)
   * @param {string} engineUsed - Engine type: 'vosk' or 'webspeech'
   */
  static showEngineLabel(sublabelEl, engineUsed) {
    if (!sublabelEl) return;

    if (engineUsed === 'vosk') {
      sublabelEl.textContent = 'Vosk';
    } else {
      sublabelEl.textContent = 'Web Speech';
    }

    sublabelEl.classList.remove('hidden');
  }

  /**
   * Show error message with optional retry button
   *
   * @param {HTMLElement} container - Container element
   * @param {string} errorMessage - Error message to display
   * @param {boolean} canRetry - Whether to show retry button
   * @param {Function} [onRetry] - Callback for retry button click
   */
  static showError(container, errorMessage, canRetry = false, onRetry = null) {
    container.innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <div class="error-message">${errorMessage}</div>
        ${canRetry && onRetry ? `
          <button class="retry-btn">Retry</button>
        ` : ''}
      </div>
    `;

    // Attach retry handler if provided
    if (canRetry && onRetry) {
      const retryBtn = container.querySelector('.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', onRetry);
      }
    }
  }

  /**
   * Clear container content
   *
   * @param {HTMLElement} container - Container to clear
   */
  static clear(container) {
    if (container) {
      container.innerHTML = '';
    }
  }
}

export default LoadingStates;
