const Joi = require('joi');

module.exports = {

  // GET /v1/tickets
  listTickets: {
    query: {
      page: Joi.number().min(1),
      perPage: Joi.number().min(1).max(100)
    },
  },

  // POST /v1/tickets
  createTicket: {
    body: {
      title: Joi.string().required().min(5),
      description: Joi.string().required().min(5),
      //refType: Joi.string().required(),
      refId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
      comment: Joi.string().optional(),
      items: Joi.array().items({
        itemId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
        name: Joi.string().required()
      }).optional(),
      moreInfo: Joi.object().optional(),
    },
  },

  // PUT /v1/tickets/:ticketId
  updateTicket: {
    body: {
      comment: Joi.string().required().min(5)
    },
    params: {
      ticketId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
    },
  },
};
