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

// Routes
import authRoutes from './routes/auth.js';
import guardianRoutes from './routes/guardian.js';
import tripRoutes from './routes/trip.js';
import telegramRoutes from './routes/telegram.js';

const app = express();
const httpServer = createServer(app);

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
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
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
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
app.get('/api/health', (req, res) =>
  res.json({
    status: 'ok',
    email: isEmailConfigured() ? 'configured' : 'not-configured',
    timestamp: new Date().toISOString(),
  })
);

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