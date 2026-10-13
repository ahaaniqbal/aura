// Aura UI primitives. Every screen is built from these so spacing, type and motion stay one system.
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { c, f, r, shadow, sp, t, Tone, toneColor } from "../theme";

export type IconName = React.ComponentProps<typeof Feather>["name"];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1); // ease-out-quint

// Pressed feedback: a short, slight scale. No spring overshoot.
export function Press({ children, onPress, disabled, style, scaleTo = 0.98, hitSlop, accessibilityLabel, accessibilityRole = "button" }: { children?: React.ReactNode; onPress?: () => void; disabled?: boolean; style?: any; scaleTo?: number; hitSlop?: number; accessibilityLabel?: string; accessibilityRole?: any }) {
  const a = useRef(new Animated.Value(1)).current;
  const to = (v: number, d: number) => Animated.timing(a, { toValue: v, duration: d, easing: EASE_OUT, useNativeDriver: true }).start();
  return (
    <AnimatedPressable
      onPressIn={() => { if (!disabled) to(scaleTo, 90); }}
      onPressOut={() => to(1, 180)}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      style={[style, { transform: [{ scale: a }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

// New content settles in place. Used for things that arrive while you watch, never for page loads.
export function FadeIn({ children, style }: { children: React.ReactNode; style?: any }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 220, easing: EASE_OUT, useNativeDriver: true }).start(); }, []);
  return <Animated.View style={[style, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>{children}</Animated.View>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "inverse";
const BTN: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: c.ink, fg: c.onInk },
  accent: { bg: c.accent, fg: c.onAccent },
  secondary: { bg: "transparent", fg: c.ink, border: c.lineStrong },
  ghost: { bg: "transparent", fg: c.ink2 },
  inverse: { bg: c.surface, fg: c.ink },
};
export function Button({ label, onPress, variant = "primary", size = "lg", icon, iconRight, loading, disabled, style }: { label: string; onPress?: () => void; variant?: ButtonVariant; size?: "lg" | "md" | "sm"; icon?: IconName; iconRight?: IconName; loading?: boolean; disabled?: boolean; style?: any }) {
  const h = size === "lg" ? 52 : size === "md" ? 42 : 32;
  const fs = size === "lg" ? 16 : size === "md" ? 15 : 13.5;
  const v = BTN[variant];
  return (
    <Press
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={label}
      style={[{ height: h, borderRadius: size === "sm" ? 6 : r.sm, paddingHorizontal: size === "sm" ? 12 : 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: v.bg, borderWidth: v.border ? 1 : 0, borderColor: v.border || "transparent" }, disabled && !loading && { opacity: 0.32 }, style]}
    >
      {loading ? <ActivityIndicator color={v.fg} size="small" /> : (
        <>
          {icon ? <Feather name={icon} size={fs} color={v.fg} /> : null}
          <Text style={{ fontFamily: f.medium, fontSize: fs, letterSpacing: -0.15, color: v.fg }}>{label}</Text>
          {iconRight ? <Feather name={iconRight} size={fs} color={v.fg} /> : null}
        </>
      )}
    </Press>
  );
}

// Text action in Aura's voice color: the lightest affordance, for secondary paths.
export function LinkButton({ label, icon, onPress, color = c.accentText, style }: { label: string; icon?: IconName; onPress?: () => void; color?: string; style?: any }) {
  return (
    <Press onPress={onPress} hitSlop={8} accessibilityLabel={label} style={[{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6 }, style]}>
      {icon ? <Feather name={icon} size={15} color={color} /> : null}
      <Text style={{ fontFamily: f.medium, fontSize: 14.5, letterSpacing: -0.1, color }}>{label}</Text>
    </Press>
  );
}

export function IconButton({ icon, onPress, variant = "outline", size = 36, color, disabled, style, label }: { icon: IconName; onPress?: () => void; variant?: "plain" | "outline" | "ink"; size?: number; color?: string; disabled?: boolean; style?: any; label: string }) {
  const fg = color || (variant === "ink" ? c.onInk : c.ink);
  return (
    <Press onPress={onPress} disabled={disabled} hitSlop={6} accessibilityLabel={label} scaleTo={0.94}
      style={[{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: variant === "ink" ? c.ink : "transparent", borderWidth: variant === "outline" ? 1 : 0, borderColor: c.lineStrong }, disabled && { opacity: 0.35 }, style]}>
      <Feather name={icon} size={Math.round(size * 0.44)} color={fg} />
    </Press>
  );
}

// A status label: colored text, optionally led by a dot. No pill, no fill.
export function Status({ label, tone = "muted", dot, style }: { label: string; tone?: Tone; dot?: boolean; style?: any }) {
  const col = toneColor[tone];
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 6 }, style]}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone === "accent" ? c.accent : col }} /> : null}
      <Text style={{ fontFamily: f.medium, fontSize: 13, letterSpacing: -0.05, color: col }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// Sections open with a full-width ink rule and a label. The rule, not a card, does the grouping.
export function Section({ title, action, onAction, meta, children, style }: { title: string; action?: string; onAction?: () => void; meta?: string; children?: React.ReactNode; style?: any }) {
  return (
    <View style={[{ marginTop: 40 }, style]}>
      <View style={ui.sectionRow}>
        <Text style={ui.sectionTitle}>{title}</Text>
        {action ? <Press onPress={onAction} hitSlop={10} accessibilityLabel={action}><Text style={ui.sectionAction}>{action}</Text></Press>
          : meta ? <Text style={t.caption}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function Divider({ inset = 0, style }: { inset?: number; style?: any }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: inset }, style]} />;
}

// Underline tabs. Scrolls horizontally when the labels outgrow the screen.
export function Tabs<T extends string>({ options, value, onChange, style, onDark }: { options: { key: T; label: string; count?: number }[]; value: T; onChange: (k: T) => void; style?: any; onDark?: boolean }) {
  const on = onDark ? c.onAccent : c.ink;
  const off = onDark ? c.onAccentMuted : c.muted;
  return (
    <View style={[{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: onDark ? "rgba(13,14,18,0.3)" : c.lineStrong }, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 22 }}>
        {options.map((o) => {
          const sel = o.key === value;
          return (
            <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="tab" accessibilityState={{ selected: sel }} accessibilityLabel={o.label}
              style={{ paddingTop: 6, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: sel ? on : "transparent", flexDirection: "row", gap: 5 }}>
              <Text style={{ fontFamily: f.medium, fontSize: 15, letterSpacing: -0.15, color: sel ? on : off }}>{o.label}</Text>
              {o.count !== undefined ? <Text style={{ fontFamily: f.regular, fontSize: 15, color: off, fontVariant: ["tabular-nums"] }}>{o.count}</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Bottom sheet: the scrim fades while the panel rises, and both settle out before unmount.
export function Sheet({ visible, onClose, children, style, maxHeight = "88%" }: { visible: boolean; onClose: () => void; children: React.ReactNode; style?: ViewStyle; maxHeight?: any }) {
  const [mounted, setMounted] = useState(visible);
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(a, { toValue: 1, duration: 260, easing: EASE_OUT, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(a, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]);
  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, opacity: a }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View style={[ui.sheet, { maxHeight }, style, { transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [560, 0] }) }] }]}>
        <View style={ui.grabber} />
        {children}
      </Animated.View>
    </Modal>
  );
}

// Empty states teach the next move instead of announcing absence.
export function Empty({ title, body, children, style }: { title: string; body: string; children?: React.ReactNode; style?: any }) {
  return (
    <View style={[{ paddingVertical: sp.xl }, style]}>
      <Text style={t.headline}>{title}</Text>
      <Text style={[t.callout, { marginTop: 4, maxWidth: 320 }]}>{body}</Text>
      {children ? <View style={{ marginTop: sp.l, alignItems: "flex-start" }}>{children}</View> : null}
    </View>
  );
}

// On/off switch. Vermilion when on, because an on switch is Aura doing something for you.
export function Toggle({ value, onChange, disabled, label }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  const a = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => { Animated.timing(a, { toValue: value ? 1 : 0, duration: 180, easing: EASE_OUT, useNativeDriver: false }).start(); }, [value]);
  return (
    <Pressable onPress={() => !disabled && onChange(!value)} disabled={disabled} hitSlop={8} accessibilityRole="switch" accessibilityState={{ checked: value, disabled: !!disabled }} accessibilityLabel={label}
      style={{ opacity: disabled ? 0.4 : 1 }}>
      <Animated.View style={{ width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: a.interpolate({ inputRange: [0, 1], outputRange: [c.lineStrong, c.accent] }) }}>
        <Animated.View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.surface, transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }] }} />
      </Animated.View>
    </Pressable>
  );
}

