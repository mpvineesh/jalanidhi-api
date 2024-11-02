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
 * settings Schema
 * @private
 */
const settingsSchema = new mongoose.Schema({
  referralCredits: {
    type: Number,
    required: true,
    default:100
  },
  referrarCredits: {
    type: Number,
    required: true,
    default:100
  },
  signupCredits: {
    type: Number,
    required: true,
    default:0
  },
  creditValueInRs: {
    type: Number,
    required: true,
    default:1
  }

}, {
  timestamps: true,
});

/**
 * Add your
 * - pre-save hooks
 * - validations
 * - virtuals
 */
settingsSchema.pre('save', async function save(next) {
  try {
   
    return next();
  } catch (error) {
    return next(error);
  }
});


/**
 * Methods
 */
settingsSchema.method({
  transform() {
    const transformed = {};
    const fields = ['referralCredits', 'referrarCredits', 'creditValueInRs'];

    fields.forEach((field) => {
      transformed[field] = this[field];
    });

    return transformed;
  },

});


/**
 * Statics
 */
settingsSchema.statics = {

  /**
   * Get settings
   *
   * @param {ObjectId} id - The objectId of settings.
   * @returns {Promise<HSN>, APIError>}
   */
  async get(id) {
    let settings;

    if (mongoose.Types.ObjectId.isValid(id)) {
      settings = await this.findById(id).exec();
    }
    if (settings) {
      return settings;
    }

    throw new APIError({
      message: 'HSN does not exist',
      status: httpStatus.NOT_FOUND,
    });
  },

  
  /**
   * List settingss in descending order of 'createdAt' timestamp.
   *
   * @param {number} skip - Number of settingss to be skipped.
   * @param {number} limit - Limit number of settingss to be returned.
   * @returns {Promise<Product[]>}
   */
  list({
    page = 1, perPage = 30, name, email, role,
  }) {
    const options = omitBy({ name, email, role }, isNil);

    return this.find(options)
      .sort({ createdAt: -1 })
      .skip(perPage * (page - 1))
      .limit(perPage)
      .exec();
  },
}

module.exports = mongoose.model('Settings', settingsSchema);
