# Mood Pulse: year-end all-hands emoji check-in

Attendees scan a QR code on the big screen, tap an emoji (and can add one word), and the results update live on the presenter screen.

## Try it locally (5 minutes)

```bash
npm install
HOST_KEY=letmein npm start
```

The console prints two links:

- **Participants:** `http://<your-laptop-ip>:3000`. The QR code points here.
- **Presenter screen:** `http://<your-laptop-ip>:3000/host?key=letmein`. Open this on the projector.

Phones must be on the **same Wi-Fi** as your laptop. To test on your own, open the participant link in a few browser tabs or on your phone.

### Presenter controls (keyboard, on the host screen)

| Key | Action |
| --- | --- |
| → / Space | Next question (every phone switches automatically) |
| ← | Previous question |
| H | Hide or reveal the results, for a drum-roll moment |
| C | Clear the answers to the current question |

## Make it your own

Edit `questions.json` to change the event name, the questions, and the emoji and labels for each. Restart the server afterwards.

## Using it on the day

Office Wi-Fi often blocks phones from talking to each other, and people may join on 4G or 5G, so host the app on a public URL:

- **Quick:** run it locally and expose it with a tunnel (for example `cloudflared tunnel --url http://localhost:3000`). Then start with `PUBLIC_URL=https://<tunnel-url> npm start` so the QR code uses that address.
- **Sturdier:** deploy to any Node host (Render, Railway, Fly.io). Set the `PUBLIC_URL` and `HOST_KEY` environment variables there.

| Env var | Default | Purpose |
| --- | --- | --- |
| `PORT` | 3000 | Port to listen on |
| `PUBLIC_URL` | `http://<lan-ip>:PORT` | Address encoded in the QR code |
| `HOST_KEY` | random (printed at startup) | Required to control the presenter screen |
| `DATA_FILE` | `./data.json` | Where answers are saved, so a restart keeps them |

Names are optional, stored only in `data.json`, and never shown on screen.
