const httpStatus = require('http-status');
const { omit } = require('lodash');
const User = require('../models/user.model');
const Vendor = require('../models/vendor.model');
const Campaign = require('../models/campaign.model');
const Order = require('../models/order.model');
const WalletLogs = require('../models/wallet.logs.model');
const Settings = require('../models/settings.model');
const APIError = require('../errors/api-error');
const appUtils = require('../utils/appUtils');
const CashfreeUtils = require('../utils/cashfreeUtils');
const nodemailer = require('nodemailer');
const FirebaseToken = require('../models/firebaseToken.model');
const emailProvider = require('../services/emails/emailProvider');
const firebaseService = require('../services/firebase')
const mongoose = require("mongoose");
const Logger = require('../../config/winston');
const logger = new Logger('/jobs')
const SMSUtils = require('../utils/SMSUtils')
const UserReports = require('./reports/user.report');
const RazorpayUtils = require('../utils/razorpayUtils');
/**
 * Load wallet and append to req.
 * @public
 */
exports.updateReferralCode = async (req, res, next) => {
  try {
    const usersWithCode = await User.find({ referralCode: { $exists: true } })
    let codes = usersWithCode.map(u => u.referralCode);
    const users = await User.find({ referralCode: { $exists: false } })
    //res.json(users);
    let updates = [];
    if(users.length){
      
      for(let user of users) {
        let code = appUtils.generateUniqueCode();
        //console.log('code', code)
        while(codes.indexOf(code) !== -1) {
          //console.log('duplicate')
          code = appUtils.generateUniqueCode();
        }
        user['referralCode'] = code;
        codes.push(code)
        updates.push(user.save()); 
      }
      //console.log(codes)
      Promise.all(updates).then((resp) => {
        res.json(resp);
      }).catch(e => {
        next(error);
      })
    } else {
      res.json("All users have referral code");
    }
    
  
  } catch (error) {
    return next(error);
  }
};

exports.updateCustomerId = async (req, res, next) => {
  try {
    const users = await User.find()
    let updates = [];
    let userCount = await User.countDocuments();
    for(let user of users) {

      
      let nameStr = user.name.length > 3 ? user.name.substring(0, 4).toUpperCase() : user.name.toUpperCase();
      const customerId = 'CBN_CUST_' + nameStr+'_'+(++userCount);
      user['customerId'] = customerId;
      updates.push(user.save());
    }
    Promise.all(updates).then((resp) => {
      res.json(resp);
    }).catch(e => {
      next(error);
    })
    
  
  } catch (error) {
    return next(error);
  }
};



exports.updateVendorId = async (req, res, next) => {
  try {
    const vendors = await Vendor.find()
    let updates = [];
    let userCount = await Vendor.countDocuments();
    for(let user of vendors) {

      
      let nameStr = user.name.length > 3 ? user.name.substring(0, 4).toUpperCase() : user.name.toUpperCase();
      const customerId = 'CBNV_' + nameStr.trim()+'_'+(++userCount);
      user['vendorId'] = customerId;
      user['mobile'] = 9567000001;
      user['email'] = 'demo@demo.com';
      updates.push(user.save());
    }
    Promise.all(updates).then((resp) => {
      res.json(resp);
    }).catch(e => {
      next(e);
    })
    
  
  } catch (error) {
    return next(error);
  }
};

exports.getUserReferralDetails = async (req, res, next) => {

  try {
    let query = {}
    let users = await User.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "walletlogs",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$$userId", "$userId"] },
                    { $eq: ["$type", "Referral"] }
                ],
                },
              },
            },
          ],
          as: "walletLogs",
        },
      },
      {
        $match: {
          'walletLogs.0': {$exists: true}, referredBy: { $exists:false } 
        }
      },
      { $project : {
          _id:true,
          mobile: true,
          walletLogs: true,
          referralCode: true,
          referredBy: true,
        }
      },
      { $sort: { createdAt: -1 } },

    ]);
    // for(let i=0;i<users.length; i++){
    //   let user = users[i];
    //   let walletLog = user.walletLogs[0];
    //   await WalletLogs.deleteOne({_id: walletLog._id})
    // }
    res.json(users);
  } catch (error) {
    return next(error);
  }
};

