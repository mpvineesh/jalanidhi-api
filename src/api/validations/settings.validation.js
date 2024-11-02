const Joi = require('joi');

module.exports = {

  // PUT /v1/settings
  updateSettings: {
    body: {
      referralCredits: Joi.number().optional(),
      creditValueInRs: Joi.number().optional(),
      referrarCredits: Joi.number().optional(),
      signupCredits: Joi.number().optional(),
    }
  },
};
