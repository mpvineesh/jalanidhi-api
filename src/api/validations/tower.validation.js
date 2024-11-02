const Joi = require('joi');

module.exports = {

  // GET /v1/towers
  listTowers: {
    query: {
      page: Joi.number().min(1),
      perPage: Joi.number().min(1).max(100),
      name: Joi.string()
    },
  },

  // POST /v1/towers
  createTower: {
    body: {
      name: Joi.string().required().min(5)
    },
  },

  // PUT /v1/towers/:towerId
  updateTower: {
    body: {
      name: Joi.string().required().min(5)
    },
    params: {
      towerId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
    },
  },
};