exports.sendTestEmail = async (req, res, next) => {
 try{
  const query = {
    "_id":mongoose.Types.ObjectId("637100af50a5d859ca69f8f1"),
    //"products.productId": mongoose.Types.ObjectId("6332620278543bbc891eeb18"),
    //"products.attributes._id": mongoose.Types.ObjectId("6332620278543bbc891eeb1c"),
    "products.attributes.options._id": mongoose.Types.ObjectId("6332620278543bbc891eeb1b")
  };

  let c = await Campaign.updateOne(query, {
    $set: {
      //"products.0.stocks": 20,
      "products.0.attributes.0.options.0.stocks": 20,
    },
  });
  
  res.json(c)
  }catch(e){
    console.log(e)
  }
}

exports.findCorruptedOrders = async (req, res, next) =>  {
  try{
    let orders = await Order.find()
    console.log(orders.length)
    for(let i=0;i<orders.length;i++){
      //console.log('checking '+i)
      try{
        let address = orders[i].address;
      
        if(address.apartment.length > 30){
          console.log('Apartment', address.apartment)
        } else {
          //console.log('Apartment', address[j].apartment, users[i]._id)
        }
      }catch(er){
        console.log(i)
        console.log('err', er);
        continue;
      }
      
    }
  }catch(e){
    console.log(e)
  }

}

exports.sendNotification = async (req, res, next) => {
  try{
    let tokens = await FirebaseToken.find();
    const registrationTokens = tokens.map(t=> t.token)
    
    // let message = {
    //   title: "Fresh Fruits campaign is live",
    //   body: "Fresh Fruits Campaign is live. Place your orders now!!",
    //   requireInteraction: "true",
    //   link: ""
    // }
    // firebaseService.sendNotifications(registrationTokens, {notification:message})

    let message = {
      title: "Fresh Fruits campaign is live",
      body: "Fresh Fruits Campaign is live. Place your orders now!!",
      requireInteraction: true,
      link: ""
    }
    let token  = 'coOb90KB4G5_Q_AivbmPU5:APA91bHPidhHXIiKz-gcGBjFMwlsjq6Tuaagggdfw9D50WZwj3lrqJf2GIbWWKl0yZnsGYmALFScgW1WAMdmqOjT-oJBwXAUYCmSp2V4Ip_PwHkeqkQ6zUd3fwEf0Ls_HnbEhUSTwSHZ'
    firebaseService.sendFCMMessage(token, message)

  } catch(e){
      console.log(e)
  }
}
exports.updatePendingOrderPaymentStatus = async function(req, res, next){
  try{
    let date = new Date();
    date.setHours(date.getHours()  - 72);
   
    let data = []
    let pendingOrders = await Order.find({status: {$in: ['PaymentCancelled', 'PaymentFailed']}, createdAt: {$gt: date}});
    console.log('PaymentCancelled orders', pendingOrders.length);
    let orderIds = []
    for(let i = 0; i < pendingOrders.length; i++) {
      console.log('checking:',i)
      if(pendingOrders[i].CFOrderId) {
        try {
          console.log('Checking order id', pendingOrders[i].orderId);
          let order = pendingOrders[i];
          let cashfreeOrder = await CashfreeUtils.getOrderStatus(order.orderId);
          if(cashfreeOrder.order_status !== 'ACTIVE') {
            orderIds.push(order.orderId)
            let statusChange = {
              status: 'Confirmed',
              comments: "Manually Updated the order by Admin",
              date: new Date().toISOString(),
            };

            let update = {
              paymentStatus: 'PAYMENT_SUCCESS',
              status: 'Confirmed' ,
              $set: {
                "campaigns.$[].products.$[].status": 'Confirmed',
                "campaigns.$[].status": 'Confirmed'
              },
              $push: { "campaigns.$[].statusUpdates": statusChange}
            }
            data.push({orderId:order.orderId, update: update})
            if(req.query.update){
              //await Order.updateOne({_id:order._id}, update)
            }
           
            console.log('Updating order: '+order.orderId, update)
           
          }
        } catch(er){
          console.log(er);
          continue;
        }
      }
    }
    console.log(data)
    res.json(data);
    
  }catch(e){
    next(e)
    console.log(e);
  }

}


