import React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Feather } from "@expo/vector-icons";
import { Button, Divider, IconButton, LinkButton, Press } from "./ui";
import { c, f, r, sp, t } from "../theme";
import type { Attachment, FlightOffer, MoneySummary, Place, Trip } from "../lib/api";

// What Aura found, shown as things you can act on. One bordered block per result, rows split by
// hairlines; the block is the only container, never a card inside a card.
export function open(url: string) {
  if (!url) return;
  if (/^https?:/i.test(url)) WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => {}));
  else Linking.openURL(url).catch(() => {});
}

export default function Results({ items, onAsk }: { items: Attachment[]; onAsk: (text: string) => void }) {
  return (
    <>
      {items.map((a, i) => {
        if (a.type === "places") return <Places key={i} a={a} onAsk={onAsk} />;
        if (a.type === "flights") return <Flights key={i} a={a} onAsk={onAsk} />;
        if (a.type === "links") return <Links key={i} items={a.items} />;
        if (a.type === "trip") return <TripBlock key={i} trip={a.trip} />;
        if (a.type === "money") return <Money key={i} m={a.summary} />;
        if (a.type === "notes") return <Notes key={i} n={a} />;
        return null;
      })}
    </>
  );
}

function Block({ title, meta, action, children }: { title: string; meta?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={s.block}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={t.label} numberOfLines={1}>{title}</Text>
          {meta ? <Text style={[t.footnote, { marginTop: 1 }]} numberOfLines={1}>{meta}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

// ---------- places ----------
function Places({ a, onAsk }: { a: Extract<Attachment, { type: "places" }>; onAsk: (t: string) => void }) {
  return (
    <Block title={cap(a.query)} meta={a.near ? `Near ${a.near}` : undefined}>
      {a.items.map((p, i) => <PlaceRow key={p.id || i} p={p} first={i === 0} onBook={() => onAsk(`Book ${p.name}${a.party ? ` for ${a.party}` : ""}${a.when ? ` at ${a.when.replace("T", " ")}` : ""}`)} />)}
    </Block>
  );
}
function PlaceRow({ p, first, onBook }: { p: Place; first: boolean; onBook: () => void }) {
  const meta = [p.kind, p.price, p.open_now === true ? "Open now" : p.open_now === false ? "Closed" : null].filter(Boolean).join("  ·  ");
  const map = p.links.find((l) => l.label === "Maps"), call = p.links.find((l) => l.label === "Call"), site = p.links.find((l) => l.label === "Website");
  return (
    <View>
      {!first ? <Divider /> : null}
      <View style={s.row}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text style={[t.label, { flex: 1 }]} numberOfLines={1}>{p.name}</Text>
          {p.rating ? <Text style={s.rating}><Feather name="star" size={12} color={c.ink} /> {p.rating.toFixed(1)}{p.reviews ? <Text style={{ color: c.muted }}> ({compact(p.reviews)})</Text> : null}</Text> : null}
        </View>
        {meta ? <Text style={[t.footnote, { marginTop: 2, color: p.open_now === false ? c.muted : c.ink2 }]}>{meta}</Text> : null}
        {p.address ? <Text style={[t.footnote, { marginTop: 1 }]} numberOfLines={1}>{p.address}</Text> : null}
        <View style={s.actions}>
          <Button label="Book a table" size="sm" onPress={onBook} />
          {call ? <IconButton icon="phone" size={32} onPress={() => open(call.url)} label={`Call ${p.name}`} /> : null}
          {map ? <IconButton icon="map-pin" size={32} onPress={() => open(map.url)} label={`${p.name} on the map`} /> : null}
          {site ? <IconButton icon="globe" size={32} onPress={() => open(site.url)} label={`${p.name} website`} /> : null}
        </View>
      </View>
    </View>
  );
}

// ---------- flights ----------
function Flights({ a, onAsk }: { a: Extract<Attachment, { type: "flights" }>; onAsk: (t: string) => void }) {
  const when = [day(a.depart), a.return ? day(a.return) : null].filter(Boolean).join(" to ");
  return (
    <Block title={`${a.from} to ${a.to}`} meta={when} action={a.search_url ? <LinkButton label="Google Flights" color={c.ink2} onPress={() => open(a.search_url)} /> : null}>
      {a.offers.length ? a.offers.map((o, i) => <OfferRow key={o.id} o={o} first={i === 0} onBook={() => onAsk(`Book the ${o.airline} option for ${price(o)} (offer ${o.id})`)} />)
        : <View style={s.row}><Text style={t.callout}>No fares Aura can book directly here. Compare on Google Flights.</Text></View>}
    </Block>
  );
}
function OfferRow({ o, first, onBook }: { o: FlightOffer; first: boolean; onBook: () => void }) {
  return (
    <View>
      {!first ? <Divider /> : null}
      <Press onPress={onBook} style={[s.row, { flexDirection: "row", alignItems: "center", gap: sp.m }]} scaleTo={0.99} accessibilityLabel={`${o.airline}, ${price(o)}. Book`}>
        <View style={{ flex: 1, gap: 6 }}>
          {o.slices.map((sl, k) => (
            <View key={k}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={s.times}>{clock(sl.depart)}</Text>
                <Feather name="arrow-right" size={13} color={c.muted} />
                <Text style={s.times}>{clock(sl.arrive)}{plusDays(sl.depart, sl.arrive) ? <Text style={s.plus}>{plusDays(sl.depart, sl.arrive)}</Text> : null}</Text>
                <Text style={[t.caption, { marginLeft: 2 }]}>{sl.from} to {sl.to}</Text>
              </View>
              <Text style={[t.footnote, { marginTop: 1 }]}>{k === 0 ? o.airline + "  ·  " : ""}{dur(sl.minutes)}  ·  {sl.stops ? `${sl.stops} stop${sl.stops > 1 ? "s" : ""}` : "Nonstop"}</Text>
            </View>
          ))}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={t.headline}>{price(o)}</Text>
          <Text style={[t.caption, { color: c.accentText, marginTop: 2 }]}>Book</Text>
        </View>
      </Press>
    </View>
  );
}

// ---------- sources ----------
function Links({ items }: { items: { title: string; url: string; source: string }[] }) {
  return (
    <View style={s.sources}>
      <Text style={[t.caption, { marginBottom: 4 }]}>Sources</Text>
      {items.slice(0, 4).map((x, i) => (
        <Press key={x.url + i} onPress={() => open(x.url)} style={s.source} scaleTo={0.99} accessibilityRole="link" accessibilityLabel={`${x.title}, ${x.source}`}>
          <Text style={s.sourceN}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[t.callout, { color: c.ink }]} numberOfLines={1}>{x.title}</Text>
            <Text style={t.caption} numberOfLines={1}>{x.source}</Text>
          </View>
        </Press>
      ))}
    </View>
  );
}

// ---------- trip ----------
export function TripBlock({ trip }: { trip: Trip }) {
  const dates = [trip.start_date, trip.end_date].filter(Boolean).map((d) => day(String(d))).join(" to ");
  return (
    <Block title={trip.title} meta={[trip.destination, dates].filter(Boolean).join("  ·  ")}>
      {trip.summary ? <View style={s.row}><Text style={t.callout}>{trip.summary}</Text></View> : null}
      {(trip.plan || []).slice(0, 7).map((d, i) => (
        <View key={i}>
          <Divider />
          <View style={s.row}>
            <Text style={t.caption}>{d.date ? day(d.date) : `Day ${i + 1}`}</Text>
            {d.title ? <Text style={[t.label, { marginTop: 2 }]}>{d.title}</Text> : null}
            {(d.items || []).slice(0, 6).map((it, k) => (
              <View key={k} style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <Text style={[t.footnote, { width: 44 }]}>{it.time || ""}</Text>
                <Text style={[t.callout, { flex: 1, color: c.ink }]}>{it.text}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </Block>
  );
}

// ---------- meeting notes ----------
function Notes({ n }: { n: Extract<Attachment, { type: "notes" }> }) {
  return (
    <Block title={n.title} meta="Notes from your recording">
      {n.summary ? <View style={s.row}><Text style={[t.callout, { color: c.ink }]}>{n.summary}</Text></View> : null}
      {n.decisions.length ? (
        <View style={[s.row, s.rule]}>
          <Text style={t.caption}>Decided</Text>
          {n.decisions.map((d, i) => <Text key={i} style={[t.callout, { color: c.ink, marginTop: 4 }]}>{d}</Text>)}
        </View>
      ) : null}
      {n.action_items.length ? (
        <View style={[s.row, s.rule]}>
          <Text style={t.caption}>To do</Text>
          {n.action_items.map((a, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <View style={s.box} />
              <Text style={[t.callout, { flex: 1, color: c.ink }]}>{a.text}{/^(me|i|you)$/i.test(a.owner) ? "" : <Text style={{ color: c.muted }}>{`  ${a.owner}`}</Text>}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Block>
  );
}

// ---------- money ----------
export function Money({ m, compactView }: { m: MoneySummary; compactView?: boolean }) {
  const delta = m.total - m.last_month;
  return (
    <Block title={monthName(m.month)} meta={m.last_month ? `${usd(Math.abs(delta))} ${delta >= 0 ? "more" : "less"} than last month` : undefined}
      action={<Text style={t.title2}>{usd(m.total)}</Text>}>
      {m.categories.slice(0, compactView ? 3 : 6).map((x, i) => {
        const cap2 = x.budget || Math.max(...m.categories.map((y) => y.spent), 1);
        const pct = Math.min(1, x.spent / cap2);
        const over = !!x.budget && x.spent > x.budget;
        return (
          <View key={x.category}>
            {i > 0 ? <Divider /> : null}
            <View style={s.row}>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={[t.callout, { flex: 1, color: c.ink }]}>{x.category}</Text>
                <Text style={[t.footnote, over && { color: c.accentText }]}>{usd(x.spent)}{x.budget ? ` of ${usd(x.budget)}` : ""}</Text>
              </View>
              <View style={s.track}><View style={[s.bar, { width: `${Math.round(pct * 100)}%` }, over && { backgroundColor: c.accent }]} /></View>
            </View>
          </View>
        );
      })}
      {!compactView && m.recurring.length ? (
        <View style={[s.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
          <Text style={t.caption}>Repeats every month</Text>
          <Text style={[t.callout, { marginTop: 2, color: c.ink }]}>{m.recurring.slice(0, 5).map((x) => `${x.merchant} ${usd(x.amount)}`).join(",  ")}</Text>
        </View>
      ) : null}
    </Block>
  );
}

// ---------- format ----------
const cap = (x: string) => (x ? x[0].toUpperCase() + x.slice(1) : x);
const compact = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));
export const usd = (cents: number) => { try { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100); } catch (_) { return `$${Math.round(cents / 100)}`; } };
const price = (o: FlightOffer) => { try { return new Intl.NumberFormat("en-US", { style: "currency", currency: o.currency, maximumFractionDigits: 0 }).format(Number(o.total)); } catch (_) { return `${o.total} ${o.currency}`; } };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function day(iso: string) { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return iso; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return `${DOW[d.getUTCDay()]}, ${MON[+m[2] - 1]} ${+m[3]}`; }
function monthName(ym: string) { const m = String(ym || "").match(/^(\d{4})-(\d{2})/); return m ? `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+m[2] - 1]} spending` : "Spending"; }
function clock(iso: string) { const m = String(iso || "").match(/T(\d{2}):(\d{2})/); if (!m) return ""; const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h < 12 ? "am" : "pm"}`; }
function plusDays(a: string, b: string) { const x = String(a).slice(0, 10), y = String(b).slice(0, 10); if (!x || !y || x === y) return ""; const d = Math.round((Date.parse(y) - Date.parse(x)) / 86400000); return d > 0 ? ` +${d}` : ""; }
const dur = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

const s = StyleSheet.create({
  block: { marginTop: sp.m, borderWidth: 1, borderColor: c.line, borderRadius: r.md, backgroundColor: c.surface, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: sp.m, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  row: { paddingHorizontal: 14, paddingVertical: 12 },
  rating: { fontFamily: f.medium, fontSize: 13, color: c.ink },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  times: { fontFamily: f.medium, fontSize: 15.5, letterSpacing: -0.2, color: c.ink },
  plus: { fontFamily: f.medium, fontSize: 11, color: c.muted },
  sources: { marginTop: sp.m },
  source: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  sourceN: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.sunken, textAlign: "center", lineHeight: 20, fontFamily: f.medium, fontSize: 11, color: c.ink2, overflow: "hidden" },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  box: { width: 14, height: 14, borderRadius: 4, borderWidth: 1.5, borderColor: c.control, marginTop: 3 },
  track: { height: 4, borderRadius: 2, backgroundColor: c.sunken, marginTop: 8, overflow: "hidden" },
  bar: { height: 4, borderRadius: 2, backgroundColor: c.ink },
});
