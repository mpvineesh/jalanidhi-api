const httpStatus = require('http-status');
const moment = require('moment-timezone');
const { omit } = require('lodash');
const User = require('../models/user.model');
const RefreshToken = require('../models/refreshToken.model');
const PasswordResetToken = require('../models/passwordResetToken.model');
const { jwtExpirationInterval } = require('../../config/vars');
const APIError = require('../errors/api-error');
const emailProvider = require('../services/emails/emailProvider');
const {generateOTP} = require('../utils/appUtils');
const OTP = require('../models/otp.model');
const {scheduleJob} = require('../utils/scheduler');
const Settings = require('../models/settings.model');
const appUtils = require('../utils/appUtils');
const SMSUtils = require('../utils/SMSUtils')
const { env } = require('../../config/vars');
const Logger = require('../../config/winston');
const logger = new Logger('/auth')
/**
 * Returns a formated object with tokens
 * @private
 */
function generateTokenResponse(user, accessToken) {
  const tokenType = 'Bearer';
  const refreshToken = RefreshToken.generate(user).token;
  const expiresIn = moment().add(jwtExpirationInterval, 'minutes');
  return {
    tokenType,
    accessToken,
    refreshToken,
    expiresIn,
  };
}

/**
 * Returns jwt token if registration was successful
 * @public
 */
exports.register = async (req, res, next) => {
  try {
    const loggedInUser = req.user;
   
    const userData = omit(req.body, 'role');
    //Verify OTP
    if(req.body.otp) {
      const {valid, err} = await OTP.isValid({type: 'signup', mobile: req.body.mobile, otp: req.body.otp});
      if (valid) {
          const settings = await Settings.findOne();
          let referralCredits = settings.referralCredits ? settings.referralCredits : 0;
          let referrarCredits = settings.referrarCredits ? settings.referrarCredits : 0;
          let signupCredits = settings.signupCredits ? settings.signupCredits : 0;
          //console.log('referralCredits', referralCredits)
          
          //check if refferralCode exist
          const referralCode = req.body.referralCode ? req.body.referralCode : '';
          delete req.body.referralCode;
          //console.log('referralCode', referralCode)
          if(referralCode && referralCode.length){
            
            let referredBy = await User.findOne({'referralCode': referralCode});
            if(referredBy == null){
              throw new APIError({
                status: httpStatus.CONFLICT,
                message: 'Invalid referral Code'
              });
            }
            req.body['referredBy']  = referredBy._id;
          }
          req.body['walletCredits']  = referralCredits;
          req.body['referralCode'] = appUtils.generateUniqueCode();
          const user = await new User(req.body).save();
          if(req.body.trackingInfo && Object.keys(req.body.trackingInfo).length > 0) {
            let trackingInfo = {...req.body.trackingInfo}
            trackingInfo['type'] = 'signup';
            trackingInfo['refId'] = user._id
            let tracking = new Tracking(trackingInfo)
            let resp = await tracking.save();
          }

          logger.info('Created new user: '+ JSON.stringify(req.body))
          
          if(referralCode && referralCode.length){
            
            let referredBy = await User.findOne({'referralCode': referralCode});
           
            //Create Pending referral rewards
            let refTxn = {
              userId: referredBy._id,
              credits: referrarCredits,
              mobile: referredBy.mobile,
              refId: user._id,
              type: "Referral",
              status: 'Pending',
              txnDetails: {
                comment: "Pending Referral rewards  for referring ("+req.body.mobile+")",
              },
            };
            await new WalletLogs(refTxn).save();

          }

          let txn = {
            userId: user._id,
            credits: referralCredits,
            type: "Signup",
            status: 'Confirmed',
            mobile: user.mobile,
            txnDetails: {
              //referredBy: referredBy._id,
              comment: "Signup rewards received",
            },
          };
          await new WalletLogs(txn).save();
          const userTransformed = user.transform();
          userTransformed['tracking'] = req.body.trackingInfo || {}
          const token = generateTokenResponse(user, user.token());
          await OTP.deleteOne({type: 'signup', mobile: req.body.mobile, otp: req.body.otp});
          res.status(httpStatus.CREATED);
          return res.json({ token, user: userTransformed });
      } else {
        //errObj.message = err.message;

        throw new APIError({
          status: httpStatus.UNAUTHORIZED,
          message: "Invalid OTP"
        });
      }
    } else {
      throw new APIError({
        status: httpStatus.UNAUTHORIZED,
        message: "OTP is missing"
      });
    }
    
  } catch (error) {
    console.log(error)
    return next(User.checkDuplicateEmail(error));
  }
};

/**
 * Returns jwt token if valid username and password is provided
 * @public
 */
exports.login = async (req, res, next) => {
  try {
    const { user, accessToken } = await User.loginAndGenerateToken(req.body);
    const token = generateTokenResponse(user, accessToken);
    const userTransformed = user.transform();
    
    if(req.clientType == 'admin' && user.role !== 'admin') {
      const err = {
        message : 'You are not authorized to access this resource',
        status: httpStatus.UNAUTHORIZED,
        isPublic: true,
      };
      throw new APIError(err);
    }
    logger.info("User logged in: "+ userTransformed.name)
    return res.json({ token, user: userTransformed });
  } catch (error) {
    console.log('login error: ', error, req.body)
    logger.error(error)
    return next(error);
  }
};

/**
 * Send login OTP to user's mobile number
 * @public
 */
