const httpStatus = require('http-status');
const { omit } = require('lodash');
const Product = require('../models/product.model');
const Campaign = require('../models/campaign.model');
const Vendor = require('../models/vendor.model');
const HSNCode = require('../models/hsn.model');
const APIError = require('../errors/api-error');
/**
 * Load product and append to req.
 * @public
 */
exports.load = async (req, res, next, id) => {
  try {
    const product = await Product.get(id);
    req.locals = { product };
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Get product
 * @public
 */
exports.get = (req, res) => res.json(req.locals.product.transform());


/**
 * Create new product
 * @public
 */
exports.create = async (req, res, next) => {
  try {
    let isValid = await validateProductPayload(req.body);
    if(isValid.valid) {
      const product = new Product(req.body);
      const savedProduct = await product.save();
      res.status(httpStatus.CREATED);
      res.json(savedProduct.transform());
    } else {
      console.log('Error', error)
      next(isValid.error);
    }
    
  } catch (error) {
    console.log('Error', error)
    next(true);
  }
};

async function validateProductPayload(payload) {
  let e = new APIError({
    message: "",
    status: httpStatus.BAD_REQUEST,
  });
  let resp = {valid: true, error: e}
  try{
    if(payload.vendorId){
      let vendor = await Vendor.get(payload.vendorId)
 
      if(!vendor) {
        resp.valid = false;
        resp.error.message = "Invalid Vendor ID"
      }
      return resp;
    }
    if(payload.HSNCode){
      let hsncode = await HSNCode.getByCode(payload.HSNCode)
      if(!hsncode) {
        resp.valid = false;
        resp.error.message = "Invalid HSN Code"
      }
      return resp;
    }
  } catch(e) {
    resp = {valid: false, error: e}
  }
  return resp;
}

/**
 * Create new products
 * @public
 */
exports.bulkInsert = async (req, res, next) => {
  try {
    const savedProducts = await Product.insertMany(req.body);
    res.status(httpStatus.CREATED);
    res.json(savedProducts.map(p => p.transform()));
  } catch (error) {
    console.log('Error', error)
    next(true);
  }
};


/**
 * Update existing product
 * @public
 */
exports.update = (req, res, next) => {
  const updatedProduct =  req.body;
  const product = Object.assign(req.locals.product, updatedProduct);

  product.save()
    .then((savedProduct) => res.json(savedProduct.transform()))
    .catch((e) => next(e));
};

/**
 * Get product list
 * @public
 */
exports.list = async (req, res, next) => {
  try {
    const products = await Product.list(req.query);
    const transformedProducts = products.map((product) => product.transform());
    res.json(transformedProducts);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete product
 * @public
 */
exports.remove = (req, res, next) => {
  const { product } = req.locals;
  let campaigns = Campaign.find({'products.productId': product.id});
  if(campaigns.length) {
    let e = new APIError({
      message: 'Failed to delete since there are some campaigns with this product.',
      status: httpStatus.BAD_REQUEST,
    });
    next(e)
  } else {
    product.remove()
    .then(() => res.status(httpStatus.NO_CONTENT).end())
    .catch((e) => next(e));
  }

  
};

exports.bulkInsertUpdate = async (req, res, next) => {
  try {
    let payload = req.body;
    let updates = [];
    for (let i = 0; i < payload.length; i++) {
      let data = payload[i];
      if(data.id) {
        let update = Product.updateOne({"_id":data.id}, {marketPrice: data.marketPrice, groupPrice: data.groupPrice});
        updates.push(update);
      } else {
        let p = new Product(data);
        updates.push(p.save());
      }
    }
    Promise.all(updates).then(() => res.status(httpStatus.OK).end()).catch((e) => next(e));
    //res.status(httpStatus.CREATED);
    //res.json(savedProducts.map(p => p.transform()));
  } catch (error) {
    console.log('Error', error)
    next(true);
  }
};
