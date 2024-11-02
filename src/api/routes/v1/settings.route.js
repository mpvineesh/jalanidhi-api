const express = require('express');
const validate = require('express-validation');
const controller = require('../../controllers/settings.controller');
const { authorize, ADMIN, LOGGED_USER } = require('../../middlewares/auth');
const {
  updateSettings,
} = require('../../validations/settings.validation');

const router = express.Router();

router
  .route('/')
  /**
   * @api {get} v1/settingss List Vendors
   * @apiDescription Get a list of settingss
   * @apiVersion 1.0.0
   * @apiName ListVendors
   * @apiGroup Vendor
   * @apiPermission admin
   *
   * @apiHeader {String} Authorization   Vendor's access token
   *
   * @apiParam  {Number{1-}}         [page=1]     List page
   * @apiParam  {Number{1-100}}      [perPage=1]  Vendors per page
   * @apiParam  {String}             [name]       Vendor's name  
   *
   * @apiSuccess {Object[]} settingss List of settingss.
   *
   * @apiError (Unauthorized 401)  Unauthorized  Only authenticated settingss can access the data
   * @apiError (Forbidden 403)     Forbidden     Only admins can access the data
   */
  .get(authorize(ADMIN),controller.read)
  /**
   * @api {post} v1/settingss Create Vendor
   * @apiDescription Create a new user
   * @apiVersion 1.0.0
   * @apiName CreateVendor
   * @apiGroup Vendor
   * @apiPermission admin
   *
   * @apiHeader {String} Authorization access token
   *
   * @apiParam  {String}             name             Vendor's name
   *
   * @apiSuccess (Created 201) {String}  id         Vendor's id
   * @apiSuccess (Created 201) {String}  name       Vendor's name
   * @apiSuccess (Created 201) {Date}    createdAt  Timestamp
   *
   * @apiError (Bad Request 400)   ValidationError  Some parameters may contain invalid values
   * @apiError (Unauthorized 401)  Unauthorized     Only authenticated settingss can create the data
   * @apiError (Forbidden 403)     Forbidden        Only admins can create the data
   */
  .put(authorize(ADMIN),validate(updateSettings), controller.update);
  router
  .route('/referralInfo')
  .get(authorize(LOGGED_USER),  controller.getReferralInfo);

module.exports = router;
