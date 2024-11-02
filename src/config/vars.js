
const path = require('path');

// import .env variables
require('dotenv-safe').config({
  path: path.join(__dirname, '../../.env'),
  example: path.join(__dirname, '../../.env.example'),
});

module.exports = {
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpirationInterval: process.env.JWT_EXPIRATION_MINUTES,
  mongo: {
    uri: process.env.NODE_ENV === 'test' ? process.env.MONGO_URI_TESTS : process.env.MONGO_URI,
  },
  logs: process.env.NODE_ENV === 'production' ? 'combined' : 'combined',
  emailConfig: {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    username: process.env.EMAIL_USERNAME,
    password: process.env.EMAIL_PASSWORD,
  },
  CASH_FREE_APP_ID: process.env.CASH_FREE_APP_ID,
  CASH_FREE_SECRET_KEY: process.env.CASH_FREE_SECRET_KEY,
  CASH_FREE_NOTIFY_URL: process.env.CASH_FREE_NOTIFY_URL,
  CASH_FREE_BASE_URL: process.env.CASH_FREE_BASE_URL,
  API_BASE_URL: process.env.API_BASE_URL,
  CASH_FREE_BASE_PG_URL: process.env.CASH_FREE_BASE_PG_URL,
  RAZORPAY_CALBACK_URL: process.env.RAZORPAY_CALBACK_URL,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
};
