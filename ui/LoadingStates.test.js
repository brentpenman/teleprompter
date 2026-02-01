/**
 * Tests for LoadingStates UI component
 */

import { jest } from '@jest/globals';
import LoadingStates from './LoadingStates.js';

// Mock DOM environment
function createContainer() {
  const div = {
    innerHTML: '',
    textContent: '',
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

  describe('showEngineLabel', () => {
    it('should show Vosk label text', () => {
      const sublabel = createContainer();

      LoadingStates.showEngineLabel(sublabel, 'vosk');

      expect(sublabel.textContent).toBe('Vosk');
      expect(sublabel.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should show Web Speech label text', () => {
      const sublabel = createContainer();

      LoadingStates.showEngineLabel(sublabel, 'webspeech');

      expect(sublabel.textContent).toBe('Web Speech');
      expect(sublabel.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should handle null element gracefully', () => {
      expect(() => {
        LoadingStates.showEngineLabel(null, 'vosk');
      }).not.toThrow();
    });
  });

  describe('showTopProgressBar', () => {
    function createBarElements() {
      return {
        bar: createContainer(),
        fill: { style: { width: '0%' } },
        text: { textContent: '' }
      };
    }

    it('should show downloading progress with MB counts', () => {
      const { bar, fill, text } = createBarElements();

      LoadingStates.showTopProgressBar(bar, fill, text, {
        status: 'downloading',
        percentage: 42,
        loaded: 17000000,
        total: 40000000
      });

      expect(bar.classList.remove).toHaveBeenCalledWith('hidden');
      expect(fill.style.width).toBe('42%');
      expect(text.textContent).toContain('16.2');
      expect(text.textContent).toContain('38.1');
      expect(text.textContent).toContain('42%');
    });

    it('should show checking storage status', () => {
      const { bar, fill, text } = createBarElements();

      LoadingStates.showTopProgressBar(bar, fill, text, {
        status: 'checking-quota'
      });

      expect(text.textContent).toBe('Checking storage...');
    });

    it('should show validating status at 100%', () => {
      const { bar, fill, text } = createBarElements();

      LoadingStates.showTopProgressBar(bar, fill, text, {
        status: 'validating'
      });

      expect(text.textContent).toBe('Validating model...');
      expect(fill.style.width).toBe('100%');
    });

    it('should show model ready and auto-hide on complete', () => {
      jest.useFakeTimers();
      const { bar, fill, text } = createBarElements();

      LoadingStates.showTopProgressBar(bar, fill, text, {
        status: 'complete'
      });

      expect(text.textContent).toBe('Model ready!');
      expect(fill.style.width).toBe('100%');

      jest.advanceTimersByTime(1000);
      expect(bar.classList.add).toHaveBeenCalledWith('hidden');

      jest.useRealTimers();
    });

    it('should cap percentage at 100', () => {
      const { bar, fill, text } = createBarElements();

      LoadingStates.showTopProgressBar(bar, fill, text, {
        status: 'downloading',
        percentage: 150,
        loaded: 50000000,
        total: 40000000
      });

      expect(fill.style.width).toBe('100%');
    });

    it('should handle null elements gracefully', () => {
      expect(() => {
        LoadingStates.showTopProgressBar(null, null, null, { status: 'downloading' });
      }).not.toThrow();
    });
  });

  describe('hideTopProgressBar', () => {
    it('should add hidden class to bar', () => {
      const bar = createContainer();

      LoadingStates.hideTopProgressBar(bar);

      expect(bar.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should handle null element gracefully', () => {
      expect(() => {
        LoadingStates.hideTopProgressBar(null);
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
