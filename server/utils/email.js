import nodemailer from 'nodemailer';
import telegram from './telegram.js';
import { getAppUrl } from '../config/appUrl.js';

export const getSmtpConfig = () => {
  const port = Number(process.env.SMTP_PORT || 587);
  const secureEnv = process.env.SMTP_SECURE;
  const secure = secureEnv !== undefined && secureEnv !== ''
    ? String(secureEnv).toLowerCase() === 'true'
    : port === 465;

  return {
    host: process.env.SMTP_HOST || '',
    port,
    secure,
    requireTLS: String(process.env.SMTP_REQUIRE_TLS || '').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  };
};

/** True when the SMTP settings needed to send anything are present. */
export const isEmailConfigured = () => {
  const config = getSmtpConfig();
  return Boolean(config.host && config.user && config.pass);
};

const envMs = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const createTransporter = () => {
  const config = getSmtpConfig();
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // Nodemailer waits 2 minutes by default, which made a blocked SMTP port
    // look like a hung request. Fail fast instead; deliver() still retries.
    connectionTimeout: envMs('SMTP_CONNECTION_TIMEOUT', 15000),
    greetingTimeout: envMs('SMTP_GREETING_TIMEOUT', 10000),
    socketTimeout: envMs('SMTP_SOCKET_TIMEOUT', 20000),
    ...(config.requireTLS ? { requireTLS: true } : {}),
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
};

// Network hiccups and SMTP 4xx replies are transient: retrying usually succeeds.
const TRANSIENT_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNECTION', 'ESOCKET', 'EAI_AGAIN', 'EDNS', 'EPIPE']);
const RETRY_DELAYS_MS = [500, 2000];

const isTransient = (err) =>
  TRANSIENT_CODES.has(err?.code) ||
  (Number(err?.responseCode) >= 400 && Number(err?.responseCode) < 500);

const emailDetails = (message) => ({
  to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
  from: typeof message.from === 'string' ? message.from : message.from?.address,
  subject: message.subject,
});

const BASE_STYLES = `
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #0f172a;
`;

const emailWrapper = (title, content) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:#0d72c9;padding:28px 40px;">
            <span style="color:#fff;font-size:22px;font-weight:700;${BASE_STYLES}">
              🛡 SafeTrail
            </span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;${BASE_STYLES}">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              SafeTrail — Your safety, always tracked.<br>
              If you did not request this email, you can safely ignore it.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

/**
 * Send a message, optionally redirecting every recipient to EMAIL_TEST_TO.
 * This lets a capture inbox (e.g. testmail.app) receive mail that is addressed
 * to real user accounts, without changing the application flow.
 *
 * Every attempt is logged either with the provider's messageId (so the delivery
 * can be traced in the SMTP provider's log) or with the reason it failed, and
 * failures are rethrown so callers cannot mistake them for success.
 */
