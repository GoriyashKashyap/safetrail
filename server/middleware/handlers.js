import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Trip from '../models/Trip.js';
import Guardian from '../models/Guardian.js';

/**
 * Initializes all Socket.io event handlers.
 * Called once from index.js with the io instance.
 *
 * Room naming convention:
 *   trip:<tripId>   — traveller + all their guardians for that trip
 *   user:<userId>   — personal room for notifications to a single user
 */
export const initSocketHandlers = (io) => {
  // ── Auth middleware for socket connections ─────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    console.log(`🔌 Socket connected: ${socket.user.name} (${socket.id})`);

    // Join personal room
    socket.join(`user:${userId}`);

    // ── Traveller: join their active trip room ─────────────────────────────
    socket.on('trip:join', async ({ tripId }) => {
      try {
        const trip = await Trip.findById(tripId);
        if (!trip) return socket.emit('error', { message: 'Trip not found' });

        const isOwner = trip.traveller.toString() === userId;
        const isGuardian = await Guardian.findOne({
          traveller: trip.traveller,
          guardianUser: userId,
          status: 'active',
        });

        if (!isOwner && !isGuardian) {
          return socket.emit('error', { message: 'Not authorized for this trip' });
        }

        socket.join(`trip:${tripId}`);
        console.log(`📍 ${socket.user.name} joined trip room: ${tripId}`);
        socket.emit('trip:joined', { tripId });
      } catch (err) {
        console.error('trip:join error:', err.message);
      }
    });

    // ── Guardian: join trip rooms for all watched trips ────────────────────
    socket.on('guardian:join-all', async () => {
      try {
        const guardianships = await Guardian.find({
          guardianUser: userId,
          status: 'active',
        });

        for (const g of guardianships) {
          const activeTrip = await Trip.findOne({
            traveller: g.traveller,
            status: { $in: ['active', 'overdue', 'sos'] },
          }).select('_id');
          if (activeTrip) {
            socket.join(`trip:${activeTrip._id}`);
          }
        }

        socket.emit('guardian:rooms-joined');
      } catch (err) {
        console.error('guardian:join-all error:', err.message);
      }
    });

    // ── Leave trip room ────────────────────────────────────────────────────
    socket.on('trip:leave', ({ tripId }) => {
      socket.leave(`trip:${tripId}`);
    });

    // ── Guardian sends a "nudge" to traveller ──────────────────────────────
    socket.on('guardian:nudge', async ({ tripId }) => {
      try {
        const trip = await Trip.findById(tripId).populate('traveller', 'name');
        if (!trip) return;

        const isGuardian = await Guardian.findOne({
          traveller: trip.traveller._id,
          guardianUser: userId,
          status: 'active',
        });
        if (!isGuardian) return;

        // Send nudge to traveller's personal room
        io.to(`user:${trip.traveller._id}`).emit('trip:nudge', {
          tripId,
          guardianName: socket.user.name,
          message: `${socket.user.name} is checking on you — please confirm you're safe.`,
        });
      } catch (err) {
        console.error('guardian:nudge error:', err.message);
      }
    });

    // ── Heartbeat (keep connection alive + last seen) ──────────────────────
    socket.on('heartbeat', () => {
      socket.emit('heartbeat:ack', { ts: Date.now() });
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Disconnected: ${socket.user.name} — ${reason}`);
    });
  });
};