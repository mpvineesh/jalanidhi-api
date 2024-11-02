const Razorpay = require("razorpay");
const moment = require('moment');
const {
    RAZORPAY_CALBACK_URL,
    RAZORPAY_KEY_SECRET,
    RAZORPAY_KEY_ID
  } = require("../../config/vars");

const Logger = require('../../config/winston');
const logger = new Logger('/razorpay')
  
let razorPayInstance = null;

getInstance = () => {
  if (razorPayInstance == null) {
    razorPayInstance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET
    });
  }
  return razorPayInstance;
};

exports.getInstance = getInstance;

exports.generatePaymentLink = async function (orderInfo, userInfo) {
    return new Promise((resolve, reject) => {
        try {
            let customer = {
                name: userInfo.name,
                email: userInfo.email,
                contact: userInfo.mobile.toString().length > 10 ? userInfo.mobile : '91'+ userInfo.mobile,
            };
            let instance = getInstance()
            let payload = {
              amount: orderInfo.amount * 100,
              currency: "INR",
              description: `Payment Link for the order ${orderInfo.orderId}`,
              notify: {
                sms: true,
                email: true
              },
              callback_url: RAZORPAY_CALBACK_URL,
              callback_method: "get",
              customer: customer,
              notes: {
                orderId: orderInfo.orderId
              },
            };
          
            instance.paymentLink.create(payload)
              .then((response) => {
                console.log('Payment link response',response );
                resolve(response);
        
              })
              .catch((errorResp) => {
                reject(errorResp);
                console.log("Payment link error", errorResp);
                logger.error(errorResp);
                
              });
          } catch (e) {
            reject(e);
            console.log("Error", e);
            logger.error(e);
          }

    })
  
};
