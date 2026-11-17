import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import Trip from '../models/Trip.js';
import Location from '../models/Location.js';
import Guardian from '../models/Guardian.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { claimPendingGuardianships } from '../services/guardianship.js';
import {
  feedLiveLocation,
  loadGuardianContacts,
  notifyCheckIn,
  notifyGuardians,
} from '../services/notify.js';

const router = Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  next();
};

// Notifications must never block an API response: a slow SMTP host would
// otherwise stall SOS for minutes.
const dispatch = (promise, label) =>
  promise.catch((err) => console.error(`[notify] ${label} failed:`, err.message));

// Telegram is a chat, not a map server — stream at most one live fix every
// few minutes per trip.
const TELEGRAM_FEED_MS = Number(process.env.TELEGRAM_FEED_MINUTES || 3) * 60 * 1000;
const lastFeedAt = new Map();

// ── GET /api/trips — my trips ────────────────────────────────────────────────
router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const { status, limit = 20, page = 1 } = req.query;
    const filter = { traveller: req.user._id };
    if (status) filter.status = status;

    const [trips, total] = await Promise.all([
      Trip.find(filter)
        .sort({ startTime: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean(),
      Trip.countDocuments(filter),
    ]);

    res.json({ trips, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  })
);

// ── GET /api/trips/active — currently active trip ────────────────────────────
router.get(
  '/active',
  protect,
  asyncHandler(async (req, res) => {
    const trip = await Trip.findOne({
      traveller: req.user._id,
      status: { $in: ['active', 'sos', 'overdue'] },
    }).populate('guardians');

    res.json({ trip: trip || null });
  })
);

// ── GET /api/trips/watching — trips I am an active guardian for ──────────────
router.get(
  '/watching',
  protect,
  asyncHandler(async (req, res) => {
    // Invitations addressed to this account are activated on first use, so a
    // guardian added mid-trip sees that trip immediately.
    await claimPendingGuardianships(req.user);

    const guardianships = await Guardian.find({
      guardianUser: req.user._id,
      status: 'active',
    }).select('_id traveller label');

    if (!guardianships.length) return res.json({ trips: [] });

    const labels = new Map(
      guardianships.map((g) => [g.traveller.toString(), g.label])
    );

    const trips = await Trip.find({
      traveller: { $in: guardianships.map((g) => g.traveller) },
    })
      .populate('traveller', 'name email phone avatar')
      .sort({ startTime: -1 })
      .limit(50)
      .lean();

    res.json({
      trips: trips.map((trip) => ({
        ...trip,
        guardianLabel: labels.get(trip.traveller?._id?.toString()) || 'Guardian',
      })),
    });
  })
);

// ── GET /api/trips/:id ────────────────────────────────────────────────────────
router.get(
  '/:id',
  protect,
  asyncHandler(async (req, res) => {
    const trip = await Trip.findOne({
      _id: req.params.id,
      traveller: req.user._id,
    }).populate('guardians');

    if (!trip) return res.status(404).json({ message: 'Trip not found.' });
    res.json({ trip });
  })
);

// ── GET /api/trips/:id/locations — location history ──────────────────────────
router.get(
  '/:id/locations',
  protect,
  asyncHandler(async (req, res) => {
    // Allow traveller or guardian to fetch locations
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ message: 'Trip not found.' });

    const isOwner = trip.traveller.toString() === req.user._id.toString();
    const isGuardian = await Guardian.findOne({
      traveller: trip.traveller,
      guardianUser: req.user._id,
      status: 'active',
    });

    if (!isOwner && !isGuardian) {
      return res.status(403).json({ message: 'Not authorized to view this trip.' });
    }

    const locations = await Location.find({ trip: req.params.id })
      .sort({ timestamp: 1 })
      .lean();

    res.json({ locations });
  })
);

