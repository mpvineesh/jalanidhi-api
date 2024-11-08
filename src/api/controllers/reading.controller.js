const httpStatus = require("http-status");
const mongoose = require('mongoose');
const { omit } = require("lodash");
const Reading = require("../models/reading.model");
const APIError = require("../errors/api-error");
/**
 * Load reading and append to req.
 * @public
 */

const months = [
  "January", 
  "February", 
  "March", 
  "April", 
  "May", 
  "June", 
  "July", 
  "August", 
  "September", 
  "October", 
  "November", 
  "December"
];
exports.load = async (req, res, next, id) => {
  try {
    const reading = await Reading.get(id);
    req.locals = { reading };
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Get reading
 * @public
 */
exports.get = (req, res) => res.json(req.locals.reading.transform());

/**
 * Create new reading
 * @public
 */
exports.create = async (req, res, next) => {
  const exist = await Reading.findOne({ month: req.body.month, userId: mongoose.Types.ObjectId(req.body.userId)});
  if (exist) {
    let e = new APIError({
      message: "Already added the reading",
      status: httpStatus.CONFLICT,
    });
    next(e);
  } else {
    try {
      const currentMonthIdx = months.indexOf(req.body.month);
      let lastMonth = months[currentMonthIdx > 0? currentMonthIdx-1: 11]
      const lastMonthReading = await Reading.find({ month: lastMonth, userId: req.body.userId}).sort({ createdAt: -1 })
      let lastReading = 0
      if(lastMonthReading.length >= 1) {
        lastReading = lastMonthReading[0].value;
      }
      let usage = req.body.value - lastReading;
      let charges = usage*2;
      req.body['charge'] = charges;
      const reading = new Reading(req.body);
      const savedReading = await reading.save();
      res.status(httpStatus.CREATED);
      res.json(savedReading.transform());
    } catch (error) {
      console.log("Error", error);
      next(true);
    }
  }
};

/**
 * Create new readings
 * @public
 */
exports.bulkInsert = async (req, res, next) => {
  try {
    const savedReadings = await Reading.insertMany(req.body);
    res.status(httpStatus.CREATED);
    res.json(savedReadings.map((p) => p.transform()));
  } catch (error) {
    console.log("Error", error);
    next(true);
  }
};

/**
 * Update existing reading
 * @public
 */
exports.update = (req, res, next) => {
  const updatedReading = req.body;
  const reading = Object.assign(req.locals.reading, updatedReading);

  reading
    .save()
    .then((savedReading) => res.json(savedReading.transform()))
    .catch((e) => next(e));
};

/**
 * Get reading list
 * @public
 */
exports.list = async (req, res, next) => {
  try {
    const readings = await Reading.list(req.query);
    const transformedReadings = readings.map((reading) => reading.transform());
    res.json(transformedReadings);
  } catch (error) {
    next(error);
  }
};

/**
 * Delete reading
 * @public
 */
exports.remove = (req, res, next) => {
  const { reading } = req.locals;
  let campaigns = Campaign.find({ "readings.readingId": reading.id });
  if (campaigns.length) {
    let e = new APIError({
      message:
        "Failed to delete since there are some campaigns with this reading.",
      status: httpStatus.BAD_REQUEST,
    });
    next(e);
  } else {
    reading
      .remove()
      .then(() => res.status(httpStatus.NO_CONTENT).end())
      .catch((e) => next(e));
  }
};

exports.bulkInsertUpdate = async (req, res, next) => {
  try {
    let payload = req.body;
    let updates = [];
    for (let i = 0; i < payload.length; i++) {
      let data = payload[i];
      if (data.id) {
        let update = Reading.updateOne(
          { _id: data.id },
          { marketPrice: data.marketPrice, groupPrice: data.groupPrice }
        );
        updates.push(update);
      } else {
        let p = new Reading(data);
        updates.push(p.save());
      }
    }
    Promise.all(updates)
      .then(() => res.status(httpStatus.OK).end())
      .catch((e) => next(e));
    //res.status(httpStatus.CREATED);
    //res.json(savedReadings.map(p => p.transform()));
  } catch (error) {
    console.log("Error", error);
    next(true);
  }
};
