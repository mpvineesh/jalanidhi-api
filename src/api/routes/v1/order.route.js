const express = require('express');
const validate = require('express-validation');
const controller = require('../../controllers/order.controller');
const report = require('../../controllers/reports/delivery.report');
const { authorize, ADMIN, LOGGED_USER } = require('../../middlewares/auth');
const {
  listOrders,
  createOrder,
  updateOrder,
  payOrder,
  updateStocks,
  listCampaigns,
  updateSubOrderStatus,
  addOrderRatings,
  getStatusFlow,
  cancelOrder,
  updateBulkOrder,
  updateOrderStatus,
  updateMultipleSubOrders,
  createManualRefund
} = require('../../validations/order.validation');

const {
  exportOrders
} = require('../../validations/reports/report.validation');

const multer  = require('multer');
const router = express.Router();

/**
 * Load user when API with orderId route parameter is hit
 */
router.param('orderId', controller.load);

router
  .route('/campaigns')
  .get(authorize(LOGGED_USER), validate(listCampaigns), controller.listCampaigns)
router
  .route('/testapi')
  .get(controller.testMethod);
  

router
  .route('/')
  /**
   * @api {get} v1/orders List Orders
   * @apiDescription Get a list of orders
   * @apiVersion 1.0.0
   * @apiName ListOrders
   * @apiGroup Order
   * @apiPermission admin
   *
   * @apiHeader {String} Authorization   Order's access token
   *
   * @apiParam  {Number{1-}}         [page=1]     List page
   * @apiParam  {Number{1-100}}      [perPage=1]  Orders per page
   * @apiParam  {String}             [name]       Order's name  
   * @apiParam  {String}             [vendorId]   Vendor Id 
   *
   * @apiSuccess {Object[]} orders List of orders.
   *
   * @apiError (Unauthorized 401)  Unauthorized  Only authenticated orders can access the data
   * @apiError (Forbidden 403)     Forbidden     Only admins can access the data
   */
  .get(authorize(LOGGED_USER), validate(listOrders), controller.list1)
  /**
   * @api {post} v1/orders Create Order
   * @apiDescription Create a new order
   * @apiVersion 1.0.0
   * @apiName CreateOrder
   * @apiGroup Order
   * @apiPermission admin
   *
   * @apiHeader {String} Authorization access token
   *
   * @apiParam  {String}             name             Order's name
   * @apiParam  {String{6..128}}     description      Order's Description
   * @apiParam  {Number}             minimumOrder     Order's minimumOrder
   * @apiParam  {String}             category         Order's Category
   * @apiParam  {String}             unit             Order's unit
   * @apiParam  {Number}             marketPrice      Order's marketPrice
   * @apiParam  {Number}             groupPrice       Order's groupPrice
   * @apiParam  {Number}             maxCountPerUser  Order's maxCountPerUser
   * @apiParam  {String}             tags             Order's tags
   * @apiParam  {Object[]}           images           Order's images
   * @apiParam  {ObjectId}           createdBy        Order's createdBy
   * 
   *
   * @apiSuccess (Created 201) {String}  id         Order's id
   * @apiSuccess (Created 201) {String}  name       Order's name
   * @apiSuccess (Created 201) {Date}    createdAt  Timestamp
   *
   * @apiError (Bad Request 400)   ValidationError  Some parameters may contain invalid values
   * @apiError (Unauthorized 401)  Unauthorized     Only authenticated orders can create the data
   * @apiError (Forbidden 403)     Forbidden        Only admins can create the data
   */
  .post(authorize(LOGGED_USER), validate(createOrder), controller.create);
router
  .route('/bulk')
  .put(authorize(LOGGED_USER), validate(updateBulkOrder), controller.updateMultipleOrders)
router
  .route('/statusFlow/:status')
  .get(authorize(LOGGED_USER), validate(getStatusFlow), controller.getStatusFlow);
  
router
.route('/export')
.post(validate(exportOrders), report.exportOrderData);

router
.route('/refund')
.post(authorize(ADMIN), validate(createManualRefund), controller.createManualRefund);

