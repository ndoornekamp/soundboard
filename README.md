# Soundboard

A vibecoded, dependency-free, static soundboard for personal timestamped YouTube clips.

## Run locally

Serve the folder over HTTP:

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

There is no package manager, build step, or backend. The only runtime dependency is the official YouTube IFrame Player API, loaded by the browser when the app starts.

## Validate

Run the pure JavaScript tests with Node's built-in test runner:

```sh
node --test tests/clip-model.test.mjs
node --check app.mjs
```

## Behavior

- Clip definitions are stored in local storage in the browser.
- Timestamp fields accept `m:ss`, `h:mm:ss`, or decimal seconds such as `7.5`.
- Board metadata can be exported to or imported from JSON files, pasted strings, or the clipboard.
- Imports skip clips whose IDs are already present on the board.
- YouTube playback still requires a network connection. The app intentionally uses the official embedded player and does not extract, download, or proxy YouTube audio.
- The player remains visible because playback is provided by the official YouTube embed.

## Deployment

Deploy to Github pages
