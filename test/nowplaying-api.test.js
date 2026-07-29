import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestGet } from '../functions/api/nowplaying.js';

const env = { LASTFM_API_KEY: 'secret', LASTFM_USER: 'kit' };

test('the now-playing API returns a normalized track and passes abort signals upstream', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), signal: options.signal });

    if (String(url).includes('audioscrobbler')) {
      return Response.json({
        recenttracks: {
          track: [{
            '@attr': { nowplaying: 'true' },
            name: 'Song',
            artist: { '#text': 'Artist' },
            image: [],
          }],
        },
      });
    }

    return Response.json({ data: [{ preview: 'https://cdn.example/preview.mp3' }] });
  });

  const response = await onRequestGet({ env });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    nowplaying: true,
    title: 'Song',
    artist: 'Artist',
    art: '',
    preview: 'https://cdn.example/preview.mp3',
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ signal }) => signal instanceof AbortSignal));
});

test('a hung upstream request is aborted and fails softly', async (t) => {
  let aborted = false;

  t.mock.method(globalThis, 'setTimeout', (callback) => {
    queueMicrotask(callback);
    return 1;
  });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      aborted = true;
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  }));

  const response = await onRequestGet({ env });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { nowplaying: false });
  assert.equal(aborted, true);
});
