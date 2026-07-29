import assert from 'node:assert/strict';
import test from 'node:test';

import { customEmojiUrl, normalizePresence } from '../assets/js/presence.js';

test('normalizes a live Lanyard custom status alongside Discord dnd', () => {
  const result = normalizePresence({
    success: true,
    data: {
      discord_status: 'dnd',
      activities: [{ id: 'custom', name: 'Custom Status', state: 'test', type: 4 }],
    },
  });

  assert.deepEqual(result, {
    status: 'dnd',
    customStatus: { text: 'test', emoji: null },
  });
});

test('supports emoji-only custom statuses and Discord custom emoji images', () => {
  const result = normalizePresence({
    success: true,
    data: {
      discord_status: 'online',
      activities: [{
        type: 4,
        state: null,
        emoji: { id: '123456789012345678', name: 'wave', animated: true },
      }],
    },
  });

  assert.deepEqual(result.customStatus, {
    text: '',
    emoji: { id: '123456789012345678', name: 'wave', animated: true },
  });
  assert.equal(
    customEmojiUrl(result.customStatus.emoji),
    'https://cdn.discordapp.com/emojis/123456789012345678.gif?size=32&quality=lossless',
  );
});

test('fails closed for an unmonitored Lanyard user and unknown statuses', () => {
  assert.equal(normalizePresence({ success: false }), null);
  assert.equal(normalizePresence(null), null);
  assert.equal(normalizePresence({
    success: true,
    data: { discord_status: 'unknown', activities: [] },
  }).status, 'offline');
});

test('preserves every Discord presence state exposed by Lanyard', () => {
  for (const status of ['online', 'dnd', 'idle', 'offline']) {
    assert.equal(normalizePresence({
      success: true,
      data: { discord_status: status, activities: [] },
    }).status, status);
  }
});
