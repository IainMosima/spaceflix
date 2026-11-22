# Spaceflix

A home media streamer that runs on one computer and plays on every screen in the house. Paste a magnet link, press play, and it streams while it downloads. Phones, laptops and smart TVs on the same Wi-Fi open it in the browser.

Built with Next.js, TypeScript and WebTorrent, with ffmpeg for audio tracks and subtitles.

## What it does

- **Streams while downloading.** The pieces you are about to watch are fetched first, so playback starts in seconds and seeking jumps the queue.
- **Series folders.** Paste an episode link and it files itself under its show, named `S01E05`, with the next episode code prefilled for the next paste. Season packs let you pick the episode, and the next one downloads in the background.
- **Resume anywhere.** Watch progress is saved per episode, and "Continue" on the home page picks up where you left off on any device.
- **Audio tracks and subtitles.** Pick any dub, English by default, even in Chrome and Edge, which cannot switch tracks natively: the server remuxes the stream with the chosen track. Embedded subtitles show up with an adjustable delay.
- **TV friendly.** Large controls, remote keys (arrows, OK, play/pause, red and green for ±30s), and a lightweight page for older TV browsers.
- **Storage optimization.** While you stream, the part you have already watched is deleted, so a 28 GB 4K movie needs about 6 GB free instead of 28 GB. It keeps 4 GB behind you for seeking back and 2 GB ahead. On by default, adjustable or off in Settings.
- **Download your way.** Download offers Full movie (to watch offline), Preload 25% (starts instantly, the rest streams), or As much as fits. Downloads never go into the 8 GB free-space reserve, and they pause if the disk fills up.
- **Storage that stays in check.** A storage panel shows what is on disk, finished episodes are cleared once you have moved on, and replacing a magnet link deletes the old download.
- **Gentle on slow internet.** Uploads off by default, a background download cap so the house keeps some bandwidth, and full speed for whatever is being watched.
- **Open in VLC.** One tap copies a VLC link for files the browser cannot play.

## Run it

You need Node.js 20+ and ffmpeg.

```bash
npm install
make build
make run        # http://localhost:8181, and your Wi-Fi address for phones and TVs
```

`make ip` prints the address to open on other devices. `make stop` stops it.

### Docker

```bash
make c-run      # start the container (make c-build to rebuild it)
make c-logs     # follow the output
make c-stop
```

`make share` builds `dist/spaceflix.zip`, a ready-to-run kit for another computer (Windows, Mac or Linux with Docker Desktop). It pulls the latest image on each start.

## Where things are kept

Your library, settings and downloads live in the data folder (`data/` by default, or the one picked in Settings). It is in `.gitignore`, so your library never ends up in git.

Titles added with Storage optimization on are kept as pieces in `cache/<title>/.pieces` rather than as one video file, so they play through the app or the VLC link. Titles already on disk keep their layout.

Self-checks: `node scripts/piece-store.check.mjs`, `node scripts/preload.check.mjs` and `node scripts/live-proxy.check.mjs`.

## Use it responsibly

Spaceflix is a general-purpose torrent client. Only download and stream content you have the right to, such as public-domain films, Creative Commons releases and your own media.
