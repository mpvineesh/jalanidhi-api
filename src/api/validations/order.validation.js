const Joi = require('joi');
const Order = require('../models/order.model');
const Txn = require('../models/transaction.model');

module.exports = {

  // GET /v1/orders
  listOrders: {
    query: {
      page: Joi.number().min(1),
      perPage: Joi.number().min(1).max(1000),
      customerId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
      orderId: Joi.string().optional(),
      apartment: Joi.string().optional(),
      mobile: Joi.number(),
      name: Joi.string(),
      email: Joi.string(),
      tower: Joi.string(),
      deliveryDate: Joi.date()
    },
  },

  listCampaigns: {
    query: {
      page: Joi.number().min(1),
      perPage: Joi.number().min(1).max(1000),
      status: Joi.string().optional(),
    },
  },
  // POST /v1/orders
  createOrder: {
    body: {
        deliveryDate: Joi.date().required().min(5),
        customerId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
        address:Joi.object({
          apartment: Joi.string().required(),
          tower: Joi.string().required(),
          flatNo: Joi.string().required()
        }),
        campaigns: Joi.array().items({
          campaignId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
          products: Joi.array().items({
            productId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
            vendorId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
            quantity: Joi.number(),
            price: Joi.number(),
            attributes: Joi.array().items({
              name: Joi.string().required(),
              quantity: Joi.number().required(),
              value: Joi.string().required()
            })
          })
        }),
        redirectUrl: Joi.string().optional(),
        trackingInfo: Joi.object({
          utmSource: Joi.string().optional(),
          utmMedium: Joi.string().optional(),
          utmCampaign: Joi.string().optional()
        })
      },
      options: {
        contextRequest: true,
      }
  },

  // PUT /v1/orders/:userId
  updateOrder: {
    body: {
      deliveryDate: Joi.date().optional().min(5),
      address:Joi.object({
        apartment: Joi.string().required(),
        tower: Joi.string().required(),
        flatNo: Joi.string().required()
      }).optional(),
      status: Joi.string().optional().valid(Order.status)
    },
    params: {
      orderId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
    },
  },

  payOrder: {
    body: {
      paymentMethod: Joi.string().required().valid(Txn.paymentMethods),
      amount: Joi.number().required(),
      customerId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
    },
    params: {
      orderId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
    },
  },

  addOrderRatings: {
    body: {
      rating: Joi.number().required(),
      comments: Joi.string().required(),
      imageUrls: Joi.array().items(Joi.string()).optional(),
      imageUrl: Joi.string().optional(),
    },
    params: {
      orderId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
      campaignId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
    },
  },

  updateSubOrderStatus: {
    body: {
      campaignIds: Joi.array().items(Joi.string().regex(/^[a-fA-F0-9]{24}$/)).optional(),
      //campaignId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
      orderId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
      productIds: Joi.array().items(Joi.string().regex(/^[a-fA-F0-9]{24}$/)).optional(),
      apartment: Joi.string().optional(), 
      status: Joi.string().required().valid(Order.status),
      comments: Joi.string().required(), 
    }
  },
  
  getStatusFlow: {
    params: {
      status: Joi.string().required(),
    },
  },

  cancelOrder: {
    body: {
      reason: Joi.string().required(),
      comments: Joi.string().optional()
    },
    params: {
      orderId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
    },
  },

  updateBulkOrder: {
    body: {
      orderIds: Joi.array().items(Joi.string().regex(/^[a-fA-F0-9]{24}$/)).optional(),
      status: Joi.string().optional().valid(Order.status)
    }
  },

  updateOrderStatus: {
    body: {
      paymentStatus: Joi.string().optional(), 
      status: Joi.string().required().valid(Order.status),
      comments: Joi.string().optional(), 
    }
  },
  updateMultipleSubOrders: {
    body: {
      status: Joi.string().required().valid(Order.status),
      subOrderIds: Joi.array().required()
    }
  },
  createManualRefund: {
    body: {
      customerId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
      subOrderId: Joi.string().required(),
      credits: Joi.number().required(), 
    }
  },

};

