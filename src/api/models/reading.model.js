const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { omitBy, isNil } = require('lodash');
const bcrypt = require('bcryptjs');
const moment = require('moment-timezone');
const jwt = require('jwt-simple');
const uuidv4 = require('uuid/v4');
const APIError = require('../errors/api-error');
const { env, jwtSecret, jwtExpirationInterval } = require('../../config/vars');

/**
 * reading Schema
 * @private
 */
const status = ['Paid', 'Pending'];
const readingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  value: {
    type: Number,
    required: true,
  },
  charge: {
    type: Number,
    required: false,
  },
  paymentStatus: {
    type: String,
    enum: status,
    default: 'Pending'
  },
  month: {
    type: String,
    required: false,
  },

}, {
  timestamps: true,
});

/**
 * Add your
 * - pre-save hooks
 * - validations
 * - virtuals
 */
readingSchema.pre('save', async function save(next) {
  try {
   
    return next();
  } catch (error) {
    return next(error);
  }
});


readingSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});


/**
 * Methods
 */
readingSchema.method({
  transform() {
    const transformed = {};
    const fields = ['createdAt', 'value', 'charge', 'month', 'user'];

    fields.forEach((field) => {
      transformed[field] = this[field];
    });

    return transformed;
  },

});


/**
 * Statics
 */
readingSchema.statics = {

  /**
   * Get reading
   *
   * @param {ObjectId} id - The objectId of reading.
   * @returns {Promise<HSN>, APIError>}
   */
  async get(id) {
    let reading;

    if (mongoose.Types.ObjectId.isValid(id)) {
      reading = await this.findById(id).exec();
    }
    if (reading) {
      return reading;
    }

    throw new APIError({
      message: 'HSN does not exist',
      status: httpStatus.NOT_FOUND,
    });
  },

  
  /**
   * List readings in descending order of 'createdAt' timestamp.
   *
   * @param {number} skip - Number of readings to be skipped.
   * @param {number} limit - Limit number of readings to be returned.
   * @returns {Promise<Product[]>}
   */
  list({
    page = 1, perPage = 30, name, email, role,
  }) {
    const options = omitBy({ name, email, role }, isNil);

    return this.find(options).populate('user')
      .sort({ createdAt: -1 })
      .skip(perPage * (page - 1))
      .limit(perPage)
      .exec();
  },
}

module.exports = mongoose.model('Reading', readingSchema);
