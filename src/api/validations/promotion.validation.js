const Joi = require('joi');

module.exports = {

  // GET /v1/clusters
  listPromotions: {
    query: {
      page: Joi.number().min(1),
      perPage: Joi.number().min(1).max(100),
      status: Joi.string(),
      apartmentId: Joi.array().items(Joi.string().regex(/^[a-fA-F0-9]{24}$/))
    },
  },

  // POST /v1/clusters
  createPromotion: {
    body: {
      name: Joi.string().optional(),
      imageUrl: Joi.string().required(),
      type: Joi.string().optional().default('campaign'),
      campaignId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
      link: Joi.string().optional(),
      apartmentIds: Joi.array().items(Joi.string().regex(/^[a-fA-F0-9]{24}$/)).required()
    },
  },

  // PUT /v1/clusters/:clusterId
  updatePromotion: {
    body: {
      name: Joi.string().optional(),
      imageUrl: Joi.string().optional(),
      type: Joi.string().optional().default('campaign'),
      status: Joi.string().optional().valid('Active', 'Inactive'),
      link: Joi.string().optional(),
      campaignId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
      apartmentIds: Joi.array().items( Joi.string().regex(/^[a-fA-F0-9]{24}$/)).optional()
    },
    params: {
      promotionId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
    },
  },
};
