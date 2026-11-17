import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Trip from '../models/Trip.js';
import Guardian from '../models/Guardian.js';
import Location from '../models/Location.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getAppUrl } from '../config/appUrl.js';
import {
  escapeHtml,
  getBotUsername,
  getWebhookInfo,
  getWebhookSecret,
  isTelegramConfigured,
  resolveWebhookUrl,
  sendLocation,
  sendMessage,
} from '../utils/telegram.js';

const router = Router();

const LINK_SCOPE = 'telegram-link';
const LINK_TTL_MS = 15 * 60 * 1000;

/**
 * Telegram only forwards a `?start=` value made of A-Z a-z 0-9 _ - and at most
 * 64 characters — a JWT (long, dot-separated) is dropped by the client, which
 * is why deep links did nothing. A 32-character hex code fits comfortably and
 * is also short enough to type by hand with /link.
 */
const issueLinkCode = async (userId) => {
  const code = crypto.randomBytes(16).toString('hex');
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        telegramLinkCode: code,
        telegramLinkExpires: new Date(Date.now() + LINK_TTL_MS),
      },
    }
  );
  return code;
};

const userFromCode = (code) =>
  code
    ? User.findOne({
        telegramLinkCode: code,
        telegramLinkExpires: { $gt: new Date() },
      })
    : null;

/** Links generated before the code switch carry a 15-minute JWT — still honoured. */
const userFromLegacyToken = async (token) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.scope !== LINK_SCOPE) return null;
    return await User.findById(payload.id);
  } catch {
    return null;
  }
};

/** Bind the chat and confirm it in the same conversation. */
const linkChat = async (chatId, user) => {
  await User.updateOne(
    { _id: user._id },
    {
      $set: { telegramChatId: String(chatId), 'settings.notifyByTelegram': true },
      $unset: { telegramLinkCode: '', telegramLinkExpires: '' },
    }
  );

  await sendMessage(
    chatId,
    [
      `👋 Connected to <b>${escapeHtml(user.name)}</b>'s SafeTrail account.`,
      '',
      'SOS, missed check-ins, check-ins and live position pins arrive here.',
      '',
      helpText(),
    ].join('\n'),
    { html: true, buttons: [[{ text: 'Open SafeTrail', url: getAppUrl() }]] }
  );
};

// ── GET /api/telegram/link — deep link that connects this account ────────────
router.get(
  '/link',
  protect,
  asyncHandler(async (req, res) => {
    if (!isTelegramConfigured()) {
      return res.status(503).json({ message: 'Telegram is not configured on the server.' });
    }
    const botUsername = await getBotUsername();
    if (!botUsername) {
      return res.status(502).json({ message: 'Could not reach the Telegram bot API.' });
    }

    const code = await issueLinkCode(req.user._id);

    res.json({
      botUsername,
      connected: Boolean(req.user.telegramChatId),
      // Telegram-safe: 32 characters of [0-9a-f], well inside its 64-char limit.
      code,
      deepLink: `https://t.me/${botUsername}?start=${code}`,
      // Fallback for a blocked bot or a client that mangles the deep link.
      command: `/link ${code}`,
      expiresInMinutes: LINK_TTL_MS / 60000,
    });
  })
);

const statusEmoji = { active: '🟢', overdue: '🟠', sos: '🚨', scheduled: '🕒', completed: '✅', cancelled: '⚪' };

const minutesUntil = (date) => {
  if (!date) return null;
  return Math.round((new Date(date).getTime() - Date.now()) / 60000);
};

// ── DELETE /api/telegram/link — disconnect this account ─────────────────────
router.delete(
  '/link',
  protect,
  asyncHandler(async (req, res) => {
    await User.updateOne(
      { _id: req.user._id },
      { $unset: { telegramChatId: '', telegramLinkCode: '', telegramLinkExpires: '' } }
    );
    res.json({ message: 'Telegram disconnected.' });
  })
);

