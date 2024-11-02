const Joi = require('joi');

module.exports = {

  deliveryReport: {
    body: {
      campaignIds: Joi.array().items(Joi.string().regex(/^[a-fA-F0-9]{24}$/)),
      clusterIds: Joi.array().items(Joi.string().regex(/^[a-fA-F0-9]{24}$/)),
      apartmentSets: Joi.array(),
    },
  },
  exportOrders: {
    body: {
      campaignIds: Joi.array().items(Joi.string().regex(/^[a-fA-F0-9]{24}$/)),
      from: Joi.date(),
      to: Joi.date(),
    },
  },

};
