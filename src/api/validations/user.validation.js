const Joi = require('joi');
const User = require('../models/user.model');

module.exports = {

  // GET /v1/users
  listUsers: {
    query: {
      page: Joi.number().min(1),
      perPage: Joi.number().min(1).max(100),
      limit: Joi.number().min(1).max(10000),
      name: Joi.string(),
      email: Joi.string(),
      mobile: Joi.number(),
      role: Joi.string().valid(User.roles),
    },
  },

  // POST /v1/users
  createUser: {
    body: {
      email: Joi.string().email().required(),
      mobile: Joi.number().required(),
      name: Joi.string().max(128),
      role: Joi.string().valid(User.roles),
      address: Joi.array().items({
        apartment: Joi.string().required(),
        tower: Joi.string().required(),
        flatNo: Joi.string().required()
      }).optional(),
    },
  },

  // PUT /v1/users/:userId
  updateUser: {
    body: {
      email: Joi.string().email(),
      name: Joi.string().max(128),
      //mobile: Joi.number(),
      //role: Joi.string().valid(User.roles),
    },
    params: {
      userId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
    },
  },

  addAddress: {
    body: {
      apartment: Joi.string().required(),
      tower: Joi.string().required(),
      flatNo: Joi.string().required()
    },
  },
};
