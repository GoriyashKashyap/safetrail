import { Router } from 'express';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { protect, signToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email.js';

const router = Router();

// ── Validation rules ─────────────────────────────────────────────────────────
const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 60 }).withMessage('Name must be 2–60 characters'),
  body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/\d/).withMessage('Password must contain at least one number'),
  body('phone').optional({ checkFalsy: true })
    .matches(/^\+?[1-9]\d{6,14}$/).withMessage('Enter a valid phone number with country code (e.g. +91...)'),
];

const loginRules = [
  body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  next();
};

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post(
  '/register',
  registerRules,
  validate,
  asyncHandler(async (req, res) => {
    const { name, email, password, phone } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    // Create email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const user = await User.create({
      name,
      email,
      password,
      phone,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
    });

    // Send verification email. A failure must not lose the account, but it has
    // to be visible: otherwise the user waits for mail that was never sent.
    let emailSent = true;
    try {
      await sendVerificationEmail(user, verificationToken);
    } catch (emailErr) {
      emailSent = false;
      console.error('[auth] Verification email failed for', user.email, '-', emailErr.message);
    }

    const token = signToken(user._id);

    res.status(201).json({
      message: emailSent
        ? 'Account created! Check your email to verify your account.'
        : 'Account created, but we could not send the verification email. Use "Resend verification" shortly.',
      emailSent,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified,
        settings: user.settings,
        createdAt: user.createdAt,
      },
    });
  })
);

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post(
  '/login',
  loginRules,
  validate,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }

    await user.touchLastSeen();

    const token = signToken(user._id);

    res.json({
      message: 'Logged in successfully.',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified,
        settings: user.settings,
        lastSeen: user.lastSeen,
      },
    });
  })
);

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get(
  '/me',
  protect,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

// ── GET /api/auth/verify-email?token=... ─────────────────────────────────────
router.get(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: 'Verification token missing.' });

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() },
    }).select('+emailVerificationToken +emailVerificationExpires');

    if (!user) {
      return res.status(400).json({ message: 'Verification link is invalid or has expired.' });
    }

    user.isVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ message: 'Email verified successfully. You can now use all features.' });
  })
);

// ── POST /api/auth/resend-verification ───────────────────────────────────────
router.post(
  '/resend-verification',
  protect,
  asyncHandler(async (req, res) => {
    if (req.user.isVerified) {
      return res.status(400).json({ message: 'Your email is already verified.' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = await User.findById(req.user._id);
    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    try {
      await sendVerificationEmail(user, verificationToken);
    } catch (emailErr) {
      console.error('[auth] Verification resend failed for', user.email, '-', emailErr.message);
      return res.status(502).json({
        message: 'We could not send the verification email right now. Please try again shortly.',
        emailSent: false,
      });
    }

    res.json({ message: 'Verification email resent. Check your inbox.', emailSent: true });
  })
);

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
router.post(
  '/forgot-password',
  body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
  validate,
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    // Always respond OK to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save({ validateBeforeSave: false });

    // The response stays generic on purpose (no account enumeration), so the
    // only place a failure can surface is the server log.
    try {
      await sendPasswordResetEmail(user, resetToken);
    } catch (err) {
      console.error('[auth] Password reset email failed for', user.email, '-', err.message);
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  })
);

// ── POST /api/auth/reset-password ────────────────────────────────────────────
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Token required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/\d/).withMessage('Password must contain at least one number'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired.' });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully. You can now log in.' });
  })
);

// ── PATCH /api/auth/update-profile ───────────────────────────────────────────
router.patch(
  '/update-profile',
  protect,
  [
    body('name').optional().trim().isLength({ min: 2, max: 60 }),
    body('phone').optional({ checkFalsy: true })
      .matches(/^\+?[1-9]\d{6,14}$/).withMessage('Enter a valid phone number with country code'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const allowed = ['name', 'phone', 'settings'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.json({ message: 'Profile updated.', user });
  })
);

export default router;