const express = require('express');
const validate = require('express-validation');
const controller = require('../../controllers/job.controller');
const JobUtils = require('../../utils/jobs');
const CFUtils = require('../../utils/cashfreeUtils');
const { authorize, ADMIN, LOGGED_USER } = require('../../middlewares/auth');
const {
  searchWallet,
} = require('../../validations/wallet.validation');
const router = express.Router();

/**
 * Load user when API with walletId route parameter is hit
 */

router
  .route('/updateCode')
  .post(authorize(LOGGED_USER), controller.updateReferralCode)


router
.route('/updateCustomerId')
.post(controller.updateCustomerId)

router
.route('/updateVendorId')
.post(controller.updateVendorId)



router
.route('/referralInfo')
.get(controller.getUserReferralDetails)


router
.route('/notify')
.post(controller.sendNotifications)

router
.route('/notifyDevice')
.post(controller.sendNotificationsToDevice)


router
.route('/testmail')
.get(controller.sendTestEmail)


router
.route('/check')
.get(controller.findCorruptedOrders)


router
.route('/checkOrders')
.get(JobUtils.updateOrderPaymentStatus)


router
.route('/updatePendingOrders')
.get(controller.updatePendingOrderPaymentStatus)


router
.route('/processReferrals')
.get(authorize(ADMIN),  controller.processMissingReferralRewards)



router
.route('/test')
.get( controller.testMethod)


router
.route('/order/:orderId')
.get( controller.getOrderTransactionDetails)


router
.route('/cashfree/:orderId/status')
.get( controller.getPaymentStatus)



router
.route('/razorpay/order')
.post( controller.createRazorPayOrder)


router
.route('/campaign/updateId')
.post( controller.updateCampaignIds)


module.exports = router;
