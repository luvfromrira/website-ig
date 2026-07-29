// functions/api/nowplaying.js
//
// Cloudflare Pages Function backing the "now playing" widget.
//
//  1. Ask Last.fm for the user's most recent track (user.getrecenttracks, limit=1).
//  2. If Last.fm gives us a track, look it up on Deezer to grab a 30s preview
//     MP3 URL, since Deezer's public search API doesn't send CORS headers and
//     can't be called directly from the browser.
//  3. Return a small, safe-to-cache JSON blob to the frontend. The Last.fm API
//     key never leaves this function.
//
// Required environment variables (set in the Cloudflare Pages project):
//   LASTFM_API_KEY
//   LASTFM_USER

const FAIL_SOFT_BODY = { nowplaying: false };

export async function onRequestGet(context) {
  const { env } = context;

  try {
    if (!env.LASTFM_API_KEY || !env.LASTFM_USER) {
      return jsonResponse(FAIL_SOFT_BODY);
    }

    const track = await getRecentTrack(env.LASTFM_API_KEY, env.LASTFM_USER);
    if (!track) {
      return jsonResponse(FAIL_SOFT_BODY);
    }

    const nowplaying = track["@attr"]?.nowplaying === "true";
    const title = track.name || "";
    const artist = track.artist?.["#text"] || track.artist?.name || "";
    const art = pickArt(track.image);

    if (!title || !artist) {
      return jsonResponse(FAIL_SOFT_BODY);
    }

    const preview = await findDeezerPreview(title, artist);

    return jsonResponse({
      nowplaying,
      title,
      artist,
      art,
      preview,
    });
  } catch (err) {
    // Any upstream hiccup (Last.fm down, Deezer down, bad JSON, etc.) fails soft.
    return jsonResponse(FAIL_SOFT_BODY);
  }
}

async function getRecentTrack(apiKey, user) {
  const url =
    "https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks" +
    `&user=${encodeURIComponent(user)}` +
    `&api_key=${encodeURIComponent(apiKey)}` +
    "&format=json&limit=1";

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  const track = data?.recenttracks?.track?.[0];
  return track || null;
}

function pickArt(images) {
  if (!Array.isArray(images) || images.length === 0) return "";
  const bySize = (size) => images.find((img) => img.size === size)?.["#text"];
  return (
    bySize("extralarge") ||
    bySize("large") ||
    bySize("medium") ||
    images[images.length - 1]?.["#text"] ||
    ""
  );
}

async function findDeezerPreview(title, artist) {
  const direct = await deezerSearch(title, artist);
  if (direct) return direct;

  // Retry once with parentheticals (remixes, "feat. ..." etc.) stripped out,
  // since exact-match searches on the raw scrobble title often miss.
  const strippedTitle = stripNoise(title);
  const strippedArtist = stripNoise(artist);

  if (strippedTitle !== title || strippedArtist !== artist) {
    const retry = await deezerSearch(strippedTitle, strippedArtist);
    if (retry) return retry;
  }

  return "";
}

function stripNoise(str) {
  return str
    .replace(/\(feat\.?[^)]*\)/gi, "")
    .replace(/\[feat\.?[^\]]*\]/gi, "")
    .replace(/feat\.?.*/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function deezerSearch(title, artist) {
  if (!title || !artist) return "";

  try {
    const q = `artist:"${artist}" track:"${title}"`;
    const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=1`;

    const res = await fetch(url);
    if (!res.ok) return "";

    const data = await res.json();
    return data?.data?.[0]?.preview || "";
  } catch (err) {
    return "";
  }
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "max-age=30",
    },
  });
}
