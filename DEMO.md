# Aura demo

**One line:** Aura is a personal AI for your work and your life. It remembers you, books and plans for you with your OK, runs routines on its own, works with any app or agent over MCP, and looks however you dress it.

## The two-minute demo (on the iPhone)

1. **Welcome.** A crowd of Auras, each dressed differently. Get started, then **Make Aura yours**: pick a color, texture, accessory. *"It's yours from the first screen."*
2. **First run.** Pick a personality, answer "What's on your plate?". Aura shows back what it learned.
3. **Food.** Ask *"find a great italian place for 4 on friday at 8"*. Places come back near you with ratings and Book a table. Tap it; approve the card; the booking page opens and dinner lands on your calendar.
4. **Travel.** Ask *"flights to lisbon march 10 to 17"*. Real fares; tap one to book (approve the card). Then *"plan the trip, we like food and walking"*: a day-by-day plan appears, and it's on Today.
5. **Memory.** Memory tab: Likes, Doesn't like, Work, Life, learned from conversation, each one forgettable. Tell Aura *"actually i moved to oakland"* and Home updates.
6. **Routines.** Today: Start of day is on. Open it, Run it now. Switch on Before each meeting.
7. **Money.** *"how much have i spent on eating out this month?"*: categories against budgets, recurring charges.
8. **Apps and agents.** You tab: connect an MCP server by address. Pair an agent with the code; when it asks something, it shows up in chat with Reply.
9. **Demo triggers.** Long-press Aura's face in the chat header (or the Demo button in development builds) for the urgent-email and bakery scenarios.
10. **Unfiltered**, once Unblock is connected: the 18+ confirmation, then the header reads "Blunt · Unfiltered".

> One engine: `capture → remember → recall → decide → propose → approve → execute → learn`.

## Architecture

- **Expo (React Native)**: Aura, Today, Memory and You tabs in ABC Diatype; designed SVG characters; rich results in chat.
- **Butterbase**: Postgres and serverless functions (`agent`, `memory`, `web`, `places`, `travel`, `money`, `routines`, `routine_tick`, `mcp`, `a2a`, `approve`, `settings`, `capture`), Claude via the AI gateway. App id `app_6nromeez40uq`.
- **Kaeva, ported**: memory graph, context ranker, A2A over MCP, privacy fingerprints. **Unblock** for Unfiltered.
- **Composio** for Gmail, Calendar and other apps; **Google Places**, **Duffel**, **Exa/Tavily/Brave** when keys are set. See the README for every env var.
