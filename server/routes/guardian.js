import { Router } from 'express';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import Guardian from '../models/Guardian.js';
import User from '../models/User.js';
import Trip from '../models/Trip.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendGuardianInviteEmail } from '../utils/email.js';
import { sendMessage } from '../utils/telegram.js';
import { getAppUrl } from '../config/appUrl.js';
import { attachGuardianToTrips, claimPendingGuardianships } from '../services/guardianship.js';

const router = Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
  next();
};

// ── GET /api/guardians — my guardians list ───────────────────────────────────
router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const guardians = await Guardian.find({ traveller: req.user._id })
      .populate('guardianUser', 'name email phone avatar lastSeen')
      .sort({ createdAt: -1 });

    res.json({ guardians });
  })
);

// ── POST /api/guardians/invite — add a guardian ──────────────────────────────
router.post(
  '/invite',
  protect,
  [
    body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
    body('label').optional().trim().isLength({ max: 30 }),
    body('name').optional().trim().isLength({ max: 60 }),
    body('phone').optional({ checkFalsy: true })
      .matches(/^\+?[1-9]\d{6,14}$/),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { email, label, name, phone } = req.body;

    // Can't add yourself
    if (email === req.user.email) {
      return res.status(400).json({ message: 'You cannot add yourself as a guardian.' });
    }

    // Max 5 guardians
    const count = await Guardian.countDocuments({
      traveller: req.user._id,
      status: { $in: ['pending', 'active'] },
    });
    if (count >= 5) {
      return res.status(400).json({ message: 'You can have up to 5 guardians.' });
    }

    // Check if the invitee has an account
    const existingUser = await User.findOne({ email });

    // Check for duplicate. A guest invite for this email must be reused when the
    // invitee has since registered, otherwise the guest-email unique index
    // rejects the new row.
    const existing = await Guardian.findOne({
      traveller: req.user._id,
      $or: [
        ...(existingUser ? [{ guardianUser: existingUser._id }] : []),
        { guestEmail: email },
      ],
    });
    if (existing && existing.status !== 'declined' && existing.status !== 'removed') {
      return res.status(409).json({ message: 'This person is already your guardian.' });
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // A registered account is activated immediately: the traveller picked them
    // on purpose, and waiting for an emailed "accept" click meant a guardian
    // added mid-trip never saw the trip. Guests stay pending until they open
    // the invite link.
    const autoActive = Boolean(existingUser);

    const guardianData = {
      traveller: req.user._id,
      label: label || 'Guardian',
      inviteToken,
      inviteExpires,
      status: autoActive ? 'active' : 'pending',
      ...(autoActive ? { acceptedAt: new Date() } : {}),
    };

    if (existingUser) {
      guardianData.guardianUser = existingUser._id;
    } else {
      guardianData.guestEmail = email;
      guardianData.guestName = name;
      guardianData.guestPhone = phone;
    }

    let guardian;
    if (existing) {
      Object.assign(existing, guardianData);
      // Promoted from a guest invite: drop the guest fields so the partial
      // guest-email index no longer covers this row.
      if (existingUser) {
        existing.guestEmail = undefined;
        existing.guestName = undefined;
        existing.guestPhone = undefined;
      }
      guardian = await existing.save();
    } else {
      guardian = await Guardian.create(guardianData);
    }

    // Attach to live trips and tell the guardian right away — socket first,
    // Telegram as the out-of-app channel.
    if (autoActive) {
      await attachGuardianToTrips(guardian);
      req.app.get('io')?.to(`user:${existingUser._id}`).emit('guardian:added', {
        guardianId: guardian._id,
        travellerName: req.user.name,
        label: guardian.label,
      });
      if (existingUser.telegramChatId) {
        await sendMessage(
          existingUser.telegramChatId,
          `<b>🛡 ${req.user.name} added you as a safety guardian</b>\n\nYou can follow their live trips and receive alerts.\n${getAppUrl()}/watching`,
          { html: true, buttons: [[{ text: 'Open SafeTrail', url: `${getAppUrl()}/watching` }]] }
        );
      }
    }

    // Send invite email
    let emailSent = true;
    try {
      await sendGuardianInviteEmail({
        toEmail: email,
        toName: existingUser?.name || name,
        travellerName: req.user.name,
        token: inviteToken,
      });
    } catch (err) {
      emailSent = false;
      console.warn('Guardian invite email failed:', err.message);
    }

    res.status(201).json({
      message: autoActive
        ? `${existingUser.name || email} is now your guardian and can follow your trips.`
        : emailSent
          ? `Invitation sent to ${email}.`
          : `Guardian added, but the invitation email to ${email} could not be sent. Check the server logs.`,
      emailSent,
      active: autoActive,
      guardian,
    });
  })
);

