const Joi = require('joi');
const Reading = require('../models/reading.model');

module.exports = {

  // GET /v1/readings
  listReadings: {
    query: {
      page: Joi.number().min(1),
      perPage: Joi.number().min(1).max(100),
      name: Joi.string(),

    },
  },

  // POST /v1/readings
  createReading: {
    body: 
      {
        userId:  Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
        month: Joi.string().optional(),
        value: Joi.number().optional(),
        
      },
      options: {
        contextRequest: true,
      }
  },

  // PUT /v1/readings/:userId
  updateReading: {
    body: {
      month: Joi.string().optional(),
      value: Joi.number().optional(),
    },
    params: {
      readingId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
    },
  },


  // POST /v1/readings
  createUpdateReading: {
    body: {
    month: Joi.string().optional(),
    value: Joi.number().optional(),
    },
    
      options: {
        contextRequest: true,
      }
  },


};