export const deliver = async (message) => {
  if (!isEmailConfigured()) {
    console.error('[email] FAILED — SMTP is not configured', emailDetails(message));
    throw new Error('SMTP_HOST, SMTP_USER and SMTP_PASS must be set in server/.env.');
  }

  const testTo = (process.env.EMAIL_TEST_TO || '').trim();
  const originalTo = Array.isArray(message.to) ? message.to.join(', ') : message.to;

  const finalMessage =
    testTo && originalTo !== testTo
      ? {
          ...message,
          to: testTo,
          subject: `[test → ${originalTo}] ${message.subject}`,
          headers: { ...(message.headers || {}), 'X-Original-To': originalTo },
        }
      : message;

  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const info = await createTransporter().sendMail(finalMessage);
      console.log('[email] sent', {
        ...emailDetails(finalMessage),
        ...(testTo && originalTo !== testTo ? { redirectedFrom: originalTo } : {}),
        messageId: info.messageId,
        response: info.response,
      });
      return info;
    } catch (err) {
      lastError = err;
      const delay = RETRY_DELAYS_MS[attempt];
      if (!isTransient(err) || delay === undefined) break;
      console.warn(
        `[email] transient failure (${err.code || err.responseCode}), retrying in ${delay}ms`,
        emailDetails(finalMessage)
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.error('[email] FAILED', {
    ...emailDetails(finalMessage),
    code: lastError?.code,
    responseCode: lastError?.responseCode,
    response: lastError?.response,
    error: lastError?.message,
  });
  throw lastError;
};

/** Verify the SMTP connection using the current environment. */
export const verifySmtp = async () => {
  const config = getSmtpConfig();
  if (!config.host || !config.user || !config.pass) {
    throw new Error('SMTP_HOST, SMTP_USER and SMTP_PASS must be set in server/.env.');
  }
  await createTransporter().verify();
  return config;
};

/** Send a plain test message (respects EMAIL_TEST_TO). */
export const sendTestEmail = (to) =>
  deliver({
    from: process.env.EMAIL_FROM,
    to: to || process.env.EMAIL_TEST_TO || process.env.SMTP_USER,
    subject: 'SafeTrail SMTP test',
    html: emailWrapper(
      'SafeTrail SMTP test',
      `
      <h2 style="margin:0 0 16px;font-size:22px;">SMTP is working 🎉</h2>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">
        This message was sent by the SafeTrail server at ${new Date().toLocaleString()}.
      </p>
      <p style="margin:0;font-size:13px;color:#94a3b8;">
        If you can read this in your capture inbox, verification, invite and alert
        emails will work too.
      </p>
      `
    ),
  });

// ── Verification email ──────────────────────────────────────────────────────
export const sendVerificationEmail = async (user, token) => {
  const verifyUrl = `${getAppUrl()}/verify-email?token=${token}`;
  const html = emailWrapper(
    'Verify your SafeTrail email',
    `
    <h2 style="margin:0 0 16px;font-size:24px;font-weight:700;">Welcome, ${user.name}!</h2>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
      You're one step away from keeping your loved ones informed every time you travel.
      Verify your email to activate your account.
    </p>
    <a href="${verifyUrl}" style="
      display:inline-block;background:#0d72c9;color:#fff;
      padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;
      text-decoration:none;margin-bottom:24px;">
      Verify my email
    </a>
    <p style="margin:0;font-size:13px;color:#94a3b8;">
      Link expires in 24 hours. Or paste this URL into your browser:<br>
      <a href="${verifyUrl}" style="color:#0d72c9;">${verifyUrl}</a>
    </p>
    `
  );
  // Send via e‑mail (unchanged)
  await deliver({
    from: process.env.EMAIL_FROM,
    to: user.email,
    subject: 'Verify your SafeTrail account',
    html,
  });
  // Also forward to Telegram if the user has subscribed
  if (user.telegramChatId) {
    await telegram.send(
      user.telegramChatId,
      `<b>🛡 Verify your SafeTrail email</b>\n\n${verifyUrl}`,
      true
    );
  }
};

// ── Password reset email ────────────────────────────────────────────────────
export const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${getAppUrl()}/reset-password?token=${token}`;
  const html = emailWrapper(
    'Reset your SafeTrail password',
    `
    <h2 style="margin:0 0 16px;font-size:24px;font-weight:700;">Reset your password</h2>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
      We received a request to reset the password for <strong>${user.email}</strong>.
      This link is valid for 1 hour.
    </p>
    <a href="${resetUrl}" style="
      display:inline-block;background:#0d72c9;color:#fff;
      padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;
      text-decoration:none;margin-bottom:24px;">
      Reset password
    </a>
    <p style="margin:0;font-size:13px;color:#94a3b8;">
      If you didn't request this, your password remains unchanged.
    </p>
    `
  );
  // Send via e‑mail (unchanged)
  await deliver({
    from: process.env.EMAIL_FROM,
    to: user.email,
    subject: 'SafeTrail password reset',
    html,
  });
  // Also forward to Telegram if the user has subscribed
  if (user.telegramChatId) {
    await telegram.send(
      user.telegramChatId,
      `<b>🔐 SafeTrail password reset</b>\n\n${resetUrl}`,
      true
    );
  }
};

// ── Guardian invite email ───────────────────────────────────────────────────
export const sendGuardianInviteEmail = async ({ toEmail, toName, travellerName, token }) => {
  const acceptUrl = `${getAppUrl()}/accept-guardian?token=${token}`;
  const html = emailWrapper(
    `${travellerName} added you as a safety guardian`,
    `
    <h2 style="margin:0 0 16px;font-size:24px;font-weight:700;">
      ${travellerName} wants you as their safety guardian
    </h2>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
      Hi ${toName || 'there'},<br><br>
      <strong>${travellerName}</strong> has added you as a trusted safety guardian on SafeTrail.
      You'll be able to see their live location while they travel and receive alerts if they're overdue.
    </p>
    <a href="${acceptUrl}" style="
      display:inline-block;background:#16a34a;color:#fff;
      padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;
      text-decoration:none;margin-bottom:24px;">
      Accept & view their trips
    </a>
    <p style="margin:0;font-size:13px;color:#94a3b8;">
      No account needed to accept. Link expires in 7 days.
    </p>
    `
  );
  // Send via e‑mail (unchanged)
  await deliver({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: `${travellerName} added you as their safety guardian on SafeTrail`,
    html,
  });
  // Telegram delivery for guardians lives in services/notify.js, which knows
  // the guardian's settings and permissions.
};

// ── SOS / Overdue alert email ───────────────────────────────────────────────
export const sendAlertEmail = async ({ toEmail, toName, travellerName, type, trip, location }) => {
  const isSOS = type === 'sos';
  const dashUrl = `${getAppUrl()}/guardian/trip/${trip._id}`;
  const mapsUrl = location
    ? `https://www.google.com/maps?q=${location.lat},${location.lng}`
    : null;
  const destination = trip.destination?.label || 'their destination';

  // One palette per event so the email always describes what actually happened.
  const variant = isSOS
    ? {
        bg: '#fef2f2',
        border: '#ef4444',
        heading: '#dc2626',
        label: '🚨 SOS Alert',
        lead: `<strong>${travellerName}</strong> has triggered an SOS on SafeTrail.`,
        subject: `🚨 SOS — ${travellerName} needs help`,
      }
    : type === 'arrived'
      ? {
          bg: '#f0fdf4',
          border: '#22c55e',
          heading: '#15803d',
          label: '✅ Arrived safely',
          lead: `<strong>${travellerName}</strong> reached <strong>${destination}</strong>.`,
          subject: `✅ ${travellerName} arrived safely — SafeTrail`,
        }
      : type === 'trip_started'
        ? {
            bg: '#eff6ff',
            border: '#3b82f6',
            heading: '#1d4ed8',
            label: '🚀 Trip started',
            lead: `<strong>${travellerName}</strong> started a trip to <strong>${destination}</strong>.`,
            subject: `🚀 ${travellerName} started a trip — SafeTrail`,
          }
        : {
            bg: '#fffbeb',
            border: '#f59e0b',
            heading: '#d97706',
            label: '⚠️ Check-in Overdue',
            lead: `<strong>${travellerName}</strong> has not checked in for their trip to <strong>${destination}</strong>.`,
            subject: `⚠️ ${travellerName} is overdue — SafeTrail`,
          };

  const html = emailWrapper(
    `${variant.label} — ${travellerName}`,
    `
    <div style="
      background:${variant.bg};
      border:2px solid ${variant.border};
      border-radius:8px;padding:20px;margin-bottom:24px;">
      <h2 style="margin:0 0 8px;color:${variant.heading};font-size:20px;">
        ${variant.label}
      </h2>
      <p style="margin:0;font-size:15px;color:#334155;">
        ${variant.lead}
      </p>
    </div>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;">
      Trip: <strong>${trip.title || destination}</strong><br>
      Started: ${new Date(trip.startTime).toLocaleString()}
    </p>
    ${
      mapsUrl
        ? `<a href="${mapsUrl}" style="display:inline-block;background:#f59e0b;color:#fff;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;margin-bottom:16px;">
            📍 View last known location
          </a><br>`
        : ''
    }
    <a href="${dashUrl}" style="
      display:inline-block;background:#0d72c9;color:#fff;
      padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;
      text-decoration:none;">
      Open Guardian Dashboard
    </a>
    `
  );

  return deliver({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: variant.subject,
    html,
    priority: isSOS ? 'high' : 'normal',
  });
};