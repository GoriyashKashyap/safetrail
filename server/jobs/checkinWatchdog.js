import cron from 'node-cron';
import Trip from '../models/Trip.js';
import Alert from '../models/Alert.js';
import Guardian from '../models/Guardian.js';
import User from '../models/User.js';
import { sendAlertEmail } from '../utils/email.js';

/**
 * Watchdog cron — runs every 5 minutes.
 * Finds active trips where nextCheckInDue has passed,
 * marks them overdue, and fires the alert chain.
 */
export const startWatchdog = (io) => {
  cron.schedule('*/5 * * * *', async () => {
    const now = new Date();
    console.log(`[Watchdog] Running at ${now.toISOString()}`);

    try {
      // All active trips where next check-in is overdue
      const overdueTrips = await Trip.find({
        status: 'active',
        nextCheckInDue: { $lt: now },
      }).populate('traveller', 'name email phone');

      if (!overdueTrips.length) return;

      console.log(`[Watchdog] ${overdueTrips.length} overdue trip(s) found`);

      for (const trip of overdueTrips) {
        try {
          // Mark as overdue
          trip.status = 'overdue';
          await trip.save();

          // Create alert record
          const alert = await Alert.create({
            trip: trip._id,
            traveller: trip.traveller._id,
            type: 'overdue',
            severity: 'warning',
            message: `${trip.traveller.name} has not checked in. Last check-in was ${
              trip.lastCheckIn
                ? Math.round((now - new Date(trip.lastCheckIn)) / 60000) + ' minutes ago'
                : 'unknown'
            }.`,
            channels: {},
            notifiedGuardians: [],
          });

          // Fetch active guardians
          const guardians = await Guardian.find({
            _id: { $in: trip.guardians },
            status: 'active',
          });

          // Resolve guardian contact info
          const guardianUsers = await Promise.all(
            guardians.map(async (g) => {
              if (g.guardianUser) {
                const u = await User.findById(g.guardianUser).select('name email phone');
                return { guardian: g, user: u, email: u?.email, name: u?.name };
              }
              return { guardian: g, user: null, email: g.guestEmail, name: g.guestName };
            })
          );

          // Emit socket alert to trip room
          io?.to(`trip:${trip._id}`).emit('alert:overdue', {
            tripId: trip._id,
            travellerName: trip.traveller.name,
            message: alert.message,
            triggeredAt: now,
          });
          alert.channels.socket = true;

          // Also notify traveller directly
          io?.to(`user:${trip.traveller._id}`).emit('trip:overdue-warning', {
            tripId: trip._id,
            message: 'You are overdue for a check-in. Your guardians are being notified.',
          });

          // Send emails to guardians
          let emailSent = 0;
          let emailAttempts = 0;
          for (const { email, name } of guardianUsers) {
            if (!email) continue;
            emailAttempts += 1;
            try {
              await sendAlertEmail({
                toEmail: email,
                toName: name,
                travellerName: trip.traveller.name,
                type: 'overdue',
                trip,
                location: null,
              });
              emailSent += 1;
            } catch (e) {
              console.error(`[Watchdog] Alert email to ${email} failed:`, e.message);
            }
          }
          if (emailSent) alert.channels.email = true;
          if (emailAttempts && !emailSent) {
            console.error(
              `[Watchdog] No alert email was delivered for trip ${trip._id} (${emailAttempts} guardian(s)) — check the SMTP settings.`
            );
          }

          alert.notifiedGuardians = guardians.map((g) => g._id);
          await alert.save();

          console.log(`[Watchdog] Alert fired for trip ${trip._id} (${trip.traveller.name})`);
        } catch (tripErr) {
          console.error(`[Watchdog] Error processing trip ${trip._id}:`, tripErr.message);
        }
      }
    } catch (err) {
      console.error('[Watchdog] Fatal error:', err.message);
    }
  });

  console.log('✅ Check-in watchdog started (every 5 min)');
};