// ── GET /api/guardians/accept?token=... — accept invite ─────────────────────
router.get(
  '/accept',
  asyncHandler(async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: 'Invite token missing.' });

    const guardian = await Guardian.findOne({
      inviteToken: token,
      inviteExpires: { $gt: Date.now() },
    }).select('+inviteToken +inviteExpires').populate('traveller', 'name email');

    if (!guardian) {
      return res.status(400).json({ message: 'Invite link is invalid or has expired.' });
    }

    guardian.status = 'active';
    guardian.acceptedAt = new Date();
    guardian.inviteToken = undefined;
    guardian.inviteExpires = undefined;
    await guardian.save();

    res.json({
      message: `You are now a guardian for ${guardian.traveller.name}.`,
      travellerName: guardian.traveller.name,
    });
  })
);

// ── PATCH /api/guardians/:id — update label / permissions ───────────────────
router.patch(
  '/:id',
  protect,
  asyncHandler(async (req, res) => {
    const guardian = await Guardian.findOne({ _id: req.params.id, traveller: req.user._id });
    if (!guardian) return res.status(404).json({ message: 'Guardian not found.' });

    const allowed = ['label', 'permissions'];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) guardian[key] = req.body[key];
    });
    await guardian.save();

    res.json({ message: 'Guardian updated.', guardian });
  })
);

// ── DELETE /api/guardians/:id — remove a guardian ───────────────────────────
router.delete(
  '/:id',
  protect,
  asyncHandler(async (req, res) => {
    const guardian = await Guardian.findOneAndUpdate(
      { _id: req.params.id, traveller: req.user._id },
      { status: 'removed' },
      { new: true }
    );
    if (!guardian) return res.status(404).json({ message: 'Guardian not found.' });

    res.json({ message: 'Guardian removed.' });
  })
);

// ── GET /api/guardians/watching — people I guard ────────────────────────────
router.get(
  '/watching',
  protect,
  asyncHandler(async (req, res) => {
    // Invitations waiting for this account are activated on first visit.
    await claimPendingGuardianships(req.user);

    // Pending ones are listed too: if the automatic claim above could not
    // resolve an invitation, the guardian still sees it and can accept in-app.
    const guardianships = await Guardian.find({
      guardianUser: req.user._id,
      status: { $in: ['active', 'pending'] },
    })
      .populate('traveller', 'name email phone avatar lastSeen')
      .sort({ acceptedAt: -1, createdAt: -1 });

    const travellerIds = guardianships
      .filter((guardian) => guardian.status === 'active')
      .map((g) => g.traveller?._id)
      .filter(Boolean);
    const liveTrips = travellerIds.length
      ? await Trip.find({
          traveller: { $in: travellerIds },
          status: { $in: ['active', 'overdue', 'sos'] },
        })
          .select('traveller title destination status lastCheckIn nextCheckInDue sos startTime')
          .lean()
      : [];

    // One live trip per traveller (the most recently started one).
    const tripByTraveller = new Map();
    for (const trip of liveTrips) {
      const key = String(trip.traveller);
      const current = tripByTraveller.get(key);
      if (!current || new Date(trip.startTime) > new Date(current.startTime)) {
        tripByTraveller.set(key, trip);
      }
    }

    res.json({
      guardianships: guardianships.map((guardian) => ({
        ...guardian.toObject(),
        activeTrip:
          guardian.status === 'active'
            ? tripByTraveller.get(String(guardian.traveller?._id)) || null
            : null,
      })),
    });
  })
);

// ── POST /api/guardians/:id/accept — guardian accepts an invite ─────────────
router.post(
  '/:id/accept',
  protect,
  asyncHandler(async (req, res) => {
    const guardian = await Guardian.findOne({
      _id: req.params.id,
      $or: [{ guardianUser: req.user._id }, { guardianUser: null, guestEmail: req.user.email }],
      status: { $in: ['pending', 'active'] },
    });
    if (!guardian) return res.status(404).json({ message: 'Invitation not found.' });

    guardian.guardianUser = req.user._id;
    guardian.status = 'active';
    guardian.acceptedAt = guardian.acceptedAt || new Date();
    await guardian.save();
    await attachGuardianToTrips(guardian);

    res.json({ message: 'You are now a guardian.', guardian });
  })
);

// ── POST /api/guardians/:id/decline — guardian declines an invite ───────────
router.post(
  '/:id/decline',
  protect,
  asyncHandler(async (req, res) => {
    const guardian = await Guardian.findOne({
      _id: req.params.id,
      $or: [{ guardianUser: req.user._id }, { guardianUser: null, guestEmail: req.user.email }],
      status: 'pending',
    });
    if (!guardian) return res.status(404).json({ message: 'Invitation not found.' });

    guardian.status = 'declined';
    guardian.inviteToken = undefined;
    guardian.inviteExpires = undefined;
    await guardian.save();

    res.json({ message: 'Invitation declined.', guardian });
  })
);

export default router;