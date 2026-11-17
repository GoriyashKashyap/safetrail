import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema(
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

    type: {
      type: String,
      enum: ['sos', 'overdue', 'arrived', 'trip_started', 'guardian_nudge'],
      required: true,
    },

    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'warning',
    },

    message: { type: String, maxlength: 500 },

    location: {
      lat: Number,
      lng: Number,
    },

    // Which channels were used
    channels: {
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: false },
      socket: { type: Boolean, default: false },
      telegram: { type: Boolean, default: false },
    },

    notifiedGuardians: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Guardian' }],

    acknowledged: { type: Boolean, default: false },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acknowledgedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

alertSchema.index({ trip: 1, createdAt: -1 });
alertSchema.index({ traveller: 1, acknowledged: 1 });

const Alert = mongoose.model('Alert', alertSchema);
export default Alert;