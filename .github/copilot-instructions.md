# Project Guidelines

This is a dependency-free static browser application. Keep the implementation in plain HTML, CSS, and JavaScript modules unless the project direction changes deliberately.

## Runtime and Commands

- Serve locally with `python3 -m http.server 4173` and open `http://localhost:4173`.
- Run pure JavaScript tests with `node --test tests/clip-model.test.mjs`.
- Check JavaScript syntax with `node --check app.mjs`.
- There is no npm package, bundler, or backend runtime.

## Architecture

- `index.html`, `styles.css`, and `app.mjs` are the static application entry points.
- Pure clip parsing and validation belongs in `js/clip-model.mjs`.
- Browser persistence belongs in the local-storage wrapper in `app.mjs`; preserve existing user data when changing the storage format.
- YouTube playback must use the official IFrame Player API through the `YouTubePlayer` adapter.
- Keep provider-specific playback isolated so a future local-audio source can be added without changing tile behavior.

## Constraints

- YouTube links are played online through the visible official embed.
- Do not extract, download, proxy, or cache raw YouTube media.
- Preserve user board data and avoid destructive migrations.
- Keep the UI keyboard accessible and validate URL and timestamp input before persistence.

## Working Method

- Read the relevant source and tests before editing.
- Keep changes focused and preserve unrelated user changes.
- Prefer pure functions for parsing and validation so they can be tested without a browser.
- After substantive edits, run the narrowest relevant Node test or syntax check before expanding the change.
