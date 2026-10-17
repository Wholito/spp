const mongoose = require('mongoose');
const logger = require('./lib/logger');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async (retries = 20) => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/spp_lab3';

  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await mongoose.connect(uri);
      logger.info('mongo_connected');
      return;
    } catch (err) {
      logger.error('mongo_connect_failed', { attempt, retries, message: err.message });
      if (attempt === retries) {
        throw err;
      }
      await sleep(2000);
    }
  }
};

module.exports = connectDB;
