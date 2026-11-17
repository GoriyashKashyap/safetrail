import Guardian from '../models/Guardian.js';
import Trip from '../models/Trip.js';

/**
 * A guardian added after a trip was created must also be attached to the
 * traveller's live trips, otherwise alerts and trip rooms would skip them.
 */
export const attachGuardianToTrips = async (guardian) => {
  await Trip.updateMany(
    {
      traveller: guardian.traveller,
      status: { $in: ['scheduled', 'active', 'overdue', 'sos'] },
    },
    { $addToSet: { guardians: guardian._id } }
  ).catch((err) => console.error('[guardian] could not attach to trips:', err.message));
};

/**
 * Invitations addressed to the signed-in account are activated on first use:
 * the traveller explicitly chose this person, and email delivery cannot be
 * relied on. Guest invites sent before the account existed are claimed too.
 */
export const claimPendingGuardianships = async (user) => {
  const claimed = await Guardian.find({
    status: 'pending',
    $or: [{ guardianUser: user._id }, { guardianUser: null, guestEmail: user.email }],
  }).catch(() => []);

  for (const guardian of claimed) {
    await Guardian.updateOne(
      { _id: guardian._id },
      {
        $set: { guardianUser: user._id, status: 'active', acceptedAt: new Date() },
        $unset: { inviteToken: '', inviteExpires: '' },
      }
    ).catch((err) => console.error('[guardian] claim failed:', err.message));
    await attachGuardianToTrips(guardian);
  }

  return claimed.length;
};