// ── GET /api/telegram/status — why are (or aren't) commands working? ─────────
router.get(
  '/status',
  protect,
  asyncHandler(async (req, res) => {
    const configured = isTelegramConfigured();
    const info = configured ? await getWebhookInfo() : null;

    res.json({
      configured,
      connected: Boolean(req.user.telegramChatId),
      botUsername: configured ? await getBotUsername() : null,
      // 'enabled' means the server can derive a public URL for Telegram to POST
      // to. 'no-public-url' means commands cannot work until SERVER_URL is set
      // (Render supplies RENDER_EXTERNAL_URL automatically).
      commands: resolveWebhookUrl() ? 'enabled' : 'no-public-url',
      webhook: !configured ? 'unavailable' : info?.url ? 'registered' : 'missing',
      pendingUpdates: info?.pending_update_count ?? null,
      lastError: info?.last_error_message
        ? `${info.last_error_message} (${new Date((info.last_error_date || 0) * 1000).toISOString()})`
        : null,
    });
  })
);

// ── POST /api/telegram/test — prove delivery works end to end ───────────────
router.post(
  '/test',
  protect,
  asyncHandler(async (req, res) => {
    if (!isTelegramConfigured()) {
      return res.status(503).json({ message: 'Telegram is not configured on the server.' });
    }
    if (!req.user.telegramChatId) {
      return res.status(400).json({ message: 'Connect Telegram first, then send the test again.' });
    }

    const sent = await sendMessage(
      req.user.telegramChatId,
      [
        '<b>✅ SafeTrail test message</b>',
        `Sent ${new Date().toLocaleString()}.`,
        'Check-ins, SOS and missed check-ins will arrive in this chat.',
        '',
        helpText(),
      ].join('\n'),
      { html: true, buttons: [[{ text: 'Open SafeTrail', url: getAppUrl() }]] }
    );

    if (!sent) {
      return res.status(502).json({
        message:
          'Telegram rejected the message. Press /stop in the chat, reconnect from Settings, and try again.',
      });
    }

    res.json({ message: 'Test message sent — check your Telegram chat.' });
  })
);

// ── Helpers for the webhook ─────────────────────────────────────────────────

const tripsFor = async (user) => {
  const guardianships = await Guardian.find({ guardianUser: user._id, status: 'active' }).select(
    'traveller label'
  );
  const watchedIds = guardianships.map((g) => g.traveller);

  const [owned, watched] = await Promise.all([
    Trip.find({
      traveller: user._id,
      status: { $in: ['scheduled', 'active', 'overdue', 'sos'] },
    }).sort({ startTime: -1 }),
    watchedIds.length
      ? Trip.find({
          traveller: { $in: watchedIds },
          status: { $in: ['active', 'overdue', 'sos'] },
        })
          .populate('traveller', 'name')
          .sort({ startTime: -1 })
      : [],
  ]);

  return { owned, watched, guardianships };
};

const describeTrip = async (trip, { role, travellerName } = {}) => {
  const last = await Location.findOne({ trip: trip._id }).sort({ timestamp: -1 }).lean();
  const due = minutesUntil(trip.nextCheckInDue);
  const name = escapeHtml(travellerName || trip.traveller?.name || 'Traveller');
  const lines = [
    `${statusEmoji[trip.status] || '•'} <b>${name}</b> — ${String(trip.status).toUpperCase()}`,
    `   ${trip.origin?.label ? `${escapeHtml(trip.origin.label)} → ` : ''}${escapeHtml(
      trip.destination?.label || '—'
    )}`,
  ];
  if (trip.transport) {
    lines.push(
      `   ${escapeHtml(trip.transport)}${trip.transportRef ? ` · ${escapeHtml(trip.transportRef)}` : ''}`
    );
  }
  if (trip.lastCheckIn) lines.push(`   Last check-in: ${new Date(trip.lastCheckIn).toLocaleString()}`);
  if (due !== null) {
    lines.push(
      due >= 0 ? `   Next check-in in ${due} min` : `   <b>Overdue by ${Math.abs(due)} min</b>`
    );
  }
  if (last?.coordinates) {
    lines.push(
      `   Position: <a href="https://www.google.com/maps?q=${last.coordinates.lat},${last.coordinates.lng}">open map</a>`
    );
  }
  if (trip.status === 'sos' && trip.sos?.message) {
    lines.push(`   SOS: ${escapeHtml(trip.sos.message)}`);
  }
  lines.push(
    `   ${role === 'guardian' ? 'Live map' : 'Trip'}: ${getAppUrl()}${
      role === 'guardian' ? `/guardian/trip/${trip._id}` : `/trips/${trip._id}`
    }`
  );
  return lines.join('\n');
};

