const httpStatus = require("http-status");
const { omit } = require("lodash");
const Product = require("../models/product.model");
const cashfreeUtils = require("../utils/cashfreeUtils");
const verifySignature = require("../lib/cashfree/verifySignature");
const { CASH_FREE_APP_ID, CASH_FREE_SECRET_KEY, RAZORPAY_KEY_SECRET } = require("../../config/vars");
const APIError = require("../errors/api-error");
const Cashfree = require("cashfree-sdk");
const Order = require("../models/order.model");
const User = require("../models/user.model");
const WalletLogs = require("../models/wallet.logs.model");
var pdf = require("pdf-creator-node");
const Transaction = require("../models/transaction.model");
var fs = require("fs");
const path = require("path");
const dirPath = path.join(__dirname, "../utils");
const invoicePath = path.join(__dirname, "../../../uploads");
const moment = require("moment");
const Logger = require("../../config/winston");
const logger = new Logger("/payment");
const mongoose = require("mongoose");
const SMSUtils = require("../utils/SMSUtils");
const { scheduleJob } = require("../utils/scheduler");
var Razorpay = require('razorpay');
const { updatePendingOrders } = require("../utils/jobs");
const { response } = require("express");

/**
 * Load product and append to req.
 * @public
 */
exports.testPayment = async (req, res, next) => {
  try {
    const resp = await cashfreeUtils.createOrder();
    console.log(resp);
    res.json(resp);
  } catch (error) {
    console.log(error);
    return next(error);
  }
};

exports.createOrder = async (req, res, next) => {
  try {
    const body = req.body;
    const resp = await cashfreeUtils.createOrder(req.body);
    console.log(resp);
    res.json(resp);
  } catch (error) {
    console.log(error);
    return next(error);
  }
};

exports.createVendor = async (req, res, next) => {
  try {
    let data = {
      id: "Vendor_2",
      name: "Manideep",
      status: "ACTIVE",
      email: "test@test.com",
      phone: "8281554863",
      settlementCycleId: 1,
      bank: {
        accountNumber: "5402039817",
        accountHolder: "Manideep",
        ifsc: "CITI0000004",
      },
    };

    const resp = await cashfreeUtils.createVendor(data);
    console.log(resp);
    res.json(resp);
  } catch (error) {
    console.log(error);
    return next(error);
  }
};

