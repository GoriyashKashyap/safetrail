import Alert from '../models/Alert.js';
import Guardian from '../models/Guardian.js';
import { sendAlertEmail } from '../utils/email.js';
import { sendMessage, sendLocation } from '../utils/telegram.js';
import { getAppUrl } from '../config/appUrl.js';

/**
 * Socket event emitted for each notification type. Names match what the client
 * already listens for in Watching.jsx / GuardianTrip.jsx / TripDetail.jsx.
 */
const SOCKET_EVENTS = {
  sos: 'trip:sos',
  overdue: 'alert:overdue',
  trip_started: 'trip:started',
  arrived: 'trip:completed',
  guardian_nudge: 'trip:nudge',
};

const TITLES = {
  sos: '🚨 SOS',
  overdue: '⚠️ Missed check-in',
  trip_started: '🚀 Trip started',
  arrived: '✅ Arrived safely',
  guardian_nudge: '👋 Check-in request',
};

export const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

const travellerId = (trip) => trip.traveller?._id || trip.traveller;

/**
 * Guardians of a trip, with the contact details needed to reach them.
 * Guardians are only contacted when their `receiveAlerts` permission is on.
 */
export const loadGuardianContacts = async (trip) => {
  const guardians = await Guardian.find({
    _id: { $in: trip.guardians || [] },
    status: 'active',
  }).populate('guardianUser', 'name email telegramChatId settings');

  return guardians
    .map((guardian) => {
      const user = guardian.guardianUser;
      const notifyByTelegram = user?.settings?.notifyByTelegram !== false;
      return {
        guardian,
        user,
        name: user?.name || guardian.guestName || 'Guardian',
        email: user?.email || guardian.guestEmail || null,
        chatId: notifyByTelegram ? user?.telegramChatId || null : null,
        notifyByEmail: user?.settings?.notifyByEmail !== false,
        viewLiveLocation: guardian.permissions?.viewLiveLocation !== false,
        receiveAlerts: guardian.permissions?.receiveAlerts !== false,
      };
    })
    .filter((contact) => contact.receiveAlerts);
};

/** Human-readable Telegram body for a trip event. */
export const telegramBody = ({ title, trip, message, location, appUrl, role = 'guardian' }) => {
  const lines = [`<b>${title}</b>`];
  if (message) lines.push(message);

  const from = trip.origin?.label;
  const to = trip.destination?.label;
  if (to) lines.push(`<b>Route:</b> ${from ? `${from} → ` : ''}${to}`);
  if (trip.transport) {
    lines.push(
      `<b>Transport:</b> ${trip.transport}${trip.transportRef ? ` · ${trip.transportRef}` : ''}`
    );
  }
  lines.push(`<b>Status:</b> ${String(trip.status || '').toUpperCase()}`);

  if (trip.lastCheckIn) lines.push(`<b>Last check-in:</b> ${new Date(trip.lastCheckIn).toLocaleString()}`);
  if (trip.nextCheckInDue) {
    lines.push(`<b>Next check-in:</b> ${new Date(trip.nextCheckInDue).toLocaleString()}`);
  }
  if (location?.lat && location?.lng) {
    lines.push(`<b>Location:</b> ${mapsLink(location.lat, location.lng)}`);
  }

  const tripPath = role === 'traveller' ? `/trips/${trip._id}` : `/guardian/trip/${trip._id}`;
  lines.push(`<b>Live map:</b> ${appUrl}${tripPath}`);
  return lines.join('\n');
};

const tripButtons = (trip, role) => {
  const appUrl = getAppUrl();
  const path = role === 'traveller' ? `/trips/${trip._id}` : `/guardian/trip/${trip._id}`;
  return [[{ text: role === 'traveller' ? 'Open my trip' : 'Open live map', url: `${appUrl}${path}` }]];
};

/**
 * Notify every active guardian of a trip over socket, email and Telegram, and
 * store the alert record. Returns the saved Alert plus delivery counters.
 */
