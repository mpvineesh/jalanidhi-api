const Joi = require('joi');

module.exports = {
  // POST /v1/auth/register
  register: {
    body: {
      email: Joi.string().email().required(),
      mobile: Joi.number().required(),
      name: Joi.string().required(),
      otp: Joi.number().max(9999999999).min(100000).optional(),
      referralCode: Joi.string().optional(),
      trackingInfo: Joi.object({
        utmSource: Joi.string().optional(),
        utmMedium: Joi.string().optional(),
        utmCampaign: Joi.string().optional()
      })
    },
  },

  // POST /v1/auth/login
  login: {
    body: {
      mobile: Joi.number()
        .required(),
      otp: Joi.number().max(9999999999).min(100000).required()
    },
  },

   // POST /v1/auth/otp
   otp: {
    body: {
      mobile: Joi.number()
        .required(),
      type: Joi.string().valid(['login', 'signup', 'password']).optional()
    },
  },


  // POST /v1/auth/facebook
  // POST /v1/auth/google
  oAuth: {
    body: {
      access_token: Joi.string().required(),
    },
  },

  // POST /v1/auth/refresh
  refresh: {
    body: {
      mobile: Joi.number().required(),
      refreshToken: Joi.string().required(),
    },
  },

  // POST /v1/auth/refresh
  sendPasswordReset: {
    body: {
      email: Joi.string()
        .email()
        .required(),
    },
  },

  // POST /v1/auth/password-reset
  passwordReset: {
    body: {
      email: Joi.string()
        .email()
        .required(),
      password: Joi.string()
        .required()
        .min(6)
        .max(128),
      resetToken: Joi.string().required(),
    },
  },
};
