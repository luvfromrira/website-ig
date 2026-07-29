# Kitalina

A small, framework-free personal site deployed on Cloudflare Pages.

## Project structure

- `index.html` contains the page content and metadata.
- `assets/css/styles.css` contains all presentation and responsive rules.
- `assets/js/theme-bootstrap.js` applies the saved theme before first paint.
- `assets/js/appearance.js` owns themes, ambient effects, and the local clock.
- `assets/js/page.js` owns sprites, section reveal, and active navigation.
- `assets/js/presence.js` renders Kitalina's Discord presence and custom status via Lanyard.
- `assets/js/now-playing.js` owns the Last.fm widget and audio preview.
- `assets/js/easter-eggs.js` contains optional decorative interactions.
- `functions/api/nowplaying.js` is the Cloudflare Pages Function used by the player.

## Local development

Serve the repository root with any static web server. For example:

```sh
python3 -m http.server 8000
```

The static page works without the Cloudflare function; the now-playing widget
simply remains hidden when `/api/nowplaying` is unavailable.

## Validation

The project uses only Node's built-in test runner and has no package dependencies:

```sh
npm run check
npm test
```

## Cloudflare Pages

Deploy the repository root as the Pages output directory. No build command is
required. Configure these environment variables for the production function:

- `LASTFM_API_KEY`
- `LASTFM_USER`

Do not commit either value to the repository.