// One message at a time above the tab bar, with an optional action (usually Undo).
export function Toast({ text, action, onAction }: { text: string | null; action?: string; onAction?: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<string | null>(text);
  useEffect(() => {
    if (text) { setShown(text); Animated.timing(a, { toValue: 1, duration: 220, easing: EASE_OUT, useNativeDriver: true }).start(); }
    else Animated.timing(a, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setShown(null));
  }, [text]);
  if (!shown) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[ui.toastWrap, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
      <View style={ui.toast} accessibilityLiveRegion="polite">
        <Text style={ui.toastTxt} numberOfLines={2}>{shown}</Text>
        {action ? <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" accessibilityLabel={action}><Text style={ui.toastAction}>{action}</Text></Pressable> : null}
      </View>
    </Animated.View>
  );
}

export const ui = StyleSheet.create({
  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: c.ink, paddingTop: 10, marginBottom: sp.xs },
  sectionTitle: { fontFamily: f.medium, fontSize: 13.5, letterSpacing: -0.05, color: c.ink },
  sectionAction: { fontFamily: f.medium, fontSize: 13.5, letterSpacing: -0.05, color: c.accentText },
  box: { backgroundColor: c.surface, borderRadius: r.md, borderWidth: 1, borderColor: c.line },
  field: { backgroundColor: c.surface, borderRadius: r.md, borderWidth: 1, borderColor: c.control },
  fieldFocus: { borderColor: c.ink },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.canvas, borderTopLeftRadius: r.lg, borderTopRightRadius: r.lg, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 34, ...shadow.float },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: c.lineStrong, marginBottom: sp.l },
  toastWrap: { position: "absolute", left: 12, right: 12, bottom: 8 },
  toast: { flexDirection: "row", alignItems: "center", gap: sp.l, backgroundColor: c.ink, borderRadius: r.md, paddingHorizontal: 16, paddingVertical: 14 },
  toastTxt: { flex: 1, fontFamily: f.regular, fontSize: 14.5, color: c.onInk },
  toastAction: { fontFamily: f.medium, fontSize: 14.5, color: c.accent },
});