async function updateOrderPayment(payload, paymentStatus) {
  let orderId = payload.order.order_id;
  let order = await Order.findOne({ orderId: orderId });
  let user = await User.findById(order.customerId);
  let campaigns = order.campaigns;
  let statusUpdates = order.statusUpdates;

  let update = {};
  if (paymentStatus === "PAYMENT_SUCCESS") {
    let statusChange = {
      status: "Confirmed",
      comments: "Confirmed the order as per Cashfree Webhook",
      date: new Date().toISOString(),
    };
    statusUpdates.push(statusChange);
    update = {
      paymentStatus: paymentStatus,
      status: "Confirmed",
      statusUpdates: statusUpdates,
      $set: {
        "campaigns.$[].products.$[].status": "Confirmed",
        "campaigns.$[].status": "Confirmed",
      },
    };
    let sTime = moment(order.createdAt);
    const now = new Date();
    let duration = moment.duration(moment(now).diff(sTime));
    let diffInMinutes = duration.asMinutes();
    if (diffInMinutes > 3 && order.stockUpdated) {
      //updateReservedStocks(orderId)
    }
    let mobileNo =
      user.mobile.toString().length > 10 ? user.mobile : "91" + user.mobile;
    SMSUtils.sendOrderConfimation(order.total, mobileNo);
  } else if (paymentStatus === "PAYMENT_USER_DROPPED") {
    logger.info(("PAYMENT_USER_DROPPED", payload));
    let cashfreeOrder = await cashfreeUtils.getOrderStatus(order.orderId);
    if (cashfreeOrder.order_status !== "PAID") {
      let statusChange = {
        status: "PaymentCancelled",
        comments: "PaymentCancelled  per Cashfree Webhook",
        date: new Date().toISOString(),
      };
      statusUpdates.push(statusChange);

      update = {
        paymentStatus: paymentStatus,
        status: "PaymentCancelled",
        PaymentStatus: "PaymentCancelled",
        statusUpdates: statusUpdates,
        $set: {
          "campaigns.$[].products.$[].status": "PaymentCancelled",
          "campaigns.$[].status": "PaymentCancelled",
        },
      };
      if (
        order.status !== "PaymentCancelled" &&
        order.paymentStatus !== "PAYMENT_USER_DROPPED"
      ) {
        // let txn = await Transaction.findOne({orderId: order._id, txnType: 'Payment'})
        // if(txn) {
        //   let methods = txn.paymentMethods;
        //   let walletTxn = methods.find( m => m.method === 'Wallet')
        //   if(walletTxn)
        //     await updateUserWallet(order, walletTxn.amount)
        // }
        scheduleJob(330, () => {
          processWalletRefund(order._id);
        });
      }
    } else {
      logger.info(
        "A wrong webhook sent from cashfree:" + paymentStatus,
        payload
      );
    }
  } else {
    logger.info(("WebHook:" + paymentStatus, payload));
    let cashfreeOrder = await cashfreeUtils.getOrderStatus(order.orderId);
    let statusChange = {
      status: "PaymentFailed",
      comments: "PaymentFailed  per Cashfree Webhook",
      date: new Date().toISOString(),
    };
    statusUpdates.push(statusChange);
    if (cashfreeOrder.order_status !== "PAID") {
      update = {
        paymentStatus: paymentStatus,
        status: "PaymentFailed",
        statusUpdates: statusUpdates,
        $set: {
          "campaigns.$[].products.$[].status": "PaymentFailed",
          "campaigns.$[].status": "PaymentFailed",
        },
      };

      // let txn = await Transaction.findOne({orderId: order._id, txnType: 'Payment'})
      // if(txn) {
      //   let methods = txn.paymentMethods;
      //   let walletTxn = methods.find( m => m.method == 'Wallet')
      //   if(walletTxn)
      //     await updateUserWallet(order, walletTxn.amount)
      // }

      scheduleJob(330, () => {
        processWalletRefund(order._id);
      });
    } else {
      logger.info(
        "A wrong webhook sent from cashfree:" + paymentStatus,
        payload
      );
    }
  }
  let updated = await Order.updateOne({ orderId: orderId }, update);
}

const processWalletRefund = async (orderId) => {
  console.log("Running the scheduled job:processWalletRefund");
  const status = ["PaymentCancelled", "PaymentFailed"];
  let txn = await Transaction.findOne({ orderId: orderId, txnType: "Payment" });
  if (txn) {
    let methods = txn.paymentMethods;
    let walletTxn = methods.find((m) => m.method == "Wallet");
    if (walletTxn) {
      let order = await Order.findById(orderId);
      console.log("processWalletRefund:order.status", order.status);
      if (status.indexOf(order.status) !== -1) {
        //Order is failed and hence refunding
        console.log("Processing refund");
        await updateUserWallet(order, walletTxn.amount);
      } else {
        console.log("No refund required");
      }
    }
  }
};

exports.checkRefundDetails = async (req, res, next) => {
  let order = await Order.findOne({
    _id: mongoose.Types.ObjectId(req.params.orderId),
  });

  let txn = await Transaction.findOne({
    orderId: order._id,
    txnType: "Payment",
  });

  if (txn) {
    let methods = txn.paymentMethods;
    let walletTxn = methods.find((m) => m.method == "Wallet");
    if (walletTxn) console.log(walletTxn);
    await updateUserWallet(order, walletTxn.amount);
  }
};