router
  .route('/:orderId')
  /**
   * @api {get} v1/orders/:id Get Order
   * @apiDescription Get user information
   * @apiVersion 1.0.0
   * @apiName GetOrder
   * @apiGroup Order
   * @apiPermission user
   *
   * @apiHeader {String} Authorization   User's access token
   *
   * @apiParam  {String}             name             Order's name
   * @apiParam  {String{6..128}}     description      Order's Description
   * @apiParam  {Number}             minimumOrder     Order's minimumOrder
   * @apiParam  {String}             category         Order's Category
   * @apiParam  {String}             unit             Order's unit
   * @apiParam  {Number}             marketPrice      Order's marketPrice
   * @apiParam  {Number}             groupPrice       Order's groupPrice
   * @apiParam  {Number}             maxCountPerUser  Order's maxCountPerUser
   * @apiParam  {String}             tags             Order's tags
   * @apiParam  {Object[]}           images           Order's images
   * @apiParam  {ObjectId}           createdBy        Order's createdBy
   *
   * @apiError (Unauthorized 401) Unauthorized Only authenticated orders can access the data
   * @apiError (Forbidden 403)    Forbidden    Only user with same id or admins can access the data
   * @apiError (Not Found 404)    NotFound     Order does not exist
   */
  //.get(authorize(LOGGED_USER), controller.get)
  .get(authorize(LOGGED_USER),controller.get)
  /**
   * @api {put} v1/orders/:id Update Order
   * @apiDescription Update the order
   * @apiVersion 1.0.0
   * @apiName UpdateOrder
   * @apiGroup Order
   * @apiPermission user
   *
   * @apiHeader {String} Authorization   User's access token
   *
   * @apiParam  {String}             name             Order's name
   * @apiParam  {String{6..128}}     description      Order's Description
   * @apiParam  {Number}             minimumOrder     Order's minimumOrder
   * @apiParam  {String}             category         Order's Category
   * @apiParam  {String}             unit             Order's unit
   * @apiParam  {Number}             marketPrice      Order's marketPrice
   * @apiParam  {Number}             groupPrice       Order's groupPrice
   * @apiParam  {Number}             maxCountPerUser  Order's maxCountPerUser
   * @apiParam  {String}             tags             Order's tags
   * @apiParam  {Object[]}           images           Order's images
   * @apiParam  {ObjectId}           createdBy        Order's createdBy
   *
   * @apiSuccess  {String}  id         Order's id
   * @apiSuccess  {String}             name             Order's name
   * @apiSuccess  {String{6..128}}     description      Order's Description
   * @apiSuccess  {Number}             minimumOrder     Order's minimumOrder
   * @apiSuccess  {String}             category         Order's Category
   * @apiSuccess  {String}             unit             Order's unit
   * @apiSuccess  {Number}             marketPrice      Order's marketPrice
   * @apiSuccess  {Number}             groupPrice       Order's groupPrice
   * @apiSuccess  {Number}             maxCountPerUser  Order's maxCountPerOrder
   * @apiSuccess  {String}             tags             Order's tags
   * @apiSuccess  {Object[]}           images           Order's images
   * @apiSuccess  {ObjectId}           createdBy        Order's createdBy
   * @apiSuccess  {Date}               createdAt        Timestamp
   *
   * @apiError (Bad Request 400)  ValidationError  Some parameters may contain invalid values
   * @apiError (Unauthorized 401) Unauthorized Only authenticated orders can modify the data
   * @apiError (Forbidden 403)    Forbidden    Only user with same id or admins can modify the data
   * @apiError (Not Found 404)    NotFound     Order does not exist
   */
  .put(authorize(LOGGED_USER), validate(updateOrder), controller.update)
  /**
   * @api {delete} v1/orders/:id Delete Order
   * @apiDescription Delete a order
   * @apiVersion 1.0.0
   * @apiName DeleteOrder
   * @apiGroup Order
   * @apiPermission admin
   *
   * @apiHeader {String} Authorization   User's access token
   *
   * @apiSuccess (No Content 204)  Successfully deleted
   *
   * @apiError (Unauthorized 401) Unauthorized  Only authenticated users can delete the data
   * @apiError (Forbidden 403)    Forbidden     Only user with same id or admins can delete the data
   * @apiError (Not Found 404)    NotFound      Order does not exist
   */
  .delete(authorize(ADMIN), controller.remove);


