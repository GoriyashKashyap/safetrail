import 'dotenv/config';
import {
  getBotUsername,
  getWebhookSecret,
  isTelegramConfigured,
  resolveWebhookUrl,
  setWebhook,
} from '../utils/telegram.js';

// Registers (or refreshes) the Telegram webhook that powers /status, /trips,
// /map and /stop inside the bot chat. Run after deploying, and again whenever
// SERVER_URL or TELEGRAM_WEBHOOK_SECRET changes:
//
//   npm run telegram:webhook
//
// Telegram requires a public HTTPS URL, so this cannot run against localhost.

if (!isTelegramConfigured()) {
  console.error('✗ TELEGRAM_BOT_TOKEN is not set — create a bot with @BotFather first.');
  process.exit(1);
}

const url = resolveWebhookUrl();

if (!url) {
  console.error('✗ A public webhook URL cannot be derived.');
  console.error('  Set SERVER_URL (e.g. https://safetrail-service.onrender.com) in');
  console.error('  server/.env, then run this script again. On Render, RENDER_EXTERNAL_URL');
  console.error('  is used automatically, so this script is normally unnecessary there.');
  process.exit(1);
}

const botUsername = await getBotUsername();
if (!botUsername) {
  console.error('✗ Could not reach the Telegram Bot API. Check TELEGRAM_BOT_TOKEN and network access.');
  process.exit(1);
}

console.log('\nSafeTrail Telegram webhook\n');
console.log('  bot    :', `@${botUsername}`);
console.log('  webhook:', url);
console.log('');

const result = await setWebhook(url, getWebhookSecret());

if (!result) {
  console.error('✗ Telegram rejected the webhook. HTTPS is required and the host must be reachable.');
  process.exit(1);
}

console.log('✓ Webhook registered. Open the bot and send /start to link your account.');
