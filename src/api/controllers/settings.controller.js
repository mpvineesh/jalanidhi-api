const httpStatus = require('http-status');
const { omit } = require('lodash');
const Settings = require('../models/settings.model');

/**
 * Load settings and append to req.
 * @public
 */
exports.load = async (req, res, next, id) => {
  try {
    const settings = await Settings.get(id);
    req.locals = { settings };
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Get settings
 * @public
 */
exports.get = (req, res) => res.json(req.locals.settings.transform());

exports.getReferralInfo = async (req, res) =>  {
  try {
    const settings = await Settings.findOne();
     let data = {
      referralCredits: settings.referralCredits,
      referrarCredits: settings.referrarCredits
     }
     res.json(data)
  } catch (error) {
    return next(error);
  }
}


/**
 * Update existing settings
 * @public
 */
exports.update = (req, res, next) => {
  
  Settings.findOneAndUpdate({},req.body,{upsert:true})
    .then((savedSettings) => {
      let s = savedSettings.transform();
      const resp = Object.assign(s, req.body);
      console.log(resp)
      res.json(resp)
    })
    .catch((e) => next(e));
};

/**
 * Get settings list
 * @public
 */
exports.read = async (req, res, next) => {
  try {
    const settings = await Settings.findOne();
    //const transformedSettingss = settingss.map((settings) => settings.transform());
    res.json(settings.transform());
  } catch (error) {
    next(error);
  }
};