// ── POST /api/trips — create trip ────────────────────────────────────────────
router.post(
  '/',
  protect,
  [
    body('destination.label').trim().notEmpty().withMessage('Destination is required'),
    body('startTime').isISO8601().withMessage('Valid start time required'),
    body('estimatedArrival').isISO8601().withMessage('Valid estimated arrival required'),
    body('checkInInterval').optional().isIn([15, 30, 60]).withMessage('Interval must be 15, 30, or 60 minutes'),
    body('transport').optional().isIn(['train', 'bus', 'car', 'flight', 'other']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const {
      title,
      origin,
      destination,
      transport,
      transportRef,
      startTime,
      estimatedArrival,
      checkInInterval,
      guardianIds,
    } = req.body;

    if (new Date(estimatedArrival) <= new Date(startTime)) {
      return res.status(400).json({ message: 'Estimated arrival must be after start time.' });
    }

    // Fetch user's active guardians
    const guardianFilter = { traveller: req.user._id, status: 'active' };
    if (guardianIds?.length) guardianFilter._id = { $in: guardianIds };
    const guardians = await Guardian.find(guardianFilter).select('_id');

    const trip = await Trip.create({
      traveller: req.user._id,
      title: title || `Trip to ${destination.label}`,
      origin,
      destination,
      transport: transport || 'other',
      transportRef,
      startTime: new Date(startTime),
      estimatedArrival: new Date(estimatedArrival),
      checkInInterval: checkInInterval || req.user.settings?.defaultCheckInInterval || 30,
      guardians: guardians.map((g) => g._id),
      status: 'scheduled',
    });

    res.status(201).json({ message: 'Trip created.', trip });
  })
);

// ── POST /api/trips/:id/start — activate trip ────────────────────────────────
router.post(
  '/:id/start',
  protect,
  asyncHandler(async (req, res) => {
    const trip = await Trip.findOne({ _id: req.params.id, traveller: req.user._id });
    if (!trip) return res.status(404).json({ message: 'Trip not found.' });
    if (trip.status === 'active') return res.status(400).json({ message: 'Trip is already active.' });
    if (!['scheduled'].includes(trip.status)) {
      return res.status(400).json({ message: 'Only scheduled trips can be started.' });
    }

    const now = new Date();
    trip.status = 'active';
    trip.startTime = now;
    trip.lastCheckIn = now;
    trip.nextCheckInDue = new Date(now.getTime() + trip.checkInInterval * 60 * 1000);
    await trip.save();

    // Socket + email + Telegram to every active guardian.
    dispatch(
      notifyGuardians({
        io: req.app.get('io'),
        trip,
        travellerName: req.user.name,
        type: 'trip_started',
        severity: 'info',
        message: `${req.user.name} started a trip to ${trip.destination.label}.`,
      }),
      'trip_started'
    );

    res.json({ message: 'Trip started. Stay safe!', trip });
  })
);

// ── POST /api/trips/:id/checkin — manual check-in ────────────────────────────
router.post(
  '/:id/checkin',
  protect,
  asyncHandler(async (req, res) => {
    const trip = await Trip.findOne({
      _id: req.params.id,
      traveller: req.user._id,
      status: { $in: ['active', 'overdue'] },
    });
    if (!trip) return res.status(404).json({ message: 'No active trip found.' });

    const { lat, lng, note, battery } = req.body;
    const now = new Date();

    trip.lastCheckIn = now;
    trip.nextCheckInDue = new Date(now.getTime() + trip.checkInInterval * 60 * 1000);
    if (trip.status === 'overdue') trip.status = 'active'; // reset overdue
    trip.checkIns.push({ confirmedAt: now, lat, lng, note });
    await trip.save();

    // Save location ping
    if (lat && lng) {
      await Location.create({
        trip: trip._id,
        traveller: req.user._id,
        coordinates: { lat, lng },
        battery,
        timestamp: now,
        isCheckIn: true,
      });
    }

    // In-app update for the trip room + each guardian's personal room, and a
    // Telegram confirmation for every guardian chat. Fired without blocking the
    // response so a slow network never stalls the check-in.
    dispatch(
      (async () => {
        const contacts = await loadGuardianContacts(trip);
        await notifyCheckIn({
          io: req.app.get('io'),
          trip,
          travellerName: req.user.name,
          lat,
          lng,
          note,
          battery,
          confirmedAt: now,
          contacts,
        });
      })(),
      'checkin'
    );

    res.json({ message: "Check-in confirmed. Your guardians have been notified.", trip });
  })
);

