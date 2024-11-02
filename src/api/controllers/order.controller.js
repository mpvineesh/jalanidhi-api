const httpStatus = require("http-status");
const { omit } = require("lodash");
const mongoose = require("mongoose");
const Order = require("../models/order.model");
const Campaign = require("../models/campaign.model");
const Ticket = require("../models/ticket.model");
const OTP = require("../models/otp.model");
const Product = require("../models/product.model");
const moment = require("moment");
const APIError = require("../errors/api-error");
const Transaction = require("../models/transaction.model");
const { scheduleJob } = require("../utils/scheduler");
const RazorPayUtils = require("../utils/razorpayUtils");
const User = require("../models/user.model");
const Vendor = require("../models/vendor.model");
const Settings = require("../models/settings.model");
const WalletLogs = require("../models/wallet.logs.model");
const Tracking = require('../models/tracking.model');
const cashfreeUtils = require("../utils/cashfreeUtils");
const PaymentController = require("./payment.controller");
const SMSUtils = require("../utils/SMSUtils");
const JobUtils = require("../utils/jobs");
const Logger = require('../../config/winston');
const logger = new Logger('/order')

const orderStatusFlow = [
  { current: "PendingPayment", next: ["Cancelled", "OutForDelivery", "Confirmed"] },
  { current: "Confirmed", next: ["OutForDelivery", "Cancelled", "OutForDelivery"] },
  { current: "OutForDelivery", next: ["PartialDelivery", "Delivered"] },
  { current: "PartialDelivery", next: ["Delivered"] },
  { current: "Cancelled", next: [] },
  { current: "Delivered", next: ["Returned"] },
];
/**
 * Load order and append to req.
 * @public
 */
exports.load = async (req, res, next, id) => {
  try {
    logger.info("Loading order: " + id);
   
    const order = await Order.get(id);
    
    req.locals = { order };
    return next();
  } catch (error) {
    logger.error(error);
    return next(error);
  }
};

/**
 * Get order
 * @public
 */
exports.get = async (req, res) => {
  
  let order = req.locals.order.transform()

  for(let i=0;i<order.campaigns.length;i++) {
    let products = order.campaigns[i].products;
    let tickets = await Ticket.find({refId:order.campaigns[i].subOrderId, 'refType': 'SubOrder'})
    order.campaigns[i]['tickets'] = tickets
    for(let j=0;j<products.length;j++) {
      let p = await Product.findOne({_id: products[j].productId})
      
      order.campaigns[i].products[j]['images'] = p.images
    }
  }

  res.json(order)
  
};

/**
 * Create new order
 * @public
 */
exports.create1 = async (req, res, next) => {
  try {
    let loggedInUser = req.user;
    let orderCount = await Order.countDocuments();
    let orderNo =
      moment(new Date()).format("DDMMYYYY") + "-" + (orderCount + 1);
    let fomrmatted = [];
    let outOfStock = false;
    let outOfStockProduct = null;
    let invalidCampaign = false;
    let invalidProduct = false;
    let inactiveCampaign = false;
    let productInCampaign = true;

    for (let i = 0; i < req.body.campaigns.length; i++) {
      const { active: isValidCampaign, campaign } =
        await Campaign.isActiveCampaign(req.body.campaigns[i].campaignId);
      if (isValidCampaign) {
        let c = req.body.campaigns[i],
          idx = i;
        let campaignStatus = await Order.getCampaignOrderStatus(c.campaignId);
        let stockExist = true;
        for (let i = 0; i < c.products.length; i++) {
          let product = c.products[i];
          if (
            campaign.products.filter((p) => p._id == product.productId)
              .length == 0
          ) {
            productInCampaign = false;
            break;
          }
          //console.log('StockInfo', campaignStatus[product.productId])
          //Get product info attributes / product
          //let productDetails = await Product.get(c.products[i]);
          const attributes = product.attributes;
          const requiredAttributes = attributes.filter(
            (attr) => attr.isRequired
          );
          if (requiredAttributes.length) {
          }
          //Does the product has any required attributes?

          if (
            campaignStatus[product.productId] &&
            campaignStatus[product.productId].total + product.quantity >
              campaignStatus[product.productId].stock
          ) {
            stockExist = false;
            outOfStockProduct = product.productId;
            break;
          }
        }
        if (!stockExist) {
          outOfStock = true;
          break;
        }
        if (!productInCampaign) break;

        let orderObj = {
          orderId: orderNo + "-" + (idx + 1),
          deliveryDate: req.body.deliveryDate,
          customerId: req.body.customerId,
          campaign: c.campaignId,
          status: "PendingPayment",
          address: req.body.address,
          products: c.products,
          createdBy: loggedInUser.id,
        };
        fomrmatted.push(orderObj);
      } else {
        invalidCampaign = true;
        break;
      }
    }

    if (outOfStock) {
      //res.status(httpStatus.BAD_REQUEST);
      let e = new APIError({
        message: "1 or more products are out of stock",
        status: httpStatus.BAD_REQUEST,
      });
      next(e);
    } else if (invalidCampaign) {
      let e = new APIError({
        message: "1 or more campaigns are invalid/inactive",
        status: httpStatus.BAD_REQUEST,
      });
      next(e);
    } else if (!productInCampaign) {
      let e = new APIError({
        message: "1 or more products are not belongs to the campaign",
        status: httpStatus.BAD_REQUEST,
      });
      next(e);
    } else {
      //console.log('fomrmatted', fomrmatted)
      const savedOrders = await Order.insertMany(fomrmatted);
      res.status(httpStatus.CREATED);
      res.json(savedOrders.map((o) => ({ id: o.id })));
    }
  } catch (error) {
    next(error);
  }
};
async function formatVendorSplit(vendorSplit) {
  let vendorSplitPayments = [];
  let vendors = Object.keys(vendorSplit);
  for (let v = 0; v < vendors.length; v++) {
    let vendor = await Vendor.get(vendors[v]);

    const sellerFeePercentage = vendor.sellerFeePercentage || 10;
    let vendorSplitAmount = (
      (vendorSplit[vendors[v]] * (100 - sellerFeePercentage)) /
      100
    ).toFixed(2);
    vendorSplitPayments.push({
      vendor_id: vendor.vendorId,
      amount: vendorSplitAmount,
    });
  }
  vendorSplitPayments[0].amount = +vendorSplitPayments[0].amount - 0.01;
  return vendorSplitPayments;
}
exports.create = async (req, res, next) => {
  try {
    let loggedInUser = req.user;
    let orderCount = await Order.countDocuments();
    let orderNo =
      moment(new Date()).format("DDMMYYYY") + "-" + (orderCount + 1);

    let fomrmatted = [];
    const { valid, error, total, orderObj, vendorSplit } = await validateOrder(
      req.body
    );
    orderObj.campaigns = orderObj.campaigns.map((c, idx) => {
      c["subOrderId"] = orderNo + "-" + (idx + 1);
      return c;
    });
    //console.log("validateOrder:", vendorSplit);

    if (valid) {
      let paymentMethods = [];
      let cashfreeAmount = total;
      let walletAmount = 0;
      
      if(loggedInUser.walletCredits && loggedInUser.walletCredits > 0) {
        console.log('Paying with wallet credits');
        cashfreeAmount = loggedInUser.walletCredits >= total ? 0 : total - loggedInUser.walletCredits;
        walletAmount = total - cashfreeAmount;
        let payment = {
          method: 'Wallet',
          amount: walletAmount
        }
        paymentMethods.push(payment)
        if(cashfreeAmount > 0) {
          paymentMethods.push({
            method: 'Cashfree',
            amount: cashfreeAmount
          })
        }
      } else {
        paymentMethods.push({
          method: 'Cashfree',
          amount: cashfreeAmount
        })
      }
      //console.log('User wallet', paymentMethods)
      let orderCustomerId =
        loggedInUser.role == "user" ? loggedInUser.id : req.body.customerId;
      const orderCustomer = await User.get(orderCustomerId);
      let address = req.body.address;
      address['mobile'] = orderCustomer.mobile;
      let orderInfo = {
        orderId: orderNo,
        deliveryDate: req.body.deliveryDate,
        customerId: orderCustomerId,
        campaigns: orderObj.campaigns,
        status: "PendingPayment",
        address: req.body.address,
        createdBy: loggedInUser.id,
        amount: cashfreeAmount,
        total: total
      };
      //savedOrder = savedOrder.populate('customer');
      
      //Vendor Split
      let vendorSplitPayments = [];
      let vendors = Object.keys(vendorSplit);
      for (let v = 0; v < vendors.length; v++) {
        let vendor = await Vendor.get(vendors[v]);

        const sellerFeePercentage = vendor.sellerFeePercentage || 10;
        let vendorSplitAmount = (
          (vendorSplit[vendors[v]] * (100 - sellerFeePercentage)) /
          100
        ).toFixed(2);
        vendorSplitPayments.push({
          vendor_id: vendor.vendorId,
          amount: vendorSplitAmount
        });
      }
      vendorSplitPayments[0].amount = +vendorSplitPayments[0].amount - 0.01;
      vendorSplitPayments[0].amount = vendorSplitPayments[0].amount.toFixed(2)
      //console.log("vendorSplitPayments", vendorSplitPayments);
      let customerOrders = await Order.countDocuments({
        customerId: orderCustomerId,
      });
      const isFirstOrder = customerOrders == 0;
      //console.log('isFirstOrder', isFirstOrder, orderCustomer)
      if (orderCustomer.referredBy && isFirstOrder) {
        const referralRewardInfo = {
          status: "Pending",
          eligible: true,
        };
        orderInfo["referralRewardInfo"] = referralRewardInfo;
      }
      let statusUpdates = [
        {
          status: "PendingPayment",
          comments: "",
          date: new Date().toISOString(),
        },
      ];
      orderInfo["statusUpdates"] = statusUpdates;
      //logger.info('Created new order '+ JSON.stringify(orderInfo))
      const order = new Order(orderInfo);
      if(req.body.trackingInfo && Object.keys(req.body.trackingInfo).length > 0) {
        let trackingInfo = {...req.body.trackingInfo}
        trackingInfo['type'] = 'order';
        trackingInfo['refId'] = order._id
        let tracking = new Tracking(trackingInfo)
        let resp = await tracking.save();
      }

      let savedOrder = await order.save();
      //Initiate RazorPay Transaction
      // const razorpay = RazorPayUtils.getInstance();
      // const options = {
      //   amount: total*100,
      //   currency: "INR",
      //   receipt: orderNo
      // };
      
      
      
      if (req.body.redirectUrl) {
        orderInfo["redirectUrl"] = req.body.redirectUrl;
      }
      if(walletAmount > 0) {
        updateUserWallet(savedOrder, walletAmount )
      }
      if(cashfreeAmount > 0) {
            cashfreeUtils
              .createCFOrder(orderInfo, orderCustomer, vendorSplitPayments)
              .then(async (resp) => {
               
                console.log("Create cashfree order API response:", resp);
                //Update rzpOrderId
                await Order.updateOne(
                  { _id: savedOrder._id },
                  { CFOrderId: resp.cf_order_id }
                );
                // TODO Update Product stock

                for (let i = 0; i < orderInfo.campaigns.length; i++) {
                  let c = orderInfo.campaigns[i];
                  //console.log('products', c.products)
                  let updateProducts = c.products.reduce((acc, p) => {
                    acc[p.productId] = p;
                    return acc;
                  }, {});

                  let campaign = await Campaign.findOne({ _id: c.campaignId });
                  let products = campaign.products;
                  let selectedCampaign = c;
                  //console.log("selectedCampaign", selectedCampaign);
                  products = products.map((p) => {
                    p = p.toJSON();
                    //Update reserved stock for the product or attribute level
                    const attributes = p.attributes || [];
                    //console.log('attributes exist?', attributes.length)

                    let selectedProduct = selectedCampaign.products.filter(
                      (pr) => pr.productId.toString() == p.productId.toString()
                    )[0];
                    if(selectedProduct){
                     
                        //console.('selectedProduct', selectedProduct, p)
                        if (attributes.length) {
                          try {
                            for (let i = 0; i < attributes.length; i++) {
                              let attr = attributes[i];
                              // console.log('loop er', attr)
                              if (attr.isRequired) {
                                //find the selected option
                                let reqAttribute = attr; //.options.filter(o => o.isRequired == true)[0];
                                if (selectedProduct.attributes) {
                                  let selectedAttribute =
                                    selectedProduct.attributes.filter(
                                      (a) => a.name == reqAttribute.name
                                    )[0];
                                  let selectedOption = selectedAttribute.value;
                                  const selectedAttributeOption = attr.options.filter(
                                    (o) => o.value == selectedOption
                                  )[0];
                                 
                                  if (selectedAttributeOption.stock !== 9999)
                                    selectedAttributeOption.reserved =
                                      (selectedAttributeOption["reserved"] || 0) +
                                      selectedAttribute.quantity;
                                }
                              }
                            }
                          } catch (le) {
                            
                           console.log("loop er", le);
                          }
                        } else if (p.stock !== 9999) {
                          ///console.log('setting reserved')
                          p["reserved"] =
                            (p["reserved"] ? p["reserved"] : 0) +
                            selectedProduct.quantity;
                        }
                      } else {
                        console.log(`Product ${p.name} is not part of the order`)
                      }
                    return p;
                  });
                  scheduleJob(60, () => {
                    checkCFOrderStatus(savedOrder._id);
                  })
                  scheduleJob(180, () => {
                    updateReservedStocks(savedOrder._id);
                  });
                  scheduleJob(330, () => {
                    updatePaymentStatus(savedOrder._id)
                  })
                  let orderCount = (campaign.orderCount || 0) + 1;
                  await Campaign.findOneAndUpdate(
                    { _id: c.campaignId },
                    { products: products, orderCount: orderCount }
                  );
                }
                // let orderBreakup = createOrderBreakup(orderInfo, paymentMethods)
                // console.log('orderBreakup2', JSON.stringify(orderBreakup))
                //Create Transaction
                let txnObj = {
                  orderId: savedOrder._id ,
                  createdBy: loggedInUser.id,
                  amount: total,
                  customerId: savedOrder.customerId,
                  txnType: "Payment",
                  paymentMethods: paymentMethods,
                  pgOrderId: resp.cf_order_id,
                  pgResponse: JSON.stringify(resp),
                  orderBreakup: createOrderBreakup(orderInfo, paymentMethods)
                };

                const transaction = new Transaction(txnObj);
                const savedTxn = await transaction.save();

                //res.status(httpStatus.CREATED);
                //console.log('Order:create', resp, orderCustomer)
                const response = {
                  orderId: savedOrder.id,
                  //razorPayOrderId: order.id,
                  cashfreeOrderId: resp.cf_order_id,
                  paymentLink: resp.payment_link?resp.payment_link:null,
                  paymentSessionId: resp.payment_session_id ? resp.payment_session_id : null,
                  status: 'PendingPayment'
                };
                res.json(response);
                res.end();
              })
              .catch((err) => {
                console.log("err", error);
                logger.error('Error creating cashfree order',err)
                res.status(httpStatus.BAD_REQUEST);
                res.json(err);
                res.end();
              });
      } else {
            let statusUpdates = [
              {
                status: "Confirmed",
                comments: "Confirmed the order and no payment required",
                date: new Date().toISOString(),
              },
            ];
            await Order.updateOne(
              { _id: savedOrder._id },
              { 'status': 'Confirmed' ,
                $set: {
                  "campaigns.$[].statusUpdates": statusUpdates,
                  "campaigns.$[].status": 'Confirmed' ,
                }
              }
            );
            let mobileNo = orderCustomer.mobile.toString().length > 10 ? orderCustomer.mobile : '91'+ orderCustomer.mobile
            SMSUtils.sendOrderConfimation(total, mobileNo)
            // vendorSplitPayments.forEach(v => {
            //   createVendorAdjustment(v.vendor_id, savedOrder.orderId, v.amount, 'CREDIT',`Adjusted for wallet credit payent for order ${savedOrder.orderId} amount: ${v.amount}`);
            // })
             updateStocks(savedOrder)
            //Create Transaction
            let orderBreakup = createOrderBreakup(orderInfo, paymentMethods)
            let txnObj = {
              orderId: savedOrder._id ,
              createdBy: loggedInUser.id,
              amount: total,
              customerId: savedOrder.customerId,
              txnType: "Payment",
              paymentMethods: paymentMethods,
              pgOrderId: 'Wallet',
              orderBreakup:orderBreakup,
              paymentStatus: 'PAYMENT_SUCCESS'
            };
            const transaction = new Transaction(txnObj);
            const savedTxn = await transaction.save();

            const response = {
              orderId: savedOrder.id,
              status: 'Confirmed'
            };
            res.json(response);
            res.end();

      }
    } else {
      console.log(error);
      logger.error('Error creating order',error)
      next(error);
    }
  } catch (e) {
    console.log(e);
    logger.error('Error creating order',e)
    next(e);
  }
};