const updateReservedStocks = async function (orderId) {
  try {
    console.log("Order Id", orderId);
    let order = await Order.findById(orderId);
    let status = [
      "PendingPayment",
      "Processing",
      "PaymentFailed",
      "PaymentCancelled",
    ];
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
        selectedProduct = selectedCampaignProduct.toJSON();
        if (attributes.length) {
          for (let i = 0; i < attributes.length; i++) {
            let attr = attributes[i];

            let selectedAttribute = selectedProduct.attributes.filter(
              (a) => a.name == attr.name
            )[0];

            if (selectedAttribute && selectedAttribute.isRequired) {
              let optionToUpdate = selectedAttribute.options.filter(
                (option) => option.value == attr.value
              )[0];

              if (optionToUpdate["stock"] !== 9999) {
                optionToUpdate["stock"] =
                  optionToUpdate["stock"] - +attr.quantity;
              }
            }
          }
        } else {
          if (selectedCampaignProduct["stock"] !== 9999) {
            selectedCampaignProduct["stock"] =
              selectedCampaignProduct["stock"] - product.quantity;
          }
        }
        selectedCampaignProduct.attributes = selectedProduct.attributes;
      }
      await Campaign.findOneAndUpdate(
        { _id: campaigns[i].campaignId },
        { products: updateProducts }
      );
    }
  } catch (e) {
    logger.error(e);
    console.log("stock update error", e);
  }
};

async function updateUserWallet(orderInfo, orderCredits) {
  console.log("updateUserWallet", orderInfo.orderId);
  const user = await User.get(orderInfo.customerId);
  //Check if already refunded
  let walletTxn = await WalletLogs.findOne({
    userId: user._id,
    type: "Refund",
    refId: orderInfo._id,
  });
  console.log("walletTxn", walletTxn);

  if (!walletTxn) {
    let credits = user.walletCredits + orderCredits;
    let updates = { walletCredits: credits };

    User.findOneAndUpdate({ _id: user._id }, updates, { new: true })
      .then(async (u) => {
        let txn = {
          userId: user._id,
          mobile: user.mobile,
          credits: orderCredits,
          type: "Refund",
          refId: orderInfo._id,
          txnDetails: {
            updatedBy: user._id,
            comment: `Refunded ${orderCredits} credits by order ${orderInfo.orderId}`,
          },
        };
        let t = await new WalletLogs(txn).save();
        return;
      })
      .catch((e) => {
        return e;
      });
  } else {
    console.log("Already refunded for this order");
  }
}

