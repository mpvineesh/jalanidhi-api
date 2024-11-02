const httpStatus = require('http-status');
const { omit } = require('lodash');
const User = require('../models/user.model');
const APIError = require('../errors/api-error');
const Settings = require('../models/settings.model');
const appUtils = require('../utils/appUtils');
const Jobs = require('../utils/jobs');
/**
 * Load user and append to req.
 * @public
 */
Jobs.createAdminUser();

exports.load = async (req, res, next, id) => {
  try {
    const user = await User.get(id);
    req.locals = { user };
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Get user
 * @public
 */
exports.get = (req, res) => res.json(req.locals.user.transform());

/**
 * Get logged in user info
 * @public
 */
exports.loggedIn = (req, res) => res.json(req.user.transform());

/**
 * Create new user
 * @public
 */
exports.create = async (req, res, next) => {
  try {
    const exist = await User.findOne({mobile: req.body.mobile});
    if(exist) {
      let e = new APIError({
        message: 'User with same mobile exist',
        status: httpStatus.CONFLICT,
      });
      next(e)
    } else {
      //check if referral code exists
      
      const user = await new User(req.body).save();
      logger.info('Created new user: '+ JSON.stringify(req.body))
       

      res.status(httpStatus.CREATED);
      res.json(user.transform());
  }
  } catch (error) {
    console.log(error);
    next(User.checkDuplicateEmail(error));
  }
};

/**
 * Replace existing user
 * @public
 */
exports.replace = async (req, res, next) => {
  try {
    const { user } = req.locals;
    const newUser = new User(req.body);
    const ommitRole = user.role !== 'admin' ? 'role' : '';
    const newUserObject = omit(newUser.toObject(), '_id', ommitRole);

    await user.updateOne(newUserObject, { override: true, upsert: true });
    const savedUser = await User.findById(user._id);

    res.json(savedUser.transform());
  } catch (error) {
    next(User.checkDuplicateEmail(error));
  }
};

/**
 * Update existing user
 * @public
 */
exports.update = (req, res, next) => {
  const ommitRole = req.locals.user.role !== 'admin' ? 'role' : '';
  let updatedUser = omit(req.body, ommitRole);
  //updatedUser = omit(req.body, 'email');
  updatedUser = omit(req.body, 'mobile');
  const user = Object.assign(req.locals.user, updatedUser);
  user.save()
    .then(async (savedUser) => {
      let u = savedUser.transform()
      for(let i = 0; i < u.address.length; i++) {
        let address = u.address[i].toJSON();
        let apartment = await Apartment.findOne({'name': u.address[i].apartment});
        //console.log('apartment ', apartment._id)
        address['apartmentId'] = apartment? apartment._id : 123;
        u.address[i] = address;
      }

      res.json(u)
    })
    .catch((e) => next(e));
};


/**
 * Update existing user's address
 * @public
 */
exports.updateAddress = async (req, res, next) => {
  try{
    let userAddresses = req.locals.user.address;
    let index = userAddresses.findIndex(address => address._id.toString() === req.params.addressId.toString());
    let addr = userAddresses[index].toJSON();
    addressToUpdate = {...addr, ...req.body}
    userAddresses[index] = addressToUpdate;
    const user = Object.assign(req.locals.user, {address: userAddresses});
    let apartment = await Apartment.findOne({name: req.body.apartment.trim()});
    // console.log(apartment)
    // console.log('user', user)
    if(apartment) {
      user.save()
        .then((savedUser) => {
          let address = {...req.body};
          let addresses = savedUser.address;
          //let updatedAddress = addresses.filter(address => address.flatNo === req.body.flatNo)[0].toJSON();
          addressToUpdate['apartmentId'] = apartment._id;
          res.json(addressToUpdate)
        })
        .catch((e) => next(User.checkDuplicateEmail(e)));
    } else {
      let e = new APIError({
        message: 'Invalid Apartment',
        status: httpStatus.CONFLICT,
      });
      next(e)
    }
  } catch(err){
    next(err)
  }
};

exports.deleteAddress = (req, res, next) => {
  const user = req.locals.user;
  
  User.updateOne({ _id: req.params.userId }, {
    $pull: {
        address: {_id: req.params.addressId},
    },
  }).then(resp => {
   
    res.status(httpStatus.OK).end();
  }).catch((e) => next(e));

  // const address = req.body;
  // let addresses = user.address.filter(a => !(a.apartment == address.apartment && a.flatNo == address.flatNo && a.tower == address.tower))
  
  // user.address = addresses;
  // console.log('addresses', addresses, user)
  // user.save()
  //   .then((savedUser) => res.json(savedUser.transform()))
  //   .catch((e) => next(e));
};

exports.addAddress = async (req, res, next) => {
  const user = req.locals.user;
  let apartment = await Apartment.findOne({name: req.body.apartment.trim()});

  if(apartment) {

    user.address.push(req.body)
    let address = req.body;
    address['apartmentId'] = apartment._id;
    user.save()
      .then((savedUser) => {
        let addresses = savedUser.address;
        let updatedAddress = addresses.filter(address => address.flatNo === req.body.flatNo)[0].toJSON();
        updatedAddress['apartmentId'] = apartment._id;

        res.json(updatedAddress)
      })
      .catch((e) => next(User.checkDuplicateEmail(e)));
  }  else {
    let e = new APIError({
      message: 'Invalid Apartment',
      status: httpStatus.CONFLICT,
    });
    next(e)
  }
};

/**
 * Get user list
 * @public
 */
exports.list = async (req, res, next) => {
  try {
    const users = await User.list(req.query);
    const transformedUsers = users.map((user) => user.transform());
    res.json(transformedUsers);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete user
 * @public
 */
exports.remove = (req, res, next) => {
  const { user } = req.locals;

  user.remove()
    .then(() => res.status(httpStatus.NO_CONTENT).end())
    .catch((e) => next(e));
};

exports.getFavouriteCampaigns = async (req, res, next) => {
  try {
    let loggedInUser = req.user;
    const userId =loggedInUser.id;
    const user = await User.findById(userId).populate('favouriteCampaigns')
    let favouriteCampaigns = user.favouriteCampaigns;
    res.json(favouriteCampaigns);
  } catch (error) {
    next(error);
  }
}


exports.removeFavouriteCampaigns = async (req, res, next) => {
  try {
  const user = req.user;
  let favouriteCampaigns = user.favouriteCampaigns;
  const updatedFavouriteCampaigns = favouriteCampaigns.filter(c => c!== null).map(c => c.toString()).filter(c => req.body.campaignId.toString() !== c);

  user['favouriteCampaigns'] = updatedFavouriteCampaigns;
  await user.save()
  res.status(httpStatus.OK).send()
  } catch (error) {
    next(error);
  }
}


exports.addFavouriteCampaigns = async  (req, res, next) => {
  try {
  const user = req.user;
  let favouriteCampaigns = user.favouriteCampaigns;
  const exist = favouriteCampaigns.filter(c => c!== null).map(c => c.toString()).indexOf(req.body.campaignId) > -1;
  if(!exist) {
    favouriteCampaigns.push(req.body.campaignId)
  }
  user['favouriteCampaigns'] = favouriteCampaigns;
  await user.save()
  res.status(httpStatus.OK).send()
  } catch (error) {
    next(error);
  }
}


exports.registerFirebaseToken = async  (req, res, next) => {
  try {
    console.log('req.body.token',req.body.token)
    let uniqueId = req.body.token.replace(':','')
    req.body['uniqueId'] = uniqueId;
    let exist = await FirebaseToken.find({uniqueId:uniqueId});
    console.log('exists', exist)
    if(!exist.length) {
      console.log(req.body)
      let firebaseToken = new FirebaseToken(req.body)
      await firebaseToken.save()
      res.json(firebaseToken)
      //res.status(httpStatus.OK).send()
    } else {
      let e = new APIError({
        message: 'Already registered',
        status: httpStatus.CONFLICT,
      });
      next(e)
     
    }
    
  } catch (error) {
    next(error);
  }
}