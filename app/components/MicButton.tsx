import React, { useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAudioRecorder, AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { transcribe } from "../lib/api";
import { c } from "../theme";

export default function MicButton({
  onResult,
  disabled,
  size = 46,
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
        Animated.timing(pulse, { toValue: 1.14, duration: 520, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 520, useNativeDriver: true }),
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

  const radius = size / 2;

  return (
    <Pressable
      onPress={toggle}
      disabled={disabled}
      hitSlop={8}
      onPressIn={() => Animated.spring(press, { toValue: 0.96, useNativeDriver: true, friction: 7, tension: 140 }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, friction: 7, tension: 140 }).start()}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: recording ? c.recording : inline ? "transparent" : c.surfaceAlt,
        borderWidth: inline ? 0 : 1,
        borderColor: recording ? c.recordingBorder : c.hairline,
      }}
    >
      {working ? (
        <ActivityIndicator color={c.text} size="small" />
      ) : (
        <Animated.View style={{ transform: [{ scale: Animated.multiply(pulse, press) }] }}>
          <Feather name={recording ? "square" : "mic"} size={inline ? 20 : 18} color={recording ? c.recordingIcon : c.muted} />
        </Animated.View>
      )}
    </Pressable>
  );
}
