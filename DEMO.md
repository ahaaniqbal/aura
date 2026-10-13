# Aura — your ambient AI, with taste

**One line:** Aura is a notes + chat app with an ambient brain — it remembers everything (HydraDB), works in the background, and only ever interrupts you to approve the things that matter.

Built at "Agents you Love" (Jun 21, 2026). Aiming: **Best Overall** (Memory/Context + Workflow + People-Love).

## The 90-second demo (on the iPhone)

1. **You tab, Connected apps.** Gmail, Google Calendar, Notion and Slack connect through real OAuth. Tap Connect on a couple. *"Aura plugs into your life."*
2. **Ask.** Type: *"Sam's birthday is June 28th. He's obsessed with chocolate cake."* Aura replies and quietly files it.
3. **People.** Sam now has a record: birthday, what he'd love, when you last spoke. *"This lives in HydraDB and comes back the moment it's useful."*
4. **Ask, Demo, "Walk past a bakery".** Aura proactively suggests picking up the chocolate cake, with a **From memory** line showing why. Approve, and it's ordered on the Aura card. (memory, proactive, approval, action, end to end)
5. **Ask, Demo, "Urgent email arrives".** The phone buzzes; an **Urgent** card shows the full reply Aura drafted. Edit it if you like, then **Send reply**. It waits five seconds behind Undo, then sends through Gmail. *"It protects your attention: handles the rest, interrupts only when it counts."*

> Everything is one engine: `capture → remember → recall → decide → propose → approve → execute → learn`. The three flows are just config on it.

## Architecture

- **Expo (React Native)** app on iPhone — Today, Ask, People, Notes and You tabs set in ABC Diatype, local-notification interrupt, live via 2s feed poll.
- **Butterbase** backend — Postgres (memories, cards, actions, context), serverless functions (`capture`, `simulate`, `approve`, `feed`), Claude (`claude-sonnet-4.6`) via the AI gateway, realtime. App id `app_6nromeez40uq`.
- **HydraDB** — memory of record (per-user via tenant/sub-tenant; `context.ingest` + `query`). Postgres mirror is the never-fail fallback.
- **AgentCard** (test mode) — the "pays, with your ok" capability. **Composio (via Butterbase integrations)** — the connect-your-tools layer (gmail/calendar/notion/slack).

## Why it wins

- **Memory/Context:** recall is visible and undeniable (the 🧠 chips + Memory tab), backed by HydraDB.
- **Workflow:** automate-then-approve — Aura does the work, you just tap.
- **People-Love:** real character (Poke-supercharged) + an elite, calm, pastel identity that lives up to the name.
