const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { omitBy, isNil } = require('lodash');
const uuidv4 = require('uuid/v4');
const APIError = require('../errors/api-error');
const status = ['PendingPayment', 'PaymentSuccess','PaymentCancelled', 'Confirmed', 'PaymentFailed', 'OutForDelivery', 'Delivered', 'Cancelled', 'PartialDelivery', 'Returned'];

const orderStatusFlow = [
  { current : 'PendingPayment' , next: ['Cancelled', 'Confirmed'] },
  { current : 'PaymentSuccess' , next: ['Cancelled', 'Confirmed'] },
  { current : 'PaymentCancelled' , next: ['Cancelled', 'PendingPayment'] },
  { current : 'Confirmed' , next: ['Cancelled', 'OutForDelivery'] },
  { current : 'OutForDelivery' , next: ['PartialDelivery', 'Delivered'] },
  { current : 'PartialDelivery' , next: ['Delivered'] },
  { current : 'Cancelled' , next: [] },
  { current : 'Delivered' , next: ['Returned'] }

]

/**
 * Order Schema
 * @private
 */
const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  campaigns: [{
    subOrderId: {
      type: String,
      required: false,
      unique: true,
      trim: true
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true
    },
    name: {
      type: String,
      required: false
    },
    deliveryDate: {
      type: Date,
      trim: true,
      required: true
    },
    status: {
      type: String,
      enum: status,
      default: 'PendingPayment'
    },
    products: [{
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      name: {
        type: String,
        required: false
      },
      vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendor',
        required: false
      },
      quantity: {
        type: Number,
        required: true,
      },
      price: {
        type: Number,
        required: true,
      },
      total: {
        type: Number,
        required: false
      },
      attributes: [{
        name: {
          type: String,
          required: true,
        },
        value: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        }, 
        quantity: {
          type: Number,
          required: false,
        },
      }],
      status: {
        type: String,
        enum: status,
        default: 'PendingPayment'
      },
    }],
    statusUpdates:[{
      status: String,
      products:[mongoose.Schema.Types.ObjectId],
      comments: String,
      date: {
        type: Date, 
        default: new Date() ,
      },
      _id: false
    }],
    cancellationInfo:{
      reason: String,
      comments: String,
      date: Date,
      products:[mongoose.Schema.Types.ObjectId]
    },
    ratings: {
      rating: Number,
      comments: String,
      imageUrls: [String]
    },
    amount: {
      type: Number,
      required: true
    },
    vendorSplit: [{
      vendor_id: {
        type: String,
        required: false
      },
      amount: {
        type: Number,
        required: false
      }
    }],
    cancellationInfo:{
      reason: String,
      comments: String,
      date: Date,
      _id: false
    }
  }],
  status: {
    type: String,
    enum: status,
    default: 'PendingPayment'
  },
  paymentStatus: {
    type: String,
    default: ''
  },
  address: {
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
    },
    mobile: {
      type: Number,
      maxlength: 10,
      index: true,
      trim: true,
    },
    _id: false
  },
  
  amount: {
    type: Number,
    required: true
  },
  total: {
    type: Number,
    required: false
  },
  history: [{
    status: {
      type: String,
      required: false,
    },
    comments: {
      type: String,
      required: false,
    },
    updatedOn: {
      type: Date,
      default:Date.now,
      required: false,
    }
  }],
  rzpOrderId: {
    type: String,
    required: false
  },
  CFOrderId: {
    type: String,
    required: false
  },
  pgOrderId: {
    type: String,
    required: false
  },
  paymentGateway: {
    type: String,
    enum: ['Razorpay', 'Cashfree'],
    required: false
  },
  vendorSplit: [{
    vendor_id: {
      type: String,
      required: false
    },
    amount: {
      type: Number,
      required: false
    }
  }],
  referralRewardInfo:{
    eligible: Boolean,
    status:{
      type: String,
      enum: ['Pending', 'Processed'],
    },
    processedOn: Date
  },
  isExchangeOrder: {
    type: Boolean,
    default: false
  },
  parentOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  },

  statusUpdates:[{
    status: String,
    comments: String,
    date: {
      type: String, 
      default: new Date() ,
    },
    _id: false
  }],
  cancellationInfo:{
    reason: String,
    comments: String,
    date: Date,
    _id: false
  },
  stockUpdated: {
    type: Boolean,
    default: false
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


 orderSchema.virtual('transaction', {
  ref: 'Transaction',
  localField: '_id',
  foreignField: 'orderId',
  justOne: true
});

orderSchema.virtual('customer', {
  ref: 'User',
  localField: 'customerId',
  foreignField: '_id',
  justOne: true
});

orderSchema.virtual('tracking', {
  ref: 'Tracking',
  localField: '_id',
  foreignField: 'refId',
  justOne: true
});

orderSchema.virtual('tickets', {
  ref: 'Ticket',
  localField: 'campaigns.subOrderId',
  foreignField: 'refId',
  justOne: false
});


orderSchema.set('toObject', {
  virtuals: true
});

orderSchema.set('toJSON', {
  virtuals: true
});

orderSchema.path('campaigns').schema.virtual('tickets').get(function() {
  return 'testing'
})

orderSchema.pre('save', async function save(next) {
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

orderSchema.post('save', async function(order) {
  
});

/**
 * Methods
 */
orderSchema.method({
  transform() {
    const transformed = {};
    let order= this.toJSON()
    const fields = ['id', 'orderId', 'customer', 'status', 'address', 'campaigns', 'createdAt', 'ratings', 'tickets', 'statusUpdates','amount', 'CFOrderId', 'tracking'];
    

    fields.forEach((field) => {
      transformed[field] = order[field] || null;
    });

    if(order['customer']) {
      let c =  order['customer'];
      customer = {id: c.id, name: c.name, mobile: c.mobile, email: c.email}

      transformed['customer'] = customer;
    }
    /*if(this['campaign']) {
      let c =  this['campaign'];
      campaign = {id: c.id, name:c.name}
      transformed['campaign'] = campaign;
    }*/
    /*let products = this.products;
    //console.log('products', products)
    if(products &&  products.length) {
      products = products.map(p => {
        let prod = p.toJSON()
        let details = p.productId ? p.productId.transform() : prod;
        delete prod.productId;
        delete prod.__v;  
        delete prod._id;
        delete details.__v;
        delete details.tags;
        delete details.createdAt;
        delete details.updatedAt;
        delete details.images;
        delete details.maxCountPerUser;
        delete details.groupPrice;
        delete details.description;

        return {...details, ...prod};
      })
      transformed['products'] = products;
    }*/
    return transformed;
  },

});

/**
 * Statics
 */
orderSchema.statics = {

  status,
  orderStatusFlow,

  /**
   * Get order
   *
   * @param {ObjectId} id - The objectId of order.
   * @returns {Promise<Order, APIError>}
   */
  async get(id) {
    let order;
    console.log('Checking the order', id)
    if (mongoose.Types.ObjectId.isValid(id)) {
      order = await this.findById(id).populate('customer').populate('tracking').populate({path: 'tickets', options: { sort: { 'createdAt': -1 } } })
  
     .exec();
    }
    if (order) {
      return order;
    }
    //logger.error('Order not found'+id)
    throw new APIError({
      message: 'Order does not exist',
      status: httpStatus.NOT_FOUND,
    });
  },

  /**
   * Get order
   *
   * @param {ObjectId} id - The objectId of order.
   * @returns {Promise<Order, APIError>}
   */
  async getCampaignOrderStatus(campaignId) {
    let total = {};

    if (mongoose.Types.ObjectId.isValid(campaignId)) {
      orders = await this.find({'campaigns.campaignId': campaignId});
      let campaign = await Campaign.get(campaignId);
      if(orders.length) {
        let productList = campaign.products;
        productList = productList.reduce((obj, p) => {
          obj[p.id] = p;
          return obj;
        },{});
        
         //console.log('productList', productList)
        total = orders.reduce((p, ord) => {
          let products = ord.campaigns.filter(c => c.campaignId == campaignId)[0].products;
          products.forEach(pr => {
            //console.log('pr',pr)
            if(p[pr.productId]) {
              p[pr.productId].total = p[pr.productId].total + pr.quantity;
            } else {
              p[pr.productId] = {id:pr.productId, stock: productList[pr.productId] ? productList[pr.productId].stock : 0, total: pr.quantity}
            }
          });
          return p;
        },{})
      }
    }
    return total;
  },

  async getOrderCountForUser(userId) {
    
    let orders = await this.countDocuments({'userId': userId, status: {$nin: ['Cancelled', 'PendingPayment', 'PaymentCancelled', 'PaymentFailed']}});
  
    return orders;
  },

  /**
   * List orders in descending order of 'createdAt' timestamp.
   *
   * @param {number} skip - Number of orders to be skipped.
   * @param {number} limit - Limit number of orders to be returned.
   * @returns {Promise<Order[]>}
   */
  list({
    page = 1, perPage = 1000, customerId,orderId, mobile, apartment
  }) {
    const options = omitBy({ customerId, orderId, mobile, apartment }, isNil);
    let query = {}
    if(options.customerId) {
      query['customerId'] = options.customerId
    }
    if(options.orderId) {
      query['orderId'] = options.orderId
    }
    if(options.mobile) {
      query['address.mobile'] = options.mobile
    }
    if(options.apartment) {
      query['address.apartment'] = options.apartment
    }
    return this.find(query)
      .populate('customer')
      ///.populate('tickets')
      .populate({path: 'tickets', options: { sort: { 'createdAt': -1 } } })
      .sort({ createdAt: -1 })
      .skip(perPage * (page - 1))
      .limit(perPage)
      .exec();
  },


  transform(orderObj) {
    const transformed = {};
    let order= orderObj;
    const fields = ['id', 'orderId', 'customer', 'status', 'address', 'campaigns', 'createdAt', 'ratings',  'statusUpdates','amount', 'CFOrderId'];
    

    fields.forEach((field) => {
      transformed[field] = order[field] || null;
    });

    if(order['customer']) {
      let c =  order['customer'];
      customer = {id: c.id, name: c.name, mobile: c.mobile, email: c.email}

      transformed['customer'] = customer;
    }
    return transformed;
  },
}
/**
 * @typedef Order
 */
module.exports = mongoose.model('Order', orderSchema);
