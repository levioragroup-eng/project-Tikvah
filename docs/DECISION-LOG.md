# PROJECT TIKVAH — Decision Log

Every significant technical or design decision gets an entry: ID, date, decision, rationale, and who made it. Newest entries go at the bottom. This log is append-only — superseded decisions get a "Superseded by Dn" note, never deleted.

Format per entry:
```
## Dn — <short title>
- **Date:** YYYY-MM-DD
- **Decision:** …
- **Rationale:** …
- **Decided by:** …
- **Status:** Active | Superseded by Dn
```

---

## D1 — Track A stack: Node.js + ws + canvas
- **Date:** 2026-09-26
- **Decision:** Track A (Handshake × OpenAI Multiplayer Game Challenge entry) is built on Node.js with the `ws` WebSocket library and a plain HTML5 canvas client.
- **Rationale:** Zero cost, no build step, runs anywhere — a browser and Node are all it takes. Keeps the challenge entry shippable fast and debuggable by anyone.
- **Decided by:** Ariel (via coordinator), recorded by Docs + QA Planner
- **Status:** Active

## D2 — Pixel art generated procedurally in code (Track A)
- **Date:** 2026-09-26
- **Decision:** Track A art is generated procedurally in code to the standards in GAME-ECOSYSTEM.md §5.
- **Rationale:** Zero cost, coherent style guaranteed by construction, no licensing risk from third-party assets.
- **Decided by:** Ariel (via coordinator), recorded by Docs + QA Planner
- **Status:** Active

## D3 — Track B foundation: Godot 4 + GDScript skeleton
- **Date:** 2026-09-26
- **Decision:** Track B (the full MMO) is scaffolded on Godot 4 with GDScript — a skeleton now, the real engine for the MMO future.
- **Rationale:** A real engine for real scope: scene system, animation, audio, and networking primitives the MMO will need, without reinventing them. Track A stays lean; Track B grows here.
- **Decided by:** Ariel (via coordinator), recorded by Docs + QA Planner
- **Status:** Active

## D4 — Server-authoritative multiplayer
- **Date:** 2026-09-26
- **Decision:** All multiplayer state (positions, interactions, inventory, puzzle state) is authoritative on the server. Clients render and predict; the server decides.
- **Rationale:** Anti-cheat and shared truth — two players must see the same world, especially for the cooperative ruin moment. No client-trusted shortcuts.
- **Decided by:** Ariel (via coordinator), recorded by Docs + QA Planner
- **Status:** Active

## D5 — No public deployment until Ariel approves hosting
- **Date:** 2026-09-26
- **Decision:** Nothing is deployed to a public URL until Ariel explicitly approves the hosting choice.
- **Rationale:** Hosting is her call — cost, account, and domain implications. The game is demo-ready locally first; public launch waits on her word.
- **Decided by:** Ariel (standing rule: no spending/publishing without her approval), recorded by Docs + QA Planner
- **Status:** Active

---

## Future decisions

Append new entries below in the same format (D6, D7, …).

*(none yet)*
