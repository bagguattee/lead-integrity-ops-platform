/**
 * High-Fidelity Browser Audio & Speech Synthesis Engine
 * Uses Web Audio API for realistic telephony sound effects (ring tone, connect, hangup)
 * and bulletproof Web Speech API SpeechSynthesis for live conversational AI voice output.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === "closed") {
    sharedAudioCtx = new AudioContextClass();
  }
  return sharedAudioCtx;
}

/**
 * Call synchronously on ANY user click (user gesture) to unlock browser audio & speech policies
 */
export function unlockAudioAndSpeech(): void {
  if (typeof window === "undefined") return;

  // 1. Unlock Web Audio API context
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume();
    }
  } catch {
    // ignore
  }

  // 2. Unlock SpeechSynthesis in Chrome / Safari
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.resume();
      // Speak a 0-volume silent micro-utterance to register audio playback permission
      const warmUp = new SpeechSynthesisUtterance(" ");
      warmUp.volume = 0.01;
      window.speechSynthesis.speak(warmUp);
    }
  } catch {
    // ignore
  }
}

/**
 * Plays a realistic telephone ring tone (dual frequency: 440Hz + 480Hz for US/AU, 400Hz + 450Hz for UK)
 */
export function playTelephoneRing(locale: string = "US"): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return resolve();
      if (ctx.state === "suspended") ctx.resume();

      const f1 = locale === "UK" ? 400 : 440;
      const f2 = locale === "UK" ? 450 : 480;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(f1, ctx.currentTime);
      osc2.frequency.setValueAtTime(f2, ctx.currentTime);

      // Volume envelope: soft fade in and fade out (1.1s ring)
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.08, ctx.currentTime + 1.0);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.15);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime);

      osc1.stop(ctx.currentTime + 1.2);
      osc2.stop(ctx.currentTime + 1.2);

      setTimeout(resolve, 1200);
    } catch {
      resolve();
    }
  });
}

/**
 * Plays a soft telephone connection chime (ascending two-tone)
 */
export function playCallConnected(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.18);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // ignore
  }
}

/**
 * Plays a telephone hangup / disconnect tone
 */
export function playHangupTone(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(480, ctx.currentTime);

    // 2 quick disconnect beeps
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.06, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.32);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // ignore
  }
}

/**
 * Speak text using Web Speech API with Chromium GC protection,
 * voice selection, and promise resolution when done.
 */
export function speakAgentVoice(
  text: string,
  options: {
    rate?: number;
    pitch?: number;
    onStart?: () => void;
    onEnd?: () => void;
  } = {}
): Promise<void> {
  return new Promise((resolve) => {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      (typeof navigator !== "undefined" && /HeadlessChrome/.test(navigator.userAgent))
    ) {
      options.onEnd?.();
      return resolve();
    }

    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.cancel();

      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = options.rate ?? 1.02;
      utter.pitch = options.pitch ?? 1.0;

      // Select natural English voice if available
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const preferred = voices.find(
          (v) =>
            v.lang.startsWith("en") &&
            (v.name.includes("Natural") ||
              v.name.includes("Google") ||
              v.name.includes("Samantha") ||
              v.name.includes("Karen") ||
              v.name.includes("Zira") ||
              v.name.includes("David"))
        );
        if (preferred) {
          utter.voice = preferred;
        } else {
          const fallbackEn = voices.find((v) => v.lang.startsWith("en"));
          if (fallbackEn) utter.voice = fallbackEn;
        }
      }

      // GC Protection: store on window so Chromium doesn't garbage-collect mid-speech
      (window as unknown as { __activeSpeechUtterance: SpeechSynthesisUtterance }).__activeSpeechUtterance = utter;

      utter.onstart = () => {
        options.onStart?.();
      };

      const finish = () => {
        options.onEnd?.();
        resolve();
      };

      utter.onend = finish;
      utter.onerror = finish;

      window.speechSynthesis.speak(utter);

      // Failsafe timeout in case browser speech engine hangs
      const maxDurationMs = Math.max(3000, (text.split(/\s+/).length / 2.2) * 1000 + 2000);
      setTimeout(() => {
        finish();
      }, maxDurationMs);
    } catch {
      options.onEnd?.();
      resolve();
    }
  });
}
