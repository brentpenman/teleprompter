/**
 * AudioVisualizer - Canvas-based waveform visualization for voice mode
 *
 * Displays animated frequency bars that react to voice input,
 * providing visual feedback that the microphone is active.
 */
class AudioVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Audio resources (initialized in start())
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.animationFrameId = null;
    this.dataArray = null;

    // State
    this.isError = false;
    this.confidenceLevel = 'high';  // 'high', 'medium', or 'low'
    this.currentOpacity = 1.0;      // For smooth transitions

    // Colors
    this.normalColor = '#22c55e';  // Green
    this.errorColor = '#f59e0b';   // Amber

    // Bind draw method to preserve context
    this.draw = this.draw.bind(this);
  }

  /**
   * Start visualization with getUserMedia stream
   * @param {MediaStream} mediaStream - Audio stream from getUserMedia
   */
  start(mediaStream) {
    this.stream = mediaStream;

    // Create AudioContext (handle browser prefixes)
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();

    // Create AnalyserNode for frequency data
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;  // Smaller FFT for clear bars
    this.analyser.smoothingTimeConstant = 0.8;  // Smooth but responsive

    // Connect stream to analyser (NOT to destination - avoid feedback)
    this.source = this.audioContext.createMediaStreamSource(mediaStream);
    this.source.connect(this.analyser);

    // Create buffer for frequency data
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    // Start animation loop
    this.draw();
  }

  /**
   * Animation loop - draws frequency bars to canvas
   */
  draw() {
    this.animationFrameId = requestAnimationFrame(this.draw);

    // Get fresh frequency data
    this.analyser.getByteFrequencyData(this.dataArray);

    const width = this.canvas.width;
    const height = this.canvas.height;

    // Clear canvas with transparent background
    this.ctx.clearRect(0, 0, width, height);

    // Calculate target opacity based on confidence level
    const opacityMap = { high: 1.0, medium: 0.6, low: 0.3 };
    const targetOpacity = opacityMap[this.confidenceLevel] ?? 1.0;

    // Smooth transition to target opacity
    this.currentOpacity += (targetOpacity - this.currentOpacity) * 0.1;

    // Apply opacity for confidence visualization
    this.ctx.globalAlpha = this.currentOpacity;

    // Configuration for bars
    const barCount = 10;
    const barGap = 2;
    const barWidth = (width - (barCount - 1) * barGap) / barCount;
    const borderRadius = 2;

    // Pick frequency bins spread across the spectrum
    // Focus on lower frequencies (more voice content)
    const binStep = Math.floor(this.dataArray.length / barCount / 2);

    // Set fill color based on error state
    this.ctx.fillStyle = this.isError ? this.errorColor : this.normalColor;

    // Draw bars from bottom up
    for (let i = 0; i < barCount; i++) {
      // Get frequency value from corresponding bin
      const binIndex = i * binStep;
      const value = this.dataArray[binIndex];

      // Calculate bar height (min 4px for visibility when silent)
      const barHeight = Math.max(4, (value / 255) * height);

      // Calculate bar position
      const x = i * (barWidth + barGap);
      const y = height - barHeight;

      // Draw rounded bar
      this.roundRect(x, y, barWidth, barHeight, borderRadius);
    }

    // Reset globalAlpha to avoid affecting other canvas operations
    this.ctx.globalAlpha = 1.0;
  }

  /**
   * Draw a rounded rectangle
   */
  roundRect(x, y, width, height, radius) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
    this.ctx.fill();
  }

  /**
   * Stop visualization and cleanup all resources
   */
  stop() {
    // Cancel animation loop
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Stop all tracks on the stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Clear canvas
    if (this.canvas && this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Reset references
    this.analyser = null;
    this.source = null;
    this.dataArray = null;
    this.isError = false;
    this.confidenceLevel = 'high';
    this.currentOpacity = 1.0;
  }

  /**
   * Set error state - changes bar color to indicate trouble
   * @param {boolean} isError - Whether in error/retry state
   */
  setErrorState(isError) {
    this.isError = isError;
    // Color will update automatically on next frame
  }

  /**
   * Set confidence level - changes bar brightness
   * @param {'high' | 'medium' | 'low'} level - Confidence level
   */
  setConfidenceLevel(level) {
    this.confidenceLevel = level;
    // Opacity will transition smoothly in draw()
  }
}
