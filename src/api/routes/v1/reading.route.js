const express = require('express');
const validate = require('express-validation');
const controller = require('../../controllers/reading.controller');
const { authorize, ADMIN, LOGGED_USER } = require('../../middlewares/auth');
const {
  listReadings,
  createReading,
  updateReading,
  createUpdateReading
} = require('../../validations/reading.validation');

const router = express.Router();

/**
 * Load user when API with readingId route parameter is hit
 */
router.param('readingId', controller.load);

router
  .route('/')
  /**
   * @api {get} v1/readings List Readings
   * @apiDescription Get a list of readings
   * @apiVersion 1.0.0
   * @apiName ListReadings
   * @apiGroup Reading
   * @apiPermission admin
   *
   * @apiHeader {String} Authorization   Reading's access token
   *
   * @apiParam  {Number{1-}}         [page=1]     List page
   * @apiParam  {Number{1-100}}      [perPage=1]  Readings per page
   * @apiParam  {String}             [name]       Reading's name  
   * @apiParam  {String}             [vendorId]   Vendor Id 
   *
   * @apiSuccess {Object[]} readings List of readings.
   *
   * @apiError (Unauthorized 401)  Unauthorized  Only authenticated readings can access the data
   * @apiError (Forbidden 403)     Forbidden     Only admins can access the data
   */
  .get(authorize(LOGGED_USER), validate(listReadings), controller.list)
  /**
   * @api {post} v1/readings Create Reading
   * @apiDescription Create a new reading
   * @apiVersion 1.0.0
   * @apiName CreateReading
   * @apiGroup Reading
   * @apiPermission admin
   *
   * @apiHeader {String} Authorization access token
   *
   * @apiParam  {String}             name             Reading's name
   * @apiParam  {String{6..128}}     description      Reading's Description
   * @apiParam  {Number}             minimumOrder     Reading's minimumOrder
   * @apiParam  {String}             category         Reading's Category
   * @apiParam  {String}             unit             Reading's unit
   * @apiParam  {Number}             marketPrice      Reading's marketPrice
   * @apiParam  {Number}             groupPrice       Reading's groupPrice
   * @apiParam  {Number}             maxCountPerUser  Reading's maxCountPerUser
   * @apiParam  {String}             tags             Reading's tags
   * @apiParam  {Object[]}           images           Reading's images
   * @apiParam  {ObjectId}           createdBy        Reading's createdBy
   * 
   *
   * @apiSuccess (Created 201) {String}  id         Reading's id
   * @apiSuccess (Created 201) {String}  name       Reading's name
   * @apiSuccess (Created 201) {Date}    createdAt  Timestamp
   *
   * @apiError (Bad Request 400)   ValidationError  Some parameters may contain invalid values
   * @apiError (Unauthorized 401)  Unauthorized     Only authenticated readings can create the data
   * @apiError (Forbidden 403)     Forbidden        Only admins can create the data
   */
  .post(authorize(LOGGED_USER), validate(createReading), controller.bulkInsert);

router
  .route('/bulk')
  .post(validate(createUpdateReading), controller.bulkInsertUpdate);
router
  .route('/:readingId')
  /**
   * @api {get} v1/readings/:id Get Reading
   * @apiDescription Get user information
   * @apiVersion 1.0.0
   * @apiName GetReading
   * @apiGroup Reading
   * @apiPermission user
   *
   * @apiHeader {String} Authorization   User's access token
   *
   * @apiParam  {String}             name             Reading's name
   * @apiParam  {String{6..128}}     description      Reading's Description
   * @apiParam  {Number}             minimumOrder     Reading's minimumOrder
   * @apiParam  {String}             category         Reading's Category
   * @apiParam  {String}             unit             Reading's unit
   * @apiParam  {Number}             marketPrice      Reading's marketPrice
   * @apiParam  {Number}             groupPrice       Reading's groupPrice
   * @apiParam  {Number}             maxCountPerUser  Reading's maxCountPerUser
   * @apiParam  {String}             tags             Reading's tags
   * @apiParam  {Object[]}           images           Reading's images
   * @apiParam  {ObjectId}           createdBy        Reading's createdBy
   *
   * @apiError (Unauthorized 401) Unauthorized Only authenticated readings can access the data
   * @apiError (Forbidden 403)    Forbidden    Only user with same id or admins can access the data
   * @apiError (Not Found 404)    NotFound     Reading does not exist
   */
  //.get(authorize(LOGGED_USER), controller.get)
  .get(authorize(LOGGED_USER), controller.get)
  /**
   * @api {put} v1/readings/:id Update Reading
   * @apiDescription Update the reading
   * @apiVersion 1.0.0
   * @apiName UpdateReading
   * @apiGroup Reading
   * @apiPermission user
   *
   * @apiHeader {String} Authorization   User's access token
   *
   * @apiParam  {String}             name             Reading's name
   * @apiParam  {String{6..128}}     description      Reading's Description
   * @apiParam  {Number}             minimumOrder     Reading's minimumOrder
   * @apiParam  {String}             category         Reading's Category
   * @apiParam  {String}             unit             Reading's unit
   * @apiParam  {Number}             marketPrice      Reading's marketPrice
   * @apiParam  {Number}             groupPrice       Reading's groupPrice
   * @apiParam  {Number}             maxCountPerUser  Reading's maxCountPerUser
   * @apiParam  {String}             tags             Reading's tags
   * @apiParam  {Object[]}           images           Reading's images
   * @apiParam  {ObjectId}           createdBy        Reading's createdBy
   *
   * @apiSuccess  {String}  id         Reading's id
   * @apiSuccess  {String}             name             Reading's name
   * @apiSuccess  {String{6..128}}     description      Reading's Description
   * @apiSuccess  {Number}             minimumOrder     Reading's minimumOrder
   * @apiSuccess  {String}             category         Reading's Category
   * @apiSuccess  {String}             unit             Reading's unit
   * @apiSuccess  {Number}             marketPrice      Reading's marketPrice
   * @apiSuccess  {Number}             groupPrice       Reading's groupPrice
   * @apiSuccess  {Number}             maxCountPerUser  Reading's maxCountPerReading
   * @apiSuccess  {String}             tags             Reading's tags
   * @apiSuccess  {Object[]}           images           Reading's images
   * @apiSuccess  {ObjectId}           createdBy        Reading's createdBy
   * @apiSuccess  {Date}               createdAt        Timestamp
   *
   * @apiError (Bad Request 400)  ValidationError  Some parameters may contain invalid values
   * @apiError (Unauthorized 401) Unauthorized Only authenticated readings can modify the data
   * @apiError (Forbidden 403)    Forbidden    Only user with same id or admins can modify the data
   * @apiError (Not Found 404)    NotFound     Reading does not exist
   */
  .put( authorize(ADMIN), validate(updateReading), controller.update)
  /**
   * @api {delete} v1/readings/:id Delete Reading
   * @apiDescription Delete a reading
   * @apiVersion 1.0.0
   * @apiName DeleteReading
   * @apiGroup Reading
   * @apiPermission admin
   *
   * @apiHeader {String} Authorization   User's access token
   *
   * @apiSuccess (No Content 204)  Successfully deleted
   *
   * @apiError (Unauthorized 401) Unauthorized  Only authenticated users can delete the data
   * @apiError (Forbidden 403)    Forbidden     Only user with same id or admins can delete the data
   * @apiError (Not Found 404)    NotFound      Reading does not exist
   */
  .delete(authorize(ADMIN), controller.remove);

module.exports = router;
