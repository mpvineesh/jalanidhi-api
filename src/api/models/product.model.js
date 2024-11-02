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
 * Product Schema
 * @private
 */
const productSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: false,
    maxlength: 1000,
  },
  category: {
    type: String,
    required: true,
    trim: true,
  },
  unit: {
    type: String,
    required: false,
    default: 1
  },
  marketPrice: {
    type: Number,
    required: false,
  },
  groupPrice: {
    type: Number,
    required: true,
  },
  attributes: [{
    name: {
      type: String,
      required: false,
    },
    isRequired: {
      type: Boolean,
      required: true
    },
    options: [{
      label: {
        type: String,
        required: false,
      },
      value: {
        type: String,
        required: false,
      },
      price: {
        type: Number,
        required: false,
      },
      maxCountPerUser: {
        type: Number,
        required: false
      },

    }]
  }],
  maxCountPerUser: {
    type: Number,
    required: false,
  },
  minimumOrder: {
    type: Number,
    required: false,
    default: 1
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  tags: [{
    type: String,
    required: false
  }],
  images: [{
    link: {
      type: String,
      required: false,
    },
    label: {
      type: String,
      required: false,
    }    
  }],
  HSNCode: {
    type: String,
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
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


productSchema.virtual('hsnInfo', {
  ref: 'HSNCode',
  localField: 'HSNCode',
  foreignField: 'code',
  justOne: true
});

productSchema.pre('save', async function save(next) {
  try {
    // if (!this.isModified('password')) return next();

    // const rounds = env === 'test' ? 1 : 10;

    // const hash = await bcrypt.hash(this.password, rounds);
    // this.password = hash;

    return next();
  } catch (error) {
    return next(error);
  }
});

/**
 * Methods
 */
productSchema.method({
  transform() {
    const transformed = {};
    const fields = ['id', 'name', 'description', 'vendorId', 'category', 'unit', 'marketPrice', 'groupPrice','minimumOrder','stock', 'maxCountPerUser', 'tags', 'images', 'attributes', 'HSNCode'];

    fields.forEach((field) => {
      transformed[field] = this[field];
    });

    return transformed;
  },

});

/**
 * Statics
 */
productSchema.statics = {

  /**
   * Get product
   *
   * @param {ObjectId} id - The objectId of product.
   * @returns {Promise<Product, APIError>}
   */
  async get(id) {
    let product;
    console.log('Is valid', mongoose.Types.ObjectId.isValid(id))
    if (mongoose.Types.ObjectId.isValid(id)) {
      
      product = await this.findById(id).exec();
    }
    if (product) {
      return product;
    }

    throw new APIError({
      message: 'Product does not exist',
      status: httpStatus.NOT_FOUND,
    });
  },

  
  /**
   * List products in descending order of 'createdAt' timestamp.
   *
   * @param {number} skip - Number of products to be skipped.
   * @param {number} limit - Limit number of products to be returned.
   * @returns {Promise<Product[]>}
   */
  list({
    page = 1, perPage = 1000, name, email, role,
  }) {
    const options = omitBy({ name, email, role }, isNil);

    return this.find(options)
      .sort({ createdAt: -1 })
      .skip(perPage * (page - 1))
      .limit(perPage)
      .exec();
  },
}
/**
 * @typedef Product
 */
module.exports = mongoose.model('Product', productSchema);
