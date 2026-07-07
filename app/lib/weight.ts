// Relationship weight, the physics of Aura's living constellation. Three forces per person:
//   closeness  how much this tie matters (relation + how much you've invested in knowing them)
//   warmth     how alive it is right now (decays from last contact, cools faster when you fall
//              behind your own rhythm with them)
//   cadence    the tempo you actually keep, learned from the spacing of past interactions
// Thine's "temporal edge weight" is recency + frequency in a text bot. Here it drives a living
// map: a close tie you usually see weekly, now three weeks quiet, visibly cools and asks for you,
// while a friend you only catch twice a year at the same gap stays warm. Overdue is relative to
// the relationship, not a fixed calendar rule.
import type { GraphPerson } from "./api";

const DAY = 86400000;

function touches(p: GraphPerson): number[] {
  return (p.touches || []).map(Number).filter((t) => t > 0).sort((a, b) => a - b);
}
function lastTouch(p: GraphPerson): number | null {
  const t = touches(p);
  if (t.length) return t[t.length - 1];
  return Number(p.updated_at) || null;
}
// median spacing between past interactions, only once we have enough to see a pattern
export function medianGapDays(p: GraphPerson): number | null {
  const t = touches(p);
  if (t.length < 3) return null;
  const g: number[] = [];
  for (let i = 1; i < t.length; i++) g.push((t[i] - t[i - 1]) / DAY);
  g.sort((a, b) => a - b);
  return g[Math.floor(g.length / 2)] || null;
}
function daysSince(p: GraphPerson): number | null {
  const last = lastTouch(p);
  return last ? (Date.now() - last) / DAY : null;
}

export function closeness(p: GraphPerson): number {
  const rel = (p.relation || "").toLowerCase();
  let s = /partner/.test(rel) ? 52 : /family/.test(rel) ? 44 : /friend/.test(rel) ? 34 : /collaborator/.test(rel) ? 22 : /client/.test(rel) ? 18 : 14;
  s += Math.min(12, (p.topics?.length || 0) * 3); // knowing their world
  s += p.wants?.length ? 6 : 0;                    // knowing what they want
  s += p.birthday ? 5 : 0;
  s += p.care ? 8 : 0;                             // carrying something for them
  s += Math.min(10, (p.open_promises?.length || 0) * 5);
  s += Math.min(8, Math.max(0, (p.touch_count || 0) - 1) * 1.2); // frequency of contact
  return Math.min(100, s);
}

// 1 = just connected. Decays with silence, and cools further when you've fallen behind the
// rhythm you normally keep with this person.
export function warmth(p: GraphPerson): number {
  const ds = daysSince(p);
  let w = ds === null ? 0.55 : ds <= 7 ? 1 : ds >= 60 ? 0.28 : 1 - 0.72 * ((ds - 7) / 53);
  const mg = medianGapDays(p);
  if (mg && mg > 0 && ds !== null) {
    const ratio = ds / mg; // >1 means overdue vs your usual tempo
    if (ratio >= 1.5) w = Math.min(w, Math.max(0.26, 1.15 - 0.5 * ratio));
  }
  return Math.max(0.24, Math.min(1, w));
}

// A tie worth a nudge: close, and overdue relative to how you actually keep it (or, before a
// rhythm is known, simply gone quiet for a while).
export function isDrifting(p: GraphPerson): boolean {
  const mg = medianGapDays(p);
  const ds = daysSince(p);
  if (mg && ds !== null) return closeness(p) >= 30 && ds >= Math.max(12, mg * 1.8);
  return closeness(p) >= 34 && warmth(p) < 0.5;
}

export function tieLabel(cl: number, w: number): string {
  if (w < 0.4) return "drifting";
  if (cl >= 60) return "inner circle";
  if (cl >= 40) return "close";
  if (cl >= 26) return "in your orbit";
  return "acquaintance";
}

function cadenceWord(d: number): string {
  if (d <= 2) return "most days";
  if (d <= 5) return "a few times a week";
  if (d <= 10) return "about weekly";
  if (d <= 20) return "every couple weeks";
  if (d <= 45) return "about monthly";
  return "now and then";
}
function agoWord(d: number): string {
  if (d <= 0) return "today";
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  if (d < 14) return `${Math.round(d)}d ago`;
  if (d < 60) return `${Math.round(d / 7)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}

// Human-facing summary for the person sheet and nudges.
export function contactStats(p: GraphPerson): { count: number; lastDays: number | null; cadenceLabel: string; lastLabel: string; overdueWeeks: number | null } {
  const ds = daysSince(p);
  const mg = medianGapDays(p);
  return {
    count: p.touch_count || touches(p).length || 0,
    lastDays: ds === null ? null : Math.round(ds),
    cadenceLabel: mg ? cadenceWord(mg) : "",
    lastLabel: ds === null ? "" : agoWord(ds),
    overdueWeeks: ds !== null && ds >= 12 ? Math.max(1, Math.round(ds / 7)) : null,
  };
}
