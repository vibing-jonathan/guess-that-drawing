# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are casual game-night groups playing together from their own phones, tablets, or computers. A host starts a private room and shares its code; the other players should be able to join and understand what to do without creating accounts or preparing software in advance.

## Product Purpose

Guess That Drawing makes it quick for a group to start a private, realtime drawing game in the browser. Players create recognizable guest profiles, choose how the room plays, draw or write from private prompts, guess together, and finish with either competitive results or a shared story reveal.

Success means the group gets from invitation to play with very little friction, stays oriented through each timed phase, and leaves with memorable drawings, guesses, or story chains rather than setup work.

## Positioning

Guess That Drawing combines account-free private rooms with three host-selectable forms of play in one session: quick classic guessing, higher-stakes guessing with penalties, and simultaneous telephone-style story chains. The group can move directly from a shared room code into competitive or collaborative play without public matchmaking or separate products.

## Operating Context

- A host creates a room, chooses the mode and rules, optionally selects or creates a word theme, and shares a short room code.
- Guests join from their own browser, using a locally remembered name and layered avatar rather than an account.
- Classic and Pro modes rotate the drawing role while the rest of the room guesses in realtime; the room ends with scores and a leaderboard.
- Phone mode has everyone write, draw, and interpret private assignments simultaneously, then reveals the resulting chains together without chat or scores.
- Sessions may span desktop and touch devices. Players can disconnect briefly and recover their seat and current room state.

## Capabilities and Constraints

- Private guest rooms support 2–12 players; Phone mode requires at least 4 players.
- Classic mode rewards quick correct guesses. Pro mode uses the same turn structure and deducts points for incorrect guesses. Phone mode runs four private sentence-and-drawing links before a synchronized reveal.
- Hosts control room settings, can remove players, and can start rematches. Curated themes are available for Classic and Pro rooms, and players can create reusable custom themes locally.
- The server is authoritative for membership, roles, timers, permissions, private prompts, drawing order, guesses, and scores. Clients receive only role-appropriate state.
- Guest profiles and custom themes are stored locally for convenience. They are sent only to the selected private room; unused private theme words and secret prompts are not exposed in public room state.
- Empty rooms expire after 30 minutes and rooms have an eight-hour absolute lifetime. Reconnect credentials allow short interruptions without introducing accounts.
- The product is a responsive web application with realtime Socket.IO communication. Production serves the browser client and game server together, with Redis supporting short-lived room and reconnect recovery.

## Brand Commitments

- The product name is **Guess That Drawing**.
- The experience remains guest-first, private by default, and centered on the social energy of game night.
- Joining and playing must not require an account.

## Evidence on Hand

- The working React client, authoritative Fastify and Socket.IO game server, shared contracts, curated themes, and automated unit and multiplayer browser tests are the primary evidence for current capabilities.
- The repository includes an incumbent interface and a formal design reference under `design/open-design/`; those materials document the current experience but do not constitute external product proof.
- No verified testimonials, customer logos, usage benchmarks, press claims, pricing, or other market proof are present. Future work must not fabricate them.

## Product Principles

1. **Start the room, not an account.** Remove identity, installation, and setup friction between receiving a code and joining the game.
2. **Keep private play genuinely private.** Reveal prompts, answers, and story authors only to the players and phases that need them.
3. **Protect game-night momentum.** Make roles, timers, progress, errors, reconnection, and the next action immediately understandable.
4. **Support different kinds of fun.** Preserve both competitive guessing and collaborative story-chain play without making either feel secondary.
5. **Treat access as a product requirement.** Desktop, touch, keyboard, and reduced-motion experiences are all first-class parts of the same game.

## Accessibility & Inclusion

Keyboard access, responsive desktop and touch support, and reduced-motion behavior are non-negotiable commitments. The current interface also uses visible focus treatment, semantic controls, screen-reader labels, live status announcements, and responsive layouts; future work should preserve and strengthen those behaviors.
