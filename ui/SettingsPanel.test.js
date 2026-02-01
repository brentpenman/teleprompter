/**
 * Tests for SettingsPanel UI component
 */

import { jest } from '@jest/globals';
import SettingsPanel from './SettingsPanel.js';

// Mock dependencies
jest.unstable_mockModule('../settings/SettingsManager.js', () => ({
  default: class SettingsManager {
    load() {
      return {
        recognitionEngine: 'auto',
        fontSize: 48,
        scrollSpeed: 50,
        highlightEnabled: true,
        mirrorEnabled: false
      };
    }
    set() { return true; }
  }
}));

jest.unstable_mockModule('../settings/DeviceCapability.js', () => ({
  default: class DeviceCapability {
    static detect() {
      return {
        platform: {
          isIOS: false,
          isAndroid: false,
          isMobile: false,
          isDesktop: true
        },
        capabilities: {
          hasSharedArrayBuffer: true,
          hasWebSpeechAPI: true,
          deviceMemory: 8,
          deviceTier: 'high'
        },
        voskSupported: true,
        webSpeechSupported: true
      };
    }
    static recommendEngine() {
      return {
        engine: 'vosk',
        reason: 'Desktop device with Vosk support - offline recognition recommended',
        shouldDownloadModel: true
      };
    }
  }
}));

jest.unstable_mockModule('../src/model/ModelCache.js', () => ({
  ModelCache: class ModelCache {
    async open() {}
    async getModel() { return null; }
    close() {}
  }
}));

jest.unstable_mockModule('./LoadingStates.js', () => ({
  default: {
    showDownloadProgress: jest.fn(),
    showError: jest.fn()
  }
}));

// Create mock DOM container
function createContainer() {
  return {
    innerHTML: '',
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(() => [])
  };
}

describe('SettingsPanel', () => {
  let SettingsManager, DeviceCapability;

  beforeAll(async () => {
    const settingsModule = await import('../settings/SettingsManager.js');
    const capabilityModule = await import('../settings/DeviceCapability.js');
    SettingsManager = settingsModule.default;
    DeviceCapability = capabilityModule.default;
  });

  it('should create instance with required dependencies', () => {
    const settings = new SettingsManager();
    const panel = new SettingsPanel(settings, DeviceCapability);

    expect(panel).toBeDefined();
    expect(panel.settings).toBe(settings);
    expect(panel.deviceCapability).toBe(DeviceCapability);
  });

  it('should render settings panel HTML', () => {
    const settings = new SettingsManager();
    const panel = new SettingsPanel(settings, DeviceCapability);
    const container = createContainer();

    panel.render(container);

    expect(container.innerHTML).toContain('settings-panel');
    expect(container.innerHTML).toContain('Recognition Engine');
    expect(container.innerHTML).toContain('Display Settings');
  });

  it('should show engine options based on support', () => {
    const settings = new SettingsManager();
    const panel = new SettingsPanel(settings, DeviceCapability);
    const container = createContainer();

    panel.render(container);

    // Both Vosk and Web Speech supported
    expect(container.innerHTML).toContain('Auto (Recommended)');
    expect(container.innerHTML).toContain('Vosk (Offline)');
    expect(container.innerHTML).toContain('Web Speech API (Online)');
    expect(container.innerHTML).not.toContain('disabled');
  });

  it('should show model management section when Vosk supported', () => {
    const settings = new SettingsManager();
    const panel = new SettingsPanel(settings, DeviceCapability);
    const container = createContainer();

    panel.render(container);

    expect(container.innerHTML).toContain('Model Management');
    expect(container.innerHTML).toContain('Download for Offline Use');
    expect(container.innerHTML).toContain('Clear Cached Model');
  });

  it('should show display toggles', () => {
    const settings = new SettingsManager();
    const panel = new SettingsPanel(settings, DeviceCapability);
    const container = createContainer();

    panel.render(container);

    expect(container.innerHTML).toContain('highlight-toggle-setting');
    expect(container.innerHTML).toContain('mirror-toggle-setting');
    expect(container.innerHTML).toContain('Highlight text during voice tracking');
    expect(container.innerHTML).toContain('Mirror mode');
  });

  it('should show recommendation reason', () => {
    const settings = new SettingsManager();
    const panel = new SettingsPanel(settings, DeviceCapability);
    const container = createContainer();

    panel.render(container);

    expect(container.innerHTML).toContain('Desktop device with Vosk support');
  });

  it('should check current settings for auto selection', () => {
    const settings = new SettingsManager();
    const panel = new SettingsPanel(settings, DeviceCapability);
    const container = createContainer();

    panel.render(container);

    // Auto is selected by default
    expect(container.innerHTML).toContain('value="auto" checked');
  });
});
