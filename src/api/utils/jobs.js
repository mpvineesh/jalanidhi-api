
const Order = require('../models/order.model');
const moment = require("moment");
const Logger = require('../../config/winston');
const logger = new Logger('/jobs')
const CashfreeUtils = require('./cashfreeUtils');
const SMSUtils = require('./SMSUtils');
const Settings = require('../models/settings.model');
const User = require('../models/user.model');
const emailProvider = require('../services/emails/emailProvider');

exports.scheduleCampaignEnd = async () => {
  try {
    const now = new Date();
    const endDateInMinutes = 60; 

    //Campaigns to publish
    let published = await Campaign.updateMany({
      status: 'Published',
      startTime: {
          $lte: now
      }
    }, {'status': 'Active'})
    logger.info('Campaign published successfully '+ JSON.stringify(published))


    //Convert to IST time
    now.setMinutes(now.getMinutes()+0);
    var inactiveDate = new Date();
    inactiveDate.setMinutes(inactiveDate.getMinutes()+15);
   
    let updated = await Campaign.updateMany({
      status: 'Active',
      endTime: {
          $lte: now
      }
    }, {'status': 'Completed'})
    logger.info('Campaign updated successfully '+ JSON.stringify(updated))
    let q = {
      status: 'Active',
      endTime: { 
          $lte: inactiveDate
      }
    }
    console.log('Getting campaigns matching', q)
    const campaigns = await Campaign.find(q);
    return campaigns;
    // for(let i = 0; i < campaigns.length; i++) {
    //     const duration = moment.duration(campaigns[i].endTime.diff(now));
    //     const minutes = duration.asMinutes();
    //     scheduleJob(minutes, () => {
    //         inactivateCampaign(campaigns[i]._id);
    //     });
    // }
  } catch (error) {
      console.log('error', error);
    return []
    return next(error);
  }
};


function inactivateCampaign(id){
    Campaign.updateOne({_id: id},{status: 'Completed'})
}


exports.inactivateCampaign = function(id){
  Campaign.updateOne({_id: id},{status: 'Completed'})
}


exports.updatePendingOrders = async function(){
  try{
    let date = new Date();
    date.setHours(date.getHours()  - 144);
    let data = []
    let pendingOrders = await Order.find({status: {$in: ['PendingPayment','PaymentCancelled']}, createdAt: {$gt: date}});
    console.log('Pending orders', pendingOrders.length);

    for(let i = 0; i < pendingOrders.length; i++) {
      console.log('checking:',i)
      if(pendingOrders[i].CFOrderId) {
        try {
          console.log('Checking order id', pendingOrders[i].orderId);
          let order = pendingOrders[i];
          let cashfreeOrder = await CashfreeUtils.getOrderStatus(order.orderId);
          if(cashfreeOrder.order_status !== 'ACTIVE') {
            let item = {
              orderId: order.orderId,
              CFOrderId: order.CFOrderId,
              status: order.status,
              CFOrserStatus: cashfreeOrder.order_status,
              orderDate : order.createdAt,
              mobile : order.address.mobile,
              customerName: cashfreeOrder.customer_details.customer_name
            }
            data.push(item)
          }
        }catch(er){
          console.log(er);
          continue;
        }
      }
    }
    console.log(data)
    return data;
  }catch(e){
    console.log(e);
  }

}