exports.generateLoginOTP = async (req, res, next) => {
  try {
    //scheduleJob(120, ()=>{console.log('Worked')})
    if(req.body.type === 'login') {
        const query = {mobile: req.body.mobile}
        const user = await User.findOne(query);
        if (user) {
          let {otp, expiry} = generateOTP();
          //console.log('generateOTP()', generateOTP(), user)
          //TODO
          if(env == 'production') {
            await OTP.deleteMany({userId: user._id,type: 'login'})
            const otpObj = new OTP({userId: user._id, otp: otp, expiresOn: expiry, type: 'login'});
            await otpObj.save();
            let mobileNo = req.body.mobile.toString().length > 10 ? req.body.mobile : '91'+ req.body.mobile
            SMSUtils.sendOTP(otp, mobileNo).then(resp => {
              console.log('Sent SMS(Login) to '+mobileNo, resp)
            }).catch(e => {
              console.log('error', e)
            })
            emailProvider.sendOTP(user, otp)
          } else {
            otp = 123456;
            const otpObj = new OTP({userId: user._id, otp: otp, expiresOn: expiry, type: 'login'});
            await otpObj.save();
          }
          

          res.status(httpStatus.OK);
          //TODO: remove otp from resp
          let resp = {expiresOn: expiry, type: 'login'}
          if(env !== 'production'){
            resp['otp'] = otp
          }
          return res.json(resp);
        } else {
          throw new APIError({
            status: httpStatus.UNAUTHORIZED,
            message: 'No account found with that mobile',
          });
        }
    } else {
      let {otp, expiry} = generateOTP();
      const query = {mobile: req.body.mobile}
      const user = await User.findOne(query);
      if (!user) {
        if(env == 'production') {
          //console.log('generateOTP()', generateOTP())
          await OTP.deleteMany({mobile: req.body.mobile, type: 'signup'})
          const otpObj = new OTP({mobile: req.body.mobile, otp: otp, expiresOn: expiry, type: 'signup'});
          await otpObj.save();

          let mobileNo = req.body.mobile.toString().length > 10 ? req.body.mobile : '91'+ req.body.mobile
          SMSUtils.sendOTP(otp, mobileNo).then(resp => {
            console.log('Sent SMS(Signup) to '+mobileNo, resp)
          }).catch(e => {
            console.log('error', e)
          })
          emailProvider.sendOTP({email:req.body.email}, otp)
        } else {
          otp = 123456;
          const otpObj = new OTP({mobile: req.body.mobile, otp: otp, expiresOn: expiry, type: 'signup'});
          await otpObj.save();
        }
        let resp = {expiresOn: expiry, type: 'signup'}
        if(env !== 'production'){
          resp['otp'] = otp
        }
        res.status(httpStatus.OK);
        return res.json(resp);
      } else {
        throw new APIError({
          status: httpStatus.CONFLICT,
          message: 'This mobile number is already registered',
        });
      }
    }
   
  } catch (error) {
    return next(error);
  }
};

/**
 * login with an existing user or creates a new one if valid accessToken token
 * Returns jwt token
 * @public
 */
exports.oAuth = async (req, res, next) => {
  try {
    const { user } = req;
    const accessToken = user.token();
    const token = generateTokenResponse(user, accessToken);
    const userTransformed = user.transform();
    return res.json({ token, user: userTransformed });
  } catch (error) {
    return next(error);
  }
};

/**
 * Returns a new jwt when given a valid refresh token
 * @public
 */
exports.refresh = async (req, res, next) => {
  try {
    const { mobile, refreshToken } = req.body;
    const refreshObject = await RefreshToken.findOneAndRemove({
      userMobile: mobile,
      token: refreshToken,
    });
    const { user, accessToken } = await User.findAndGenerateToken({ mobile, refreshObject });
    const response = generateTokenResponse(user, accessToken);
    return res.json(response);
  } catch (error) {
    return next(error);
  }
};

exports.sendPasswordReset = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email }).exec();

    if (user) {
      const passwordResetObj = await PasswordResetToken.generate(user);
      emailProvider.sendPasswordReset(passwordResetObj);
      res.status(httpStatus.OK);
      return res.json('success');
    }
    throw new APIError({
      status: httpStatus.UNAUTHORIZED,
      message: 'No account found with that email',
    });
  } catch (error) {
    return next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, password, resetToken } = req.body;
    const resetTokenObject = await PasswordResetToken.findOneAndRemove({
      userEmail: email,
      resetToken,
    });

    const err = {
      status: httpStatus.UNAUTHORIZED,
      isPublic: true,
    };
    if (!resetTokenObject) {
      err.message = 'Cannot find matching reset token';
      throw new APIError(err);
    }
    if (moment().isAfter(resetTokenObject.expires)) {
      err.message = 'Reset token is expired';
      throw new APIError(err);
    }

    const user = await User.findOne({ email: resetTokenObject.userEmail }).exec();
    user.password = password;
    await user.save();
    emailProvider.sendPasswordChangeEmail(user);

    res.status(httpStatus.OK);
    return res.json('Password Updated');
  } catch (error) {
    return next(error);
  }
};


exports.myInfo = async (req, res, next) => {
  try {
    let loggedInUser = req.user;
    let user = await User.findOne({_id: loggedInUser.id}).populate('orderCount').populate('tracking');
   
     user = user.transform();
    for(let i = 0; i < user.address.length; i++) {
      let address = user.address[i].toJSON();
      let apartment = await Apartment.findOne({'name': user.address[i].apartment});
      address['apartmentId'] = apartment? apartment._id : '';
      user.address[i] = address;
    }
    res.json(user)
    res.status(httpStatus.OK);
  } catch (error) {
    return next(error);
  }
};
