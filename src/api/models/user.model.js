const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { omitBy, isNil } = require('lodash');
const bcrypt = require('bcryptjs');
const moment = require('moment-timezone');
const jwt = require('jwt-simple');
const uuidv4 = require('uuid/v4');
const APIError = require('../errors/api-error');
const { env, jwtSecret, jwtExpirationInterval } = require('../../config/vars');
const OTP = require('./otp.model');
/**
* User Roles
*/
const roles = ['user', 'admin',  'system'];

const status = ['Active', 'Inactive', 'Deleted', 'Incomplete'];
/**
 * User Schema
 * @private
 */
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    maxlength: 128,
    index: true,
    trim: true,
  },
  mobile: {
    type: Number,
    maxlength: 10,
    index: true,
    unique: true,
    trim: true,
  },
  role: {
    type: String,
    enum: roles,
    default: 'user',
  },
  picture: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: status,
    default: 'Active'
  },
  address: [{
    apartment: {
      type: String,
      maxlength: 128,
      trim: true,
    },
    tower: {
      type: String,
      maxlength: 128,
      trim: true,
    },
    flatNo: {
      type: String,
      maxlength: 128,
      trim: true,
    }
  }],
  userDetails: {

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

userSchema.virtual('tracking', {
  ref: 'Tracking',
  localField: '_id',
  foreignField: 'refId',
  justOne: true
});

 userSchema.virtual('orderCount', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'customerId',
  options: {
    match: {
      status: {'$nin': ['PendingPayment', 'PaymentFailed']}
    }
  },
  count: true
});

userSchema.pre('save', async function save(next) {
  try {
    /*
    if (!this.isModified('password')) return next();

    const rounds = env === 'test' ? 1 : 10;

    const hash = await bcrypt.hash(this.password, rounds);
    this.password = hash;
    */
    return next();
  } catch (error) {
    return next(error);
  }
});

/**
 * Methods
 */
userSchema.method({
  transform() {
    const transformed = {};
    const fields = ['id', 'name', 'email', 'picture', 'role', 'createdAt', 'address', 'mobile', 'walletCredits', 'referralCode', 'orderCount', 'tracking'];
    
    fields.forEach((field) => {
      transformed[field] = this[field];
    });
    // let address = this['address'];
    // address = address.map(a => { return {apartment: a.apartment, tower: a.tower, flatNo: a.flatNo, apartmentId: a.apartmentId} });
    // transformed['address'] = address;
    return transformed;
  },

  token() {
    const payload = {
      exp: moment().add(jwtExpirationInterval, 'minutes').unix(),
      iat: moment().unix(),
      sub: this._id,
    };
    return jwt.encode(payload, jwtSecret);
  },

  async passwordMatches(password) {
    return bcrypt.compare(password, this.password);
  },
});

/**
 * Statics
 */
userSchema.statics = {

  roles,

  /**
   * Get user
   *
   * @param {ObjectId} id - The objectId of user.
   * @returns {Promise<User, APIError>}
   */
  async get(id) {
    let user;

    if (mongoose.Types.ObjectId.isValid(id)) {
      user = await this.findById(id).populate('tracking').exec();
    }
    if (user) {
      return user;
    }

    throw new APIError({
      message: 'User does not exist',
      status: httpStatus.NOT_FOUND,
    });
  },

  /**
   * Find user by email and tries to generate a JWT token
   *
   * @param {ObjectId} id - The objectId of user.
   * @returns {Promise<User, APIError>}
   */
  async loginAndGenerateToken(options) {
    const { mobile, otp } = options;
    if (!mobile) throw new APIError({ message: 'A mobile is required to generate a token' });

    const user = await this.findOne({ mobile }).populate('orderCount').exec();
    const errObj = {
      status: httpStatus.UNAUTHORIZED,
      isPublic: true,
    };
    if(!user) {
      errObj['message'] = 'User does not exist';
      throw new APIError(errObj);
    } else {
      const valid = otp== mobile;
      console.log('isOTPValid??', options, valid)
      if (valid) {
          for(let i = 0; i < user.address.length; i++) {
            let address = user.address[i].toJSON();
            //console.log('apartment ', apartment._id)
            user.address[i] = address;
            //console.log('user.address[i]', address, user.address[i])
          }
          return { user, accessToken: user.token() };
      } else {
        errObj['message'] = err.message;
      }  
      throw new APIError(errObj);
    }
  },


  /**
   * Find user by email and tries to generate a JWT token
   *
   * @param {ObjectId} id - The objectId of user.
   * @returns {Promise<User, APIError>}
   */
  async findAndGenerateToken(options) {
    const { mobile, password, refreshObject } = options;
    if (!mobile) throw new APIError({ message: 'A mobile number is required to generate a token' });

    const user = await this.findOne({ mobile }).exec();
    const err = {
      status: httpStatus.UNAUTHORIZED,
      isPublic: true,
    };
    if (password) {
      if (user && await user.passwordMatches(password)) {
        return { user, accessToken: user.token() };
      }
      err.message = 'Incorrect mobile or password';
    } else if (refreshObject && refreshObject.userMobile === mobile) {
      if (moment(refreshObject.expires).isBefore()) {
        err.message = 'Invalid refresh token.';
      } else {
        return { user, accessToken: user.token() };
      }
    } else {
      err.message = 'Incorrect mobile or refreshToken';
    }
    throw new APIError(err);
  },

  /**
   * List users in descending order of 'createdAt' timestamp.
   *
   * @param {number} skip - Number of users to be skipped.
   * @param {number} limit - Limit number of users to be returned.
   * @returns {Promise<User[]>}
   */
  list({
    page = 1,  name, email, role,mobile,limit=2000
  }) {
    const options = omitBy({ name, email, role, mobile }, isNil);

    return this.find(options)
      .sort({ createdAt: -1 })
      .skip(limit * (page - 1))
      .limit(limit)
      .exec();
  },

  /**
   * Return new validation error
   * if error is a mongoose duplicate key error
   *
   * @param {Error} error
   * @returns {Error|APIError}
   */
  checkDuplicateEmail(error) {
    if (error.name === 'MongoError' && error.code === 11000) {
      return new APIError({
        message: 'Validation Error',
        errors: [{
          field: 'email/mobile',
          location: 'body',
          messages: ['"email/mobile" already exists'],
        }],
        status: httpStatus.CONFLICT,
        isPublic: true,
        stack: error.stack,
      });
    }
    return error;
  },

  async oAuthLogin({
    service, id, email, name, picture,
  }) {
    const user = await this.findOne({ $or: [{ [`services.${service}`]: id }, { email }] });
    if (user) {
      user.services[service] = id;
      if (!user.name) user.name = name;
      if (!user.picture) user.picture = picture;
      return user.save();
    }
    const password = uuidv4();
    return this.create({
      services: { [service]: id }, email, password, name, picture,
    });
  },
};

/**
 * @typedef User
 */
module.exports = mongoose.model('User', userSchema);
