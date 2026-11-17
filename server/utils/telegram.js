import 'dotenv/config';
import crypto from 'crypto';

const token = process.env.TELEGRAM_BOT_TOKEN;
const API = token ? `https://api.telegram.org/bot${token}` : null;

let cachedUsername = process.env.TELEGRAM_BOT_USERNAME || null;

export const isTelegramConfigured = () => Boolean(API);

/**
 * Escapes user-controlled text before it is sent with parse_mode=HTML.
 * An unescaped `<` or `&` makes Telegram reject the whole message with 400.
 */
export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Secret that authenticates the webhook path. TELEGRAM_WEBHOOK_SECRET wins;
 * otherwise a value derived from the bot token is used, so a deployment works
 * without extra configuration (only the server knows the bot token).
 */
export const getWebhookSecret = () =>
  process.env.TELEGRAM_WEBHOOK_SECRET ||
  (token ? crypto.createHash('sha256').update(`safetrail-webhook:${token}`).digest('hex') : '');

/** Low-level Bot API call. Returns the `result` field, or null on failure. */
const call = async (method, payload) => {
  if (!API) {
    console.warn('[telegram] disabled — TELEGRAM_BOT_TOKEN not set');
    return null;
  }
  try {
    const response = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false) {
      console.error(`[telegram] ${method} failed`, {
        status: response.status,
        description: data?.description,
      });
      return null;
    }
    return data.result;
  } catch (err) {
    console.error(`[telegram] ${method} error`, err.message);
    return null;
  }
};

/**
 * Send a text message.
 * @param {string|number} chatId
 * @param {string} text
 * @param {{html?: boolean, buttons?: Array<Array<{text: string, url: string}>>}} options
 */
export const sendMessage = (chatId, text, { html = false, buttons = null } = {}) =>
  call('sendMessage', {
    chat_id: chatId,
    text,
    ...(html ? { parse_mode: 'HTML', link_preview_options: { is_disabled: false } } : {}),
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });

/** Drop a pin. Telegram has no live-location API for bots, so the pin is a snapshot. */
export const sendLocation = (chatId, lat, lng) =>
  call('sendLocation', { chat_id: chatId, latitude: Number(lat), longitude: Number(lng) });

export const getBotUsername = async () => {
  if (cachedUsername) return cachedUsername;
  const me = await call('getMe', {});
  cachedUsername = me?.username || null;
  return cachedUsername;
};

export const setWebhook = (url, secretToken) =>
  call('setWebhook', {
    url,
    secret_token: secretToken || undefined,
    allowed_updates: ['message'],
  });

export const deleteWebhook = () => call('deleteWebhook', {});

/**
 * What Telegram currently believes about this bot's webhook. `last_error_message`
 * is the single most useful field when commands "do nothing": it reveals a
 * rejected secret, a DNS failure or a sleeping host.
 */
export const getWebhookInfo = () => call('getWebhookInfo', {});

/**
 * Public URL Telegram should POST updates to, or null when it cannot be
 * derived (local development with no public SERVER_URL).
 */
export const resolveWebhookUrl = () => {
  const secret = getWebhookSecret();
  const base = (process.env.SERVER_URL || process.env.RENDER_EXTERNAL_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!secret || !base) return null;
  return `${base}/api/telegram/webhook/${secret}`;
};

/** Register the webhook at boot so commands work after every deploy. */
export const ensureWebhook = async () => {
  const url = resolveWebhookUrl();
  if (!url || !API) return null;
  return setWebhook(url, getWebhookSecret());
};

// Back-compat: older callers use telegram.send(chatId, text, html)
const telegram = {
  send: (chatId, text, html = false) => sendMessage(chatId, text, { html: Boolean(html) }),
  sendMessage,
  sendLocation,
  getBotUsername,
  isTelegramConfigured,
};

export default telegram;
