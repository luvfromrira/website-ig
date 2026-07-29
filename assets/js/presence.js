const LANYARD_USER_ID = '1190070053920591947';
const LANYARD_URL = `https://api.lanyard.rest/v1/users/${LANYARD_USER_ID}`;
const POLL_INTERVAL_MS = 30000;
const REQUEST_TIMEOUT_MS = 8000;

const VALID_STATUSES = new Set(['online', 'dnd', 'idle', 'offline']);
const SPOKEN_STATUS = {
  online: 'online',
  dnd: 'do not disturb',
  idle: 'idle',
  offline: 'offline',
};

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePresence(payload) {
  if (!payload?.success || !payload.data) return null;

  const data = payload.data;
  const status = VALID_STATUSES.has(data.discord_status)
    ? data.discord_status
    : 'offline';
  const activity = Array.isArray(data.activities)
    ? data.activities.find(({ type }) => type === 4)
    : null;
  const state = cleanString(activity?.state);
  const emojiName = cleanString(activity?.emoji?.name);
  const emojiId = /^\d+$/.test(activity?.emoji?.id || '') ? activity.emoji.id : '';
  const emojiAnimated = Boolean(activity?.emoji?.animated);

  return {
    status,
    customStatus: state || emojiName || emojiId ? {
      text: state,
      emoji: emojiId || emojiName ? {
        id: emojiId,
        name: emojiName,
        animated: emojiAnimated,
      } : null,
    } : null,
  };
}

export function customEmojiUrl(emoji) {
  if (!emoji?.id || !/^\d+$/.test(emoji.id)) return '';
  return `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'webp'}?size=32&quality=lossless`;
}

function renderPresence(view, elements) {
  const { root, label, divider, custom, emoji, text } = elements;
  const customStatus = view.customStatus;
  const hasCustomStatus = Boolean(customStatus);

  root.dataset.status = view.status;
  label.textContent = view.status;
  divider.hidden = !hasCustomStatus;
  custom.hidden = !hasCustomStatus;
  custom.title = customStatus?.text || '';
  text.textContent = customStatus?.text || '';
  emoji.replaceChildren();

  if (customStatus?.emoji) {
    const imageUrl = customEmojiUrl(customStatus.emoji);
    if (imageUrl) {
      const image = new Image(15, 15);
      image.src = imageUrl;
      image.alt = '';
      emoji.append(image);
    } else {
      emoji.textContent = customStatus.emoji.name;
    }
  }

  const accessibleCustom = [customStatus?.emoji?.name, customStatus?.text]
    .filter(Boolean)
    .join(' ');
  root.setAttribute(
    'aria-label',
    `Discord status: ${SPOKEN_STATUS[view.status]}` +
      (accessibleCustom ? `. Custom status: ${accessibleCustom}` : '') +
      ". Open Kitalina's Discord profile",
  );
  root.hidden = false;
}

function initPresence() {
  const elements = {
    root: document.getElementById('discordPresence'),
    label: document.getElementById('presenceLabel'),
    divider: document.getElementById('presenceDivider'),
    custom: document.getElementById('presenceCustom'),
    emoji: document.getElementById('presenceEmoji'),
    text: document.getElementById('presenceText'),
  };
  if (Object.values(elements).some((element) => !element)) return;

  let loading = false;

  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(LANYARD_URL, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Lanyard returned ${response.status}`);

      const view = normalizePresence(await response.json());
      if (view) renderPresence(view, elements);
      else elements.root.hidden = true;
    } catch (error) {
      // Presence is an enhancement. Keep the last good state on a temporary
      // network error, or remain hidden if Lanyard has not responded yet.
    } finally {
      clearTimeout(timeout);
      loading = false;
    }
  }

  refresh();
  setInterval(refresh, POLL_INTERVAL_MS);
  document.addEventListener('visibilitychange', refresh);
}

if (typeof document !== 'undefined') initPresence();
