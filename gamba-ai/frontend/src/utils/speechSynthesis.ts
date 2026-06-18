/**
 * speechSynthesis.ts — Text-to-Speech Core Engine
 *
 * Lightweight utility wrapping the Web Speech API for spoken responses.
 * Handles voice selection, queuing, and cancellation.
 */

let selectedVoice: SpeechSynthesisVoice | null = null;

/** Resolve the best available female voice (prefer English, natural-sounding) */
function resolveVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // Prefer high-quality English female voices
  const preferredNames = [
    'Google UK English Female',
    'Google US English Female',
    'Microsoft Zira',
    'Samantha',
    'Google US English',
    'Victoria',
    'Karen',
    'Microsoft Hazel',
    'Microsoft Susan'
  ];
  for (const name of preferredNames) {
    const match = voices.find((v) => v.name.includes(name));
    if (match) return match;
  }

  // Fallback: English female/neutral voices (avoiding known male voice names)
  const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const femaleEnglishVoice = englishVoices.find(
    (v) => !/\b(male|david|daniel|alex|george|jarvis|ravi|mark|richard)\b/i.test(v.name.toLowerCase())
  );
  if (femaleEnglishVoice) return femaleEnglishVoice;

  // Fallback: any English voice
  if (englishVoices.length > 0) return englishVoices[0];

  // Last resort: first available
  return voices[0] ?? null;
}

/** Initialize voice selection — call once after voices load */
export function initVoices(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  selectedVoice = resolveVoice();

  // Voices may load asynchronously in some browsers
  if (!selectedVoice) {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      selectedVoice = resolveVoice();
    }, { once: true });
  }
}

/**
 * Speak the given text aloud.
 * Cancels any currently playing speech first.
 *
 * @returns A promise that resolves when speech ends, or rejects on error.
 */
export function speak(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      reject(new Error('Speech synthesis not available'));
      return;
    }

    // Cancel anything currently playing
    cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      // 'interrupted' and 'canceled' are not real errors
      if (event.error === 'interrupted' || event.error === 'canceled') {
        resolve();
      } else {
        reject(new Error(`Speech synthesis error: ${event.error}`));
      }
    };

    window.speechSynthesis.speak(utterance);
  });
}

/** Immediately cancel any in-progress or queued speech */
export function cancel(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

/** Check if the browser supports speech synthesis */
export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
