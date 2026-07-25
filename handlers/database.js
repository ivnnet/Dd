const mongoose = require('mongoose');

let isConnected = false;

async function connect() {
  const uri = process.env.URI || process.env.MONGO_URI;
  if (!uri) {
    console.log('MongoDB: no URI provided, skipping connection');
    return false;
  }
  try {
    await mongoose.connect(uri);
    isConnected = true;
    console.log('MongoDB connected');
    return true;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    return false;
  }
}

function isReady() {
  return isConnected;
}

module.exports = { connect, isReady };
