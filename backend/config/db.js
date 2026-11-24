const mongoose = require('mongoose');

const state = { connected: false };

function attachConnectionHandlers() {
  if (mongoose.connection.listenerCount('connected') > 0) return;

  mongoose.connection.on('connected', () => {
    state.connected = true;
    console.log('MongoDB connected');
  });

  mongoose.connection.on('disconnected', () => {
    state.connected = false;
    console.warn('MongoDB disconnected');
  });

  mongoose.connection.on('error', (err) => {
    state.connected = false;
    console.error('MongoDB connection error', err);
  });
}

const connectDB = async () => {
  attachConnectionHandlers();

  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ai-crop-doctor';
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    state.connected = true;
  } catch (err) {
    state.connected = false;
    console.error('MongoDB connection error', err);
    // Do not exit the process: allow server to run in degraded mode for testing.
    // Scans and chat history will use local JSON storage.
  }
};

module.exports = { connectDB, state };