function createOrderBreakup(orderInfo, paymentMethods) {
  let orderBreakups = [];
  let campaigns = orderInfo.campaigns;
  for(let campaign of campaigns){
    
    let payments = []
    for(let paymentMethod of paymentMethods){
      let percentage = (campaign.amount/orderInfo.total);
      payments.push({
        method: paymentMethod.method,
        amount: (percentage * paymentMethod.amount).toFixed(2),
      })
    }
    let breakup = {
      campaignId: campaign.campaignId,
      total: campaign.amount,
      payments: payments
    }
    orderBreakups.push(breakup)
  }
  console.log('orderBreakups', orderBreakups)
  return orderBreakups;

}

async function checkCFOrderStatus(orderId) {
  let order = await Order.findOne({_id:orderId});
  if(order.status =='PendingPayment' || order.status =='PaymentCancelled'){
    let cashfreeOrder = await cashfreeUtils.getOrderStatus(order.orderId);
    let cashfreePayment = await cashfreeUtils.getPaymentStatus(order.orderId);
    let orderUpdate = {}
    console.log('Running order status check:', order.status, cashfreeOrder.order_status, cashfreePayment)
    if(!cashfreePayment || cashfreePayment.length == 0) {
      logger.info('checkCFOrderStatus: Cashfree payment is not initiated yet of order '+orderId)
      console.log('checkCFOrderStatus: Cashfree payment is not initiated yet of order '+orderId)
    } else {
      if(cashfreePayment.filter(p => p.payment_status !== 'NOT_ATTEMPTED').length == 0){
        logger.info('checkCFOrderStatus: Cashfree payment is NOT_ATTEMPTED '+orderId)
        console.log('checkCFOrderStatus: Cashfree payment is NOT_ATTEMPTED '+orderId)
      } else{
        if(cashfreeOrder.order_status == 'PAID'){
          orderUpdate =  {
            paymentStatus: "PAYMENT_SUCCESS",
            status: 'Confirmed' ,
            $set: {
              "campaigns.$[].products.$[].status": 'Confirmed',
              "campaigns.$[].status": 'Confirmed' 
            }
          }
        } else {
          if(cashfreePayment[0].payment_status !== 'SUCCESS' && cashfreePayment[0].payment_status !== 'PENDING'){
            orderUpdate =  {
              paymentStatus: "PAYMENT_FAILED",
              status: 'PaymentFailed' ,
              $set: {
                "campaigns.$[].products.$[].status": 'PaymentFailed',
                "campaigns.$[].status": 'PaymentFailed' 
              }
            }
            if(order.status !== 'PaymentCancelled' && order.paymentStatus !== 'PAYMENT_USER_DROPPED') {
              //TODO: check
              let txn = await Transaction.findOne({orderId: order._id, txnType: 'Payment'})
              if(txn) {
                let methods = txn.paymentMethods;
                let walletTxn = methods.find( m => m.method === 'Wallet')
                if(walletTxn)
                  PaymentController.updateUserWallet(order, walletTxn.amount)
              }
            }

          }
        }
      }
      console.log('Updating order:', orderUpdate)
      let updated = await Order.updateOne({'_id': orderId}, orderUpdate)
    }
  }
}

exports.updatePaymentPendingorderStatus = async (req, res, next) => {
  try {
    let orderId = req.params.orderId;
    updatePaymentStatus(orderId)
  } catch (error) {
    logger.error(error)
    next(error);
  }
};

const updatePaymentStatus = async (orderId) => {
  let order = await Order.findOne({_id:orderId});
  console.log('Updating pyment status', order.orderId)
  if(order.status =='PendingPayment' || order.status =='PaymentCancelled'){
    let cashfreeOrder = await cashfreeUtils.getOrderStatus(order.orderId);
    let cashfreePayment = await cashfreeUtils.getPaymentStatus(order.orderId);
    let orderUpdate = {}
    console.log('Running order status check:', order.status, cashfreeOrder.order_status, cashfreePayment)
    if(!cashfreePayment  || cashfreePayment.length || cashfreeOrder.order_status == 'EXPIRED') {
      logger.info('updatePaymentStatus: Cashfree payment is not initiated yet of order '+orderId)
      console.log('updatePaymentStatus: Cashfree payment is not initiated yet of order '+orderId)
      orderUpdate =  {
        paymentStatus: "PAYMENT_FAILED",
        status: 'PaymentFailed' ,
        $set: {
          "campaigns.$[].products.$[].status": 'PaymentFailed',
          "campaigns.$[].status": 'PaymentFailed' 
        }
      }
      let txn = await Transaction.findOne({orderId: order._id, txnType: 'Payment'})
      if(txn) {
        let methods = txn.paymentMethods;
        let walletTxn = methods.find( m => m.method === 'Wallet')
        if(walletTxn)
          PaymentController.updateUserWallet(order, walletTxn.amount)
      }
      if(order.status !== orderUpdate.status){
        console.log('Updating order:', orderUpdate)
        await Order.updateOne({'_id': orderId}, orderUpdate)
      }

    } 
  }
}



async function updateUserWallet(orderInfo, orderCredits) {
  try{
    const user = await User.get(orderInfo.customerId)
    let credits = user.walletCredits-orderCredits;
    let updates = {walletCredits: credits};
    User.findOneAndUpdate({_id:user._id},updates,{new:true}).then(async u => {
      let txn = {
        userId: user._id,
        mobile: user.mobile,
        credits: orderCredits,
        type: 'Debit',
        refId: orderInfo._id,
        txnDetails: {
          updatedBy: user._id,
          comment: `Used ${orderCredits} credits for order ${orderInfo.orderId}`
        }
      }
      let t = await new WalletLogs(txn).save();
      return;
    }).catch(e => {
      //return e;
      console.log(e);
    });
  }catch(e) {
    console.log(e);
  }
}

