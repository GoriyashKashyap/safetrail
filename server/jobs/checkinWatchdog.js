import cron from 'node-cron';
import Trip from '../models/Trip.js';
import { notifyGuardians, notifyTraveller } from '../services/notify.js';

/**
 * Watchdog cron — runs every 5 minutes.
 * Finds active trips where nextCheckInDue has passed, marks them overdue and
 * fires the alert chain (socket + email + Telegram) through services/notify.js.
 */
export const startWatchdog = (io) => {
  cron.schedule('*/5 * * * *', async () => {
    const now = new Date();
    console.log(`[Watchdog] Running at ${now.toISOString()}`);

    try {
      const overdueTrips = await Trip.find({
        status: 'active',
        nextCheckInDue: { $lt: now },
      }).populate('traveller', 'name email phone telegramChatId');

      if (!overdueTrips.length) return;

      console.log(`[Watchdog] ${overdueTrips.length} overdue trip(s) found`);

      for (const trip of overdueTrips) {
        try {
          trip.status = 'overdue';
          await trip.save();

          const minutesAgo = trip.lastCheckIn
            ? Math.round((now - new Date(trip.lastCheckIn)) / 60000)
            : null;
          const message = `${trip.traveller.name} has not checked in. Last check-in was ${
            minutesAgo === null ? 'never' : `${minutesAgo} minutes ago`
          }.`;

          await notifyGuardians({
            io,
            trip,
            travellerName: trip.traveller.name,
            type: 'overdue',
            severity: 'warning',
            message,
          });

          await notifyTraveller({
            io,
            trip,
            traveller: trip.traveller,
            text: 'You are overdue for a check-in. Your guardians have been notified — check in as soon as you are safe.',
          });

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
