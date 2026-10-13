import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import BrandIcon from "../components/BrandIcon";
import { Button, Divider, IconName, Press, Section, Toggle } from "../components/ui";
import { c, f, inputReset, layout, r, sp, t } from "../theme";
import { PERSONALITIES } from "../lib/personality";
import type { Personality, Settings } from "../lib/api";

const TOOLS: { key: string; slug: string; brand: string; label: string; icon: IconName; sub: string }[] = [
  { key: "gmail", slug: "gmail", brand: "gmail", label: "Gmail", icon: "mail", sub: "Reads new mail, drafts replies for your OK" },
  { key: "gcal", slug: "google-calendar", brand: "googlecalendar", label: "Google Calendar", icon: "calendar", sub: "Knows when you're busy and when you're free" },
  { key: "notion", slug: "notion", brand: "notion", label: "Notion", icon: "file-text", sub: "Your notes and docs" },
  { key: "slack", slug: "slack", brand: "slack", label: "Slack", icon: "slack", sub: "Catches messages that need you" },
  { key: "whatsapp", slug: "", brand: "whatsapp", label: "WhatsApp", icon: "message-circle", sub: "Not available yet" },
  { key: "bank", slug: "", brand: "", label: "Bank and cards", icon: "credit-card", sub: "Not available yet" },
];

export default function YouScreen({ settings, onSettings, onUnfiltered, serverConnected, onConnect, isPro, onUpgrade, onSignOut }: {
  settings: Settings; onSettings: (patch: { personality?: Personality; instructions?: string }) => Promise<boolean>; onUnfiltered: (on: boolean) => void;
  serverConnected: string[]; onConnect: (slug: string) => void; isPro: boolean; onUpgrade: () => void; onSignOut: () => void;
}) {
  const [instr, setInstr] = useState(settings.instructions);
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setInstr(settings.instructions); }, [settings.instructions]);
  const dirty = instr.trim() !== (settings.instructions || "").trim();
  const connected = TOOLS.filter((x) => x.slug && serverConnected.includes(x.slug)).length;

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={t.display} accessibilityRole="header">You</Text>

      <Section title="Personality" meta="How Aura talks to you">
        {PERSONALITIES.map((p, i) => {
          const on = settings.personality === p.key;
          return (
            <View key={p.key}>
              {i > 0 ? <Divider /> : null}
              <Press onPress={() => !on && onSettings({ personality: p.key })} style={s.option} scaleTo={0.99} accessibilityRole="radio" accessibilityLabel={`${p.label}. ${p.line}`}>
                <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
                <View style={{ flex: 1 }}>
                  <Text style={t.label}>{p.label}</Text>
                  <Text style={[t.footnote, { marginTop: 2 }]}>{p.line}</Text>
                  {on ? <View style={s.sample}><Text style={t.callout}>{p.sample}</Text></View> : null}
                </View>
              </Press>
            </View>
          );
        })}
      </Section>

      <Section title="Unfiltered">
        <View style={s.unfiltered}>
          <View style={{ flex: 1 }}>
            <Text style={t.label}>Unfiltered mode</Text>
            <Text style={[t.callout, { marginTop: 4 }]}>
              {settings.unfiltered_available
                ? "Aura answers what you actually ask, mature and controversial topics included, without lectures or disclaimers. Runs on Unblock's open-weight models. For adults only."
                : "Runs on Unblock's open-weight models, without lectures or disclaimers. Available once Aura is connected to Unblock."}
            </Text>
          </View>
          {settings.unfiltered_available
            ? <Toggle value={settings.unfiltered} onChange={onUnfiltered} label="Unfiltered mode" />
            : <Text style={t.caption}>Not connected</Text>}
        </View>
      </Section>

      <Section title="Your instructions">
        <TextInput style={[s.instr, inputReset, focused && { borderColor: c.ink }]} value={instr} onChangeText={setInstr} multiline textAlignVertical="top"
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} selectionColor={c.accent} maxLength={1500}
          placeholder="Call me Ahaan. Keep it short. I work in product, so skip the basics." placeholderTextColor={c.faint} accessibilityLabel="Your instructions for Aura" />
        {dirty ? (
          <Button label="Save instructions" size="md" loading={saving} style={{ marginTop: sp.m, alignSelf: "flex-start" }}
            onPress={async () => { setSaving(true); await onSettings({ instructions: instr }); setSaving(false); }} />
        ) : null}
      </Section>

      <Section title="Connected apps" meta={`${connected} connected`}>
        {TOOLS.map((x, i) => {
          const on = !!x.slug && serverConnected.includes(x.slug);
          const can = !!x.slug;
          return (
            <View key={x.key}>
              {i > 0 ? <Divider inset={38} /> : null}
              <View style={s.tool}>
                <View style={[s.logo, !can && { opacity: 0.45 }]}>{x.brand ? <BrandIcon brand={x.brand} size={20} /> : <Feather name={x.icon} size={18} color={c.ink2} />}</View>
                <View style={{ flex: 1 }}>
                  <Text style={[t.label, !can && { color: c.muted }]}>{x.label}</Text>
                  <Text style={[t.footnote, { marginTop: 2 }]}>{x.sub}</Text>
                </View>
                {on ? (
                  <View style={s.on}><Feather name="check" size={14} color={c.ink} /><Text style={s.onTxt}>Connected</Text></View>
                ) : can ? <Button label="Connect" size="sm" variant="secondary" onPress={() => onConnect(x.slug)} /> : null}
              </View>
            </View>
          );
        })}
      </Section>

      <Section title="Plan">
        <View style={s.tool}>
          <View style={{ flex: 1 }}>
            <Text style={t.label}>{isPro ? "Aura Pro" : "Free"}</Text>
            <Text style={[t.footnote, { marginTop: 2 }]}>{isPro ? "Active. Unlimited memory and the daily brief." : "Pro adds unlimited memory and a daily brief. 7 days free, then $12 a month."}</Text>
          </View>
          {isPro ? null : <Button label="Try Pro" size="sm" variant="secondary" onPress={onUpgrade} />}
        </View>
      </Section>

      <Section title="Account">
        <Press onPress={onSignOut} style={s.row} scaleTo={0.99} accessibilityLabel="Sign out">
          <Text style={[t.label, { flex: 1 }]}>Sign out</Text>
          <Feather name="log-out" size={17} color={c.ink2} />
        </Press>
      </Section>
      <Text style={[t.footnote, { marginTop: sp.h }]}>Aura 1.0</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: layout.page, paddingTop: sp.xl, paddingBottom: 56 },
  option: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 14 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.control, alignItems: "center", justifyContent: "center", marginTop: 1 },
  radioOn: { borderColor: c.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink },
  sample: { marginTop: sp.m, backgroundColor: c.sunken, borderRadius: r.md, paddingHorizontal: 14, paddingVertical: 10 },
  unfiltered: { flexDirection: "row", alignItems: "flex-start", gap: sp.l, paddingVertical: 14 },
  instr: { marginTop: sp.m, minHeight: 96, backgroundColor: c.surface, borderRadius: r.md, borderWidth: 1, borderColor: c.control, padding: 14, fontFamily: f.regular, fontSize: 15.5, lineHeight: 22, color: c.ink },
  tool: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 14 },
  logo: { width: 22, alignItems: "center" },
  on: { flexDirection: "row", alignItems: "center", gap: 5 },
  onTxt: { fontFamily: f.medium, fontSize: 13, color: c.ink },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
});
