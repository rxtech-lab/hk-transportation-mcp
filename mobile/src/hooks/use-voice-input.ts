import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from "expo-speech-recognition";
import type { Locale } from "@/lib/i18n/i18n-provider";

export type VoiceStatus = "idle" | "starting" | "listening" | "stopped";

export type VoiceError = "denied" | "unavailable" | "no-speech" | "unknown";

/** App locale -> BCP-47 tag understood by the native speech recognizers. */
const RECOGNIZER_LANG: Record<Locale, string> = {
  "zh-HK": "zh-HK",
  "zh-TW": "zh-TW",
  "zh-CN": "zh-CN",
  "en-US": "en-US",
};

export function recognizerLang(locale: Locale): string {
  return RECOGNIZER_LANG[locale] ?? "en-US";
}

function mapError(code: ExpoSpeechRecognitionErrorCode): VoiceError | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
      return "denied";
    case "service-not-allowed":
    case "language-not-supported":
      return "unavailable";
    case "no-speech":
    case "speech-timeout":
      return "no-speech";
    default:
      return "unknown";
  }
}

/**
 * Is an on-device model actually installed for `lang`? The native flag silently
 * fails (or errors) when it isn't, so we check before enabling it.
 */
async function hasOnDeviceModel(lang: string): Promise<boolean> {
  if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return false;
  try {
    const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
    const wanted = lang.toLowerCase().replace(/_/g, "-");
    return installedLocales.some((l) => l.toLowerCase().replace(/_/g, "-") === wanted);
  } catch {
    // getSupportedLocales throws on Android 12 and below; assume iOS is fine.
    return true;
  }
}

/**
 * Live speech-to-text. Prefers on-device recognition and silently falls back to
 * the platform recognizer when no local model is installed for the language.
 */
export function useVoiceInput() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<VoiceError | null>(null);
  const [onDevice, setOnDevice] = useState(false);

  // Guards a late `end` event from a previous session flipping a new one to "stopped".
  const sessionRef = useRef(0);
  // Mirrors `interim` so the `end` handler can read it without a nested state update.
  const interimRef = useRef("");

  useSpeechRecognitionEvent("start", () => setStatus("listening"));

  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      interimRef.current = "";
      setInterim("");
      if (text) setTranscript((prev) => prev + text);
    } else {
      interimRef.current = text;
      setInterim(text);
    }
  });

  useSpeechRecognitionEvent("volumechange", (event) => {
    // Native value ranges from -2 (silence) to 10 (loud).
    setVolume(Math.max(0, Math.min(1, event.value / 10)));
  });

  useSpeechRecognitionEvent("error", (event) => {
    const mapped = mapError(event.error);
    if (mapped) setError(mapped);
    setStatus("stopped");
  });

  useSpeechRecognitionEvent("end", () => {
    // The session can end without a final result; keep whatever was on screen.
    const pending = interimRef.current;
    if (pending) {
      interimRef.current = "";
      setInterim("");
      setTranscript((prev) => prev + pending);
    }
    setVolume(0);
    setStatus((prev) => (prev === "idle" ? prev : "stopped"));
  });

  const start = useCallback(async (lang: string) => {
    const session = ++sessionRef.current;
    setError(null);
    setStatus("starting");

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (session !== sessionRef.current) return;
    if (!permission.granted) {
      setError("denied");
      setStatus("stopped");
      return;
    }

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setError("unavailable");
      setStatus("stopped");
      return;
    }

    const local = await hasOnDeviceModel(lang);
    if (session !== sessionRef.current) return;
    setOnDevice(local);

    try {
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: local,
        addsPunctuation: true,
        iosTaskHint: "dictation",
        volumeChangeEventOptions: { enabled: true, intervalMillis: 150 },
      });
    } catch {
      setError("unknown");
      setStatus("stopped");
    }
  }, []);

  const stop = useCallback(() => {
    sessionRef.current++;
    ExpoSpeechRecognitionModule.stop();
  }, []);

  /** Drops the accumulated text without touching the recognizer. */
  const clearTranscript = useCallback(() => {
    interimRef.current = "";
    setTranscript("");
    setInterim("");
  }, []);

  const reset = useCallback(() => {
    sessionRef.current++;
    ExpoSpeechRecognitionModule.abort();
    interimRef.current = "";
    setStatus("idle");
    setTranscript("");
    setInterim("");
    setVolume(0);
    setError(null);
  }, []);

  // Never leave the microphone open behind an unmounted screen.
  useEffect(() => () => ExpoSpeechRecognitionModule.abort(), []);

  return {
    status,
    transcript,
    interim,
    volume,
    error,
    onDevice,
    isRecording: status === "starting" || status === "listening",
    start,
    stop,
    reset,
    clearTranscript,
  };
}
