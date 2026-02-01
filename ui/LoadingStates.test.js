/**
 * Tests for LoadingStates UI component
 */

import { jest } from '@jest/globals';
import LoadingStates from './LoadingStates.js';

// Mock DOM environment
function createContainer() {
  const div = {
    innerHTML: '',
    classList: {
      items: [],
      add: jest.fn(function(className) { this.items.push(className); }),
      remove: jest.fn(function(className) {
        this.items = this.items.filter(c => c !== className);
      }),
      contains: jest.fn(function(className) { return this.items.includes(className); })
    },
    querySelector: jest.fn()
  };
  return div;
}

describe('LoadingStates', () => {
  describe('showDownloadProgress', () => {
    it('should render progress bar for downloading status', () => {
      const container = createContainer();

      LoadingStates.showDownloadProgress(container, {
        status: 'downloading',
        percentage: 42,
        loaded: 17000000,
        total: 40000000
      });

      expect(container.innerHTML).toContain('progress-bar');
      expect(container.innerHTML).toContain('progress-fill');
      expect(container.innerHTML).toContain('width: 42%');
      expect(container.innerHTML).toContain('16.2MB / 38.1MB');
      expect(container.innerHTML).toContain('42%');
    });

    it('should render skeleton loader for non-download states', () => {
      const container = createContainer();

      LoadingStates.showDownloadProgress(container, {
        status: 'checking-quota'
      });

      expect(container.innerHTML).toContain('skeleton-loader');
      expect(container.innerHTML).toContain('Checking storage availability');
    });

    it('should cap percentage at 100', () => {
      const container = createContainer();

      LoadingStates.showDownloadProgress(container, {
        status: 'downloading',
        percentage: 150,
        loaded: 50000000,
        total: 40000000
      });

      expect(container.innerHTML).toContain('width: 100%');
    });

    it('should render cached status', () => {
      const container = createContainer();

      LoadingStates.showDownloadProgress(container, {
        status: 'cached'
      });

      expect(container.innerHTML).toContain('Using cached model');
    });
  });

  describe('showSpinner', () => {
    it('should render spinner with default message', () => {
      const container = createContainer();

      LoadingStates.showSpinner(container);

      expect(container.innerHTML).toContain('spinner');
      expect(container.innerHTML).toContain('Initializing...');
    });

    it('should render spinner with custom message', () => {
      const container = createContainer();

      LoadingStates.showSpinner(container, 'Loading model...');

      expect(container.innerHTML).toContain('spinner');
      expect(container.innerHTML).toContain('Loading model...');
    });
  });

  describe('showEngineIndicator', () => {
    it('should show Vosk badge with cache info', () => {
      const container = createContainer();

      LoadingStates.showEngineIndicator(
        container,
        'vosk',
        true,
        40 * 1024 * 1024,
        Date.now()
      );

      expect(container.innerHTML).toContain('Vosk (Offline)');
      expect(container.innerHTML).toContain('engine-badge vosk');
      expect(container.innerHTML).toContain('Model cached');
      expect(container.innerHTML).toContain('40.0MB');
      expect(container.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should show Vosk badge without cache info when not cached', () => {
      const container = createContainer();

      LoadingStates.showEngineIndicator(
        container,
        'vosk',
        false,
        0,
        0
      );

      expect(container.innerHTML).toContain('Vosk (Offline)');
      expect(container.innerHTML).not.toContain('Model cached');
    });

    it('should show Web Speech badge', () => {
      const container = createContainer();

      LoadingStates.showEngineIndicator(
        container,
        'webspeech',
        false,
        0,
        0
      );

      expect(container.innerHTML).toContain('Web Speech API (Online)');
      expect(container.innerHTML).toContain('engine-badge webspeech');
      expect(container.innerHTML).not.toContain('Model cached');
    });

    it('should handle null container gracefully', () => {
      expect(() => {
        LoadingStates.showEngineIndicator(null, 'vosk', true, 0, 0);
      }).not.toThrow();
    });
  });

  describe('showError', () => {
    it('should render error message without retry', () => {
      const container = createContainer();

      LoadingStates.showError(container, 'Download failed', false);

      expect(container.innerHTML).toContain('error-state');
      expect(container.innerHTML).toContain('Download failed');
      expect(container.innerHTML).not.toContain('retry-btn');
    });

    it('should render error message with retry button', () => {
      const container = createContainer();
      const onRetry = jest.fn();

      // Mock querySelector to return a button element
      const retryBtn = {
        addEventListener: jest.fn()
      };
      container.querySelector.mockReturnValue(retryBtn);

      LoadingStates.showError(container, 'Network error', true, onRetry);

      expect(container.innerHTML).toContain('error-state');
      expect(container.innerHTML).toContain('Network error');
      expect(container.innerHTML).toContain('retry-btn');
      expect(container.querySelector).toHaveBeenCalledWith('.retry-btn');
      expect(retryBtn.addEventListener).toHaveBeenCalledWith('click', onRetry);
    });
  });

  describe('clear', () => {
    it('should clear container innerHTML', () => {
      const container = createContainer();
      container.innerHTML = '<div>Some content</div>';

      LoadingStates.clear(container);

      expect(container.innerHTML).toBe('');
    });

    it('should handle null container gracefully', () => {
      expect(() => {
        LoadingStates.clear(null);
      }).not.toThrow();
    });
  });
});
