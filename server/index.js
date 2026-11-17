import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import connectDB from './models/db.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { initSocketHandlers } from './middleware/handlers.js';
import { startWatchdog } from './jobs/checkinWatchdog.js';
import { isEmailConfigured, verifySmtp } from './utils/email.js';
import { ensureWebhook, isTelegramConfigured, resolveWebhookUrl } from './utils/telegram.js';

// Routes
import authRoutes from './routes/auth.js';
import guardianRoutes from './routes/guardian.js';
import tripRoutes from './routes/trip.js';
import telegramRoutes from './routes/telegram.js';

const app = express();
const httpServer = createServer(app);

// Render (and any other reverse proxy) terminates TLS and forwards the client
// address in X-Forwarded-For. Without this express-rate-limit warns about the
// header and throttles every visitor under the proxy's single IP.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// CLIENT_URL accepts a comma-separated list so one deployment can serve the
// local Vite dev server and the hosted frontend at the same time. Entries may
// use a wildcard (e.g. https://*.vercel.app), which matters because Vercel
// gives every deployment its own hostname.
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const escapeRegex = (value) => value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

const isAllowedOrigin = (origin) =>
  allowedOrigins.some((allowed) => {
    if (!allowed.includes('*')) return allowed === origin;
    const pattern = new RegExp(`^${escapeRegex(allowed).replace(/\*/g, '.*')}$`);
    return pattern.test(origin);
  });

// Requests without an Origin header (curl, Render health checks, server-side
// callers) are always allowed; browser origins must match the list.
const corsOrigin = (origin, callback) => {
  if (!origin || isAllowedOrigin(origin)) return callback(null, true);
  console.warn(`[cors] blocked origin: ${origin}`);
  return callback(null, false);
};

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Make io accessible in route handlers via app.get('io')
app.set('io', io);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Global rate limiter — 200 req / 15 min per IP
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { message: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Stricter limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many login attempts. Please wait 15 minutes.' },
});

// ── Routes ────────────────────────────────────────────────────────────────────
// Landing route: the API has no UI, so a bare visit to the deployed host would
// otherwise return 404 and look like an outage.
app.get('/', (req, res) =>
  res.json({
    service: 'SafeTrail API',
    status: 'ok',
    health: '/api/health',
    endpoints: ['/api/auth', '/api/guardians', '/api/trips', '/api/telegram'],
  })
);

// Browsers request this automatically; answer it so logs stay readable.
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/api/health', (req, res) =>
  res.json({
    status: 'ok',
    // Render sets RENDER_GIT_COMMIT, so a deploy can be confirmed instead of
    // guessed at (a stale instance silently keeps serving the old code).
    build: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || 'development',
    email: isEmailConfigured() ? 'configured' : 'not-configured',
    telegram: isTelegramConfigured() ? 'configured' : 'not-configured',
    telegramCommands: resolveWebhookUrl() ? 'enabled' : 'no-public-url',
    timestamp: new Date().toISOString(),
  })
);

app.get('/api/test', (req, res) => {
  res.json({ message: 'Test route works!' });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/guardians', guardianRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/telegram', telegramRoutes);

// ── 404 + Error Handlers ──────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Boot ───────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  initSocketHandlers(io);
  startWatchdog(io);

  // Fail loudly at boot instead of silently dropping verification, reset,
  // invite and alert emails later.
  if (!isEmailConfigured()) {
    console.error(`
✗  Email is NOT configured
   Verification, password reset, guardian invite and alert emails will fail.
   Set SMTP_HOST, SMTP_USER and SMTP_PASS in server/.env (see .env.example).
`);
  } else {
    verifySmtp()
      .then((config) => console.log(`✓ Email  : SMTP ${config.host}:${config.port} reachable`))
      .catch((err) => console.error(`✗ Email  : SMTP check failed — ${err.message}`));
  }

  if (!isTelegramConfigured()) {
    console.warn(`
✗  Telegram is NOT configured
   Guardians will only get in-app (socket) and email alerts.
   Set TELEGRAM_BOT_TOKEN in server/.env (see .env.example).
`);
  } else if (!resolveWebhookUrl()) {
    console.log('✓ Telegram : bot configured (commands need a public SERVER_URL)');
  } else {
    // Idempotent: refreshes the webhook so bot commands keep working after a
    // deploy that changed the public hostname. A free host often answers the
    // first outbound call while still waking up, so one retry is attempted.
    const register = (attempt = 1) =>
      ensureWebhook()
        .then((ok) => {
          if (ok) {
            console.log('✓ Telegram : bot + webhook ready');
            return;
          }
          if (attempt < 2) {
            console.warn('… Telegram : webhook registration failed, retrying in 30s');
            setTimeout(() => register(attempt + 1), 30000);
            return;
          }
          console.error('✗ Telegram : webhook registration failed — check SERVER_URL / TELEGRAM_WEBHOOK_SECRET');
        })
        .catch((err) => console.error(`✗ Telegram : ${err.message}`));

    register();
  }

  httpServer.listen(PORT, () => {
    console.log(`
🛡  SafeTrail server running
    ├─ HTTP  : http://localhost:${PORT}
    ├─ WS    : ws://localhost:${PORT}
    └─ Env   : ${process.env.NODE_ENV || 'development'}
    `);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