async function updateStocks(orderInfo) {
  for (let i = 0; i < orderInfo.campaigns.length; i++) {
    let c = orderInfo.campaigns[i];
    //console.log('products', orderInfo)
    let updateProducts = c.products.reduce((acc, p) => {
      acc[p.productId] = p;
      return acc;
    }, {});

    let campaign = await Campaign.findOne({ _id: c.campaignId });
    //console.log('campaign', campaign)
    let products = campaign.products;
    let selectedCampaign = c;
    // let selectedCampaign = orderInfo.campaigns.filter(
    //   (c) => c.campaignId.toString() == campaign._id.toString()
    // )[0];
    //console.log("selectedCampaign", selectedCampaign);
    products = products.map((p) => {
      p = p.toJSON();
      //Update reserved stock for the product or attribute level
      const attributes = p.attributes || [];
      //console.log('attributes exist?', attributes.length)

      let selectedProduct = selectedCampaign.products.filter(
        (pr) => pr.productId.toString() == p.productId.toString()
      )[0];
      //console.log('selectedProduct', selectedProduct, p)
      if(selectedProduct) {
        if (attributes.length) {
          try {
            for (let i = 0; i < attributes.length; i++) {
              let attr = attributes[i];
              // console.log('loop er', attr)
              if (attr.isRequired) {
                //find the selected option
                let reqAttribute = attr; //.options.filter(o => o.isRequired == true)[0];
                if (selectedProduct.attributes) {
                  let selectedAttribute =
                    selectedProduct.attributes.filter(
                      (a) => a.name == reqAttribute.name
                    )[0];
                  let selectedOption = selectedAttribute.value;
                  const selectedAttributeOption = attr.options.filter(
                    (o) => o.value == selectedOption
                  )[0];
                  console.log(
                    "reqAttribute",
                    selectedAttribute,
                    selectedOption
                  );
                  if (selectedAttributeOption.stock !== 9999)
                    selectedAttributeOption.reserved =
                      (selectedAttributeOption["reserved"] || 0) +
                      selectedProduct.quantity;
                }
              }
            }
          } catch (le) {
            console.log("loop er", le);
          }
        } else if (p.stock !== 9999) {
          ///console.log('setting reserved')
          p["reserved"] =
            (p["reserved"] ? p["reserved"] : 0) +
            selectedProduct.quantity;
        }
      } else {
        console.log(`Product ${p.name} is not ordered`);
       logger.info(`Product ${p.name} is not ordered`);
      }
      return p;
    });

    scheduleJob(180, () => {
      updateReservedStocks(orderInfo._id);
    });
    let orderCount = (campaign.orderCount || 0) + 1;
    await Campaign.findOneAndUpdate(
      { _id: c.campaignId },
      { products: products, orderCount: orderCount }
    );
  }
}

exports.updateStocks = async (req, res, next) => {
  updateReservedStocks(req.params.orderId);
};

const updateReservedStocks = async function (orderId) {
  try {

    console.log("Order Id", orderId);
    let order = await Order.findById(orderId);
    let status = ["PendingPayment", "Processing", "PaymentFailed", "PaymentCancelled"];
    if(order.status === "PendingPayment" && order.paymentStatus == "PAYMENT_PROCESSING") {
      //This order is pending after 3 minutes and can be deleted

    }
    let campaigns = order.campaigns;
    for (let i = 0; i < campaigns.length; i++) {
      let campaignUpdate = await Campaign.findById(campaigns[i].campaignId);
      let updateProducts = campaignUpdate.products;
      let products = campaigns[i].products;
      for (let j = 0; j < products.length; j++) {
        let product = products[j];
        //Update reserved stock for the product or attribute level
        const attributes = product.attributes || [];
        let selectedCampaignProduct = updateProducts.filter(
          (pr) => pr.productId.toString() == product.productId.toString()
        )[0];
        selectedProduct = selectedCampaignProduct.toJSON()
        if (attributes.length) {
          for (let i = 0; i < attributes.length; i++) {
            let attr = attributes[i];
           
              let selectedAttribute = selectedProduct.attributes.filter(
                (a) => a.name == attr.name
              )[0];
              
              if(selectedAttribute && selectedAttribute.isRequired) {
                let optionToUpdate = selectedAttribute.options.filter(option => option.value == attr.value)[0];
               
                if (optionToUpdate["stock"] !== 9999) {
                  optionToUpdate["reserved"] = optionToUpdate["reserved"] - +attr.quantity;
                  if (status.indexOf(order.status) == -1) {
                    optionToUpdate["stock"] = optionToUpdate["stock"] - +attr.quantity;
                  }
                }
              } else {
                if(!selectedAttribute) {
                  logger.error('Failed to find selected attribute',{selectedProduct: selectedProduct, attr: attr, campaigns: campaigns})
                }
                
              }
              //console.log('selectedAttribute', JSON.stringify(selectedAttribute));
            //}
          }
        } else {
          if (selectedCampaignProduct["stock"] !== 9999) {
            let r = selectedCampaignProduct["reserved"]
            if (status.indexOf(order.status) !== -1) {
             
              selectedCampaignProduct["reserved"] =
                r - product.quantity < 0? 0 : r - product.quantity;
            } else {
              selectedCampaignProduct["reserved"] =
              r - product.quantity < 0? 0 : r - product.quantity;
              selectedCampaignProduct["stock"] =
              selectedCampaignProduct["stock"] - product.quantity;
            }
          }
        }
        selectedCampaignProduct.attributes = selectedProduct.attributes;
      }
      await Campaign.findOneAndUpdate(
        { _id: campaigns[i].campaignId },
        { products: updateProducts }
      );
      await Order.updateOne({_id: orderId}, {stockUpdated: true})
    }

  } catch (e) {
    logger.error(e)
    console.log("stock update error", e);
  }
};

const validateOrder = async function (orderObj) {
  let e = new APIError({
    message: "",
    status: httpStatus.BAD_REQUEST,
  });
  let error = false, produtStockeError = false,
    total = 0;
  let vendorSplit = {};
  logger.info('Validating order payload', orderObj)
  for (let i = 0; i < orderObj.campaigns.length; i++) {
    let campaignTotal = 0;
    let campaignVendorSplit = {};
    const { active: isValidCampaign, campaign } =
      await Campaign.isActiveCampaign(orderObj.campaigns[i].campaignId);
    //console.log("validateOrder:357", JSON.stringify(campaign));
    if (isValidCampaign) {
      let c = orderObj.campaigns[i],
        idx = i;
      //let campaignStatus = await Order.getCampaignOrderStatus(c.campaignId);
      orderObj.campaigns[i].name = campaign.name;
      orderObj.campaigns[i].deliveryDate = campaign.deliveryTime;
      for (let j = 0; j < c.products.length; j++) {
        let product = c.products[j];
        console.log('checking produt details', c.products[j].productId)
        let productDetails = await Product.get(c.products[j].productId);
        product.vendorId = productDetails.vendorId;
        console.log('vendor daaat', productDetails.vendorId)
        orderObj.campaigns[i].products[j].name = productDetails.name;
        //console.log('validateOrder:367', campaign.products, product.productId)
        if (
          campaign.products.filter(
            (p) => p.productId.toString() == product.productId.toString()
          ).length == 0
        ) {
          e.message = `Product ${productDetails.name} is not part of the selected campaign`;
          error = true;
          break;
        }
        let campaignProductDetails = campaign.products.filter(
          (p) => p.productId.toString() == product.productId.toString()
        )[0]
        //let productPriceTotal  = +product.quantity * +productDetails.groupPrice;
        console.log(`Product ${productDetails.name} base price: ${campaignProductDetails.groupPrice} quantity ${product.quantity}`);
        let productTotal = +product.quantity * +campaignProductDetails.groupPrice;
        product['price'] = campaignProductDetails.groupPrice
        campaignTotal = campaignTotal + productTotal
        total += productTotal;
        let vId = productDetails.vendorId.toString();
        //console.log('StockInfo', campaignStatus[product.productId])
        product['total'] = productTotal
        //Get product info attributes / product
        const campaignProduct = campaign.products.filter(
          (p) => product.productId.toString() == p.productId.toString()
        )[0];
        //console.log("campaignProduct", campaignProduct);
        const attributes = campaignProduct.attributes || [];
        const requiredAttributes = attributes.filter((attr) => attr.isRequired);
        let stock = campaignProduct.stock;
        let reserved = campaignProduct.reserved;
        let maxCountPerUser = campaignProduct.maxCountPerUser;
         
        let {sockError, err} = checkIfStockAvailable(campaignProduct, product, productDetails)
        if(sockError) {
          error = true;
          e.message = err.message
          produtStockeError = true;
          break
        }
        
        if (requiredAttributes.length) {
          //console.log('product.attributes', product)
          if (!product.attributes || product.attributes.length == 0) {
            e.message = "Required product attributes missing";
            error = true;
            break;
          }
          /********************** Cheking If mandatory product attributes are seleted **********************/
          let selectedRequiredAttributes = attributes.filter((o) =>
            product.attributes.some(({ name }) => o.name === name)
          );
          console.log(
            "Cheking If mandatory product",
            attributes,
            product.attributes
          );
          if (!selectedRequiredAttributes.length) {
            e.message = "Required add on attributes are not selected";
            error = true;
            break;
          }
          //const selectedRequiredAttr = product.attributes.filter(attr => attr.required)[0]

          /*
          const selectedAttributeOption = requiredAttributes[0].options.filter(o => o.value = product.attributes[0].value)[0];
          stock = selectedAttributeOption.stock;
          reserved = selectedAttributeOption.reserved;
          maxCountPerUser = selectedAttributeOption.maxCountPerUser;
          if(!selectedAttributeOption) {
            e.message = 'Selected attribute option is invalid';
            error = true;break;
          } else if(product.attributes.filter(attr => attr.name == requiredAttributes[0].name).length == 0){
            e.message = 'Required product attributes missing';
            error = true;break;
          }
          */
          //check attribute level stocks
          let stocks = 0;
        }
        //Calculate add on price
       
        if (product.attributes && attributes.length) {
          //console.log("product.attributes", product.attributes);
          product.attributes.forEach((attr) => {
            const attrDetails = attributes.filter(
              (at) => at.name == attr.name
            )[0];
            console.log("attrDetails", attr, attrDetails);
            if (attrDetails) {
              const selectedOption = attrDetails.options.filter(
                (o) => o.value === attr.value
              )[0];
              console.log(
                "selectedOption",
                selectedOption,
                selectedOption.price * +attr.quantity
              );
              attr['price'] = selectedOption.price
              total += selectedOption.price * +attr.quantity;
              product['total'] = product['total'] + (selectedOption.price * +attr.quantity)
              console.log(`Product ${productDetails.name} Attribute: ${attrDetails.name} ${attr.value} quantity ${attr.quantity}`);

              campaignTotal = campaignTotal + (selectedOption.price * +attr.quantity);
              //let vId = product.vendorId.toString()
              vendorSplit[vId] = vendorSplit[vId]
                ? vendorSplit[vId] + selectedOption.price * +attr.quantity
                : selectedOption.price * +attr.quantity
            }
          });
        } else if (product.attributes) {
          product.attributes = []
        }
       
        campaignVendorSplit[vId] =  campaignVendorSplit[vId] ? campaignVendorSplit[vId] + product['total'] : product['total'];
        vendorSplit[vId] = vendorSplit[vId]
          ? vendorSplit[vId] + product['total']
          : product['total'];

        //Does the product has any required attributes?

        if (maxCountPerUser < product.quantity) {
          e.message = `Maximum allowed quantity for ${productDetails.name} is ${maxCountPerUser}`;
          error = true;
          break;
        } else if (stock !== 9999 && stock - reserved == 0) {
          e.message = `Product ${productDetails.name} is out of stock`;
          error = true;
          break;
        } else if (stock !== 9999 && product.quantity > stock - reserved) {
          e.message = `Available stock for  ${productDetails.name} is ${stock - reserved} but requested for ${product.quantity}`;
          error = true;
          break;
        }
      }
      if(produtStockeError) {
        error = true;
        break;
      }
      let campaignVendorSplitPayments = [];
      let vendors = Object.keys(campaignVendorSplit);
      for (let v = 0; v < vendors.length; v++) {
        let vendor = await Vendor.get(vendors[v]);
        //console.log('sellerFeePercentage', vendor.sellerFeePercentage, campaignVendorSplit)
        const sellerFeePercentage = vendor.sellerFeePercentage;
        let vendorSplitAmount = (
          (campaignVendorSplit[vendors[v]] * (100 - sellerFeePercentage)) /
          100
        ).toFixed(2);
        campaignVendorSplitPayments.push({
          vendor_id: vendor.vendorId,
          amount: vendorSplitAmount
        });
      }
      //console.log('campaignVendorSplitPayments', campaignVendorSplitPayments)
      campaignVendorSplitPayments[0].amount = +campaignVendorSplitPayments[0].amount - 0.01;
      campaignVendorSplitPayments[0].amount = campaignVendorSplitPayments[0].amount.toFixed(2)


      orderObj.campaigns[i].amount  = campaignTotal;
      orderObj.campaigns[i].vendorSplit  = campaignVendorSplitPayments;
    } else {
      e.message = `The campaign is expired/invalid`;
      error = true;
      break;
    }
    
  }
  //console.log('orderObj', JSON.stringify(orderObj))
  //vendorSplit[vId].amount = vendorSplit[vId].amount  + 0.01;
  return { valid: !error, error: e, total, orderObj, vendorSplit };
};
/**
 * Create new order
 * @public
 */

