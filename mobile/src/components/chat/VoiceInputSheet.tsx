import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/use-theme";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { recognizerLang, useVoiceInput } from "@/hooks/use-voice-input";

const RECORDING_COLOR = "#FF3B30";
const ACCENT_COLOR = "#007AFF";

/** Joins two chunks of transcript without doubling up whitespace. */
function join(base: string, addition: string) {
  const left = base.trimEnd();
  const right = addition.trim();
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

interface VoiceInputSheetProps {
  visible: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
}

export function VoiceInputSheet({
  visible,
  onClose,
  onInsert,
}: VoiceInputSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { dict, locale } = useI18n();
  const {
    transcript,
    interim,
    volume,
    error,
    isRecording,
    start,
    stop,
    reset,
    clearTranscript,
  } = useVoiceInput();

  const [draft, setDraft] = useState("");
  // Text typed by hand (or committed by a previous take) that speech appends to.
  const baseRef = useRef("");
  // Once the user edits by hand, stop overwriting their text with the transcript.
  const editedRef = useRef(false);

  const ring = useSharedValue(0);
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ring.value * 0.55 }],
    opacity: 0.12 + ring.value * 0.25,
  }));

  useEffect(() => {
    ring.value = withTiming(isRecording ? volume : 0, { duration: 140 });
  }, [ring, volume, isRecording]);

  useEffect(() => {
    if (editedRef.current) return;
    setDraft(join(baseRef.current, transcript + interim));
  }, [transcript, interim]);

  // Start listening as soon as the sheet appears; release the mic when it goes away.
  useEffect(() => {
    if (!visible) {
      reset();
      return;
    }
    baseRef.current = "";
    editedRef.current = false;
    setDraft("");
    reset();
    start(recognizerLang(locale));
  }, [visible, locale, start, reset]);

  const handleChangeText = useCallback(
    (next: string) => {
      if (isRecording) stop();
      editedRef.current = true;
      setDraft(next);
    },
    [isRecording, stop],
  );

  const handleMicPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isRecording) {
      stop();
      return;
    }
    // Resume: keep what's on screen and append the next take to it.
    baseRef.current = draft;
    editedRef.current = false;
    clearTranscript();
    start(recognizerLang(locale));
  }, [isRecording, stop, draft, clearTranscript, start, locale]);

  const handleDone = useCallback(() => {
    const trimmed = draft.trim();
    stop();
    if (trimmed) onInsert(trimmed);
    onClose();
  }, [draft, stop, onInsert, onClose]);

  const handleCancel = useCallback(() => {
    stop();
    onClose();
  }, [stop, onClose]);

  const blocked = error === "denied" || error === "unavailable";
  const canConfirm = draft.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
      // Keeps our state in sync if iOS dismisses the sheet with a swipe.
      onDismiss={handleCancel}
      testID="voice-sheet"
    >
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: theme.sheetBackground }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.header, { borderBottomColor: theme.separatorLight }]}>
          <Pressable onPress={handleCancel} hitSlop={8} testID="voice-cancel-btn">
            <Text style={[styles.headerAction, { color: theme.textSecondary }]}>
              {dict.chat.voiceCancel}
            </Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {dict.chat.voiceTitle}
          </Text>
          <Pressable
            onPress={handleDone}
            disabled={!canConfirm}
            hitSlop={8}
            testID="voice-done-btn"
          >
            <Text
              style={[
                styles.headerAction,
                styles.headerActionPrimary,
                { color: canConfirm ? ACCENT_COLOR : theme.textTertiary },
              ]}
            >
              {dict.chat.voiceDone}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            testID="voice-transcript"
            style={[styles.transcript, { color: theme.text }]}
            value={draft}
            onChangeText={handleChangeText}
            placeholder={dict.chat.voiceHint}
            placeholderTextColor={theme.textTertiary}
            multiline
            maxLength={2000}
            scrollEnabled={false}
            editable={!blocked}
            autoCorrect
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {blocked ? (
            <View style={styles.blockedBox}>
              <Text style={[styles.status, { color: theme.textSecondary }]}>
                {error === "denied"
                  ? dict.chat.voicePermission
                  : dict.chat.voiceUnavailable}
              </Text>
              {error === "denied" ? (
                <Pressable onPress={() => Linking.openSettings()} hitSlop={8}>
                  <Text style={[styles.status, styles.link]}>
                    {dict.chat.locationSettings}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <>
              <Text style={[styles.status, { color: theme.textSecondary }]}>
                {isRecording
                  ? dict.chat.voiceListening
                  : dict.chat.voiceTapToResume}
              </Text>
              <View style={styles.micWrapper}>
                {isRecording ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.micRing, ringStyle]}
                  />
                ) : null}
                <Pressable
                  onPress={handleMicPress}
                  testID="voice-mic-btn"
                  style={({ pressed }) => [
                    styles.micButton,
                    {
                      backgroundColor: isRecording
                        ? RECORDING_COLOR
                        : ACCENT_COLOR,
                    },
                    pressed && styles.micPressed,
                  ]}
                >
                  <Ionicons
                    name={isRecording ? "mic" : "mic-outline"}
                    size={30}
                    color="#fff"
                  />
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.41,
  },
  headerAction: {
    fontSize: 17,
    letterSpacing: -0.41,
  },
  headerActionPrimary: {
    fontWeight: "600",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  transcript: {
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.4,
    minHeight: 120,
  },
  footer: {
    alignItems: "center",
    paddingTop: 8,
    gap: 16,
  },
  status: {
    fontSize: 13,
    letterSpacing: -0.08,
    textAlign: "center",
  },
  link: {
    color: ACCENT_COLOR,
    fontWeight: "600",
  },
  blockedBox: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  micWrapper: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  micRing: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: RECORDING_COLOR,
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  micPressed: {
    opacity: 0.8,
  },
});
