// favorite artists: fills the lovezone list from /api/topartists, which is the
// last 30 days of scrobbles off Last.fm. Fetched once on load -- unlike the now
// playing widget there is nothing here worth polling for.
//
// The heading and the list both start hidden in the markup, so a failed call or
// an empty month leaves no orphaned "favorite artists" header behind.
(function () {
  const REQUEST_TIMEOUT_MS = 10000;

  const head = document.getElementById('topArtistsHead');
  const list = document.getElementById('topArtists');
  if (!head || !list) return;

  async function load() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch('/api/topartists', { signal: controller.signal });
      if (!res.ok) throw new Error('top artists request failed');

      const data = await res.json();
      const artists = Array.isArray(data && data.artists) ? data.artists : [];
      if (!artists.length) return;

      // Falls back to the bare profile if a pill has no per-artist url, and to
      // plain text if there is no link at all -- a pill that looks clickable
      // and goes nowhere is worse than one that doesn't.
      const profile = typeof data.profile === 'string' ? data.profile : '';

      list.replaceChildren(...artists.map((artist, i) => {
        const li = document.createElement('li');
        const href = artist.url || profile;

        if (href) {
          const a = document.createElement('a');
          a.href = href;
          a.textContent = artist.name;
          a.target = '_blank';
          a.rel = 'noopener';
          li.append(a);
        } else {
          li.textContent = artist.name;
        }

        // the top three get the same star treatment as the picked-by-hand faves
        if (i < 3) li.classList.add('starred');
        if (artist.plays) {
          li.title = artist.plays + (artist.plays === 1 ? ' play' : ' plays')
            + ' in the last 30 days';
        }
        return li;
      }));

      head.hidden = false;
      list.hidden = false;
    } catch (err) {
      if (!controller.signal.aborted) {
        console.warn('Unable to load top artists.', err);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  load();
})();