exports.sendNotifications = async (req, res, next) => {
  try{
    let tokens = await FirebaseToken.find().distinct('token');
    console.log('tokens', tokens);
   
    let token = 'ftRnOKZUQFpwj3ntdbv4x0:APA91bGqlwPHlmcClOBdi8MRfuzHUg8MjlN8fAcWD-hBnyny8kgPq0nbFX7YQ1Y_OKT1LaC99uMMxcmH3EPoa9Wylf9W1kPFpimCz9L_AJuwNWuzcVyXYNyUYokpNxM4f6uSu9VjCDSR'
    
    //let r = await firebaseService.subscribeToTopic([token], "test")
    let message = {
      title: "Fresh Fruits campaign is live",
      body: "Fresh Fruits Campaign is live. Place your orders now!!",
      requireInteraction: "true",
      link: "https://combuyn.in"
    }
    firebaseService.notifyTopic(message, "test")
    // for(let i=0;i<registrationTokens.length;i++){
    //   token = registrationTokens[i]
    //   // let message = {
    //   //   title: "Fresh Fruits campaign is live",
    //   //   body: "Fresh Fruits Campaign is live. Place your orders now!!",
    //   //   requireInteraction: "false",
    //   //   link: "https://combuyn.in"
    //   // }
    //   //let token  = 'coOb90KB4G5_Q_AivbmPU5:APA91bHPidhHXIiKz-gcGBjFMwlsjq6Tuaagggdfw9D50WZwj3lrqJf2GIbWWKl0yZnsGYmALFScgW1WAMdmqOjT-oJBwXAUYCmSp2V4Ip_PwHkeqkQ6zUd3fwEf0Ls_HnbEhUSTwSHZ'
    //   firebaseService.notify(token, message)
    // }
    res.status(httpStatus.OK).end()
  } catch(e){
      console.log(e)
  }
}


exports.sendNotificationsToDevice = async (req, res, next) => {
  try{
    let tokens = await FirebaseToken.find().distinct('token');
    const registrationTokens = tokens
   
    let message = {
      title: "Fresh Fruits campaign is live",
      body: "Fresh Fruits Campaign is live. Place your orders now!!",
      requireInteraction: "false",
      image: 'https://campaigndemo1.s3.amazonaws.com/campaign/Fruits.jpg',
      link: "https://combuyn.in"
    }
    for(let i=0;i<registrationTokens.length;i++){
      token = registrationTokens[i]
         firebaseService.notifyDevice(token, message)
    }
    res.status(httpStatus.OK).end()
  } catch(e){
      console.log(e)
  }
}


exports.processMissingReferralRewards = async (req, res, next) => {
  const settings = await Settings.findOne().lean();
  let referralCredits = settings.referralCredits
                ? settings.referralCredits
                : 0;

  let users = await User.find({ referredBy: { $exists: true } })
  let usersList = {}
  console.log('Total users', users.length)
  logger.info('Processing mising referral rewards')
  for(let i = 0; i < users.length; i++){
    let user = users[i];
    let referredByUser = await User.findOne({ _id: user.referredBy}).select('_id name mobile referralCode walletCredits')
    if(!referredByUser) continue;
    //console.log('referredByUser', referredByUser)
    let walletTxn = await WalletLogs.find({userId: referredByUser._id, type: 'Referral', refId: user._id});

    console.log('exists?',walletTxn)
    if(walletTxn.length) continue;
    let orders  = await Order.countDocuments({customerId: user._id, 'campaigns.status': 'Delivered'});

    if( usersList[referredByUser._id.toString()]){
      //Check if delivered order
      
      if(orders > 0){
        usersList[referredByUser._id.toString()].count += 1;
        usersList[referredByUser._id.toString()]['referredUsers'].push(user._id)
      } else {
        usersList[referredByUser._id.toString()]['pendingReferrals'].push(user._id)
        console.log('No delivered orders');
      }
      
    } else {
      usersList[referredByUser._id.toString()] = referredByUser.toJSON();
      usersList[referredByUser._id.toString()]['count'] = 1;
      usersList[referredByUser._id.toString()]['walletTxns'] = walletTxn;
      usersList[referredByUser._id.toString()]['referredUsers'] = []
      usersList[referredByUser._id.toString()]['pendingReferrals'] = []
      if(orders > 0){
        usersList[referredByUser._id.toString()]['referredUsers'].push(user._id)
      } else {
        usersList[referredByUser._id.toString()]['pendingReferrals'].push(user._id)
      }
    }
    

  }
  
  usersList = Object.values(usersList)
  logger.info('Found '+ usersList.length+ ' users', usersList)
  for(let i = 0; i < usersList.length; i++){
    let user = usersList[i];
    if(user.walletTxns.length == 0 && user.referredUsers.length){
      let referrar = await User.get(user._id);
        const updatedUser = Object.assign(referrar, {
          walletCredits: (referrar.walletCredits||0) + (user.referredUsers.length * referralCredits),
        });
        console.log('User '+user.name+' will get '+(user.referredUsers.length * referralCredits) + ' credits')
        logger.info('User '+user.name+' will get '+(user.referredUsers.length * referralCredits) + ' credits')
        //await updatedUser.save();

      for(let j=0;j<user.referredUsers.length; j++){
        let u =  await User.get(user.referredUsers[j])
        let txn = {
          userId: user._id,
          mobile: user.mobile,
          credits: referralCredits,
          type: "Referral",
          txnDetails: {
            //referredBy: referredBy._id,
            comment: "Referral rewards received for referring "+u.name+"("+u.mobile+")",
          },
          refId: user.referredUsers[j]
        };
        logger.info('Inserting logs', txn)
        //await new WalletLogs(txn).save();

      }
    }
      
  }

  res.json(usersList)
}

