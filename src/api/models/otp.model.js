const mongoose = require('mongoose');
const httpStatus = require('http-status');
const APIError = require('../errors/api-error');

 
/**
 * OTP Schema
 * @private
 */
const OTPSchema = new mongoose.Schema({
    otp: {type: Number, required: true},
    mobile: {type: Number, required: false},
    type: {type: String, required: false},
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    createdOn: { type: Date, default: Date.now },
    expiresOn: { type: Date, default: Date.now },
    requestCount: {type: Number, required: false, default: 0}
}, {
  timestamps: false,
});

/**
 * Add your
 * - pre-save hooks
 * - validations
 * - virtuals
 */

/**
 * Methods
 */

OTPSchema.pre('save', async function save(next) {
  return next();
});


/**
 * Statics
 */
OTPSchema.statics = {

  /**
   * Get OTP
   *
   * @param {ObjectId} id - The objectId of OTP.
   * @returns {Promise<Product, APIError>}
   */
  async get(id) {
    let OTP;

    if (mongoose.Types.ObjectId.isValid(id)) {
      OTP = await this.findById(id).exec();
    }
    if (OTP) {
      return OTP;
    }

    throw new APIError({
      message: 'OTP does not exist',
      status: httpStatus.NOT_FOUND,
    });
  },

  async isValid(options) {
    const { otp} = options;
    console.log('isValid', options)
    if (!otp) return ({ valid: false, error: { message: 'Invalid OTP' } });
    let valid = false;
    const otpDoc = await this.findOne(options).exec();
    const err = {
      status: httpStatus.UNAUTHORIZED,
      isPublic: true,
    };
    if (otpDoc) {
      if(new Date().getTime() > new Date(otpDoc.expiresOn).getTime()) {
        err.message = 'OTP has been expired';
      } else {
        valid = true;
      }
    } 
    //console.log('{ valid, err}', { valid, err}) 
    return ({ valid, err})
  },

  /**
   * List OTPs in descending order of 'createdAt' timestamp.
   *
   * @param {number} skip - Number of products to be skipped.
   * @param {number} limit - Limit number of products to be returned.
   * @returns {Promise<Product[]>}
   */
}

module.exports = mongoose.model('OTP', OTPSchema);