exports.cashfreePaymentHook = async (req, res, next) => {
  console.log("Payment hook invoked", req.body);
  logger.info(("Payment hook invoked", req.body));
  try {
    console.log("Headers", req.headers, CASH_FREE_SECRET_KEY);
    let signature = "";
    let timestamp = "";
    if (req.headers["x-cashfree-signature"]) {
      signature = req.headers["x-cashfree-signature"];
      timestamp = req.headers["x-cashfree-timestamp"];
    } else if (req.headers["x-webhook-signature"]) {
      signature = req.headers["x-webhook-signature"];
      timestamp = req.headers["x-webhook-timestamp"];
    }

    //let secretKey = CASH_FREE_SECRET_KEY;
    //let resp = Cashfree.Payouts.VerifySignature(req.body, signature, CASH_FREE_SECRET_KEY);
    //console.log('signature verify',resp);
    let content = req.body;
    // if(req.body.data && req.body.data.order) {
    //   req.body.data.order['order_amount'] =  req.body.data.order['order_amount'].toFixed(2)
    // }
    // if(req.body.data && req.body.data.payment ) {
    //   req.body.data.payment['payment_amount'] =  req.body.data.payment['payment_amount'].toFixed(2)
    // }

    let body = timestamp + JSON.stringify(req.body);
    //console.log('Body', body)
    //console.log('verifySignature', verifySignature(body, signature, CASH_FREE_SECRET_KEY))
    /*
    if(req.body.txStatus === 'FAILED') {
      let payload = {
        order: {
          order_id: req.body.orderId
        }
      }
      await updateOrderPayment(payload, 'PAYMENT_FAILED')
      res.status(httpStatus.OK);
      res.send();
    }  else if(req.body.txStatus === 'USER_DROPPED') {
      let payload = {
        order: {
          order_id: req.body.orderId
        }
      }
      await updateOrderPayment(payload, 'USER_DROPPED')
      res.status(httpStatus.OK);
      res.send();
    } else {
      */
    if (req.body.data) {
      if (verifySignature(body, signature, CASH_FREE_SECRET_KEY)) {
        //console.log('Verified', req.body.data)
        if (req.body.data && req.body.data.payment) {
          switch (req.body.type) {
            case "PAYMENT_SUCCESS_WEBHOOK": {
              await updateOrderPayment(req.body.data, "PAYMENT_SUCCESS");
              break;
            }
            case "PAYMENT_USER_DROPPED_WEBHOOK": {
              await updateOrderPayment(req.body.data, "PAYMENT_USER_DROPPED");
              break;
            }
            case "PAYMENT_FAILED_WEBHOOK": {
              console.log("Invoked PAYMENT_FAILED_WEBHOOK");
              await updateOrderPayment(req.body.data, "PAYMENT_FAILED");
              break;
            }
          }
          res.status(httpStatus.OK);
          res.send();
        } else {
          console.log("Invalid payload");
          let er = new APIError({
            message: "Invalid payload",
            status: httpStatus.BAD_REQUEST,
          });
          next(er);
        }
      } else {
        console.log("Signature Mismatch");
        let er = new APIError({
          message: "Signature Mismatch",
          status: httpStatus.BAD_REQUEST,
        });
        next(er);
      }
    } else {
      console.log("Webhook version 0 invoked", body);
    }

    //}
  } catch (e) {
    console.log("Internal error", e);
    return next(e);
  }
};

exports.createInvoice = async function (req, res, next) {
  try {
    const orderId = req.params.orderId;
    let order = await Order.findById(orderId)
      .populate({
        path: "transaction",
      })
      .populate({
        path: "customer",
      })
      .lean()
      .exec();
    const statusList = [
      "PaymentSuccess",
      "Confirmed",
      "OutForDelivery",
      "Delivered",
      "PartialDelivery",
    ];
    if (statusList.indexOf(order.status) == -1) {
      let er = new APIError({
        message: "Invoice not available",
        status: httpStatus.BAD_REQUEST,
      });
      next(er);
    }

    let data = {};
    let products = [];

    for (let i = 0; i < order.campaigns.length; i++) {
      campaign = order.campaigns[i];

      let p = campaign.products;
      for (let j = 0; j < p.length; j++) {
        let product = p[j];
        let productDetails = await Product.findById(product.productId).populate(
          "hsnInfo"
        );
        //console.log(productDetails.hsnInfo)
        product.campaign = campaign.name;
        console.log(product.attributes);
        let addOns = "";
        if (product.attributes && product.attributes.length) {
          for (let i = 0; i < product.attributes.length; i++) {
            addOns =
              addOns +
              (addOns.length ? " ," : "") +
              product.attributes[i].name +
              ":" +
              product.attributes[i].value;
            product.price += +product.attributes[i].price;
          }
          product.name = `${product.name} (${addOns})`;
        }

        product.amount = (
          product.total -
          (product.total -
            (100 * product.total) / (productDetails.hsnInfo.GST + 100))
        ).toFixed(2);
        product.GST = (
          product.total -
          (100 * product.total) / (productDetails.hsnInfo.GST + 100)
        ).toFixed(2);
        products.push(product);
      }
    }
    data["products"] = products;
    data["customer"] = order.customer;
    data["address"] = order.address;
    data["invoiceNo"] = order.orderId;
    data["txn"] = order.transaction;
    data["createdOn"] = moment(order.createdAt).format("Do MMM YYYY");

    var html = fs.readFileSync(dirPath + "/invoice.html", "utf8");
    console.log("invoicePath", invoicePath);
    if (!fs.existsSync(invoicePath)) {
      fs.mkdirSync(invoicePath);
    }
    var options = {
      format: "A4",
      orientation: "portrait",
      //border: "10mm",
      header: {
        height: "10mm",
        contents: "",
      },
      footer: {
        height: "10mm",
        contents: {
          //first: 'Cover page',
          //2: 'Second page', // Any page number is working. 1-based index
          //default: '<span style="color: #444;">© 2020 LoanInsDeals - A Product of Vikazana Pvt. Ltd.</span>', // fallback value
          //last: 'Last Page'
        },
      },
    };
    var document = {
      html: html,
      data: {
        data: data,
      },
      path: invoicePath + "/" + data.invoiceNo + ".pdf",
    };
    pdf
      .create(document, options)
      .then((resp) => {
        var file = fs.createReadStream(
          invoicePath + "/" + data.invoiceNo + ".pdf"
        );
        var stat = fs.statSync(invoicePath + "/" + data.invoiceNo + ".pdf");
        res.setHeader("Content-Length", stat.size);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=quote.pdf");
        file.pipe(res);
      })
      .catch((error) => {
        console.log(error);
        res.status(httpStatus.INTERNAL_SERVER_ERROR);
        res.json("Error generating invoice");
      });
  } catch (e) {
    console.log(e);
    res.status(httpStatus.INTERNAL_SERVER_ERROR);
    res.json("Internal error");
  }
};