exports.testMethod =  async (req, res, next) => {
  // console.log('Updating')
  let a = await WalletLogs.updateMany({}, {status: 'Confirmed'}, {upsert:true});
  console.log(a)

  // let path = await UserReports.getDailyReferralData();
  // const attachments = [
  //   {   // define custom content type for the attachment
  //     filename: path.split('/')[path.split('/').length-1],
  //     path: path,
  //     //contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  //   }
  // ]
  // const mailOptions = {
  //   from: '"Combuyn" <noreply@combuyn.in>',
  //   to: 'vneesh@gmail.com',
  //   //bcc: emailIds,
  //   attachments: attachments,
  //   subject: 'Daily Referral Report',
  //   //html: emailTemplate
  // };
  // emailProvider.sendCustomEmail(mailOptions)
  // console.log(path)
  // res.send({})
  // SMSUtils.sendOrderConfimation("10", 919483305683).then(resp => {
  //   console.log('Sent SMS(Login) to '+9567723832, resp)
  // }).catch(e => {
  //   console.log('error', e)
  // })
  // let walletTxn = await WalletLogs.find({mobile: null});
  // for(let i = 0;i<walletTxn.length;i++) {
  //   let user = await User.findById(walletTxn[i].userId);
  //   await WalletLogs.updateOne({_id:walletTxn[i]._id}, {mobile: user.mobile})
  // }
  // res.json(walletTxn)

}


exports.getOrderTransactionDetails = async (req, res, next) =>  {
  try{
    // let walletLogs = await WalletLogs.find({type: 'Refund'});
    // console.log('Total refunds: ' + walletLogs.length)
    // let data = []
    // for(let i = 0;i<walletLogs.length;i++) {
    //   let obj = walletLogs[i].toJSON()
    //   if(walletLogs[i].refId.length == 24){
    //     let order =  await Order.findById(walletLogs[i].refId)
    //     obj['orderStatus'] = order.status
    //     data.push(obj)
    //   }
    // }
    let id = req.params.orderId
    let query = {}
    if(id.length == 24){
      query['_id'] = id
    } else {
      query['orderId']= id
    }
    //const orderId = req.params.orderId
    let order = await Order.findOne(query).populate('transaction')
    res.json(order)
  } catch(e){
    console.log(e)
  }

}


exports.getPaymentStatus = async (req, res, next) =>  {
  try{
    let resp = await CashfreeUtils.getPaymentStatus(req.params.orderId)
    // const orderId = req.params.orderId
    // let order = await Order.findById(orderId).populate('transaction')
    console.log(resp)
    res.json(resp)
  } catch(e){
    console.log(e)
  }

}


exports.createRazorPayOrder = async (req, res, next) =>  {
  try{
    let data = req.body
    let resp = await RazorpayUtils.generatePaymentLink(data.orderInfo, data.customer)
    console.log(resp)
    res.json(resp)
  } catch(e){
    console.log(e)
  }

}

exports.updateCampaignIds = async (req, res, next) => {
  try {
    const campaigns = await Campaign.find()
    let updates = [];
    let campaignCount = 0;
    for(let c of campaigns) {

      
      const cId = 'CA2022' +(++campaignCount);
      c['cId'] = cId;
      updates.push(c.save());
    }
    Promise.all(updates).then((resp) => {
      res.json(resp);
    }).catch(e => {
      next(e);
    })
    
  
  } catch (error) {
    return next(error);
  }
};