import mongoose from 'mongoose';

/**
 * Guardian schema — links a traveller to a trusted guardian contact.
 * A guardian can be either an existing registered user OR an unregistered
 * guest (invited by email). Both can receive alerts.
 */
const guardianSchema = new mongoose.Schema(
  {
    traveller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // If guardian is a registered user on the platform
    guardianUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // If guardian is invited by email (unregistered)
    guestEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
    guestName: {
      type: String,
      trim: true,
    },
    guestPhone: {
      type: String,
      trim: true,
    },

    // Invite flow
    inviteToken: { type: String, select: false },
    inviteExpires: { type: Date, select: false },

    status: {
      type: String,
      enum: ['pending', 'active', 'declined', 'removed'],
      default: 'pending',
    },

    // What the guardian is allowed to see/do
    permissions: {
      viewLiveLocation: { type: Boolean, default: true },
      receiveAlerts: { type: Boolean, default: true },
      viewTripHistory: { type: Boolean, default: true },
      sendNudge: { type: Boolean, default: true },
    },

    label: {
      type: String,
      trim: true,
      maxlength: 30,
      default: 'Guardian', // e.g. "Mom", "Best Friend"
    },

    acceptedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Ensure a traveller can't add the same guardian twice
guardianSchema.index({ traveller: 1, guardianUser: 1 }, { unique: true, sparse: true });
guardianSchema.index({ traveller: 1, guestEmail: 1 }, { unique: true, sparse: true });

// Virtual: display name resolved from either source
guardianSchema.virtual('displayName').get(function () {
  if (this.guardianUser?.name) return this.guardianUser.name;
  return this.guestName || this.guestEmail || 'Guardian';
});

const Guardian = mongoose.model('Guardian', guardianSchema);
export default Guardian;