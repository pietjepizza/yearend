# Peak Season Pulse: a live all-hands deck with anonymous voting

The whole all-hands runs from this app: slides, live anonymous polls that race across the big screen, an award vote, a timeline with the workload, a live Q&A and a "YES WE CAN!" finale. People join by scanning a QR code. Nobody logs in and no names are collected.

**The content is private.** The public website holds only the app. The presentation itself (slides, timeline, notes, polls) lives in a small Supabase database: the presenter screen opens it with the **presenter key**, and phones get only the poll questions, with the join code that the QR code on the big screen carries. Every page tells search engines not to index it.

## Using it on the day

1. Open `presenter.html` on the laptop connected to the projector and enter the presenter key once ("Remember on this computer"). The key never shows in the address bar.
2. Press **?** for the **presenter guide**: full screen, every key and button, a before-you-start checklist and a check for placeholders still in the content.
3. Press **F** (or F11, or Ctrl ⌘ F on a Mac) for full screen.
4. Click **Reset** twice to clear test votes.
5. Optional: in the guide, click **Open presenter view**. It opens on your laptop with your speaker notes, the next screen, live counts, a clock and big Next/Back buttons. The projector follows it.

| Key | Action |
| --- | --- |
| → / Space / Page Down (clicker) | Next screen; phones follow |
| ← / Page Up | Previous screen |
| H | Reveal results, or hide them again. Award: the drumroll. Timeline: skip the animation. Tug of war: start, and again for a rematch. |
| F | Full screen on or off |
| S | Snow on or off |
| U | Bring back removed words, Q&A questions and kudos |
| C, then C | Clear the votes of the current question |
| ? / Esc | Open or close the presenter guide |

Move the mouse to show the control bar: ← →, Reveal now, Snow, Reset (click twice), Full screen and Guide. Click a word in the word cloud to remove it. In the Q&A, click a question once to mark it answered and again to hide it.

## What's in the show

| Screen | What happens |
| --- | --- |
| **Join** | A big QR code. Players pop in with secret names such as "Captain VLOOKUP". |
| **Polls** | A countdown, then a reveal with confetti and an upbeat headline. Answers race along their lanes and words float in as bubbles. |
| **Slides** | Title, agenda, sections, highlights, figures that count up, shout-outs, quotes. Text in `[brackets]` is highlighted as a placeholder. |
| **Bar chart** | A calm, businesslike revenue reveal: the earlier years grow in quickly, then this year (the last bar) builds up quarter by quarter with a live counter on top that turns gold when it passes last year. The outlook rises (hatched), the total settles and the takeaway fades in. No confetti or flashes on this screen. Reported figures are solid, the outlook is hatched. A takeaway sits beside it (a badge, a big figure, a few points and a tagline) and the source in the footer. Use public figures only. |
| **Improvement Award** | "Meet the nominees" (three cards), then a secret audience vote. On the reveal a spotlight jumps between the cards and lands on the winner: confetti, fireworks and the prize. Phones show the winner; ties are called as ties. |
| **The road ahead** | A clean Gantt-style timeline: workstreams as thin bars and milestones on a month axis, holidays shaded, the key milestone as a gold line, and the peak weeks shaded gold with "look out for each other". Underneath, a team workload line worked out from how everything overlaps. Key figures (key moments, weeks to go-live, one team) count up beside the title. |
| **Recap** | "Thank you for your honesty!" Each poll's result with a **We'll do** pledge. |
| **Kudos wall** | Right after the shout-outs, colleagues thank each other from their phones: pick a kind (Thank you, Hero of the year, Team player, Calm in the storm, Energy boost), write who it is for and a line. One card at a time sits in the spotlight (a new one goes there straight away); the others form a wall. Click a card to remove it, U brings it back. |
| **Tug of war** | Just before the finale: every phone is on Team Debit or Team Credit (picked at random, about half and half). Press H: 3-2-1, then "PULL!" and 20 seconds of tapping. The rope and its gold knot follow the pulls live; the winner gets gold, confetti and fireworks. H again for a rematch. |
| **Live Q&A** | People ask anonymously on their phones and upvote each other's questions. The big screen shows them ranked live. |
| **Finale** | Rally lines, a giant "YES WE CAN!", fireworks and confetti. A few seconds later the holiday moment: the lines make way, baubles drop from the string lights, the snow thickens and a golden "Happy holidays" lands letter by letter with the thank-you line beneath. Phones turn into a **CHEER!** button with the holiday greeting. |
| **February check-in** | Extra screens after the finale (Next never runs into them). Open them from the presenter guide: the energy question again, with **December's score beside today's**, plus a go-live question. Same QR code. Don't press Reset first if you want the comparison. |

