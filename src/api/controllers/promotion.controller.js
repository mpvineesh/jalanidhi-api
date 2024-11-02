const httpStatus = require("http-status");
const { omit } = require("lodash");
const Promotion = require("../models/promotion.model");
const mongoose = require('mongoose');

/**
 * Load promotion and append to req.
 * @public
 */
exports.load = async (req, res, next, id) => {
  try {
    const promotion = await Promotion.get(id);
    req.locals = { promotion };
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Get promotion
 * @public
 */
exports.get = (req, res) => res.json(req.locals.promotion.transform());

/**
 * Create new promotion
 * @public
 */
exports.create = async (req, res, next) => {
  try {
    const promotion = new Promotion(req.body);
    const savedPromotion = await promotion.save();
    res.status(httpStatus.CREATED);
    res.json(savedPromotion.transform());
  } catch (error) {
    console.log("Error create", error);
    next(error);
  }
};

/**
 * Update existing promotion
 * @public
 */
exports.update = (req, res, next) => {
  //req.body['type'] = req.body['type'] || 'campaign';
  const updatedPromotion = req.body;
  const promotion = Object.assign(req.locals.promotion, updatedPromotion);

  promotion
    .save()
    .then((savedPromotion) => res.json(savedPromotion.transform()))
    .catch((e) => next(e));
};

/**
 * Get promotion list
 * @public
 */
exports.list = async (req, res, next) => {
  try {
    const query = {...req.query}
    if (req.query.apartmentId) {
      query["apartmentId"] =  mongoose.Types.ObjectId(req.query.apartmentId);
      delete req.query.apartmentId;
    }
    const promotions = await Promotion.list(query);
   
    const transformedPromotions = promotions.map((promotion) =>
      promotion.transform()
    );
    res.json(transformedPromotions);
  } catch (error) {
    next(error);
  }
};

exports.listNew = async (req, res, next) => {
  let minCampaignsCount = 0
  let campaignFilter = {};
  if (req.query.apartment) {
    campaignFilter["apartments"] =  mongoose.Types.ObjectId(req.query.apartment);
   delete req.query.apartment;
  }
  try {
    let promotions = await Promotion.aggregate([
      {
        $match: req.query,
      },

      {
        $lookup: {
          from: "campaigns",
          localField: "name",
          foreignField: "promotion",
          //let: { promotionName: "$name" },
          // pipeline: [
          //   {
          //     $match: {

          //       $expr: {
          //         $in: [ "$$promotionName", "$promotion" ]
          //       }
          //     },
          //   },

          // ],
          as: "campaigns",
          pipeline: [
            {
              $match: campaignFilter,
            },
          ],
        },
      },
      {
        $set: {
          campaignsCount: { $size: "$campaigns" },
        },
      },
      {
        $set: {
          id: "$_id",
        },
      },
      {
        $match: {
          $expr: {
            $gt: ["$campaignsCount", minCampaignsCount],
          },
        },
      },
      {
        $project: {
          name: 1,
          id: 1,
          image: 1,
          campaignsCount: 1
        },
      },
    ]).exec();
    res.json(promotions);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete promotion
 * @public
 */
exports.remove = (req, res, next) => {
  const { promotion } = req.locals;

  promotion
    .remove()
    .then(() => res.status(httpStatus.NO_CONTENT).end())
    .catch((e) => next(e));
};