function checkIfStockAvailable(campaignProduct, orderProduct, productDetails) {

  //
  let e = new APIError({
    message: "",
    status: httpStatus.BAD_REQUEST,
  });
  const stock = campaignProduct.stock;
  const reserved = campaignProduct.reserved;
  const maxCountPerUser = campaignProduct.maxCountPerUser;
  let attrStockError = false;
  if(orderProduct.attributes){
   
    for(let i = 0; i < orderProduct.attributes.length; i++){
        let attr = orderProduct.attributes[i];
        let selectedAttribute = campaignProduct.attributes.filter(
          (a) => a.name == attr.name
        )[0];
        
        if(selectedAttribute && selectedAttribute.isRequired) {
          let optionToUpdate = selectedAttribute.options.filter(option => option.value == attr.value)[0];
          console.log('optionToUpdate', selectedAttribute, attr, optionToUpdate)
          if (optionToUpdate["stock"] !== 9999 &&  optionToUpdate.stock - optionToUpdate.reserved == 0) {
            e.message = `${productDetails.name}-${selectedAttribute.name} ${optionToUpdate.value} is out of stock`;
            attrStockError = true;
            break;
          } else if (optionToUpdate["stock"] !== 9999 && attr.quantity > optionToUpdate.stock - optionToUpdate.reserved) {
            e.message = `Available stock for ${productDetails.name}(${selectedAttribute.name} ${optionToUpdate.value}) is ${optionToUpdate.stock - optionToUpdate.reserved} but requested for ${attr.quantity}`;
            attrStockError = true;
            break;
          }
        } else {
          if(!selectedAttribute) {
            logger.error('Failed to find selected attribute')
          }
        }
    }
    
  } else {
    if (maxCountPerUser < orderProduct.quantity) {
      e.message = `Maximum allowed quantity for ${productDetails.name} is ${maxCountPerUser}`;
      attrStockError = true;
      //break;
    } else if (stock !== 9999 &&  stock - reserved == 0) {
      e.message = `Product ${productDetails.name} is out of stock`;
      attrStockError = true;
      //break;
    } else if (stock !== 9999 && orderProduct.quantity > stock - reserved) {
      e.message = `Available stock for ${productDetails.name} is ${stock - reserved} but requested for ${orderProduct.quantity}`;
      error = true;
      //break;
    }
  }
  return {sockError: attrStockError, err: e}

}
exports.validate = async (req, res, next) => {
  try {
    let loggedInUser = req.user;
    let orderCount = await Order.countDocuments();
    let orderNo =
      moment(new Date()).format("DDMMYYYY") + "-" + (orderCount + 1);

    let fomrmatted = [];
    //const { valid, error, total } = await validateOrder(req.body);
    const { valid, error, total, orderObj, vendorSplit } = await validateOrder(req.body);
    if (!valid) {
      next(error);
    } else {
      return { valid, error, total, orderObj, vendorSplit }
    }
  } catch (error) {
    logger.error(error)
    next(error);
  }
};

function getStatusUpdatedOrder(order, status, comments) {
  
  let statusUpdates = order.statusUpdates;
  let statusChange = {
    status: status,
    comments: comments,
    date: new Date().toISOString(),
  };
  statusUpdates.push(statusChange);
  order["statusUpdates"] = statusUpdates;
  order["status"] = status;

  order.campaigns.forEach(campaign => {
    campaign['status'] = status
    let statusUpdates = campaign.statusUpdates;
    let products = []
    campaign.products.forEach(p => {
      products.push(p.productId);
      p['status'] = status
    })
    let statusChange = {
      status: status,
      comments: comments,
      date: new Date().toISOString(),
      products: products
    };
    statusUpdates.push(statusChange);
    campaign['statusUpdates'] = statusUpdates
  })

  return order;
}
/**
 * Update existing order
 * @public
 */
exports.update = (req, res, next) => {
  const updatedOrder = omit(req.body, "products");
  let orderToUpdate = req.locals.order.toJSON()
  let isValid = true;
  let updateError =  new APIError({
    message: "",
    status: httpStatus.BAD_REQUEST,
  });
  if (updatedOrder.status) {
      const isStatusUpdateAllowed = checkStatusFlow(orderToUpdate.status, req.body.status);
      if (orderToUpdate.status === req.body.status) {
        updateError = new APIError({
          message: "Order is already in "+req.body.status+ " status",
          status: httpStatus.BAD_REQUEST,
        });
        isValid = false
        //next(updateError)
      } else if (!isStatusUpdateAllowed) {
        updateError = new APIError({
          message: "Status change not allowed",
          status: httpStatus.BAD_REQUEST,
        });
        isValid = false
      } else {
        orderToUpdate = getStatusUpdatedOrder(orderToUpdate, req.body.status, "Updated by Admin")

        /*
        let statusUpdates = req.locals.order.statusUpdates;
        let statusChange = {
          status: req.body.status,
          comments: "Updated by Admin",
          date: new Date().toISOString(),
        };
        statusUpdates.push(statusChange);
        orderToUpdate["statusUpdates"] = statusUpdates;
        orderToUpdate["status"] = req.body.status;

        orderToUpdate.campaigns.forEach(campaign => {
          campaign['status'] = req.body.status
          let statusUpdates = campaign.statusUpdates;
          let products = campaign.products.map(p => p.productId)
          let statusChange = {
            status: req.body.status,
            comments: "Updated by Admin",
            date: new Date().toISOString(),
            products: products
          };
          statusUpdates.push(statusChange);
          campaign['statusUpdates'] = statusUpdates
        })
        */
      }
  }
  if(!isValid){
     next(updateError)
  } else {
    if(updatedOrder.deliveryDate){
      orderToUpdate['deliveryDate'] = updatedOrder.deliveryDate
    }
    if(updatedOrder.address && Object.keys(updatedOrder.address).length){
      orderToUpdate['address'] = updatedOrder.address
    }
   // console.log('orderToUpdate', orderToUpdate)
  
    const order = Object.assign(req.locals.order, orderToUpdate);
    order
      .save()
      .then((savedOrder) => res.json({ id: savedOrder.id }))
      .catch((e) => next(e));
  }
  
};

exports.addOrderRatings = async (req, res, next) => {
  let ratings = {
    rating: req.body.rating,
    comments: req.body.comments,
    imageUrls: req.body.imageUrls ? req.body.imageUrls : req.body.imageUrl ? [req.body.imageUrl] : [],
  };
  const query = {
    "campaigns.campaignId": req.params.campaignId,
    "_id": req.params.orderId
  };
try{
  let updated = await Order.updateOne(query, {
    $set: {
      "campaigns.0.ratings": ratings,
    },
  });
  res.json(ratings)
}catch(e){
  next(e)
}
  console.log('Adding ratings:', ratings);
  let order = req.locals.order;
  order["ratings"] = ratings;
  //console.log('addOrderRatings', order)
  order
    .save()
    .then((savedOrder) => res.json(savedOrder.ratings))
    .catch((e) => next(e));
};

/**
 * Get order list
 * @public
 */
exports.list = async (req, res, next) => {
  var host = req.get('host');
   console.log(host)
  //Work around to check if the user is from admin site or client app
  const clientUrls = ['beta.combuyn.in','combuyn.in']
 
  let loggedInUser = req.user;
  let query = req.query;
  if (loggedInUser.role == "user") {
    query["customerId"] = loggedInUser.id;
  }

  if(clientUrls.indexOf(host) > 0){
    query["status"] = { $ne: 'PendingPayment' } 
  }

  try {
    const orders = await Order.list(query);
    const transformedOrders = orders.map((order) => order.transform());
    res.json(transformedOrders);
  } catch (error) {
    next(error);
  }
};


exports.list1 = async (req, res, next) => {
  let loggedInUser = req.user;
  let query = {}
  query["customerId"] = mongoose.Types.ObjectId(loggedInUser.id);
  
  if(req.query.orderId){
    query['orderId'] = { "$regex": req.query.orderId, "$options": "i" };
  }
  if(req.query.apartment){
    query['address.apartment'] = req.query.apartment;
  }
  if(req.query.mobile){
    query['mobile'] = req.query.mobile;
  }
  if(req.query.name){
    query['name'] =  { "$regex": req.query.name, "$options": "i" };
  }
  if(req.query.email){
    query['address.email'] = { "$regex": req.query.email, "$options": "i" };
  }
  if(req.query.tower){
    query['address.tower'] = req.query.tower;
  }
  if(req.query.deliveryDate){
    query['address.deliveryDate'] = req.query.deliveryDate;
  }
  if(req.query.status){
    query['status'] = req.query.status;
  }
  let limit = req.query.perPage ? req.query.perPage : 5000
  let skip = req.query.page ? (req.query.page-1)* limit : 0

  if(req.clientType && req.clientType == 'admin') {
    delete query['customerId'];
    if(req.query.customerId){
      query['customerId'] = mongoose.Types.ObjectId(req.query.customerId);
    }
    let orders = await Order.find(query)
        .select('-statusUpdates')
        .populate('customer')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();
      const transformedOrders = orders.map((order) => Order.transform(order));
      res.json(transformedOrders);

  } else {
    query["status"] = { $ne: 'PendingPayment' } 
    try {

      let orders = await Order.aggregate([
        {
          $match: query,
        },
        {
          $lookup: {
            from: "users",
            let: { customerId: "$customerId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ["$$customerId", "$_id"] }],
                  },
                },
              },
            ],
            as: "customer",
          },
        },
        {
          $unwind: {
            path: "$customer",
            preserveNullAndEmptyArrays: false,
          },
        },
        
        {
          $unwind: "$campaigns"
        },
        {
          "$lookup": {
            "from": "tickets",
            "localField": "campaigns.subOrderId",
            "foreignField": "refId",
            "as": "campaigns.tickets"
          }
        },
       
       
        { $group : {
           _id : "$_id", 
           orderId : { $first: '$orderId' },
           id : { $first: '$_id' },
           status : { $first: '$status' },
           address : { $first: '$address' },
           createdAt : { $first: '$createdAt' },
           ratings : { $first: '$ratings' },
           statusUpdates : { $first: '$statusUpdates' },
           amount : { $first: '$amount' },
           customer : { $first: '$customer' },
           CFOrderId : { $first: '$CFOrderId' },
           campaigns: { $push: "$campaigns" } 
          } 
        },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
        { $skip: skip },
       
       
  
      ]).allowDiskUse(true);
      const transformedOrders = orders.map((order) => Order.transform(order));
      res.json(transformedOrders);
      //res.json(orders);
    } catch (error) {
      next(error);
    }

  }
  
  //let query = req.query;
 
  

  
 
  // if(req.clientType && req.clientType == 'admin') {
  //   delete query["customerId"];
  // } else {
  //   query["status"] = { $ne: 'PendingPayment' } 
  // }
  // console.log('Order List', host, query)
  

}
/**
 * Get order list
 * @public
 */
