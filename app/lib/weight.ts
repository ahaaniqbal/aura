// Relationship weight, the physics of Aura's living constellation. Two forces per person:
//   closeness  how much this tie matters (relation + how much you've invested in knowing them)
//   warmth     how alive it is right now (decays the longer since you last connected)
// The People canvas maps closeness to size + prominence and warmth to glow, so a close tie
// going quiet visibly cools, the way a friend drifting out of your life actually feels.
import type { GraphPerson } from "./api";

export function closeness(p: GraphPerson): number {
  const rel = (p.relation || "").toLowerCase();
  let s = /partner/.test(rel) ? 52 : /family/.test(rel) ? 44 : /friend/.test(rel) ? 34 : /collaborator/.test(rel) ? 22 : /client/.test(rel) ? 18 : 14;
  s += Math.min(12, (p.topics?.length || 0) * 3); // knowing their world
  s += p.wants?.length ? 6 : 0;                    // knowing what they want
  s += p.birthday ? 5 : 0;
  s += p.care ? 8 : 0;                             // carrying something for them
  s += Math.min(10, (p.open_promises?.length || 0) * 5);
  return Math.min(100, s);
}

// 1 = just connected, decays to ~0.28 by two months of silence.
export function warmth(p: GraphPerson): number {
  const u = Number(p.updated_at);
  if (!u) return 0.55;
  const days = (Date.now() - u) / 86400000;
  if (days <= 7) return 1;
  if (days >= 60) return 0.28;
  return 1 - 0.72 * ((days - 7) / 53);
}

// A close tie that has gone cold, the relationship most worth a nudge.
export function isDrifting(p: GraphPerson): boolean {
  return closeness(p) >= 34 && warmth(p) < 0.5;
}

export function tieLabel(cl: number, w: number): string {
  if (w < 0.4) return "drifting";
  if (cl >= 60) return "inner circle";
  if (cl >= 40) return "close";
  if (cl >= 26) return "in your orbit";
  return "acquaintance";
}