exports.razorpayWebHook = async (req, res, next) => {
  try {
    console.log("RZP Payment hook invoked", req.body);
    logger.info(("RZP Payment hook invoked", req.body));
    if (req.body && req.body.event) {
      //validate the signature
      console.log("Recieved respose from Razorpay", req.body.event);
      const signature = req.headers["x-razorpay-signature"];
      if ( Razorpay.validateWebhookSignature( JSON.stringify(req.body), signature, RAZORPAY_KEY_SECRET ) ) {
      
        let razorPayResponse = req.body;
        
        if (razorPayResponse.event == "payment.authorized") {
          let payload = razorPayResponse.body.payment.entity;
          if (payload.status == "authorized") {
            let orderDetails = await Order.findOne({
              razorpayOrderId: payload.order_id,
            });
            updateRazorpayOrderPayment(orderDetails, "authorized")
            return res.send()
          } else {
            // await Order.updateOne(
            //   { razorpayOrderId: payload.order_id },
            //   { status: payload.status }
            // );
            // const respObj = {
            //   txnId: payload.id,
            //   status: payload.status,
            //   response: JSON.stringify(razorPayResponse),
            // };
            // await new RazorPay(respObj).save();
            return res.send()
          }
        } else {
          logger.error(
            "Webhook Call|" + (razorPayResponse.event || "No Event"),
            req.body || {}
          );
          return res.send()
        }
      } else {
        // const respObj = {
        //   txnId: payload.id,
        //   status: "invalidSignature",
        //   response: JSON.stringify(razorPayResponse),
        // };
        // logger.error("invalidSignature", respObj);
        // await new RazorPay(respObj).save();
        console.error(
          "Error:Razorpay:webhook:updatePayment:156",
          "Signature doesn not match"
        );
        return res.send()
      }
    } else {
      return res.send()
    }
  } catch (e) {
    logger.error(e);
    console.error("Error:Razorpay:webhook:updatePayment:163", e);
    // const respObj = {
    //   txnId: payload.id,
    //   status: "internalError",
    //   response: JSON.stringify(e),
    // };
    // await new RazorPay(respObj).save();
    return res.send()
  }
};

