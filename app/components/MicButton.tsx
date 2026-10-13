import React, { useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAudioRecorder, AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { transcribe } from "../lib/api";
import { c } from "../theme";

// Tap to dictate, tap again to transcribe into the field. While recording the button turns
// into an orange stop control with a slow pulse, so the state is never ambiguous.
export default function MicButton({
  onResult,
  disabled,
  size = 40,
  variant = "default",
}: {
  onResult: (t: string) => void;
  disabled?: boolean;
  size?: number;
  variant?: "default" | "inline";
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;
  const press = useRef(new Animated.Value(1)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const inline = variant === "inline";

  const startPulse = () => {
    loopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.86, duration: 620, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 620, useNativeDriver: true }),
      ])
    );
    loopRef.current.start();
  };
  const stopPulse = () => {
    loopRef.current?.stop();
    pulse.setValue(1);
  };

  const toggle = async () => {
    if (working || disabled) return;
    if (!recording) {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) return;
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecording(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        startPulse();
      } catch (e) {
        setRecording(false);
        stopPulse();
      }
    } else {
      setRecording(false);
      setWorking(true);
      stopPulse();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (uri) {
          const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" as any });
          const text = await transcribe(b64, "audio/m4a");
          if (text) onResult(text);
        }
      } catch (e) {
        /* ignore */
      } finally {
        setWorking(false);
      }
    }
  };

  return (
    <Pressable
      onPress={toggle}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={recording ? "Stop dictation" : "Dictate"}
      onPressIn={() => Animated.timing(press, { toValue: 0.92, duration: 90, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(press, { toValue: 1, duration: 180, useNativeDriver: true }).start()}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: recording ? c.signalTint : "transparent",
        borderWidth: !inline && !recording ? 1 : 0,
        borderColor: c.lineStrong,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {working ? (
        <ActivityIndicator color={c.ink2} size="small" />
      ) : (
        <Animated.View style={{ transform: [{ scale: Animated.multiply(pulse, press) }] }}>
          {recording
            ? <Animated.View style={{ width: size * 0.3, height: size * 0.3, borderRadius: 3, backgroundColor: c.signal }} />
            : <Feather name="mic" size={Math.round(size * 0.45)} color={c.ink2} />}
        </Animated.View>
      )}
    </Pressable>
  );
}
