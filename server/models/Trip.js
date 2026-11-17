import mongoose from 'mongoose';

const checkInSchema = new mongoose.Schema(
  {
    confirmedAt: { type: Date, default: Date.now },
    lat: Number,
    lng: Number,
    note: { type: String, maxlength: 200 },
  },
  { _id: false }
);

const tripSchema = new mongoose.Schema(
  {
    traveller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    title: {
      type: String,
      trim: true,
      maxlength: [100, 'Trip title must not exceed 100 characters'],
      default: 'My Trip',
    },

    origin: {
      label: String,
      lat: Number,
      lng: Number,
    },

    destination: {
      label: { type: String, required: [true, 'Destination is required'] },
      lat: Number,
      lng: Number,
    },

    transport: {
      type: String,
      enum: ['train', 'bus', 'car', 'flight', 'other'],
      default: 'other',
    },

    // Optional: train number, bus route, flight number, vehicle plate
    transportRef: { type: String, trim: true, maxlength: 40 },

    startTime: { type: Date, required: true },
    estimatedArrival: { type: Date, required: true },
    arrivedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ['scheduled', 'active', 'completed', 'sos', 'overdue', 'cancelled'],
      default: 'scheduled',
    },

    checkInInterval: {
      type: Number,
      enum: [15, 30, 60],
      default: 30, // minutes
    },

    lastCheckIn: { type: Date, default: null },
    checkIns: [checkInSchema],

    // Guardians watching this trip
    guardians: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Guardian' }],

    // SOS data (if triggered)
    sos: {
      triggeredAt: { type: Date, default: null },
      lat: Number,
      lng: Number,
      message: { type: String, maxlength: 500 },
      resolvedAt: { type: Date, default: null },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },

    // Watchdog: set to Date.now + checkInInterval, updated on each check-in
    nextCheckInDue: { type: Date, default: null },

    // Auto-cleared 30 days after completion (TTL via cron)
    archivedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// Index for watchdog queries: all active trips with overdue check-ins
tripSchema.index({ status: 1, nextCheckInDue: 1 });
tripSchema.index({ traveller: 1, status: 1 });

const Trip = mongoose.model('Trip', tripSchema);
export default Trip;