async function updateRazorpayOrderPayment(payload, paymentStatus) {
  let orderId = payload.order.order_id;
  let order = await Order.findOne({ orderId: orderId });
  let user = await User.findById(order.customerId);
  let campaigns = order.campaigns;
  let statusUpdates = order.statusUpdates;

  let update = {};
  if (paymentStatus === "PAYMENT_SUCCESS") {
    let statusChange = {
      status: "Confirmed",
      comments: "Confirmed the order as per Cashfree Webhook",
      date: new Date().toISOString(),
    };
    statusUpdates.push(statusChange);
    update = {
      paymentStatus: paymentStatus,
      status: "Confirmed",
      statusUpdates: statusUpdates,
      $set: {
        "campaigns.$[].products.$[].status": "Confirmed",
        "campaigns.$[].status": "Confirmed",
      },
    };
    let sTime = moment(order.createdAt);
    const now = new Date();
    let duration = moment.duration(moment(now).diff(sTime));
    let diffInMinutes = duration.asMinutes();
    if (diffInMinutes > 3 && order.stockUpdated) {
      //updateReservedStocks(orderId)
    }
    let mobileNo =
      user.mobile.toString().length > 10 ? user.mobile : "91" + user.mobile;
    SMSUtils.sendOrderConfimation(order.total, mobileNo);
  } else if (paymentStatus === "PAYMENT_USER_DROPPED") {
    logger.info(("PAYMENT_USER_DROPPED", payload));
    let cashfreeOrder = await cashfreeUtils.getOrderStatus(order.orderId);
    if (cashfreeOrder.order_status !== "PAID") {
      let statusChange = {
        status: "PaymentCancelled",
        comments: "PaymentCancelled  per Cashfree Webhook",
        date: new Date().toISOString(),
      };
      statusUpdates.push(statusChange);

      update = {
        paymentStatus: paymentStatus,
        status: "PaymentCancelled",
        PaymentStatus: "PaymentCancelled",
        statusUpdates: statusUpdates,
        $set: {
          "campaigns.$[].products.$[].status": "PaymentCancelled",
          "campaigns.$[].status": "PaymentCancelled",
        },
      };
      if (
        order.status !== "PaymentCancelled" &&
        order.paymentStatus !== "PAYMENT_USER_DROPPED"
      ) {
        // let txn = await Transaction.findOne({orderId: order._id, txnType: 'Payment'})
        // if(txn) {
        //   let methods = txn.paymentMethods;
        //   let walletTxn = methods.find( m => m.method === 'Wallet')
        //   if(walletTxn)
        //     await updateUserWallet(order, walletTxn.amount)
        // }
        scheduleJob(330, () => {
          processWalletRefund(order._id);
        });
      }
    } else {
      logger.info(
        "A wrong webhook sent from cashfree:" + paymentStatus,
        payload
      );
    }
  } else {
    logger.info(("WebHook:" + paymentStatus, payload));
    let cashfreeOrder = await cashfreeUtils.getOrderStatus(order.orderId);
    let statusChange = {
      status: "PaymentFailed",
      comments: "PaymentFailed  per Cashfree Webhook",
      date: new Date().toISOString(),
    };
    statusUpdates.push(statusChange);
    if (cashfreeOrder.order_status !== "PAID") {
      update = {
        paymentStatus: paymentStatus,
        status: "PaymentFailed",
        statusUpdates: statusUpdates,
        $set: {
          "campaigns.$[].products.$[].status": "PaymentFailed",
          "campaigns.$[].status": "PaymentFailed",
        },
      };

      // let txn = await Transaction.findOne({orderId: order._id, txnType: 'Payment'})
      // if(txn) {
      //   let methods = txn.paymentMethods;
      //   let walletTxn = methods.find( m => m.method == 'Wallet')
      //   if(walletTxn)
      //     await updateUserWallet(order, walletTxn.amount)
      // }

      scheduleJob(330, () => {
        processWalletRefund(order._id);
      });
    } else {
      logger.info(
        "A wrong webhook sent from cashfree:" + paymentStatus,
        payload
      );
    }
  }
  let updated = await Order.updateOne({ orderId: orderId }, update);
}


exports.updateUserWallet = updateUserWallet;
