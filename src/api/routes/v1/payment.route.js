const express = require('express');
const validate = require('express-validation');
const controller = require('../../controllers/payment.controller');
const { authorize, ADMIN, LOGGED_USER } = require('../../middlewares/auth');
const router = express.Router();

router
  .route('/cashfree')
  .get(authorize(LOGGED_USER), controller.testPayment)


router
.route('/cashfree/vendor')
.get(authorize(LOGGED_USER), controller.createVendor)


router
.route('/webhook/cashfree')
.post(controller.cashfreePaymentHook)


router
.route('/webhook/razorpay')
.post(controller.razorpayWebHook)


router
.route('/cashfree/order')
.post(controller.createOrder)


router
.route('/:orderId/invoice')
.get(controller.createInvoice)


router
.route('/:orderId/refund')
.get(controller.checkRefundDetails)

module.exports = router;