const helpText = () =>
  [
    '<b>SafeTrail bot</b>',
    '',
    '/status — live trips and their state',
    '/trips — your trips and the trips you guard',
    '/map — latest position of every live trip',
    '/stop — stop receiving Telegram alerts',
    '',
    `Dashboard: ${getAppUrl()}`,
  ].join('\n');

const handleCommand = async (chatId, text) => {
  const [rawCommand, ...args] = text.trim().split(/\s+/);
  const command = rawCommand.toLowerCase().replace(/@.*$/, '').split('?')[0];
  const appUrl = getAppUrl();

  if (command === '/start' || command === '/link') {
    const arg = args[0];

    if (arg) {
      const linked = (await userFromCode(arg)) || (await userFromLegacyToken(arg));
      if (linked) {
        await linkChat(chatId, linked);
        return;
      }
      await sendMessage(
        chatId,
        [
          'That connect code is invalid, already used, or older than 15 minutes.',
          '',
          'Open SafeTrail → Settings → Telegram → Connect for a fresh code, then send it here as /link &lt;code&gt;.',
        ].join('\n'),
        { html: true, buttons: [[{ text: 'Open SafeTrail', url: `${appUrl}/settings` }]] }
      );
      return;
    }

    const existing = await User.findOne({ telegramChatId: chatId });
    if (existing) {
      await sendMessage(
        chatId,
        `✅ This chat is already connected to <b>${escapeHtml(existing.name)}</b>.\n\n${helpText()}`,
        { html: true }
      );
      return;
    }

    await sendMessage(
      chatId,
      [
        '👋 Welcome to SafeTrail.',
        '',
        'To connect, open the app → Settings → Telegram → Connect and press Start,',
        'or send the code shown there as <code>/link &lt;code&gt;</code>.',
        '',
        helpText(),
      ].join('\n'),
      { html: true, buttons: [[{ text: 'Open SafeTrail', url: `${appUrl}/settings` }]] }
    );
    return;
  }

  const user = await User.findOne({ telegramChatId: chatId });
  if (!user) {
    await sendMessage(
      chatId,
      [
        'This chat is not linked.',
        '',
        'Open SafeTrail → Settings → Telegram → Connect, then press Start,',
        'or send the code shown there as <code>/link &lt;code&gt;</code>.',
      ].join('\n'),
      { html: true, buttons: [[{ text: 'Open Settings', url: `${appUrl}/settings` }]] }
    );
    return;
  }

  if (command === '/stop') {
    await User.updateOne({ _id: user._id }, { $unset: { telegramChatId: '' } });
    await sendMessage(
      chatId,
      [
        '🔕 Unsubscribed. You will no longer receive SafeTrail alerts here.',
        '',
        'Changed your mind? Open SafeTrail → Settings → Telegram → Connect,',
        'or send <code>/link &lt;code&gt;</code> with the code shown there.',
      ].join('\n'),
      { html: true, buttons: [[{ text: 'Open Settings', url: `${appUrl}/settings` }]] }
    );
    return;
  }

  if (command === '/help') {
    await sendMessage(chatId, helpText(), { html: true });
    return;
  }

  if (command === '/status') {
    const { owned, watched } = await tripsFor(user);
    const blocks = [];
    for (const trip of owned) blocks.push(await describeTrip(trip, { role: 'traveller' }));
    for (const trip of watched) {
      blocks.push(await describeTrip(trip, { role: 'guardian', travellerName: trip.traveller?.name }));
    }
    if (!blocks.length) {
      await sendMessage(chatId, 'No live trips right now. Create one in SafeTrail and start it.', {
        buttons: [[{ text: 'Open SafeTrail', url: appUrl }]],
      });
      return;
    }

    const buttons = [
      ...owned.slice(0, 2).map((trip) => [{ text: `Trip → ${trip.destination?.label || 'details'}`, url: `${appUrl}/trips/${trip._id}` }]),
      ...watched.slice(0, 2).map((trip) => [
        { text: `Live map → ${trip.traveller?.name || 'traveller'}`, url: `${appUrl}/guardian/trip/${trip._id}` },
      ]),
    ];

    await sendMessage(chatId, blocks.slice(0, 3).join('\n\n'), { html: true, buttons });
    return;
  }

  if (command === '/trips') {
    const owned = await Trip.find({ traveller: user._id }).sort({ startTime: -1 }).limit(5);
    const guardianships = await Guardian.find({ guardianUser: user._id, status: 'active' }).populate(
      'traveller',
      'name'
    );

    const lines = ['<b>Your recent trips</b>'];
    if (!owned.length) lines.push('— none yet —');
    for (const trip of owned) {
      lines.push(
        `${statusEmoji[trip.status] || '•'} ${escapeHtml(
          trip.destination?.label || 'Trip'
        )} · ${String(trip.status)} · ${new Date(trip.startTime).toLocaleDateString()}`
      );
    }
    lines.push('', '<b>People you guard</b>');
    if (!guardianships.length) lines.push('— nobody yet —');
    for (const g of guardianships) {
      lines.push(
        `• ${escapeHtml(g.traveller?.name || g.guestName || g.guestEmail || 'Traveller')} (${escapeHtml(
          g.label
        )})`
      );
    }

    await sendMessage(chatId, lines.join('\n'), { html: true });
    return;
  }

  if (command === '/map') {
    const { owned, watched } = await tripsFor(user);
    const live = [
      ...owned.filter((trip) => ['active', 'overdue', 'sos'].includes(trip.status)),
      ...watched,
    ];
    if (!live.length) {
      await sendMessage(chatId, 'No live trips to map.');
      return;
    }

    for (const trip of live.slice(0, 3)) {
      const last = await Location.findOne({ trip: trip._id }).sort({ timestamp: -1 }).lean();
      if (last?.coordinates) {
        await sendLocation(chatId, last.coordinates.lat, last.coordinates.lng);
      }
      const role = owned.some((t) => String(t._id) === String(trip._id)) ? 'traveller' : 'guardian';
      await sendMessage(chatId, await describeTrip(trip, { role }), {
        html: true,
        buttons: [
          [
            {
              text: 'Open live map',
              url: `${appUrl}${role === 'guardian' ? `/guardian/trip/${trip._id}` : `/trips/${trip._id}`}`,
            },
          ],
        ],
      });
    }
    return;
  }

  await sendMessage(chatId, `Unknown command.\n\n${helpText()}`, { html: true });
};

// ── POST /api/telegram/webhook/:secret — Bot API updates ────────────────────
router.post(
  '/webhook/:secret',
  asyncHandler(async (req, res) => {
    const secret = getWebhookSecret();
    const headerSecret = req.get('x-telegram-bot-api-secret-token');
    const authorized = secret && (req.params.secret === secret || headerSecret === secret);

    if (!authorized) {
      return res.status(404).json({ message: 'Not found.' });
    }

    // Answer Telegram immediately; work happens in the background.
    res.json({ ok: true });

    const message = req.body?.message;
    if (!message?.chat?.id || typeof message.text !== 'string') return;

    try {
      await handleCommand(String(message.chat.id), message.text);
    } catch (err) {
      console.error('[telegram] webhook handler failed:', err.message);
    }
  })
);

export default router;