After the event, **Download results** in the presenter guide saves a one-page summary (all polls, the award winner, the pledges and the Q&A questions) that you can share or print as PDF.

## Edit the content

The content is `questions.json`. It is **not in git**: it lives on your own computer and in Supabase. `questions.example.json` shows the structure with example text.

```bash
PULSE_KEY=<presenter key> npm run content:pull   # download the current content into questions.json
# edit questions.json
PULSE_KEY=<presenter key> npm run content:push   # upload it; the live screens use it on the next load
```

To keep the key dates off the live presentation for a while, `npm run dates:hide` parks the real timeline in a private archive (behind the presenter key, never shown on any screen) and puts a neutral "date TBD" timeline live; `npm run dates:show` puts the real one back. Both need `PULSE_KEY`.

The main parts of `questions.json`:

- **`show`**: the running order. Every step has a `type` (`title`, `lobby`, `agenda`, `section`, `bullets`, `stats`, `shoutouts`, `quote`, `nominees`, `question`, `roadmap`, `recap`, `qa`, `kudos`, `tug`, `finale`), a short `nav` label and **`notes`** (shown in the presenter view). Steps with `extra: true` are the February check-in.
- **`questions`**: the polls. Each has a `title`, `context`, `wordPrompt`, `options` (`label`, `icon`, an optional `score` from 1 to 5 and a `note`), `takeaways` (the headline, picked by outcome) and a `pledge`. `group: "checkin"` marks check-in polls; `compareWith` shows an earlier poll's score beside the new one.
- **The award** is the question with `type: "award"`: three `options` with `label`, `team` and `idea`, plus the `prize`.
- **`chart`** steps: `bars` (each with a `label`, a `note`, a `total` text and `parts` of `label` and `value`; a bar of one part needs no part `label`, its total sits on top; an outlook part adds `max` for its range and `outlook: true` for the hatching), `unit`, `callout` (`badge`, `value`, `label`, `points`, `tagline`) and `source`.
- **`tug`** and **`kudos`** steps: the tug of war takes `teams` (two names) and `seconds`; the kudos wall takes `title`, `subtitle` and, for the simulator, `demo` cards.
- **`roadmap`**: the timeline. `start`/`end` (the date range), `holidays` (`label`, `start`, `end`), and `rows` of `items`: bars (`start`, `end`, both days included, `fade`, `key`) and milestones (`date`; `key: true` makes it the gold line). `weight` sets how much an item adds to the workload, `peakZone` (default 55) where the gold peak weeks start, and `stats` the figures beside the title.
- **`countdown`**: the chip at the top right, counting the days to a `date`.
- **`finale`**: `lines` (the rally lines), `title` ("YES WE CAN!"), `holidays` (the holiday greeting; `""` leaves out the holiday moment) and `thanks` (the line beneath it).
- `timer` (seconds per poll), `lobby`, `recap`, `ticker` (the light-hearted lines in the bottom ticker) and `reactions`.

## Testing

- **Simulator** (`simulator.html`, after the presenter key): the presenter screen with live phones beside it and a control panel. Jump to any screen, run a simulated room of up to 120 players (they also ask and upvote Q&A questions), fire reactions.
- **Node server**, for a fully local run on your own network: `npm install`, then `HOST_KEY=letmein npm start`. Open `/host?key=letmein` (or `/host?key=letmein#notes` for the presenter view); phones open the address printed at startup. It reads `questions.json`, or the example if that is missing.

## How it is built

- `public/`: the app, shared by every mode: `core.js` (state, polls, Q&A, numbering), `host.js` (presenter screen), `join.js` (phone), `notes.js` (presenter view), `help.js` (presenter guide, results download), `lock.js` (presenter key and join code), `fx.js`, `icons.js`, `style.css`.
- `artifact/`: the bundled app and its transport (Supabase, claude.ai, or same-browser for the simulator).
- `server.js`: the local Node server with Server-Sent Events.
- `scripts/build-pages.js` builds `docs/` for GitHub Pages with **no content inside**. It fails if any text from `questions.json` would end up in a public page. `scripts/content.js` uploads and downloads the content.
- `supabase/`: the database. `pulse_live_voting.sql` holds the screen state and the anonymous answers; `pulse_private_content.sql` holds the content behind the presenter key and the join code. The presenter key and the join code are stored only as SHA-256 hashes. Never commit the key.

If a network blocks WebSockets, the pages fall back to checking every couple of seconds; reactions and the "connected" counter need the live connection.

## Privacy

No names and no login. Phones get a random token so people can change their answer. Player names come from fixed word lists, so nobody can put their own text on screen as a name. Words and Q&A questions people type can be removed by the presenter with a click.
