# Peak Season Pulse: Finance Operations year-end game show

A live, **fully anonymous** poll for the year-end all-hands, styled as a playful game show. People scan a QR code, become a secret player (for example "Captain VLOOKUP"), and vote. Their answers race across the big screen. The show ends on a motivating "YES WE CAN!".

## The show

| # | Screen | What happens |
| --- | --- | --- |
| 0 | **Lobby** | Bouncy title, how-to-play steps, a big QR code. Players pop in with their secret names. |
| 1–4 | **Questions** | A 25-second countdown, then "TIME'S UP!", a confetti reveal and an upbeat headline. Each answer is a little character racing in its own lane, and the winner gets a crown and a speech bubble. Words float in as bubbles. |
| 5 | **Recap** | "Thank you for your honesty!" Each question's result is shown with a **We'll do** pledge. |
| 6 | **The road ahead** | An animated timeline. The team character walks from today through the year-end close, the holiday break and the annual report to the ERP "boss level", ending with "Peak conquered!". |
| 7 | **Finale** | Rally lines slam in, then a giant "YES WE CAN!" with fireworks and a parade of everyone's characters. Phones turn into a big **CHEER!** button. |

The questions:
1. **How are you feeling right now?** This is the honest check.
2. **If 2026 were a share price…** This is about pride.
3. **How charged are you for peak season?**
4. **What will make us unstoppable through the peak?** This is about what we can do.

The headlines stay encouraging whatever the outcome.

## Test link

The test copy is published as a private claude.ai page.
- The page is the presenter screen. Move the mouse to show the controls, then press **▶ Simulate the room** to play through with about 40 simulated players.
- Phones scan the QR code (the link ends in `#join`). Cross-device play works when signed in to claude.ai.

To rebuild it: `ARTIFACT_URL=<link> npm run build:artifact` writes `dist/mood-pulse.html`.

## Run it for the real event

```bash
npm install
HOST_KEY=letmein npm start
```

Open the presenter link `/host?key=letmein` on the projector. Phones need to reach the server:
- **Quick option:** a tunnel, with `PUBLIC_URL=https://<tunnel>`.
- **Sturdier option:** a Node host such as Render, Railway or Fly.io.

| Key | Action |
| --- | --- |
| → / Space | Next screen (phones follow) |
| ← | Previous screen |
| H | Reveal now, or hide again |
| S | Snow on or off |
| Click a word | Remove it from the screen |
| U | Restore removed words |
| C, then C again | Clear the current question |
| Reset button, clicked twice | Start over |

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | 3000 | Port to listen on |
| `PUBLIC_URL` | `http://<lan-ip>:PORT` | Address in the QR code |
| `HOST_KEY` | random (printed at startup) | Required to control the screen |
| `DATA_FILE` | `./data.json` | Saved answers |

## Edit the content

Everything is in `questions.json`:

- **`timer`**: seconds per question. A question can set its own `timer`, and 0 turns the countdown off.
- **`lobby`**: the title and intro.
- **`recap`**: the thank-you title and subtitle.
- **`roadmap.steps`**: the timeline. Each step has a `type` (`start`, `level`, `rest`, `boss` or `finish`), `when`, `label` and `note`. **The dates are placeholders marked "date TBD".**
- **`finale`**: the rally `lines`, the big `title` and the `thanks`.
- **Each question** has:
  - `title`, `context` and `wordPrompt`
  - `takeaways`: the upbeat headline, picked by outcome
  - `pledge`: the "We'll do" line on the recap
  - `options`: each has `label`, `icon`, an optional `score` from 1 to 5, and a speech-bubble `note`
  - `demo`: data for the simulator

Colours and fonts are set at the top of `public/style.css`.

## Privacy

No names and no login. Phones get a random token so people can change their answer. Player names are built from fixed word lists, so nobody can put their own text on screen as a name. Words typed as answers can be removed by clicking them.
