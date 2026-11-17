import mongoose from 'mongoose';

/**
 * Location — a single GPS ping or check-in position for a trip.
 * Written by POST /api/trips/:id/location and by check-ins that include
 * coordinates. Read by guardians via GET /api/trips/:id/locations.
 */
const locationSchema = new mongoose.Schema(
  {
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      required: true,
    },
    traveller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },

    accuracy: Number, // metres
    speed: Number, // m/s
    heading: Number, // degrees
    altitude: Number, // metres
    battery: Number, // percent

    timestamp: { type: Date, default: Date.now, required: true },

    // True when this ping came from a manual check-in rather than background GPS
    isCheckIn: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Timeline query for a trip, and TTL-style cleanup by traveller
locationSchema.index({ trip: 1, timestamp: 1 });
locationSchema.index({ traveller: 1, timestamp: -1 });

const Location = mongoose.model('Location', locationSchema);
export default Location;
