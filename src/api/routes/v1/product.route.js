const express = require('express');
const validate = require('express-validation');
const controller = require('../../controllers/product.controller');
const { authorize, ADMIN, LOGGED_USER } = require('../../middlewares/auth');
const {
  listProducts,
  createProduct,
  updateProduct,
  createUpdateProduct
} = require('../../validations/product.validation');

const router = express.Router();

/**
 * Load user when API with productId route parameter is hit
 */
router.param('productId', controller.load);

router
  .route('/')
  /**
   * @api {get} v1/products List Products
   * @apiDescription Get a list of products
   * @apiVersion 1.0.0
   * @apiName ListProducts
   * @apiGroup Product
   * @apiPermission admin
   *
   * @apiHeader {String} Authorization   Product's access token
   *
   * @apiParam  {Number{1-}}         [page=1]     List page
   * @apiParam  {Number{1-100}}      [perPage=1]  Products per page
   * @apiParam  {String}             [name]       Product's name  
   * @apiParam  {String}             [vendorId]   Vendor Id 
   *
   * @apiSuccess {Object[]} products List of products.
   *
   * @apiError (Unauthorized 401)  Unauthorized  Only authenticated products can access the data
   * @apiError (Forbidden 403)     Forbidden     Only admins can access the data
   */
  .get(authorize(LOGGED_USER), validate(listProducts), controller.list)
  /**
   * @api {post} v1/products Create Product
   * @apiDescription Create a new product
   * @apiVersion 1.0.0
   * @apiName CreateProduct
   * @apiGroup Product
   * @apiPermission admin
   *
   * @apiHeader {String} Authorization access token
   *
   * @apiParam  {String}             name             Product's name
   * @apiParam  {String{6..128}}     description      Product's Description
   * @apiParam  {Number}             minimumOrder     Product's minimumOrder
   * @apiParam  {String}             category         Product's Category
   * @apiParam  {String}             unit             Product's unit
   * @apiParam  {Number}             marketPrice      Product's marketPrice
   * @apiParam  {Number}             groupPrice       Product's groupPrice
   * @apiParam  {Number}             maxCountPerUser  Product's maxCountPerUser
   * @apiParam  {String}             tags             Product's tags
   * @apiParam  {Object[]}           images           Product's images
   * @apiParam  {ObjectId}           createdBy        Product's createdBy
   * 
   *
   * @apiSuccess (Created 201) {String}  id         Product's id
   * @apiSuccess (Created 201) {String}  name       Product's name
   * @apiSuccess (Created 201) {Date}    createdAt  Timestamp
   *
   * @apiError (Bad Request 400)   ValidationError  Some parameters may contain invalid values
   * @apiError (Unauthorized 401)  Unauthorized     Only authenticated products can create the data
   * @apiError (Forbidden 403)     Forbidden        Only admins can create the data
   */
  .post(authorize(LOGGED_USER), validate(createProduct), controller.bulkInsert);

router
  .route('/bulk')
  .post(validate(createUpdateProduct), controller.bulkInsertUpdate);
router
  .route('/:productId')
  /**
   * @api {get} v1/products/:id Get Product
   * @apiDescription Get user information
   * @apiVersion 1.0.0
   * @apiName GetProduct
   * @apiGroup Product
   * @apiPermission user
   *
   * @apiHeader {String} Authorization   User's access token
   *
   * @apiParam  {String}             name             Product's name
   * @apiParam  {String{6..128}}     description      Product's Description
   * @apiParam  {Number}             minimumOrder     Product's minimumOrder
   * @apiParam  {String}             category         Product's Category
   * @apiParam  {String}             unit             Product's unit
   * @apiParam  {Number}             marketPrice      Product's marketPrice
   * @apiParam  {Number}             groupPrice       Product's groupPrice
   * @apiParam  {Number}             maxCountPerUser  Product's maxCountPerUser
   * @apiParam  {String}             tags             Product's tags
   * @apiParam  {Object[]}           images           Product's images
   * @apiParam  {ObjectId}           createdBy        Product's createdBy
   *
   * @apiError (Unauthorized 401) Unauthorized Only authenticated products can access the data
   * @apiError (Forbidden 403)    Forbidden    Only user with same id or admins can access the data
   * @apiError (Not Found 404)    NotFound     Product does not exist
   */
  //.get(authorize(LOGGED_USER), controller.get)
  .get(authorize(LOGGED_USER), controller.get)
  /**
   * @api {put} v1/products/:id Update Product
   * @apiDescription Update the product
   * @apiVersion 1.0.0
   * @apiName UpdateProduct
   * @apiGroup Product
   * @apiPermission user
   *
   * @apiHeader {String} Authorization   User's access token
   *
   * @apiParam  {String}             name             Product's name
   * @apiParam  {String{6..128}}     description      Product's Description
   * @apiParam  {Number}             minimumOrder     Product's minimumOrder
   * @apiParam  {String}             category         Product's Category
   * @apiParam  {String}             unit             Product's unit
   * @apiParam  {Number}             marketPrice      Product's marketPrice
   * @apiParam  {Number}             groupPrice       Product's groupPrice
   * @apiParam  {Number}             maxCountPerUser  Product's maxCountPerUser
   * @apiParam  {String}             tags             Product's tags
   * @apiParam  {Object[]}           images           Product's images
   * @apiParam  {ObjectId}           createdBy        Product's createdBy
   *
   * @apiSuccess  {String}  id         Product's id
   * @apiSuccess  {String}             name             Product's name
   * @apiSuccess  {String{6..128}}     description      Product's Description
   * @apiSuccess  {Number}             minimumOrder     Product's minimumOrder
   * @apiSuccess  {String}             category         Product's Category
   * @apiSuccess  {String}             unit             Product's unit
   * @apiSuccess  {Number}             marketPrice      Product's marketPrice
   * @apiSuccess  {Number}             groupPrice       Product's groupPrice
   * @apiSuccess  {Number}             maxCountPerUser  Product's maxCountPerProduct
   * @apiSuccess  {String}             tags             Product's tags
   * @apiSuccess  {Object[]}           images           Product's images
   * @apiSuccess  {ObjectId}           createdBy        Product's createdBy
   * @apiSuccess  {Date}               createdAt        Timestamp
   *
   * @apiError (Bad Request 400)  ValidationError  Some parameters may contain invalid values
   * @apiError (Unauthorized 401) Unauthorized Only authenticated products can modify the data
   * @apiError (Forbidden 403)    Forbidden    Only user with same id or admins can modify the data
   * @apiError (Not Found 404)    NotFound     Product does not exist
   */
  .put( authorize(ADMIN), validate(updateProduct), controller.update)
  /**
   * @api {delete} v1/products/:id Delete Product
   * @apiDescription Delete a product
   * @apiVersion 1.0.0
   * @apiName DeleteProduct
   * @apiGroup Product
   * @apiPermission admin
   *
   * @apiHeader {String} Authorization   User's access token
   *
   * @apiSuccess (No Content 204)  Successfully deleted
   *
   * @apiError (Unauthorized 401) Unauthorized  Only authenticated users can delete the data
   * @apiError (Forbidden 403)    Forbidden     Only user with same id or admins can delete the data
   * @apiError (Not Found 404)    NotFound      Product does not exist
   */
  .delete(authorize(ADMIN), controller.remove);

module.exports = router;