router
.route('/validate')
/**
* @api {post} v1/orders/validate Validate Order
* @apiDescription Validate an order
* @apiVersion 1.0.0
* @apiName ValidateOrder
* @apiGroup Order
* @apiPermission admin
*
* @apiHeader {String} Authorization access token
*
* @apiParam  {String}             name             Order's name
* @apiParam  {String{6..128}}     description      Order's Description
* @apiParam  {Number}             minimumOrder     Order's minimumOrder
* @apiParam  {String}             category         Order's Category
* @apiParam  {String}             unit             Order's unit
* @apiParam  {Number}             marketPrice      Order's marketPrice
* @apiParam  {Number}             groupPrice       Order's groupPrice
* @apiParam  {Number}             maxCountPerUser  Order's maxCountPerUser
* @apiParam  {String}             tags             Order's tags
* @apiParam  {Object[]}           images           Order's images
* @apiParam  {ObjectId}           createdBy        Order's createdBy
* 
*
* @apiSuccess (Created 201) {String}  id         Order's id
* @apiSuccess (Created 201) {String}  name       Order's name
* @apiSuccess (Created 201) {Date}    createdAt  Timestamp
*
* @apiError (Bad Request 400)   ValidationError  Some parameters may contain invalid values
* @apiError (Unauthorized 401)  Unauthorized     Only authenticated orders can create the data
* @apiError (Forbidden 403)     Forbidden        Only admins can create the data
*/
.post(authorize(LOGGED_USER), validate(createOrder), controller.validate);


 
router
  .route('/suborder/bulk')
  .put(authorize(LOGGED_USER), validate(updateMultipleSubOrders), controller.updateMultipleSubOrders)


router
  .route('/:orderId/exchange')
  .post(authorize(LOGGED_USER), controller.requestExchangeProducts);

router
    .route('/:orderId/cancel')
    .post(authorize(LOGGED_USER), validate(cancelOrder), controller.cancelOrder);

router
.route('/:orderId/:campaignId/cancel')
.post(authorize(LOGGED_USER), validate(cancelOrder), controller.cancelSubOrder);

router
    .route('/:orderId/:campaignId')
    .get(authorize(LOGGED_USER), controller.getOrderCampaign);
    

router
.route('/:orderId/:campaignId/review')
.post(authorize(LOGGED_USER), multer().array(), validate(addOrderRatings), controller.addOrderRatings);

router
  .route('/:orderId/pay')
  .post(authorize(LOGGED_USER), validate(payOrder), controller.payment);


router
  .route('/:orderId/updateStocks')
  .post(authorize(LOGGED_USER), controller.updateStocks);



  
router
.route('/:campaignId/:productId/:status')
.post (authorize(LOGGED_USER), controller.updateOrderProductStatus);

router
.route('/:orderId/status')
.put(authorize(LOGGED_USER), validate(updateOrderStatus), controller.updateOrderSubOrderStatus);

router
.route('/:orderId/updatePendingOrder')
.post(authorize(ADMIN),controller.updatePaymentPendingorderStatus);

router
.route('/:campaignId/:status')
.put (authorize(LOGGED_USER), controller.updateOrderCampaignStatus);

router
.route('/:orderId/ratings')
.post(authorize(LOGGED_USER), multer().array(), validate(addOrderRatings), controller.addOrderRatings);

router
.route('/status')
.post(authorize(LOGGED_USER), validate(updateSubOrderStatus), controller.updateSubOrderStatus);



router
  .route('/meta/status')
  .get(authorize(LOGGED_USER), controller.getOrderStatus);

  router
  .route('/sms/test')
  .get(controller.testSMS);


/*************** Sub Order APIs  *****************/

module.exports = router;
