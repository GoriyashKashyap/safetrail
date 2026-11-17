# 🛡 SafeTrail

**SafeTrail** is a real-time travel-safety platform. A traveller registers a trip, checks in periodically while moving, and shares live location, trip status, and emergency alerts with a small circle of trusted **guardians** (family or friends). If the traveller misses a check-in, SafeTrail automatically flags the trip as overdue and notifies the guardians over real-time sockets, email and Telegram. A one-tap **SOS** escalates immediately.

The repository is a JavaScript monorepo with two independent packages:

| Package | Path | Stack | Purpose |
| --- | --- | --- | --- |
| `safetrail-server` | `server/` | Node.js, Express, MongoDB/Mongoose, Socket.IO | REST API, authentication, live tracking, background watchdog, email |
| `safetrail-client` | `client/` | React 18, Vite, Tailwind CSS, React Router, Leaflet, Socket.IO client | Web UI: auth, dashboard, trip planning, live map, check-in/SOS, guardian management, guardian watch view |

---

## Table of contents

- [What the project does](#-what-the-project-does)
- [Core concepts](#-core-concepts)
- [Features](#-features)
- [Architecture](#-architecture)
- [Technology stack](#-technology-stack)
- [Directory structure](#-directory-structure)
- [Data models](#-data-models)
- [REST API reference](#-rest-api-reference)
- [Real-time API (Socket.IO)](#-real-time-api-socketio)
- [Check-in watchdog](#-check-in-watchdog)
- [Security](#-security)
- [Environment variables](#-environment-variables)
- [Getting started](#-getting-started)
- [User flows](#-user-flows)
- [Current state & known gaps](#-current-state--known-gaps)
- [Possible next steps](#-possible-next-steps)

---

## 🎯 What the project does

Solo and vulnerable travellers often want someone to know where they are and that they arrived safely, without constant manual messaging. SafeTrail automates this:

1. The traveller schedules a trip (origin, destination, transport, start and arrival times, and a check-in interval).
2. They invite up to five guardians by email. A guardian can be an existing SafeTrail user or someone with no account at all.
3. When the trip starts, the traveller sends periodic **check-ins** and optional background GPS pings.
4. Guardians watch a live map of the trip and receive real-time events: trip started, new check-in, location update, overdue alert, SOS, and trip completed.
5. If a check-in does not arrive in time, a cron-driven watchdog marks the trip `overdue` and alerts every active guardian by socket and email.
6. If something goes wrong, the traveller presses SOS; the trip enters `sos` status and guardians get a critical alert with coordinates.

---

## 🧩 Core concepts

**Traveller** — a registered `User` who owns trips.

**Guardian** — a trusted contact attached to a traveller (`Guardian` document). It may point at a registered user (`guardianUser`) or hold guest contact details (`guestEmail`, `guestName`, `guestPhone`). Guardians have granular permissions: `viewLiveLocation`, `receiveAlerts`, `viewTripHistory`, `sendNudge`. Their lifecycle is `pending → active` (or `declined` / `removed`); a guardianship for an existing account starts `active`. An invite token is valid for 7 days.

**Trip** — a journey with a status machine:
`scheduled → active → completed`, with `overdue` and `sos` as exceptional states, and `cancelled` for scheduled trips that are deleted.

**Check-in** — a confirmation that the traveller is safe, optionally carrying coordinates and a short note. Each check-in resets `nextCheckInDue = now + checkInInterval`.

**Alert** — an auditable record of a notification (`sos`, `overdue`, `arrived`, `trip_started`, `guardian_nudge`) with severity, location, delivery channels used, and guardians notified.

**Location ping** — a GPS sample stored per trip (`Location` model) and broadcast to anyone in the trip's real-time room.

**Rooms** — Socket.IO rooms namespace real-time traffic:
`trip:<tripId>` for a traveller plus all guardians of that trip, and `user:<userId>` for direct messages to one person.

---

## ✨ Features

### Authentication & account
- Email/password registration with server-side validation (`express-validator`).
- bcrypt password hashing (cost factor 12) via a Mongoose `pre('save')` hook.
- JWT bearer authentication (`signToken`, `protect` middleware), 7-day expiry by default.
- Email verification with a 32-byte random token, valid 24 hours, plus a resend endpoint.
- Password reset with a 1-hour token; the endpoint always returns the same message to prevent email enumeration.
- Profile update restricted to a whitelist of fields (`name`, `phone`, `settings`).
- Per-user settings: default check-in interval (15/30/60 min), alert buffer minutes, and email/SMS/push notification toggles.
- `lastSeen` tracking on login.

### Guardians
- Invite by email; auto-links to an existing account or stores guest details.
- **A registered invitee is activated immediately** (the traveller picked them on purpose) and attached to any trip already in progress, so a guardian added mid-trip sees that trip at once. Guest invites stay `pending` until they open the accept link or sign up; invitations addressed to the signed-in account are claimed automatically on first visit.
- Self-invite blocked; maximum of 5 pending/active guardians per traveller.
- Duplicate-invite protection via **partial** unique indexes on traveller+user and traveller+email (a traveller can have several registered guardians and several guest guardians).
- Tokenised accept link that needs no login and expires after 7 days; pending invitations can also be accepted or declined in-app.
- Editable label (e.g. "Mom", "Best Friend") and permissions.
- Soft removal via `status: 'removed'`.
- `GET /api/guardians/watching` lists **everyone the user guards** together with `activeTrip` — the person's current live trip, if any — so the guardian always knows who they monitor.
- New guardians are announced over sockets (`guardian:added`) and Telegram when they have a linked chat.

### Trips & live tracking
- Create, list (paginated, filterable by status), fetch, start, check in, complete, and cancel trips.
- Start requires `scheduled` status and initialises `lastCheckIn`/`nextCheckInDue`.
- Check-ins accept `lat`, `lng`, `note`, and `battery`; a GPS check-in also stores a `Location` record.
- Overdue trips can be checked in again, which resets them to `active`.
- Background location endpoint accepts accuracy, speed, heading, altitude, and battery, broadcasts to the trip room, and is accessible while `active`, `overdue`, or `sos`.
- Trip creation only attaches the traveller's **active** guardians (optionally narrowed by `guardianIds`).
- Every state change broadcasts a Socket.IO event to the trip room.

### Safety & alerts
- SOS transitions the trip to `sos`, records an `Alert` with `critical` severity, and notifies guardians over three channels — socket (trip room **and** each guardian's personal room), email with a maps link, and Telegram — without blocking the HTTP response, so a slow SMTP host cannot delay the alarm.
- The same fan-out (`services/notify.js`) covers trip started, missed check-in (watchdog) and arrived-safely, so every event has one consistent set of channels and one `Alert` record listing the guardians reached.
- Watchdog cron (every 5 minutes) detects missed check-ins, marks trips overdue, and notifies guardians and the traveller.
- Guardians can "nudge" a traveller over sockets; the traveller receives a direct message in their personal room.
- Email templates (responsive HTML) for verification, password reset, guardian invite, and trip-started/overdue/arrived/SOS alerts — each with its own copy, colour and maps link.

### Telegram bot
Guardians (and travellers) can follow everything from a chat, with no app open:

- **Connect**: `Settings → Telegram → Connect` calls `GET /api/telegram/link`, which returns a `t.me/<bot>?start=<code>` deep link plus the same code. The code is 32 hex characters valid for 15 minutes, because Telegram only forwards `?start=` values made of `A-Za-z0-9_-` and at most 64 characters — a JWT would be silently dropped. Pressing **Start** binds `telegramChatId` to the account; `/link <code>` typed in the chat does the same when the deep link cannot be used (blocked bot, unusual client).
- **Commands**: `/status` (live trips plus check-in state), `/map` (a pin for the latest position of every live trip), `/trips` (recent trips and the people you guard), `/link <code>` (connect), `/stop` (unlink), `/help`.
- **Push alerts**: SOS, missed check-in, trip started and arrived are sent with route, transport, status, last/next check-in, a maps link and an inline "Open live map" button.
- **Live feed**: every `TELEGRAM_FEED_MINUTES` (default 3) a background GPS ping also sends a location pin plus a maps link to guardians who may view live location. Telegram bots cannot stream a live location, so the pin is a snapshot and the button opens the real map.
- **Webhook**: `npm run telegram:webhook` registers `<SERVER_URL|RENDER_EXTERNAL_URL>/api/telegram/webhook/<secret>`; the server also registers it at boot (with one retry), so a normal deploy is enough. The secret is `TELEGRAM_WEBHOOK_SECRET` when set, otherwise one derived from the bot token (only the server knows it). Requests without the secret are answered `404`.
- **Diagnostics**: `GET /api/telegram/status` reports `configured`, `connected`, `botUsername`, `commands: "enabled" | "no-public-url"`, `webhook: "registered" | "missing" | "unavailable"`, `pendingUpdates` (commands queued at Telegram because nothing was listening) and `lastError`. `POST /api/telegram/test` sends a real test message to the linked chat. Both are surfaced in `Settings → Telegram`, and `/api/health` also reports `telegramCommands`.
- **Check-ins**: every check-in refreshes guardians in-app (trip room + each guardian's personal room) and confirms it in their Telegram chat (time, next check-in, note, position, live-map button) — without adding an email or an `Alert` per check-in.

---

## 🏗 Architecture

```
┌──────────────────────────────┐        ┌───────────────────────────────────────────┐
│  React client (Vite, :5173)  │        │  Express + Socket.IO server (:5000)       │
│                              │        │                                           │
│  React Router · Tailwind     │──REST──▶  /api/auth · /api/guardians · /api/trips   │
│  Leaflet map · socket.io-    │        │  JWT protection · rate limiting · Helmet   │
│  client (token in handshake) │◀──WS───▶  Rooms: trip:<id>, user:<id>                │
└──────────────────────────────┘        └───────────────┬───────────────────────────┘
                                                        │ Mongoose
                                                        ▼
                                            ┌───────────────────────┐
                                            │  MongoDB "safetrail"  │
                                            │  users, trips,        │
                                            │  guardians, alerts,   │
                                            │  locations            │
                                            └───────────────────────┘

  node-cron watchdog (every 5 min) ──▶ overdue trips ──▶ socket + email alerts
```

The HTTP server is created explicitly (`createServer(app)`) so Express and Socket.IO share one port. The `io` instance is attached to the Express app (`app.set('io', io)`) so REST handlers can emit events.

The Vite dev server proxies `/api` and `/socket.io` (with WebSocket upgrade) to `localhost:5000`, so the client can use relative URLs in development.

---

## 🧰 Technology stack

### Server
| Concern | Library |
| --- | --- |
| HTTP framework | `express` 4 |
| Database / ODM | `mongoose` 8 |
| Real-time | `socket.io` 4 |
| Auth | `jsonwebtoken`, `bcryptjs` |
| Validation | `express-validator` |
| Email | `nodemailer` (SMTP) |
| Scheduling | `node-cron` |
| Security hardening | `helmet`, `express-rate-limit`, `cors` |
| Logging | `morgan` |
| Config | `dotenv` |
| IDs / tokens | `uuid`, Node `crypto` |
| Dev reload | `nodemon` |

### Client
| Concern | Library |
| --- | --- |
| UI | `react` 18, `react-dom` |
| Build tool | `vite` 5 with `@vitejs/plugin-react` |
| Routing | `react-router-dom` 6 |
| Styling | `tailwindcss` 3, `autoprefixer`, `postcss` |
| HTTP | `axios` |
| Maps | `leaflet`, `react-leaflet` |
| Real-time | `socket.io-client` 4 |
| Icons | `lucide-react` |

Module system is native ESM (`"type": "module"`) in both packages.

---

## 📁 Directory structure

```
.
├── README.md
├── client/                        # React + Vite frontend
│   ├── index.html                 # HTML shell, fonts, Leaflet CSS, #root
│   ├── package.json
│   ├── vite.config.js             # port 5173, /api and /socket.io proxy
│   ├── tailwind.config.js         # shield / pulse / safe / warn / danger palettes
│   ├── postcss.config.js
│   ├── public/
│   │   └── shield.svg             # favicon
│   └── src/
│       ├── main.jsx               # React entry point + providers
│       ├── App.jsx                # route table (public, traveller, guardian)
│       ├── index.css              # Tailwind layers + design-system component classes
│       ├── components/
│       │   ├── auth/              # ProtectedRoute, AuthLayout
│       │   ├── layout/            # AppShell (header + responsive nav)
│       │   ├── ui/                # Banner, Countdown, StatusBadge, Loading/EmptyState
│       │   ├── LiveMap.jsx        # Leaflet map with trail polyline + status marker
│       │   └── TripCard.jsx
│       ├── pages/                 # auth, dashboard, trips, guardians, watching, settings
│       ├── context/               # AuthContext (session + shared socket)
│       ├── hooks/                 # useGeolocation, useSocketEvent
│       ├── services/              # api (axios + JWT), socket (socket.io-client)
│       └── utils/                 # formatting, countdowns, status metadata
└── server/                        # Express + Socket.IO backend
    ├── index.js                   # app bootstrap, middleware, routes, listen
    ├── package.json
    ├── models/
    │   ├── db.js                  # Mongoose connection + SIGINT shutdown
    │   ├── User.js                # User schema (bcrypt, settings)
    │   ├── Trip.js                # Trip + embedded check-ins
    │   ├── Guardian.js            # Guardian + invite flow + permissions
    │   ├── Alert.js               # Alert audit records
    │   └── Location.js            # GPS pings + check-in positions
    ├── routes/
    │   ├── auth.js                # register/login/me/verify/reset/profile
    │   ├── guardian.js            # invite/list/accept/update/remove/watching
    │   └── trip.js                # CRUD + start/checkin/location/sos/complete
    ├── middleware/
    │   ├── auth.js                # JWT protect + signToken
    │   ├── handlers.js            # Socket.IO auth, rooms, events
    │   └── errorHandler.js        # asyncHandler, errorHandler, notFound
    ├── jobs/
    │   └── checkinWatchdog.js     # node-cron overdue detector + alert chain
    └── utils/
        └── email.js               # Nodemailer transporter + HTML templates
```

---

## 🗃 Data models

### `User` (`server/models/User.js`)
| Field | Type / rules |
| --- | --- |
| `name` | String, required, 2–60 chars |
| `email` | String, required, unique, lowercase, email regex |
| `phone` | String, optional, E.164-ish regex `^\+?[1-9]\d{6,14}$` |
| `password` | String, required, min 8, `select: false`, bcrypt-hashed (cost 12) |
| `avatar` | String, nullable |
| `isVerified` | Boolean, default `false` |
| `emailVerificationToken` / `Expires` | hidden (`select: false`) |
| `passwordResetToken` / `Expires` | hidden (`select: false`) |
| `settings.defaultCheckInInterval` | 15 / 30 / 60, default 30 |
| `settings.alertBuffer` | Number of extra minutes, default 10 |
| `settings.notifyByEmail` / `notifyBySMS` / `notifyByPush` | Booleans, default `true` |
| `lastSeen` | Date |
| `createdAt` / `updatedAt` | Timestamps |

Methods: `comparePassword(candidate)`, `touchLastSeen()`. `toJSON` strips `password` and `__v`.

### `Trip` (`server/models/Trip.js`)
| Field | Type / rules |
| --- | --- |
| `traveller` | ObjectId → User, required |
| `title` | String, max 100, default "My Trip" |
| `origin` | `{ label, lat, lng }` |
| `destination` | `{ label (required), lat, lng }` |
| `transport` | `train \| bus \| car \| flight \| other` |
| `transportRef` | String, max 40 (train no., flight no., plate…) |
| `startTime`, `estimatedArrival` | Dates, required; arrival must be after start |
| `arrivedAt` | Date or null |
| `status` | `scheduled \| active \| completed \| sos \| overdue \| cancelled` |
| `checkInInterval` | 15 / 30 / 60 minutes, default 30 |
| `lastCheckIn` | Date or null |
| `checkIns[]` | `{ confirmedAt, lat, lng, note (max 200) }`, no sub-`_id` |
| `guardians[]` | ObjectIds → Guardian |
| `sos` | `{ triggeredAt, lat, lng, message (max 500), resolvedAt, resolvedBy }` |
| `nextCheckInDue` | Date driving the watchdog |
| `archivedAt` | Date (reserved for 30-day cleanup; no cleanup job exists yet) |

Indexes: `{ status, nextCheckInDue }` (watchdog), `{ traveller, status }`.

### `Guardian` (`server/models/Guardian.js`)
| Field | Type / rules |
| --- | --- |
| `traveller` | ObjectId → User, required |
| `guardianUser` | ObjectId → User or null |
| `guestEmail` / `guestName` / `guestPhone` | unregistered-guardian contact details |
| `inviteToken` / `inviteExpires` | hidden, 7-day invite |
| `status` | `pending \| active \| declined \| removed` |
| `permissions` | `{ viewLiveLocation, receiveAlerts, viewTripHistory, sendNudge }`, all default `true` |
| `label` | String, max 30, default "Guardian" |
| `acceptedAt` | Date or null |

Unique sparse indexes prevent duplicate guardians per traveller. Virtual `displayName` resolves to the linked user's name, else guest name/email, else "Guardian".

### `Alert` (`server/models/Alert.js`)
`trip`, `traveller`, `type` (`sos \| overdue \| arrived \| trip_started \| guardian_nudge`), `severity` (`info \| warning \| critical`), `message`, `location {lat,lng}`, `channels {email,sms,push,socket}`, `notifiedGuardians[]`, `acknowledged`, `acknowledgedBy`, `acknowledgedAt`. Indexes on `{ trip, createdAt }` and `{ traveller, acknowledged }`.

### `Location` (`server/models/Location.js`)
`trip` (→ Trip), `traveller` (→ User), `coordinates { lat, lng }` (both required), `accuracy`, `speed`, `heading`, `altitude`, `battery`, `timestamp`, `isCheckIn` (true for manual check-in pings). Indexes on `{ trip, timestamp }` and `{ traveller, timestamp }`.

---

## 🌐 REST API reference

Base URL: `http://localhost:5000/api`. Protected routes require `Authorization: Bearer <JWT>`.

### Health
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | – | `{ status: 'ok', email, telegram, timestamp }` |

### Auth — `/api/auth` (limiter: 20 requests / 15 min / IP)
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/register` | – | Create account; returns token + user. Requires `name`, `email`, `password` (≥8 chars, ≥1 digit), optional `phone`. `409` if email exists. |
| POST | `/login` | – | Returns token + user. `401` on bad credentials. |
| GET | `/me` | ✅ | Current user. |
| GET | `/verify-email?token=` | – | Verify email; token valid 24 h. |
| POST | `/resend-verification` | ✅ | Re-issue verification email. |
| POST | `/forgot-password` | – | Always returns 200 to avoid enumeration; emails a 1-hour reset link. |
| POST | `/reset-password` | – | Body `{ token, password }`. |
| PATCH | `/update-profile` | ✅ | Whitelisted updates: `name`, `phone`, `settings`. |

### Guardians — `/api/guardians`
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | ✅ | List my guardians (linked user fields populated). |
| POST | `/invite` | ✅ | Add guardian: `{ email, label?, name?, phone? }`. Max 5; blocks self and duplicates. A registered email is activated immediately and attached to live trips; a guest stays `pending` and gets an invite email. |
| GET | `/accept?token=` | – | Public invite acceptance; sets `status: active`. |
| POST | `/:id/accept` | ✅ | Signed-in guardian accepts a pending invitation. |
| POST | `/:id/decline` | ✅ | Signed-in guardian declines a pending invitation. |
| PATCH | `/:id` | ✅ | Update `label` and/or `permissions` (owner only). |
| DELETE | `/:id` | ✅ | Soft-remove guardian (`status: 'removed'`). |
| GET | `/watching` | ✅ | Everyone I guard (`active` and any unclaimed `pending`), each with `activeTrip` — that person's live trip or `null`. |

### Telegram — `/api/telegram`
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/link` | ✅ | `{ botUsername, connected, code, deepLink, command, expiresInMinutes }`; the deep link embeds a 32-character Telegram-safe code valid for 15 minutes. |
| DELETE | `/link` | ✅ | Unlink the chat from this account. |
| GET | `/status` | ✅ | Bot, command and webhook diagnostics: `commands` (`enabled \| no-public-url`), `webhook` (`registered \| missing`), `pendingUpdates`, `lastError`. |
| POST | `/test` | ✅ | Send a real test message to the linked chat; `400` when not connected, `502` when Telegram rejects it. |
| POST | `/webhook/:secret` | secret | Telegram Bot API updates. Requires the webhook secret (path or `x-telegram-bot-api-secret-token` header); anything else is `404`. Handles `/start <code>`, `/link <code>`, `/status`, `/trips`, `/map`, `/stop`, `/help`. |

### Trips — `/api/trips`
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | ✅ | My trips; query `status`, `limit` (20), `page` (1); returns `trips, total, page, pages`. |
| GET | `/active` | ✅ | Current trip with status `active \| sos \| overdue`, or `null`. |
| GET | `/watching` | ✅ | Trips you are an **active guardian** for, with populated traveller and your guardian label (`guardianLabel`). |
| GET | `/:id` | ✅ | Trip with populated guardians (owner only). |
| GET | `/:id/locations` | ✅ | Location history; allowed for the owner or an **active guardian** of that traveller. |
| POST | `/` | ✅ | Create trip: `destination.label`, `startTime`, `estimatedArrival` required; optional `title`, `origin`, `transport`, `transportRef`, `checkInInterval`, `guardianIds`. |
| POST | `/:id/start` | ✅ | `scheduled → active`; sets `lastCheckIn` and `nextCheckInDue`; notifies guardians (`trip:started` over socket + email + Telegram). |
| POST | `/:id/checkin` | ✅ | Body `{ lat?, lng?, note?, battery? }`; resets timer; stores a check-in (and a `Location` if coordinates given); emits `trip:checkin`. Works while `active` or `overdue`. |
| POST | `/:id/location` | ✅ | Background GPS ping `{ lat, lng, accuracy?, speed?, heading?, altitude?, battery? }`; stores `Location`; emits `location:update`; pushes a throttled Telegram pin + live-map link. |
| POST | `/:id/sos` | ✅ | Body `{ lat?, lng?, message? }`; sets `sos` status, creates a critical `Alert`, and alerts every active guardian over socket, email and Telegram (dispatched in the background). |
| POST | `/:id/complete` | ✅ | Ends trip, sets `arrivedAt`, clears `nextCheckInDue`, emits `trip:completed`, notifies guardians of the safe arrival. |
| DELETE | `/:id` | ✅ | Cancel a `scheduled` trip (soft: `status: 'cancelled'`). |

Error shape is consistently `{ "message": "..." }`. The central error handler maps Mongoose validation errors to `400`, duplicate keys to `409`, and cast errors to `400`.

---

## 🔌 Real-time API (Socket.IO)

Connect with the JWT in the handshake:

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:5000', { auth: { token } });
```

The server verifies the token, loads the user, and rejects the connection otherwise. On success the socket joins `user:<userId>`.

### Client → server
| Event | Payload | Effect |
| --- | --- | --- |
| `trip:join` | `{ tripId }` | Join `trip:<id>` if owner or active guardian; replies `trip:joined` or `error`. |
| `guardian:join-all` | – | Join every room for the guardian's travellers' active trips; replies `guardian:rooms-joined`. |
| `trip:leave` | `{ tripId }` | Leave the trip room. |
| `guardian:nudge` | `{ tripId }` | If an active guardian, emits `trip:nudge` to the traveller's personal room. |
| `heartbeat` | – | Replies `heartbeat:ack` with a timestamp. |

### Server → client
| Event | Target room | Payload |
| --- | --- | --- |
| `trip:started` | `trip:<id>` + `user:<guardianId>` | `{ tripId, travellerName, destination, status }` |
| `trip:checkin` | `trip:<id>` | `{ tripId, lat, lng, note, battery, confirmedAt, travellerName }` |
| `location:update` | `trip:<id>` | `{ tripId, lat, lng, accuracy, speed, battery, timestamp }` |
| `trip:sos` | `trip:<id>` + `user:<guardianId>` | `{ tripId, travellerName, destination, lat, lng, message, triggeredAt }` |
| `trip:completed` | `trip:<id>` + `user:<guardianId>` | `{ tripId, travellerName, arrivedAt }` |
| `alert:overdue` | `trip:<id>` + `user:<guardianId>` | `{ tripId, travellerName, message, triggeredAt }` |
| `guardian:added` | `user:<guardianId>` | `{ guardianId, travellerName, label }` |
| `trip:overdue-warning` | `user:<travellerId>` | `{ tripId, message }` |
| `trip:nudge` | `user:<travellerId>` | `{ tripId, guardianName, message }` |
| `guardian:rooms-joined` | socket | `{}` |
| `trip:joined` | socket | `{ tripId }` |
| `error` | socket | `{ message }` |

Guardian-facing events go to the trip room **and** to each guardian's personal room, so a guardian whose page was open before the trip started still receives it.

---

## ⏱ Check-in watchdog

`server/jobs/checkinWatchdog.js` starts a `node-cron` job on boot: `*/5 * * * *` (every 5 minutes).

For each trip with `status: 'active'` and `nextCheckInDue < now`:

1. Set `status = 'overdue'`.
2. Call `notifyGuardians({ type: 'overdue' })`: emits `alert:overdue` to the trip room and each guardian's personal room, emails every guardian who allows email alerts, sends a Telegram message to linked chats, and stores one `Alert` with a "last check-in was N minutes ago" message, the channels used and the guardians reached.
3. Call `notifyTraveller(...)`: emits `trip:overdue-warning` to `user:<travellerId>` and messages them on Telegram if linked.

Note: the user-level `settings.alertBuffer` is modelled but the watchdog does not currently apply it — overdue fires exactly at `nextCheckInDue`.

---

## 🔒 Security

- **Passwords:** bcrypt, cost 12, never selected by default.
- **JWT:** signed with `JWT_SECRET`; default 7-day expiry; verified on HTTP and socket connections.
- **Authorization:** trip reads/site actions are scoped to the owner; guardians are checked explicitly for location history, socket rooms, and nudges.
- **Rate limiting:** global 200 requests / 15 min per IP; auth routes 20 requests / 15 min per IP.
- **Input validation:** `express-validator` chains on auth, guardian, and trip endpoints plus Mongoose schema validation; profile updates and guardian patches use field whitelists (no mass assignment).
- **Headers:** `helmet` is enabled, with `contentSecurityPolicy: false` (needed for the Leaflet/font CDNs in development).
- **Body size:** JSON limited to 2 MB.
- **Enumeration resistance:** forgot-password always returns the same response.
- **Token hygiene:** verification/reset/invite tokens are hidden from normal queries (`select: false`) and cleared after use.
- **CORS:** restricted to `CLIENT_URL` with credentials, for both HTTP and WebSocket.
- **Not implemented:** SMS and push notification delivery — the settings and `Alert.channels` flags exist, but only socket, email and Telegram are wired up. Helmet's CSP is disabled; no refresh-token rotation or revocation list exists.
- **Webhook auth:** the Telegram webhook path contains `TELEGRAM_WEBHOOK_SECRET` and is also checked against the `x-telegram-bot-api-secret-token` header; without a match the route answers `404` so the endpoint is indistinguishable from a typo.

---

## 🔑 Environment variables

Copy `server/.env.example` to `server/.env` and adjust the values:

```dotenv
# ── Server ───────────────────────────────────────────────
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173
# PUBLIC_APP_URL=https://safetrail.vercel.app   # links inside emails
# SERVER_URL=https://safetrail-service.onrender.com   # Telegram webhook base

# ── Database ─────────────────────────────────────────────
MONGO_URI=mongodb://127.0.0.1:27017/safetrail

# ── Auth ─────────────────────────────────────────────────
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d

# ── SMTP (Nodemailer) — Brevo ────────────────────────────
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-brevo-login@example.com
SMTP_PASS=your-brevo-smtp-key
EMAIL_FROM="SafeTrail <no-reply@your-verified-domain.com>"

# ── Telegram bot ─────────────────────────────────────────
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_FEED_MINUTES=3
```

Create the bot with **@BotFather** (`/newbot`), put the token in `TELEGRAM_BOT_TOKEN`, choose any long random `TELEGRAM_WEBHOOK_SECRET`, then run `cd server && npm run telegram:webhook` once. Users connect from **Settings → Telegram**. On Render, `RENDER_EXTERNAL_URL` replaces `SERVER_URL` automatically, and the server re-registers the webhook on every boot.

Email uses Brevo's SMTP relay (free plan: 300 emails/day, no card required). Verify the `EMAIL_FROM` sender and publish its SPF/DKIM records under **Brevo → Settings → Senders & Domains**, then copy the SMTP login and generate an SMTP key under **Brevo → SMTP & API**; without a verified sender, Brevo rejects the message. Any other SMTP provider works by swapping host, port and credentials.

Check the whole path with `cd server && npm run email:test` (verifies the connection, then sends one message).

### Email failures are always visible

`utils/email.js` is the single send path, so nothing can fail quietly:

- Every attempt logs `[email] sent` with the provider `messageId` and SMTP response, or `[email] FAILED` with the error code, SMTP response code and server reply. Trace a message in Brevo's transactional log by that ID.
- Transient failures (network errors and SMTP 4xx replies) are retried twice with a short backoff before being reported as failed.
- `sendVerificationEmail`, `sendPasswordResetEmail`, `sendGuardianInviteEmail`, `sendAlertEmail` and `sendTestEmail` return the Nodemailer result, so callers can log or act on it.
- Boot prints an explicit warning when SMTP is unconfigured, and `/api/health` reports `email: "configured" | "not-configured"`.
- Routes return an `emailSent` flag and adjust their message, so the UI never reports "Invitation sent" when the send failed. `POST /api/auth/resend-verification` answers `502` if the mail could not be sent, and the overdue watchdog logs an error when no guardian alert was delivered.
- Exception: `POST /api/auth/forgot-password` keeps a generic response on purpose (no account enumeration), so that failure appears in the server log only.

The client needs no environment file during development because Vite proxies API and WebSocket traffic to the server. Production builds default to `https://safetrail-service.onrender.com`: `api.js` calls `<origin>/api` and `socket.js` connects to the same origin, so a hosting provider needs no configuration. Set `VITE_API_URL` to override that origin (staging backend, self-hosted API). On the server, `CLIENT_URL` accepts a comma-separated list and wildcards such as `https://*.vercel.app`, which is needed because Vercel gives every deployment its own hostname. Because a wildcard cannot be opened by a recipient, email links are built from `PUBLIC_APP_URL` (falling back to the first hosted `CLIENT_URL` entry) — set it whenever `CLIENT_URL` contains only wildcards. The database name is hard-coded to `safetrail` in `models/db.js`.

`mongodb://127.0.0.1:27017/safetrail` assumes MongoDB is reachable over plain TCP. If you would rather host it, a managed MongoDB provider is the usual choice; the connection string goes in `MONGO_URI`.

---

## 🚀 Getting started

### Prerequisites
- Node.js 18+ (ESM, top-level packages, `node-cron`, Mongoose 8)
- npm
- A MongoDB instance (local or hosted) and, for email features, an SMTP account

### 1. Backend

```bash
cd server
npm install
# create server/.env as shown above
npm run dev        # nodemon index.js, http://localhost:5000
# or: npm start
```

On success the console prints the HTTP URL, WebSocket URL, and environment, and logs `MongoDB connected` and `Check-in watchdog started (every 5 min)`. Verify with:

```bash
curl http://localhost:5000/api/health
```

### 2. Frontend

```bash
cd client
npm install
npm run dev        # Vite on http://localhost:5173
```

Other client scripts: `npm run build` (production bundle) and `npm run preview`.

> The Vite dev server proxies `/api` and `/socket.io` to `localhost:5000`, so start the backend first. Open http://localhost:5173 and register an account.

---

## 🧭 User flows

**Registration → verification**
`POST /register` → account created (`isVerified: false`) + JWT returned → verification email → `GET /verify-email?token=…` sets `isVerified: true`.

**Invite a guardian**
`POST /guardians/invite` → if the email belongs to an account the guardianship is `active` at once, attached to any trip already running, and the guardian is told over sockets (and Telegram when linked) → otherwise the Guardian is created as `pending` with a 7-day token and an invite email is sent → the guest opens `/accept-guardian?token=…` (`GET /guardians/accept`) **or** registers; on their first visit `POST /trips/watching` / `GET /guardians/watching` claims the invitation automatically.

**Run a trip**
Create trip (`scheduled`) → `POST /trips/:id/start` (`active`, timer set, guardians notified) → guardian opens Watching, which joins `trip:<id>` → traveller posts `/checkin` and `/location` → guardian sees live updates (and gets Telegram pins every few minutes) → `POST /trips/:id/complete` (`completed`).

**Missed check-in**
Timer expires → watchdog within 5 minutes sets `overdue` → one alert per guardians' channel set (socket, email, Telegram) → traveller checks in → status returns to `active`.

**Emergency**
`POST /trips/:id/sos` → `sos` status + critical `Alert` → guardians receive `trip:sos` in the trip room and their personal rooms, an email with the last coordinates, and a Telegram message with a map pin and an "Open live map" button. The notification fan-out runs in the background so the SOS response is immediate.

**Guardian nudge**
Guardian emits `guardian:nudge` → server verifies guardianship → `trip:nudge` to the traveller's `user:<id>` room.

---

## ⚠️ Current state & known gaps

This is a work-in-progress repository. The backend is substantially implemented; the frontend is not. Known issues as of this README:

**Server needs a MongoDB instance to finish booting**
- The module graph loads cleanly (import paths and model filenames now match), but `connectDB()` exits the process if `MONGO_URI` is unset or unreachable. Provide `MONGO_URI` in `server/.env`.

**`server/.env` is required**
- A `.env.example` is provided; copy it to `.env` and fill in the values. The server reads `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, SMTP settings, etc. via `dotenv`. Without `MONGO_URI` the process exits on startup.

**Frontend**
- Implemented pages: login/register, email verification, forgot/reset password, guardian invite acceptance, dashboard, trip planning, live trip view (map, check-in, SOS, opt-in location sharing), guardian management, settings, guardian watch list, and guardian trip view.
- The client talks to the API through the Vite proxy, so no client env file is needed in development.
- No automated tests or type-checking are configured for the client.

**Other incomplete pieces**
- No test suite, no linter config, no root `package.json`/workspace tooling, no CI.
- SMS and push channels are modelled but not implemented.
- `settings.alertBuffer` is not applied by the watchdog.
- `Trip.archivedAt` and the "auto-clear 30 days after completion" comment have no corresponding cron job.
- `Trip.sos.resolvedAt` / `resolvedBy` are never written — there is no "resolve SOS" endpoint.
- `Alert` acknowledgement fields exist but no endpoint exposes acknowledgement.
- Guardian `permissions` (including `sendNudge`, `viewLiveLocation`, `viewTripHistory`) are stored but not enforced by the corresponding endpoints/socket handlers.
- No refresh tokens, logout/token revocation, or account deletion.
- `/api/trips/:id/locations` returns raw history without pagination or a retention policy.
- No invitation-decline endpoint (the `declined` status is defined but unreachable).
- Error responses are consistent in shape, but there is no request-ID or structured logging.

---

## 🔭 Possible next steps

1. Add optional root workspace scripts for running both packages.
2. Enforce guardian permissions in the REST and socket layers.
4. Implement SOS resolution/acknowledgement endpoints and trip archival.
5. Add integration tests for auth, trip lifecycle, guardian authorization, and the watchdog.
6. Add SMS/push channels and apply the configurable `alertBuffer`.

---

**SafeTrail** — *Your safety, always tracked.*