export const notifyGuardians = async ({
  io,
  trip,
  travellerName,
  type,
  severity = 'warning',
  message,
  location = null,
}) => {
  const contacts = await loadGuardianContacts(trip);
  const name = travellerName || trip.traveller?.name || 'Traveller';
  const appUrl = getAppUrl();
  const channels = { socket: false, email: false, telegram: false };

  const event = SOCKET_EVENTS[type] || `alert:${type}`;
  if (io) {
    // The trip room only covers sockets that already knew about this trip. A
    // guardian who opened the app before the trip started (or is on another
    // page) is reached through their personal room. Socket.IO unions rooms,
    // so a socket in both still receives the event once.
    const rooms = [`trip:${trip._id}`];
    for (const contact of contacts) {
      if (contact.user?._id) rooms.push(`user:${contact.user._id}`);
    }

    io.to(rooms).emit(event, {
      tripId: trip._id,
      travellerName: name,
      destination: trip.destination?.label,
      status: trip.status,
      lat: location?.lat ?? null,
      lng: location?.lng ?? null,
      message,
      triggeredAt: new Date(),
      arrivedAt: trip.arrivedAt,
    });
    channels.socket = true;
  }

  const body = telegramBody({
    title: `${TITLES[type] || 'SafeTrail'} — ${name}`,
    trip,
    message,
    location,
    appUrl,
  });

  const deliveries = await Promise.all(
    contacts.map(async (contact) => {
      let emailOk = false;
      let telegramOk = false;

      if (contact.email && contact.notifyByEmail) {
        try {
          await sendAlertEmail({
            toEmail: contact.email,
            toName: contact.name,
            travellerName: name,
            type: type === 'arrived' ? 'arrived' : type,
            trip,
            location,
          });
          emailOk = true;
        } catch (err) {
          console.error(`[notify] email to ${contact.email} failed:`, err.message);
        }
      }

      if (contact.chatId) {
        const sent = await sendMessage(contact.chatId, body, {
          html: true,
          buttons: tripButtons(trip, 'guardian'),
        });
        telegramOk = Boolean(sent);
      }

      return { emailOk, telegramOk };
    })
  );

  channels.email = deliveries.some((d) => d.emailOk);
  channels.telegram = deliveries.some((d) => d.telegramOk);

  if (!contacts.length) {
    console.warn(`[notify] ${type}: trip ${trip._id} has no active guardians to alert`);
  }

  const alert = await Alert.create({
    trip: trip._id,
    traveller: travellerId(trip),
    type,
    severity,
    message,
    ...(location?.lat && location?.lng ? { location: { lat: location.lat, lng: location.lng } } : {}),
    channels,
    notifiedGuardians: contacts.map((contact) => contact.guardian._id),
  });

  console.log(`[notify] ${type} for trip ${trip._id}`, {
    guardians: contacts.length,
    ...channels,
  });

  return { alert, contacts };
};

/** Notify the traveller themselves (personal room + Telegram). */
export const notifyTraveller = async ({ io, trip, traveller, text, event = 'trip:overdue-warning' }) => {
  const id = traveller?._id || traveller || travellerId(trip);
  if (io && id) {
    io.to(`user:${id}`).emit(event, { tripId: trip._id, message: text });
  }
  const chatId = trip.traveller?.telegramChatId || traveller?.telegramChatId;
  if (chatId) {
    await sendMessage(chatId, text, { buttons: tripButtons(trip, 'traveller') });
  }
};

/**
 * Push one live position to guardians on Telegram. Telegram bots cannot stream
 * a live location, so this sends a pin plus a link to the live map.
 */
export const feedLiveLocation = async ({ trip, travellerName, lat, lng, contacts }) => {
  const targets = contacts.filter((contact) => contact.chatId && contact.viewLiveLocation);
  if (!targets.length) return 0;

  const appUrl = getAppUrl();
  const text = [
    `<b>📍 ${travellerName || trip.traveller?.name || 'Traveller'} moved</b>`,
    `<b>Position:</b> ${mapsLink(lat, lng)}`,
    `<b>Live map:</b> ${appUrl}/guardian/trip/${trip._id}`,
  ].join('\n');

  const results = await Promise.all(
    targets.map(async (contact) => {
      const pin = await sendLocation(contact.chatId, lat, lng);
      const textSent = await sendMessage(contact.chatId, text, {
        html: true,
        buttons: tripButtons(trip, 'guardian'),
      });
      return Boolean(pin) || Boolean(textSent);
    })
  );

  return results.filter(Boolean).length;
};
