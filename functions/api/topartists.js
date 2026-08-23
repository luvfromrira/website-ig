// functions/api/topartists.js
//
// Cloudflare Pages Function backing the "favorite artists" list in lovezone.
// Asks Last.fm for the user's most played artists over the last 30 days
// (user.gettopartists, period=1month) and returns just the names, so the
// API key never leaves this function.
//
// Reuses the same environment variables as the now playing widget:
//   LASTFM_API_KEY
//   LASTFM_USER

const FAIL_SOFT_BODY = { artists: [] };
const UPSTREAM_TIMEOUT_MS = 6000;
const LIMIT = 10;

export async function onRequestGet(context) {
  const { env } = context;

  try {
    if (!env.LASTFM_API_KEY || !env.LASTFM_USER) {
      return jsonResponse(FAIL_SOFT_BODY);
    }

    const url =
      "https://ws.audioscrobbler.com/2.0/?method=user.gettopartists" +
      `&user=${encodeURIComponent(env.LASTFM_USER)}` +
      `&api_key=${encodeURIComponent(env.LASTFM_API_KEY)}` +
      `&period=1month&format=json&limit=${LIMIT}`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) return jsonResponse(FAIL_SOFT_BODY);

    const data = await res.json();
    const raw = data?.topartists?.artist;
    if (!Array.isArray(raw)) return jsonResponse(FAIL_SOFT_BODY);

    // The username is only known here, so the profile link is built server-side
    // rather than leaving the frontend to guess it.
    const profile = `https://www.last.fm/user/${encodeURIComponent(env.LASTFM_USER)}`;

    const artists = raw
      .map((a) => ({
        name: String(a?.name || "").trim(),
        plays: Number(a?.playcount) || 0,
      }))
      .filter((a) => a.name)
      .slice(0, LIMIT)
      .map((a) => ({
        ...a,
        // deep-links to that artist inside the user's own library, which is the
        // page the play count on the pill is actually counting
        url: `${profile}/library/music/${encodeURIComponent(a.name)}`,
      }));

    return jsonResponse({ profile, artists });
  } catch (err) {
    // Last.fm down, bad JSON, timeout -- the list just doesn't render.
    return jsonResponse(FAIL_SOFT_BODY);
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      // Top artists move slowly; an hour of cache is plenty.
      "Cache-Control": "max-age=3600",
    },
  });
}