exports.processMissingReferralRewards = async (userId) => {
  console.log('Running daily cron job')
  logger.info('Running daily cron job')
  const settings = await Settings.findOne().lean();
  let referralCredits = settings.referralCredits
                ? settings.referralCredits
                : 0;
  let referrarCredits = settings.referrarCredits
                ? settings.referrarCredits
                : 0;
  let userQuery = { referredBy: { $exists: true } }
  if(userId){
    userQuery['_id'] = userId
  }
  let users = await User.find(userQuery)
  let usersList = {}
  console.log('Total users', users.length)
  logger.info('Processing mising referral rewards')
  for(let i = 0; i < users.length; i++){
    let user = users[i];
    let referredByUser = await User.findOne({ _id: user.referredBy}).select('_id name mobile referralCode walletCredits')
    if(!referredByUser) continue;
    //console.log('referredByUser', referredByUser)
    let walletTxn = await WalletLogs.find({userId: referredByUser._id, type: 'Referral', refId: user._id, status: 'Confirmed'});

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
        
        let totalRewards = 0
        let referrar = await User.get(user._id);
        for(let j=0;j<user.referredUsers.length; j++){
          let u =  await User.get(user.referredUsers[j])
          let credits = referrarCredits
          //check if pending rewards exist
          let pendingWalletTxn = await WalletLogs.findOne({userId: user._id, type: 'Referral', refId: user.referredUsers[j], status: 'Pending'});
          if(pendingWalletTxn) {
            credits = pendingWalletTxn.credits
            totalRewards = totalRewards + pendingWalletTxn.credits
            await WalletLogs.updateOne({userId: user._id, type: 'Referral', refId: user.referredUsers[j]}, 
            {status: 'Confirmed', txnDetails: { comment: "Referral rewards received for referring "+u.name+"("+u.mobile+")"}});
          } else {
            
            let txn = {
              userId: user._id,
              credits: referrarCredits,
              type: "Referral",
              mobile: user.mobile,
              status: 'Confirmed',
              txnDetails: {
                //referredBy: referredBy._id,
                comment: "Referral rewards received for referring "+u.name+"("+u.mobile+")",
              },
              refId: user.referredUsers[j]
            };
            logger.info('Inserting logs', txn)
            await new WalletLogs(txn).save();
            totalRewards= totalRewards + referrarCredits;
          }
          
          let mobileNo = referrar.mobile.toString().length > 10 ? referrar.mobile : '91'+ referrar.mobile
          SMSUtils.sendReferralcreditNotification(credits, mobileNo, u.name).then(resp => {
            console.log('Sent SMS(Login) to '+mobileNo, resp)
          }).catch(e => {
            console.log('error', e)
          })
        }

      
        const updatedUser = Object.assign(referrar, {
          walletCredits: (referrar.walletCredits||0) + totalRewards,
        });
        console.log('User '+user.name+' will get '+totalRewards + ' credits')
        logger.info('User '+user.name+' will get '+totalRewards + ' credits')
        await updatedUser.save();
        
    }
      
  }

}

exports.dailyReferralSummary = async () => {
  let reportPath = await UserReports.getDailyReferralData();
  const attachments = [
    {   // define custom content type for the attachment
      filename: reportPath.split('/')[reportPath.split('/').length-1],
      path: reportPath,
      //contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  ]
  const mailOptions = {
    from: '"Combuyn" <noreply@combuyn.in>',
    to: 'amol@combuyn.in,nitin@combuyn.in,prateek@combuyn.in,amolag92@gmail.com',
    //to: 'vneesh@gmail.com',
    bcc: 'vneesh@gmail.com',
    attachments: attachments,
    subject: 'Daily Referral Report',
    //html: emailTemplate
  };
  emailProvider.sendCustomEmail(mailOptions)
}

exports.updateOrderPaymentStatus = async function(){
  try{
    let date = new Date();
    date.setHours(date.getHours()  - 144);
    // let oId = '10112022-267'
    // let details = await CashfreeUtils.getOrderStatus(oId);
    // console.log('details', details)
    let data = []
    let pendingOrders = await Order.find({status: {$in: ['PendingPayment','PaymentCancelled']}, createdAt: {$gt: date}});
    console.log('Pending orders', pendingOrders.length);

    for(let i = 0; i < pendingOrders.length; i++) {
      console.log('checking:',i)
      if(pendingOrders[i].CFOrderId) {
        try {
          console.log('Checking order id', pendingOrders[i].orderId);
          let order = pendingOrders[i];
          let cashfreeOrder = await CashfreeUtils.getOrderStatus(order.orderId);
          if(cashfreeOrder.order_status !== 'ACTIVE') {
            let item = {
              orderId: order.orderId,
              CFOrderId: order.CFOrderId,
              status: order.status,
              CFOrserStatus: cashfreeOrder.order_status,
              orderDate : order.createdAt,
              mobile : order.address.mobile,
              customerName: cashfreeOrder.customer_details.customer_name
            }
            data.push(item)
          }
        }catch(er){
          console.log(er);
          continue;
        }
      }
    }
    console.log(data)
    return data;
  }catch(e){
    console.log(e);
  }

}


exports.createAdminUser = async function(){
    const exist = await User.findOne({mobile:'9090909090'});
    if(exist == null){
      let user = new User({
        name: 'Admin',
        role: 'admin',
        mobile: '9090909090',
      });
      try {
        
        let admin = await user.save();
        console.log('Created admin user')
      }catch(er){
        console.log(er);
      }
    } else {
      console.log('Exist')
    }
    


}