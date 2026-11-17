import mongoose from 'mongoose';
import Guardian from './Guardian.js';

// Guardian used to define sparse compound indexes. Because `traveller` is
// always present, those indexes also covered rows whose second key was null,
// which limited a traveller to one registered guardian and one guest. The
// schema now uses partial unique indexes; drop the legacy ones so existing
// deployments stop rejecting valid invites.
const LEGACY_GUARDIAN_INDEXES = ['traveller_1_guardianUser_1', 'traveller_1_guestEmail_1'];

const dropLegacyGuardianIndexes = async () => {
  for (const name of LEGACY_GUARDIAN_INDEXES) {
    await Guardian.collection.dropIndex(name).catch(() => {});
  }
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      dbName: 'safetrail',
    });
    await dropLegacyGuardianIndexes();
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌ MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed (app termination)');
  process.exit(0);
});

export default connectDB;