const Joi = require('joi');
const Product = require('../models/product.model');

module.exports = {

  // GET /v1/products
  listProducts: {
    query: {
      page: Joi.number().min(1),
      perPage: Joi.number().min(1).max(100),
      name: Joi.string(),
      vendorId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).optional(),

    },
  },

  // POST /v1/products
  createProduct: {
    body: 
      Joi.array().items({
        name: Joi.string().required().min(1),
        description: Joi.string().optional(),
        minimumOrder: Joi.number(),
        marketPrice: Joi.number(),
        groupPrice: Joi.number().required(),
        //stock: Joi.number(),
        category: Joi.string().required(),
        maxCountPerUser: Joi.number(),
        unit: Joi.string(),
        HSNCode: Joi.string().required(),
        images: Joi.array().items({
          label: Joi.string(),
          link: Joi.string()
        }),
        vendorId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
        //createdBy: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
        tags: Joi.array().items(Joi.string()),
        
        attributes: Joi.array().items({
          name: Joi.string().required(),
          isRequired: Joi.boolean().required(),
          options:Joi.array().
          when('isRequired', {
            is: Joi.boolean().valid(true),
            then: Joi.array().items(Joi.object({
                label: Joi.string().required(),
                value: Joi.string().required(),
                //stock: Joi.number().required(),
                price: Joi.number().required(),
                maxCountPerUser: Joi.number().optional(),
              }))
            }),
            otherwise: Joi.array().items(Joi.object({
              label: Joi.string().required(),
              value: Joi.string().required(),
              maxCountPerUser: Joi.number().optional(),
           }))
        })
        
      }),
      options: {
        contextRequest: true,
      }
  },

  // PUT /v1/products/:userId
  updateProduct: {
    body: {
      name: Joi.string().min(1),
      description: Joi.string().min(5),
      minimumOrder: Joi.number(),
      marketPrice: Joi.number(),
      groupPrice: Joi.number(),
      //stock: Joi.number(),
      category: Joi.string(),
      maxCountPerUser: Joi.number(),
      unit: Joi.string(),
      HSNCode: Joi.string(),
      images: Joi.array().items({
        label: Joi.string(),
        link: Joi.string()
      }),
      tags: Joi.array().items(Joi.string())
    },
    params: {
      productId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
    },
  },


  // POST /v1/products
  createUpdateProduct: {
    body: 
      Joi.array().items({
        id: Joi.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
        name: Joi.string().optional().min(5),
        description: Joi.string().min(10),
        minimumOrder: Joi.number(),
        marketPrice: Joi.number(),
        groupPrice: Joi.number(),
        //stock: Joi.number(),
        category: Joi.string().required(),
        maxCountPerUser: Joi.number(),
        unit: Joi.string(),
        HSNCode: Joi.string().optional(),
        images: Joi.array().items({
          label: Joi.string(),
          link: Joi.string()
        }),
        vendorId: Joi.string().regex(/^[a-fA-F0-9]{24}$/).optional(),
        //createdBy: Joi.string().regex(/^[a-fA-F0-9]{24}$/).required(),
        tags: Joi.array().items(Joi.string()),
        
        attributes: Joi.array().items({
          name: Joi.string().optional(),
          isRequired: Joi.boolean().optional(),
          options:Joi.array().
          when('isRequired', {
            is: Joi.boolean().valid(true),
            then: Joi.array().items(Joi.object({
                label: Joi.string().optional(),
                value: Joi.string().optional(),
                //stock: Joi.number().required(),
                price: Joi.number().optional(),
                maxCountPerUser: Joi.number().optional(),
              }))
            }),
            otherwise: Joi.array().items(Joi.object({
              label: Joi.string().optional(),
              value: Joi.string().optional(),
              maxCountPerUser: Joi.number().optional(),
           }))
        })
        
      }),
      options: {
        contextRequest: true,
      }
  },


};