exports.listCampaigns = async (req, res, next) => {
  let loggedInUser = req.user;
  let query = {};
  if (loggedInUser.role == "user") {
    query["customerId"] = loggedInUser.id;
  }
  let size = parseInt(req.query.size) || 20; //parseInt(req.query.limit) || 0;
  let skip = (parseInt(req.query.page) - 1) * size || 0;
  try {
    //const orders = await Order.list(query);
    const orders = await Order.aggregate(
      { $match: query },
      { $unwind: "$campaigns" },
      { $match: { "campaigns.status": req.query.status } },
      { $skip: parseInt(skip) },
      { $limit: parseInt(size) }
    );

    const transformedOrders = orders.map((order) => order.transform());
    res.json(transformedOrders);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete order
 * @public
 */
exports.remove = (req, res, next) => {
  const { order } = req.locals;

  order
    .remove()
    .then(() => res.status(httpStatus.NO_CONTENT).end())
    .catch((e) => next(e));
};

exports.payment = async (req, res, next) => {
  res.status(httpStatus.OK);
};

/**
 * Update existing order
 * @public
 */
exports.updateOrderStatus = async (req, res, next) => {
  // let statusUpdates = req.locals.order.statusUpdates;
  // let statusChange = {
  //   status: req.body.status,
  //   comments: "",
  //   date: new Date().toISOString(),
  // };
  // statusUpdates.push(statusChange);
  // const updatedOrder = { status: req.body.status, statusUpdates };
console.log('updating order')
  let orderToUpdate = getStatusUpdatedOrder(req.locals.order.toJSON(), req.body.status, "Updated by Admin")

  const order = Object.assign(req.locals.order, orderToUpdate);
  try {
    let updated = await order.save();
    //update wallet
    switch (req.body.status) {
      case "Delivered": {
        let orderCount = await Order.getOrderCountForUser(order.userId);
        if (orderCount == 1) {
          //Check for referral and update credits
          let user = await User.findOne({ _id: order.userId });
          if (user.referredBy) {
            const settings = await Settings.findOne();
            let referralCredits = settings.referralCredits
              ? settings.referralCredits
              : 0;
            let referrarCredits = settings.referrarCredits
              ? settings.referrarCredits
              : 0;
            if (referralCredits > 0) {
              let referrar = await User.get(user.referredBy);
              const updatedUser = Object.assign(referrar, {
                walletCredits: referrar.walletCredits + referralCredits,
              });
              await updatedUser.save();
              let txn = {
                userId: user.referredBy,
                credits: referralCredits,
                type: "Referral",
                txnDetails: {
                  //referredBy: referredBy._id,
                  comment: "Refferral rewards received",
                },
              };
              await new WalletLogs(txn).save();
            }
            /*
            if (referrarCredits > 0) {
              let referredUser = await User.get(user._id);
              const updatedUser = Object.assign(referredUser, {
                walletCredits: referredUser.walletCredits + referralCredits,
              });
              await updatedUser.save();
              let txn = {
                userId: user._id,
                credits: referralCredits,
                type: "Referral",
                txnDetails: {
                  referredBy: user.referredBy,
                  comment: "Refferral rewards received",
                },
              };
              await new WalletLogs(txn).save();
            }
            */
          }
        }
      }
      default:
        break;
    }
    res.status(httpStatus.OK);
    res.end();
  } catch (e) {
    next(e);
  }

  //.then((savedOrder) => res.json({id:savedOrder.id}))
  // .catch((e) => next(e));
};

/**
 * Update existing order
 * @public
 */
exports.updateOrderProductStatus = async (req, res, next) => {
  try {
    const campaignId = req.params.campaignId;
    const productId = req.params.productId;
    const status = req.params.status;
    const query = {
      "campaigns.campaignId": campaignId,
      "campaigns.products.productId": productId,
      "campaigns.products.status": { $exists: false },
    };

    let updated = await Order.updateMany(query, {
      $set: {
        "campaigns.0.products.0.status": status,
      },
    });

    res.status(httpStatus.OK);
    res.end();
  } catch (error) {
    next(error);
    console.log("Error", error);
  }
};

async function processReferralReward(options) {
  let userId = options.userId;
  let user = await User.findOne({ _id: userId });
  if (user.referredBy) {
    const settings = await Settings.findOne();
    let referralCredits = settings.referralCredits
      ? settings.referralCredits
      : 0;
    let referrarCredits = settings.referrarCredits
      ? settings.referrarCredits
      : 0;
    if (referralCredits > 0) {
      let referrar = await User.get(user.referredBy);
      const updatedUser = Object.assign(referrar, {
        walletCredits: referrar.walletCredits + referralCredits,
      });
      await updatedUser.save();
      let txn = {
        userId: user.referredBy,
        credits: referralCredits,
        type: "Referral",
        txnDetails: {
          //referredBy: referredBy._id,
          comment: "Refferral rewards received(OrderId:"+options.orderId+")",
        },
      };
      await new WalletLogs(txn).save();
    }

    if (referrarCredits > 0) {
      let referredUser = await User.get(user._id);
      const updatedUser = Object.assign(referredUser, {
        walletCredits: referredUser.walletCredits + referralCredits,
      });
      await updatedUser.save();
      let txn = {
        userId: user._id,
        credits: referralCredits,
        type: "Referral",
        txnDetails: {
          referredBy: user.referredBy,
          comment: "Refferral rewards received",
        },
      };
      await new WalletLogs(txn).save();
    }
    let order = await Order.get(options.orderId);
    let referralRewardInfo = order.referralRewardInfo;
    referralRewardInfo["status"] = "Processed";
    referralRewardInfo["processedOn"] = new Date();
    order["referralRewardInfo"] = referralRewardInfo;
    await order.save();
  }
}

exports.updateOrderCampaignStatus = async (req, res, next) => {
  try {
    const campaignId = req.params.campaignId;
    const status = req.params.status;
    let statusChange = {
      status: status,
      comments: "Updated order status by Admin",
      date: new Date().toISOString(),
    };
    let updated = await Order.updateMany(
      {
        "campaigns.campaignId": campaignId,
      },
      {
        $set: {
          "campaigns.0.status": status,
        },
        $push: { "campaigns.$[subOrder].statusUpdates": statusChange}
      },
      { upsert: true }
    );
    if (status === "Delivered") {
      let orders = await Order.find({
        "campaigns.campaignId": campaignId,
        status: { $ne: status },
      });
      //console.log('Orders updated', orders)
      for (let i = 0; i < orders.length; i++) {
        let o = orders[i];
        if (
          o.campaigns.length ==
          o.campaigns.filter((c) => c.status == status).length
        ) {
          o.status = status;
          await o.save();
          if (o.referralRewardInfo) {
            //TODO
            //processReferralReward()
          }
        }
      }
    }

    res.status(httpStatus.OK);
    res.end();
  } catch (error) {
    next(error);
    console.log("Error", error);
  }
};

function checkStatusFlow(currentStatus, nextStatus) {
  let statuses = orderStatusFlow.filter((f) => f.current == currentStatus)[0].next;

  return statuses.includes(nextStatus);
}

exports.updateSubOrderStatus = async (req, res, next) => {
  try {
    let query = {};
    if (req.body.orderId) {
      query["orderId"] = req.body.orderId;
    }
    // if(req.body.campaignId){
    //   query['campaigns.campaignId'] = req.body.campaignId;
    // }
    if (req.body.campaignIds) {
      query["campaigns.campaignId"] = { $in: req.body.campaignIds };
    }
    if (req.body.apartment) {
      query["address.apartment"] = req.body.apartment;
    }
    let orders = await Order.find(query);
    var updateOps = [];
    let updateError = null;
    //orders.forEach(function(o) {
    //or(let o in orders) {
    for (let i = 0; i < orders.length; i++) {
      let o = orders[i];
      const order = o;
      let idxArr = [];
      let update = false;
      const isStatusUpdateAllowed = checkStatusFlow(o.status, req.body.status);
      if (!isStatusUpdateAllowed) {
        updateError = new APIError({
          message: "Status change not allowed",
          status: httpStatus.BAD_REQUEST,
        });
        break;
      } else if (o.status === req.body.status) {
        //Order already in same status, don't update
      } else {
        req.body.campaignIds.forEach((cId) => {
          let idx = o.campaigns.findIndex(
            (c) => c.campaignId.toString() == cId.toString()
          );
          if (idx !== -1) {
            update = true;
            o.campaigns[idx].status = req.body.status;
            let statusUpdate = {
              status: req.body.status,
              products: req.body.productIds,
              comments: req.body.comments,
              date: new Date().toISOString(),
            };
            let statusUpdates = o.campaigns[idx].statusUpdates || [];
            statusUpdates.push(statusUpdate);
            o.campaigns[idx].statusUpdates = statusUpdates;
          }
        });
        if (update) {
          if (
            o.campaigns.length ==
            o.campaigns.filter((c) => c.status === req.body.status).length
          ) {
            o["status"] = req.body.status;
            if (
              o.status == "Delivered" &&
              o.referralRewardInfo &&
              o.referralRewardInfo.eligible &&
              o.referralRewardInfo.status === "Pending"
            ) {
              //processReferralReward({ userId: o.customerId, orderId: o._id, orderNo: o.orderId});
            }
          }
          updateOps.push(o.save());
        }
      }
      // let idx = o.campaigns.findIndex(c => c.campaignId.toString() == req.body.campaignId.toString());
      // //console.log('idx', req.body.campaignId.toString(), o.campaigns, idx)
      // if(idx !== -1) {
      //   o.campaigns[idx].status = req.body.status
      //   let statusUpdate = {
      //     status: req.body.status,
      //     products:req.body.productIds,
      //     comments: req.body.comments
      //   }
      //   let statusUpdates = o.campaigns.statusUpdates || [];
      //   statusUpdates.push(statusUpdate)
      //   o.campaigns[idx].statusUpdates = statusUpdates;
      //   if(o.campaigns.length == o.campaigns.filter(c => c.status === req.body.status).length){
      //     o['status'] == req.body.status;
      //     if(o.status == 'Delivered' && o.referralRewardInfo) {
      //       processReferralReward({userId: o.userId})
      //     }
      //   }
      //   //await o.save();
      //   updateOps.push(o.save());
      // }
      // let update = Order.updateOne({
      //   "_id": o._id
      // },
      // {
      //   '$set': {
      //     'campaigns.0.status': status
      //   }
      // })
    }
    if (updateError) {
      return next(updateError);
    }
    return Promise.all(updateOps)
      .then((resp) => {
        //console.log('resp', resp)
        res.json(resp);
        res.end();
      })
      .catch((e) => {
        next(e);
      });
  } catch (error) {
    console.log("Error", error);
    next(error);
  }
};

exports.updateCheck = async (req, res, next) => {
  try {
    let orders = await Order.find();
    var updateOps = [];
    const status = "PendingPayment"; //req.params.status;

    orders.forEach(function (o) {
      let update = Order.updateOne(
        {
          _id: o._id,
        },
        {
          $set: {
            "campaigns.0.status": status,
          },
        }
      );
      updateOps.push(update);
    });
    return Promise.all(updateOps)
      .then((resp) => {
        console.log("resp", resp);
        res.json(resp);
        res.end();
      })
      .catch((e) => {
        next(e);
      });
  } catch (error) {
    next(error);
  }
};

exports.getStatusFlow = async (req, res, next) => {
  try {
    let status = req.params.status;
    let statusFlow = Order.orderStatusFlow;
    let flow = statusFlow.filter((s) => s.current == status)[0];
    if (flow) {
      res.json(flow.next);
      res.end();
    }
  } catch (error) {
    console.log("Error", error);
    next(error);
  }
};

exports.requestExchangeProducts = async (req, res, next) => {
  try {
    let loggedInUser = req.user;
    let resp = await createExchangeOrder(
      req.params.orderId,
      req.body.campaigns,
      req.body.deliveryDate,
      loggedInUser
    );
    res.json(resp);
    res.end();
  } catch (error) {
    next(error);
  }
};

async function createExchangeOrder(
  orderId,
  campaigns,
  deliveryDate,
  loggedInUser
) {
  try {
    let prentOrder = await Order.get(orderId);
    let orderCount = await Order.countDocuments();
    let orderNo =
      moment(new Date()).format("DDMMYYYY") + "-" + (orderCount + 1);

    let exchangeOrderInfo = {
      orderId: orderNo,
      deliveryDate: deliveryDate,
      customerId: prentOrder.customerId,
      campaigns: [],
      status: "PendingPayment",
      address: prentOrder.address,
      createdBy: prentOrder.cretedBy,
      amount: 0,
    };

    campaigns.forEach((c) => {
      let parentCampaign = prentOrder.campaigns.filter(
        (c) => c.campaignId.toString() === c.campaignId.toString()
      )[0];
      let cancelledProducts = [];
      c.products.forEach((p) => {
        let parentProduct = parentCampaign.products.filter(
          (pr) => pr.productId.toString() == p.productId.toString()
        )[0];
        let exchangeProduct = parentProduct.toJSON();
        delete exchangeProduct._id;
        cancelledProducts.push(exchangeProduct);
      });
      let exchangeCampaign = parentCampaign.toJSON();
      delete exchangeCampaign._id;
      exchangeCampaign["products"] = cancelledProducts;
      exchangeCampaign["statusUpdates"] = [];
      exchangeCampaign["status"] = "PendingPayment";
      exchangeCampaign["deliveryDate"] = deliveryDate;
      exchangeOrderInfo.campaigns.push(exchangeCampaign);
    });
    //console.log("Exchange", exchangeOrderInfo);
    const { valid, error, total, orderObj } = await validateOrder(
      exchangeOrderInfo
    );
    orderObj.campaigns = orderObj.campaigns.map((c, idx) => {
      c["subOrderId"] = orderNo + "-" + (idx + 1);
      return c;
    });

    if (valid) {
      let orderInfo = {
        orderId: exchangeOrderInfo.orderId,
        deliveryDate: deliveryDate,
        customerId: exchangeOrderInfo.customerId,
        campaigns: orderObj.campaigns,
        status: "PendingPayment",
        address: exchangeOrderInfo.address,
        createdBy: loggedInUser.id,
        amount: 0,
        isExchangeOrder: true,
        parentOrderId: orderId,
      };
      const order = new Order(orderInfo);
      let savedOrder = await order.save();

      // TODO Update Product stock
      for (let i = 0; i < orderInfo.campaigns.length; i++) {
        let c = orderInfo.campaigns[i];
        //console.log('products', c.products)
        let updateProducts = c.products.reduce((acc, p) => {
          acc[p.productId] = p;
          return acc;
        }, {});

        let campaign = await Campaign.findOne({ _id: c.campaignId });
        //console.log('campaign', campaign)
        let products = campaign.products;
        let selectedCampaign = orderObj.campaigns.filter(
          (c) => c.campaignId.toString() == campaign._id.toString()
        )[0];
        //console.log("selectedCampaign", selectedCampaign);
        products = products.map((p) => {
          p = p.toJSON();
          //Update reserved stock for the product or attribute level
          const attributes = p.attributes || [];
          //console.log('attributes exist?', attributes.length)

          let selectedProduct = selectedCampaign.products.filter(
            (pr) => pr.productId == p.productId.toString()
          )[0];
          //console.log("selectedProduct", selectedProduct, p);
          if (attributes.length) {
            for (let i = 0; i < attributes.length; i++) {
              let attr = attributes[i];
              if (attr.isRequired) {
                //find the selected option
                let reqAttribute = attr; //.options.filter(o => o.isRequired == true)[0];

                let selectedAttribute = selectedProduct.attributes.filter(
                  (a) => a.name == reqAttribute.name
                )[0];
                let selectedOption = selectedAttribute.value;
                const selectedAttributeOption = attr.options.filter(
                  (o) => o.value == selectedOption
                )[0];
                //console.log("reqAttribute", selectedAttribute, selectedOption);
                if (selectedAttributeOption.stock !== 9999)
                  selectedAttributeOption.reserved =
                    (selectedAttributeOption["reserved"] || 0) +
                    selectedProduct.quantity;
              }
            }
          } else if (p.stock !== 9999) {
            p["reserved"] =
              (p["reserved"] ? p["reserved"] : 0) + selectedProduct.quantity;
          }
          return p;
        });
        //console.log('Create Order: Products to update', products)

        //scheduleJob(180, ()=>{updateReservedStocks(savedOrder._id)})
        let orderCount = (campaign.orderCount || 0) + 1;
        await Campaign.findOneAndUpdate(
          { _id: c.campaignId },
          { products: products, orderCount: orderCount }
        );
      }
      //res.status(httpStatus.CREATED);
      const resp = {
        orderId: savedOrder.id,
        razorPayOrderId: order.id,
      };
      return resp;
      // res.json(resp);
      // res.end();
    } else {
      console.log("error", error);
      return error;
      //next(error);
    }
  } catch (e) {
    console.error(e);
    return e;
    //next(e);
  }
}

function getUpdatedCampaigns(campaigns, status, comments, extras = null) {
  campaigns.forEach((c) => {
    c.status = status;
    let statusUpdates = c.statusUpdates;

    let statusChange = {
      status: status,
      comments: comments,
      date: new Date().toISOString(),
    };
    statusUpdates.push(statusChange);
    c["statusUpdates"] = statusUpdates;
    if (extras) {
      Object.keys(extras).forEach((k) => {
        c[k] = extras[k];
        return c;
      });
    }
    return c;
  });
  return campaigns;
}
exports.cancelOrder = async (req, res, next) => {
  try {
    let e = new APIError({
      message: "",
      status: httpStatus.BAD_REQUEST,
    });
    let loggedInUser = req.user;
    let orderId = req.params.orderId;
    let order = await Order.get(orderId);
    let refundAvailableStatus = [
      "PaymentSuccess",
      "Confirmed",
      "OutForDelivery",
      "Delivered",
      "PartialDelivery",
    ];
    let cancellationInfo = {
      reason: req.body.reason,
      comments: req.body.comments,
      date: new Date(),
    };
    let statusUpdates = order.statusUpdates;
    let statusChange = {
      status: "Cancelled",
      comments: "Customer Cancelled the Order",
      date: new Date().toISOString(),
    };
    statusUpdates.push(statusChange);
    let campaigns = getUpdatedCampaigns(
      order.campaigns,
      "Cancelled",
      "Customer Cancelled the Order",
      { cancellationInfo }
    );
    if (refundAvailableStatus.indexOf(order.status) > -1) {
      let data = {
        referenceId: order.orderId,
        refundAmount: order.amount - 0.01,
        refundNote: "Order Cancelled",
        isSplit: order.vendorSplit.length ? true : false,
        merchantRefundId: "REFUND_ORDER_" + order.orderId,
        refundType: "INSTANT",
        splitDetails: JSON.stringify(order.vendorSplit),
      };
      cashfreeUtils
        .createRefund(data)
        .then(async (resp) => {
          //Update Order status
          await Order.updateOne(
            { _id: order._id },
            {
              status: "Cancelled",
              updatedBy: loggedInUser._id,
              paymentStatus: "PAYMENT_CANCELLED",
              cancellationInfo,
              statusUpdates,
              campaigns,
            }
          );
          res.json("Order cancelled successfully");
          res.end();
        })
        .catch((err) => {
          e.message = "Failed to cancel the order";
          e.status = httpStatus.INTERNAL_SERVER_ERROR;
          next(e);
        });
    } else if (order.status == "Cancelled") {
      let e = new APIError({
        message: "Order is already Cancelled",
        status: httpStatus.BAD_REQUEST,
      });
      next(e);
      //res.end();
    } else {
      await Order.updateOne(
        { _id: order._id },
        {
          status: "Cancelled",
          updatedBy: loggedInUser._id,
          paymentStatus: "PAYMENT_CANCELLED",
          cancellationInfo,
          statusUpdates,
          campaigns,
        }
      );
      res.json("Order cancelled successfully. No Refund required");
      res.end();
    }
  } catch (error) {
    next(error);
  }
};




exports.reviewOrder = async (req, res, next) => {
  try {
    let loggedInUser = req.user;
    let order = await Order.get(req.params.orderId);
    let ratings = {
      rating: req.body.rating,
      comments: req.body.comments,
      imageUrls: req.body.imageUrls,
    };
    order["ratings"] = ratings;
    await order.save();
    res.status(200);
    res.end();
  } catch (error) {
    next(error);
  }
};

exports.getOrderStatus = async (req, res, next) => {
  try {
    res.json(Order.status);
    res.end();
  } catch (error) {
    next(error);
  }
};

exports.updateMultipleOrders = async (req, res, next) => {
  let orderIds = req.body.orderIds || [];

  // const isStatusUpdateAllowed = checkStatusFlow(o.status, req.body.status);
  // if (!isStatusUpdateAllowed) {
  //   updateError = new APIError({
  //     message: "Status change not allowed",
  //     status: httpStatus.BAD_REQUEST,
  //   });
  // }
  try {
      for(let i=0; i<orderIds.length; i++){
        let order = await Order.get(orderIds[i]);
        let statusUpdates = order.statusUpdates;
        let statusChange = {
          status: req.body.status,
          comments: "Bulk order update from Admin",
          date: new Date().toISOString(),
        };

        let orderToUpdate = getStatusUpdatedOrder(order.toJSON(), req.body.status, "Bulk order update from Admin")


        statusUpdates.push(statusChange);
        const updatedOrder = { status: req.body.status, statusUpdates };
        const orderUpdate = Object.assign(order, orderToUpdate);
        try {
          let updated = await orderUpdate.save();
          //update wallet
          switch (req.body.status) {
            case "Delivered": {
              let orderCount = await Order.getOrderCountForUser(order.userId);
              if (orderCount == 1) {
                //Check for referral and update credits
                let user = await User.findOne({ _id: order.userId });
                if (user.referredBy) {
                  const settings = await Settings.findOne();
                  let referralCredits = settings.referralCredits
                    ? settings.referralCredits
                    : 0;
               
                  if (referralCredits > 0) {
                    let referrar = await User.get(user.referredBy);
                    const updatedUser = Object.assign(referrar, {
                      walletCredits: referrar.walletCredits + referralCredits,
                    });
                    await updatedUser.save();
                    let txn = {
                      userId: user.referredBy,
                      credits: referralCredits,
                      type: "Referral",
                      txnDetails: {
                        //referredBy: referredBy._id,
                        comment: "Refferral rewards received",
                      },
                    };
                    await new WalletLogs(txn).save();
                  }
      
                  /*
                  if (referrarCredits > 0) {
                    let referredUser = await User.get(user._id);
                    const updatedUser = Object.assign(referredUser, {
                      walletCredits: referredUser.walletCredits + referralCredits,
                    });
                    await updatedUser.save();
                    let txn = {
                      userId: user._id,
                      credits: referralCredits,
                      type: "Referral",
                      txnDetails: {
                        referredBy: user.referredBy,
                        comment: "Refferral rewards received",
                      },
                    };
                    await new WalletLogs(txn).save();
                  }
                  */
                }
              }
            }
            default:
              break;
          }
        } catch (e) {
          next(e);
        }
        res.status(200);
        res.end();

      }

    } catch (err) {
      next(err);
    }

  




};

exports.testSMS = async (req, res, next) => {
  SMSUtils.sendOTP(otp, mobile)
    .then((resp) => {
      console.log("response", resp);
    })
    .catch((e) => {
      console.log("error", e);
    });
};


exports.getOrderCampaign = async (req, res, next) => {
  let loggedInUser = req.user;
  let query = {
    _id: mongoose.Types.ObjectId(req.params.orderId),
    //"campaigns.campaignId": mongoose.Types.ObjectId(req.params.campaignId)
  } ;
  
  try {
    const subOrders = await Order.aggregate([
      { $match: query },
      { $unwind: "$campaigns" },
      {
        $replaceRoot: {
          newRoot: "$campaigns"
        }
      },
      { $match: { "campaignId": mongoose.Types.ObjectId(req.params.campaignId) } },
      
    ]);
    subOrder = subOrders[0]
    let breakup = {total:0, gst: 0}
    for(let i=0;i<subOrder.products.length;i++) {
      let product = subOrder.products[i]
      let p = await Product.findById(subOrder.products[i].productId).populate('hsnInfo');
      let total = product.total || subOrder.products[i].price * subOrder.products[i].quantity;

      let GST = (total - (100 * total)/((p.hsnInfo? p.hsnInfo.GST : 0) + 100)).toFixed(2);
      let price = (total - GST).toFixed(2);
      breakup.total+= +price;
      breakup.gst+= +GST;
      subOrder.products[i]['breakup'] = {price: price, gst: GST}
      subOrder.products[i]['images'] = p.images
    }
    let baseCapaign = await Campaign.findById(mongoose.Types.ObjectId(req.params.campaignId))
    subOrder['images'] = baseCapaign.images;
    let tickets = await Ticket.find({refId:subOrder.subOrderId, 'refType': 'SubOrder'})
    subOrder['tickets'] = tickets
    subOrder['address'] = req.locals.order.address
    breakup['sgst'] = (breakup['gst']/2).toFixed(2)
    breakup['igst'] = (breakup['gst']/2).toFixed(2)
    subOrder['breakup'] = breakup
    res.json(subOrder);
  } catch (error) {
    next(error);
  }
};

exports.validateOrder = validateOrder;

exports.testMethod  = async (req, res, next) => {
  let query = { "campaigns.1": {$exists: true}}
  let subOrderFilters = {}
  try {
    let orders = await Order.aggregate([
      { $match: query},
      { $project: {
          campaigns: {$filter: {
              input: '$campaigns',
              as: 'campaign',
              cond: {$eq: ['$$campaign.status', 'Confirmed']}
          }},
          _id: 0,
          orderId: 1,
          customerId: 1,
          paymentStatus: 1,
          address: 1,
          CFOrderId: 1,
          createdAt: 1,
      }},
      {
        $match: {
           "campaigns.0": { $exists: true }  
        },
      },
    ])
  
    res.json(orders)
  }catch(e){
    console.log(e)
  }
}


exports.updateOrderSubOrderStatus  = async (req, res, next) => {
  try
  {
    let orderId = mongoose.Types.ObjectId(req.params.orderId)
    let status = req.body.status
    let statusChange = {
      status: req.body.status,
      comments: req.body.comments ? req.body.comments : "Updated by Admin",
      date: new Date().toISOString(),
    };

    let update = {
      status: status,
      $set: {
        "campaigns.$[].products.$[].status": status,
        "campaigns.$[].status": status
      },
      $push: { "campaigns.$[].statusUpdates": statusChange}
    }
    if(req.body.paymentStatus) {
      update['paymentStatus'] = req.body.paymentStatus
    }
    console.log('update', update)
    let updated = await Order.updateOne({'_id': orderId}, update);
    let order = await Order.findById(orderId);
    res.json(order)
  } catch(e){
    console.log(e)
  }
}


/****************** Sub Order APIs ********************/

exports.updateMultipleSubOrders = async (req, res, next) => {
  try {
    let e = new APIError({
      message: "",
      status: httpStatus.BAD_REQUEST,
    });
   
    const subOrderIds = req.body.subOrderIds;
    const status = req.body.status;
    if(status == 'Cancelled' && subOrderIds.length > 1){
      e.message = "Multiple Cancellations are not allowed"
      next(e)
    } else {
      let statusChange = {
        status: req.body.status,
        comments: "Bulk Order updated by Admin",
        date: new Date().toISOString(),
      };

      /*
      let updated = await Order.updateMany(
        {
          "campaigns.subOrderId": {$in: subOrderIds} ,
        },
        {
          $set: {
            "status": status,
            "campaigns.$.status": status,
            "campaigns.$.products.$[].status": status,
            
          },
          $push: { "campaigns.$.statusUpdates": statusChange}
        }
      );
      */
      console.log('Updating multiple suborders')
      let updated = await Order.updateMany(
        {
          "campaigns.subOrderId": {$in: subOrderIds} ,
        },
        { 
          "$set": {
            "campaigns.$[subOrder].status": status,
            "status": status,
            "campaigns.$[subOrder].products.$[].status": status,
          },
          $push: { "campaigns.$[subOrder].statusUpdates": statusChange}
        },
        { 
          "arrayFilters": [{ "subOrder.subOrderId": {$in:  subOrderIds}  }]
        }
      );

      if(status == 'Cancelled' && subOrderIds.length  == 1) {
        processRefund(subOrderIds[0])
        // let orderDetails = await getSubOrderDetails(subOrderIds[0])
        // orderDetails = orderDetails[0]
        // console.log('orderDetails',orderDetails)
        // let subOrder = orderDetails.campaigns[0];
      }
      if(status == 'Delivered') {
        processReferralRewards(subOrderIds)
      }
      res.status(httpStatus.OK);
      res.end();
    }
  } catch (error) {
    next(error);
    console.log("Error", error);
  }
};

async function processReferralRewardsOld(subOrderIds){
  const settings = await Settings.findOne();
  let users = {}
  for(let i = 0; i < subOrderIds.length; i++){
    let subOrderId = subOrderIds[i];
    let order = await Order.findOne({'campaigns.subOrderId': subOrderId});
    let orderCount = await Order.getOrderCountForUser(order.customerId);
    if (orderCount == 1) {
      //Check for referral and update credits
      
      let user = null;
      if(!users[order.customerId.toString()]) {
        user = await User.findOne({ _id: order.customerId });
        users[order.customerId.toString()] = user;
          if (user.referredBy) {
            //check if already got refferal credits
            let walletTxn = await WalletLogs.find({userId: user.referredBy, refId: order.customerId});
            if(!walletTxn.length){
            
              let referralCredits = settings.referralCredits
                ? settings.referralCredits
                : 0;
            
              if (referralCredits > 0) {
                let referrar = await User.get(user.referredBy);
                const updatedUser = Object.assign(referrar, {
                  walletCredits: (referrar.walletCredits||0) + referralCredits,
                });
                logger.info("Processed referral reward for:"+subOrderId)
                await updatedUser.save();
                let txn = {
                  userId: user.referredBy,
                  credits: referralCredits,
                  type: "Referral",
                  txnDetails: {
                    //referredBy: referredBy._id,
                    comment: "Refferral rewards received for reffering "+user.name+"("+order.address.mobile+")",
                  },
                  refId: order.customerId
                };
                logger.info("Processed referral reward", txn)
                await new WalletLogs(txn).save();
              }

            }
          }
      }
    }


  }
}

async function processReferralRewards(subOrderIds){
  const settings = await Settings.findOne();
  let users = {}
  for(let i = 0; i < subOrderIds.length; i++){
    let subOrderId = subOrderIds[i];
    let order = await Order.findOne({'campaigns.subOrderId': subOrderId});
    JobUtils.processMissingReferralRewards(order.customerId)


  }
}

async function getSubOrderDetails(subOrderId) {
  let query = {"campaigns.0": {$exists: true  }}
  let subOrderFilters = {$eq: ['$$campaign.subOrderId', subOrderId]}
  try {

    let orderDetails = await Order.aggregate([
      { $match: { campaigns : { $elemMatch : { subOrderId : subOrderId } } }},
      { $project: {
          campaigns: {$filter: {
              input: '$campaigns',
              as: 'campaign',
              cond: subOrderFilters
          }},
          _id: 1,
          orderId: 1,
          customerId: 1,
          paymentStatus: 1,
          address: 1,
          CFOrderId: 1,
          createdAt: 1,
      }},
      {
        $match: {
           "campaigns.0": { $exists: true }  
        },
      },
    ])
   return orderDetails;
  }catch(e){
    console.log(e)
    return null;
  }
}
async function processRefund(subOrderId) {
 
  let orderDetails = await getSubOrderDetails(subOrderId)
  console.log('processRefund: OrderDetails',subOrderId, orderDetails)
  logger.info('processRefund: Processing refund', {subOrderId, orderDetails})
  orderDetails = orderDetails[0]
  //console.log('processRefund: OrderDetails',orderDetails)
  let subOrder = orderDetails.campaigns[0];
  let txnDetails = await Transaction.findOne({orderId: orderDetails._id})
  let orderBreakup = txnDetails.orderBreakup;
  let subOrderBreakup = orderBreakup.find(b => b.campaignId.toString() === subOrder.campaignId.toString());
  console.log('#####subOrderBreakup', subOrder, subOrderBreakup)
  let walletTxn = subOrderBreakup.payments.find(p => p.method == 'Wallet');
  let refundMethods = []
  if(walletTxn) {
    let credits = walletTxn.amount;
    refundWalletCredits(orderDetails.customerId, subOrderId, credits)
    refundMethods.push({method: 'Wallet', amount: credits})
  }

  let cashfreeTxn = subOrderBreakup.payments.find(p => p.method == 'Cashfree');
  if(cashfreeTxn){
    let data = {
      referenceId: orderDetails.orderId,
      refundAmount: cashfreeTxn.amount - 0.01,
      refundNote: "Order Cancelled",
      //isSplit: subOrder.vendorSplit.length ? true : false,
      merchantRefundId: "REFUND_ORDER_" + subOrderId,
      refundType: "INSTANT",
      refundNotes: "Refund for the order "+subOrderId,
      //splitDetails: JSON.stringify(subOrder.vendorSplit),
    };
    //console.log('$$$data', data)
    cashfreeUtils
      .createRefund(data)
      .then(async (resp) => {
       console.log('*********', resp)
        refundMethods.push({method: 'Cashfree', amount: cashfreeTxn.amount})
        let txnObj = {
          orderId: orderDetails._id ,
          subOrderId: cashfreeTxn.subOrderId,
          createdBy: orderDetails.customerId,
          amount: subOrder.amount,
          customerId: orderDetails.customerId,
          txnType: "Refund",
          paymentMethods: refundMethods,
          pgOrderId: resp.cf_refund_id,
          pgResponse: JSON.stringify(resp),
          //orderBreakup: createOrderBreakup(orderInfo, paymentMethods)
        };
        const transaction = new Transaction(txnObj);
        const savedTxn = await transaction.save();

        logger.info('Refund processed successfully for order:'+cashfreeTxn.subOrderId)
      })
      .catch((err) => {
        logger.info('Failed to refund', err)
        console.log('Failed to refund', err)
      });
  }

}
exports.createManualRefund = async (req, res, next) => {
  try {
    let customerId = req.body.customerId;
    let subOrderId = req.body.subOrderId;
    let credits = req.body.credits;
    refundWalletCredits(customerId, subOrderId, credits);
    res.json("Refund created successfully");
    res.end();
  } catch(e){
    next(e)
  }


}

async function refundWalletCredits(customerId, subOrderId, orderCredits) {
  const user = await User.get(customerId)
  //Check if already refunded 
  let walletTxn = await WalletLogs.findOne({userId: user._id,type: 'Refund',refId: subOrderId})
  console.log('walletTxn',walletTxn)

  if(!walletTxn) {
    let credits = user.walletCredits+orderCredits;
    let updates = {walletCredits: credits};
    console.log(updates)
    User.findOneAndUpdate({_id:user._id},updates,{new:true}).then(async u => {
      let txn = {
        userId: user._id,
        mobile: user.mobile,
        credits: orderCredits,
        type: 'Refund',
        refId: subOrderId,
        txnDetails: {
          updatedBy: user._id,
          comment: `Refunded ${orderCredits} credits by order ${subOrderId}`
        }
      }
      let t = await new WalletLogs(txn).save();
      return;
    }).catch(e => {
      return e;
    });
     
  } else {
    console.log('Already refunded for this order')
  }
}

const updateCampaignStocks = async function (campaignId, products) {
  try {

      console.log("CampaignId", campaignId);
      let status = ['Confirmed', 'OutForDelivery']
      let campaignUpdate = await Campaign.findById(campaignId);
      let updateProducts = campaignUpdate.products;
      for (let j = 0; j < products.length; j++) {
        let product = products[j];
        //Update reserved stock for the product or attribute level
        const attributes = product.attributes || [];
        let selectedCampaignProduct = updateProducts.filter(
          (pr) => pr.productId.toString() == product.productId.toString()
        )[0];
        selectedProduct = selectedCampaignProduct.toJSON()
        if (attributes.length) {
          for (let i = 0; i < attributes.length; i++) {
            let attr = attributes[i];
           
              let selectedAttribute = selectedProduct.attributes.filter(
                (a) => a.name == attr.name
              )[0];
              
              if(selectedAttribute && selectedAttribute.isRequired) {
                let optionToUpdate = selectedAttribute.options.filter(option => option.value == attr.value)[0];
               
                if (optionToUpdate["stock"] !== 9999) {
                  optionToUpdate["reserved"] = optionToUpdate["reserved"] - +attr.quantity;
                  if (status.indexOf(order.status) == -1) {
                    optionToUpdate["stock"] = optionToUpdate["stock"] - +attr.quantity;
                  }
                }
              } else {
                if(!selectedAttribute) {
                  logger.error('Failed to find selected attribute',{selectedProduct: selectedProduct, attr: attr, campaigns: campaigns})
                }
                
              }
              //console.log('selectedAttribute', JSON.stringify(selectedAttribute));
            //}
          }
        } else {
          if (selectedCampaignProduct["stock"] !== 9999) {
            let r = selectedCampaignProduct["reserved"]
            if (status.indexOf(order.status) !== -1) {
             
              selectedCampaignProduct["reserved"] =
                r - product.quantity < 0? 0 : r - product.quantity;
            } else {
              selectedCampaignProduct["reserved"] =
              r - product.quantity < 0? 0 : r - product.quantity;
              selectedCampaignProduct["stock"] =
              selectedCampaignProduct["stock"] - product.quantity;
            }
          }
        }
        selectedCampaignProduct.attributes = selectedProduct.attributes;
      }
      await Campaign.findOneAndUpdate(
        { _id: campaignId },
        { products: updateProducts }
      );
      

  } catch (e) {
    logger.error(e)
    console.log("stock update error", e);
  }
};

exports.cancelSubOrder = async (req, res, next) => {
  try {
    console.log('Received request for cancelling subOrder', req.params)
    let e = new APIError({
      message: "",
      status: httpStatus.BAD_REQUEST,
    });
    let loggedInUser = req.user;
    let orderId = req.params.orderId;
    let campaignId = req.params.campaignId;
    let order = await Order.get(orderId);
    let subOrder = order.campaigns.find(campaign => campaign.campaignId.toString() === campaignId.toString());
    let refundAvailableStatus = [
      "PaymentSuccess",
      "Confirmed",
      "OutForDelivery",
      "Delivered",
      "PartialDelivery",
    ];
    let cancellationInfo = {
      reason: req.body.reason,
      comments: req.body.comments,
      date: new Date(),
    }; 
    let statusChange = {
      status: "Cancelled",
      comments: "Customer Cancelled the Order",
      date: new Date().toISOString(),
    };
    // let update = {
    //   status: "Cancelled",
    //   $set: {
    //     "campaigns.0.products.$[].status": "Cancelled",
    //     "campaigns.0.status": "Cancelled",
    //     "campaigns.0.cancellationInfo": cancellationInfo
    //   },
    //   $push: { "campaigns.0.statusUpdates": statusChange}
    // }
    let status = 'Cancelled'
    console.log('Cancelling suborder', subOrder.subOrderId)
    let update =  { 
      "$set": {
        "campaigns.$[subOrder].status": status,
        "status": status,
        "campaigns.$[subOrder].products.$[].status": status,
        "campaigns.$[subOrder].cancellationInfo": cancellationInfo,
      },
      $push: { "campaigns.$[subOrder].statusUpdates": statusChange}
    }
    
  

    if (refundAvailableStatus.indexOf(subOrder.status) > -1) {
      
      
      let updated = await Order.updateMany(
        {
          "campaigns.subOrderId": {$in: [subOrder.subOrderId]} ,
        },
        { 
          "$set": {
            "campaigns.$[subOrder].status": status,
            "status": status,
            "campaigns.$[subOrder].products.$[].status": status,
          },
          $push: { "campaigns.$[subOrder].statusUpdates": statusChange}
        },
        { 
          "arrayFilters": [{ "subOrder.subOrderId": {$in:  [subOrder.subOrderId]}  }]
        }
      );


      processRefund(subOrder.subOrderId)
      updateCampaignStocks(campaignId, subOrder.products)
      res.json("Order cancelled successfully");
      res.end();

    } else if(subOrder.status == "Cancelled") {
      res.json("Order is already cancelled");
      res.end();
    } else {
      let updated = await Order.updateOne(
        {
          "campaigns.subOrderId": {$in: [subOrder.subOrderId]} ,
        },
        { 
          "$set": {
            "campaigns.$[subOrder].status": status,
            "status": status,
            "campaigns.$[subOrder].products.$[].status": status,
          },
          $push: { "campaigns.$[subOrder].statusUpdates": statusChange}
        },
        { 
          "arrayFilters": [{ "subOrder.subOrderId": {$in:  [subOrder.subOrderId]}  }]
        }
      );
      res.json("Order cancelled successfully. No Refund required");
      res.end();
    }
  } catch (error) {
    next(error);
  }
};


exports.cancelSubOrderProducts = async (req, res, next) => {
  try {
    /*
    {
      productIds: [id1, id2],
      subOrderId: id
    }

    */
    console.log('Received request for cancelling subOrder products', req.params, req.body)
    let e = new APIError({
      message: "",
      status: httpStatus.BAD_REQUEST,
    });
    let loggedInUser = req.user;
    let orderId = req.params.orderId;
    let subOrderId = req.body.subOrderId;
    let order = await Order.get(orderId);
    let subOrder = order.campaigns.find(campaign => campaign.subOrderId === subOrderId);
    if(!subOrer){
      e.message = "Invalid Sub Order ID";
      next(e);
    }
    let refundAvailableStatus = [
      "PaymentSuccess",
      "Confirmed",
      "OutForDelivery",
      "Delivered",
      "PartialDelivery",
    ];
    let products = []
    let invalid = false;
     for(let i = 0; i < productIds.length; i++){
      let id = productIds[i];
      let productInfo = subOrder.products.find(product => product.productId.toString() == id.toString());
      if(productInfo.status == 'Cancelled') {
        e.message = `Product ${productInfo.name} is already cancelled`;
        invalid = true;
        break;
      }
      products.push(productInfo)
     } 
     if(invalid){
       next(e)
     }
      

   
    let cancellationInfo = {
      reason: req.body.reason,
      comments: req.body.comments,
      date: new Date(),
      products:productIds
    }; 
    let statusChange = {
      status: "Cancelled",
      comments: "Customer Cancelled the Order",
      date: new Date().toISOString(),
    };

    let status = 'Cancelled'
console.log('Cancelling suborder', subOrder.subOrderId)
    let update =  { 
      "$set": {
        //"campaigns.$[subOrder].status": status,
        "status": status,
        "campaigns.$[subOrder].products.$[].status": status,
        "campaigns.$[subOrder].cancellationInfo": cancellationInfo,
      },
      $push: { "campaigns.$[subOrder].statusUpdates": statusChange}
    }
    
  

    if (refundAvailableStatus.indexOf(subOrder.status) > -1) {
      
      

      let updated = await Order.updateMany(
        {
          "campaigns.subOrderId": {$in: [subOrder.subOrderId]} ,
        },
        { 
          "$set": {
            "campaigns.$[subOrder].status": status,
            "status": status,
            "campaigns.$[subOrder].products.$[].status": status,
          },
          $push: { "campaigns.$[subOrder].statusUpdates": statusChange}
        },
        { 
          "arrayFilters": [{ "subOrder.subOrderId": {$in:  [subOrder.subOrderId]}  }]
        }
      );


      processRefund(subOrder.subOrderId)
      res.json("Order cancelled successfully");
      res.end();

    } else if(subOrder.status == "Cancelled") {
      res.json("Order is already cancelled");
      res.end();
    } else {
      let updated = await Order.updateOne(
        {
          "campaigns.subOrderId": {$in: [subOrder.subOrderId]} ,
        },
        { 
          "$set": {
            "campaigns.$[subOrder].status": status,
            "status": status,
            "campaigns.$[subOrder].products.$[].status": status,
          },
          $push: { "campaigns.$[subOrder].statusUpdates": statusChange}
        },
        { 
          "arrayFilters": [{ "subOrder.subOrderId": {$in:  [subOrder.subOrderId]}  }]
        }
      );
      res.json("Order cancelled successfully. No Refund required");
      res.end();
    }
  } catch (error) {
    next(error);
  }
};