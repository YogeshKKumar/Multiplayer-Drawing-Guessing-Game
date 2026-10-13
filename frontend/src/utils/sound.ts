/**
 * Lightweight Web Audio API arcade sound synthesizer.
 * Zero external audio files required.
 */

class ArcadeSoundManager {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    gainValue: number = 0.08,
    delaySec: number = 0
  ) {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const startTime = ctx.currentTime + delaySec;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(gainValue, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + durationSec);
    } catch {
      // Ignore audio errors when browser blocks autoplay
    }
  }

  public playPop() {
    this.playTone(520, 0.08, 'triangle', 0.07, 0);
    this.playTone(680, 0.09, 'triangle', 0.06, 0.05);
  }

  public playRoundStart() {
    this.playTone(440, 0.12, 'triangle', 0.08, 0);
    this.playTone(554.37, 0.12, 'triangle', 0.08, 0.1);
    this.playTone(659.25, 0.22, 'triangle', 0.09, 0.2);
  }

  public playCorrectGuess() {
    this.playTone(523.25, 0.1, 'sine', 0.1, 0);
    this.playTone(659.25, 0.1, 'sine', 0.1, 0.09);
    this.playTone(783.99, 0.12, 'sine', 0.1, 0.18);
    this.playTone(1046.5, 0.28, 'triangle', 0.12, 0.27);
  }

  public playTimerUrgent() {
    this.playTone(880, 0.05, 'sine', 0.04, 0);
  }

  public playClearOrUndo() {
    this.playTone(360, 0.08, 'sine', 0.06, 0);
    this.playTone(260, 0.1, 'sine', 0.05, 0.06);
  }

  public playGameEnd() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.16, 'triangle', 0.09, idx * 0.11);
    });
  }
}

export const soundFX = new ArcadeSoundManager();
