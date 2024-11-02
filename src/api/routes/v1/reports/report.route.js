const express = require('express');
const validate = require('express-validation');
const deliveryReports = require('../../../controllers/reports/delivery.report');
const vendorReports = require('../../../controllers/reports/vendor.report');
const campaignReports = require('../../../controllers/reports/campaign.report');
const userReports = require('../../../controllers/reports/user.report');
const txnReports = require('../../../controllers/reports/transaction.report');
const { authorize, ADMIN, LOGGED_USER } = require('../../../middlewares/auth');
const {
  deliveryReport,
  exportOrders
} = require('../../../validations/reports/report.validation');

const router = express.Router();

router.get('/', (req, res) => res.send('Reports'));

router
  .route('/delivery')
  .post(validate(deliveryReport), deliveryReports.getCustomerDeliveryReport);

router
  .route('/revenue')
  .post(authorize(ADMIN), campaignReports.getCampaignRevenueReport);

router
.route('/apartment')
.post(validate(deliveryReport), deliveryReports.getApartmentDeliveryReport);


router
  .route('/other')
  .post(authorize(ADMIN), deliveryReports.getCustomerDeliveryReport);



router
.route('/vendor')
.post(authorize(ADMIN), vendorReports.getVendorOrderReport);


router
.route('/referral')
.post(userReports.getReferralReport);


router
.route('/transaction')
.get(authorize(ADMIN),txnReports.getTransactionReport);

  //console.log(router)
module.exports = router;