// ── POST /api/trips/:id/location — background GPS ping ───────────────────────
router.post(
  '/:id/location',
  protect,
  asyncHandler(async (req, res) => {
    const { lat, lng, accuracy, speed, heading, altitude, battery } = req.body;
    if (!lat || !lng) return res.status(400).json({ message: 'Coordinates required.' });

    const trip = await Trip.findOne({
      _id: req.params.id,
      traveller: req.user._id,
      status: { $in: ['active', 'overdue', 'sos'] },
    });
    if (!trip) return res.status(404).json({ message: 'No active trip found.' });

    const loc = await Location.create({
      trip: trip._id,
      traveller: req.user._id,
      coordinates: { lat, lng },
      accuracy, speed, heading, altitude, battery,
      timestamp: new Date(),
    });

    // Broadcast live location to guardians in the trip room
    req.app.get('io')?.to(`trip:${trip._id}`).emit('location:update', {
      tripId: trip._id,
      lat, lng, accuracy, speed, battery,
      timestamp: loc.timestamp,
    });

    // Throttled Telegram feed: one pin + live-map link every few minutes.
    const feedKey = String(trip._id);
    if (Date.now() - (lastFeedAt.get(feedKey) || 0) >= TELEGRAM_FEED_MS) {
      lastFeedAt.set(feedKey, Date.now());
      dispatch(
        (async () => {
          const contacts = await loadGuardianContacts(trip);
          await feedLiveLocation({ trip, travellerName: req.user.name, lat, lng, contacts });
        })(),
        'location feed'
      );
    }

    res.json({ ok: true });
  })
);

// ── POST /api/trips/:id/sos — trigger SOS ────────────────────────────────────
router.post(
  '/:id/sos',
  protect,
  asyncHandler(async (req, res) => {
    const { lat, lng, message } = req.body;

    const trip = await Trip.findOne({
      _id: req.params.id,
      traveller: req.user._id,
      status: { $in: ['active', 'overdue'] },
    }).populate('guardians');

    if (!trip) return res.status(404).json({ message: 'No active trip found.' });

    trip.status = 'sos';
    trip.sos = { triggeredAt: new Date(), lat, lng, message: message || 'SOS triggered' };
    await trip.save();

    // Critical alert: socket blast + email + Telegram, recorded as an Alert.
    // Fired without blocking the response so a slow SMTP host cannot stall SOS.
    dispatch(
      notifyGuardians({
        io: req.app.get('io'),
        trip,
        travellerName: req.user.name,
        type: 'sos',
        severity: 'critical',
        message: message || 'SOS triggered — they need help now.',
        location: lat && lng ? { lat, lng } : null,
      }),
      'sos'
    );

    res.json({ message: 'SOS sent. Your guardians are being alerted.', trip });
  })
);

// ── POST /api/trips/:id/complete — end the trip ──────────────────────────────
router.post(
  '/:id/complete',
  protect,
  asyncHandler(async (req, res) => {
    const trip = await Trip.findOne({
      _id: req.params.id,
      traveller: req.user._id,
      status: { $in: ['active', 'overdue', 'sos'] },
    });
    if (!trip) return res.status(404).json({ message: 'No active trip found.' });

    trip.status = 'completed';
    trip.arrivedAt = new Date();
    trip.nextCheckInDue = null;
    await trip.save();

    req.app.get('io')?.to(`trip:${trip._id}`).emit('trip:completed', {
      tripId: trip._id,
      travellerName: req.user.name,
      arrivedAt: trip.arrivedAt,
    });

    dispatch(
      notifyGuardians({
        io: req.app.get('io'),
        trip,
        travellerName: req.user.name,
        type: 'arrived',
        severity: 'info',
        message: `${req.user.name} arrived at ${trip.destination.label}.`,
      }),
      'arrived'
    );

    res.json({ message: 'Trip completed. Welcome to your destination!', trip });
  })
);

// ── DELETE /api/trips/:id — cancel scheduled trip ────────────────────────────
router.delete(
  '/:id',
  protect,
  asyncHandler(async (req, res) => {
    const trip = await Trip.findOneAndUpdate(
      { _id: req.params.id, traveller: req.user._id, status: 'scheduled' },
      { status: 'cancelled' },
      { new: true }
    );
    if (!trip) return res.status(404).json({ message: 'Scheduled trip not found.' });

    res.json({ message: 'Trip cancelled.', trip });
  })
);

export default router;