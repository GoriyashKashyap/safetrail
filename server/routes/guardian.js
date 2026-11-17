import { Router } from 'express';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import Guardian from '../models/Guardian.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendGuardianInviteEmail } from '../utils/email.js';

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

    // Check for duplicate
    const dupQuery = existingUser
      ? { traveller: req.user._id, guardianUser: existingUser._id }
      : { traveller: req.user._id, guestEmail: email };

    const existing = await Guardian.findOne(dupQuery);
    if (existing && existing.status !== 'declined' && existing.status !== 'removed') {
      return res.status(409).json({ message: 'This person is already your guardian.' });
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const guardianData = {
      traveller: req.user._id,
      label: label || 'Guardian',
      inviteToken,
      inviteExpires,
      status: 'pending',
    };

    if (existingUser) {
      guardianData.guardianUser = existingUser._id;
    } else {
      guardianData.guestEmail = email;
      guardianData.guestName = name;
      guardianData.guestPhone = phone;
    }

    const guardian = existing
      ? Object.assign(existing, guardianData) && await existing.save()
      : await Guardian.create(guardianData);

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
      message: emailSent
        ? `Invitation sent to ${email}.`
        : `Guardian added, but the invitation email to ${email} could not be sent. Check the server logs.`,
      emailSent,
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

// ── GET /api/guardians/watching — trips I'm guarding (for guardian view) ────
router.get(
  '/watching',
  protect,
  asyncHandler(async (req, res) => {
    const guardianships = await Guardian.find({
      guardianUser: req.user._id,
      status: 'active',
    }).populate('traveller', 'name email phone avatar');

    res.json({ guardianships });
  })
);

export default router;