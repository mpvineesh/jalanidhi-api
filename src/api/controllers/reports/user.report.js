const httpStatus = require("http-status");
const { omit } = require("lodash");
const Order = require("../../models/order.model");
const Campaign = require("../../models/campaign.model");
const User = require("../../models/user.model");
const mongoose = require("mongoose");
const excelJS = require("exceljs");
const path = require("path");
const moment = require("moment");
var fs = require("fs");
const { env} = require('../../../config/vars');
/**
 * Customer Delivery Report
 * @public
 */
exports.getReferralReport = async (req, res, next) => {
  try {
    //console.log("req", req);
    let loggedInUser = req.user;
    let query = {};

    let today = new Date();
    let before30Days = new Date();
    before30Days.setDate(before30Days.getDate() - 300);

    if (req.body.startedAfter) {
      query["createdAt"] = { $gte: new Date(req.body.startedAfter) };
    }
    if (req.body.startedBefore) {
      query["createdAt"] = { $lte: new Date(req.body.startedBefore) };
    }
    if (!req.body.startedAfter && !req.body.startedBefore) {
      query["createdAt"] = { $gte: before30Days };
    }

    let workbook = await fetchReferralData(query);
    /****** Create excel *********** */

    let fileName = "ReferralReport_" + moment(new Date()).format("DDMMYYYY");

    try {
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=" + fileName + ".xlsx"
      );
      //workbook.xlsx.writeFile(dirPath+'/'+fileName+'.xlsx');
      return workbook.xlsx.write(res).then(function () {
        res.status(200).end();
      });
    } catch (err) {
      console.log(err);
      res.send({
        status: "error",
        message: "Something went wrong",
      });
    }
  } catch (error) {
    console.log(error);
    return next(error);
  }
};

/**
 * Customer Delivery Report Apartment Level
 * @public
 */
async function fetchReferralData(query) {
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
              $and: [
                {$expr: { $eq: ["$$userId", "$userId"] }},
                {$expr: { $eq: ["$status", "Confirmed"] }}
              ]
              
            },
          },
          { $sort: { createdAt: -1 } },
        ],
        as: "walletLogs",
      },
    },

    {
      $lookup: {
        from: "users",
        let: {
          userId: {
            $cond: { if: "$referredBy", then: "$referredBy", else: null },
          },
        },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$$userId", "$_id"] },
            },
          },
          {
            $project: {
              name: true,
              mobile: true,
              email: true,
              referredBy: true,
              referralCode: true,
            },
          },
        ],
        as: "referredByUser",
      },
    },
    {
      $lookup: {
        from: "users",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$$userId", "$referredBy"] },
            },
          },
          {
            $project: {
              name: true,
              mobile: true,
              email: true,
              referredBy: true,
              referralCode: true,
              createdAt: true,
            },
          },
        ],
        as: "referredUsers",
      },
    },

    {
      $project: {
        name: true,
        mobile: true,
        email: true,
        referredBy: true,
        createdAt: true,
        referralCode: true,
        walletLogs: true,
        referredByUser: true,
        referredUsers: true,
        walletCredits: true,
        //referredBy: $referredByUser.name
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
  ]);

  //res.json(formatted);
  let formatted = users.map((u) => {
    let data = {
      name: u.name,
      mobile: u.mobile,
      email: u.email,
      referredBy:
        u.referredByUser && u.referredByUser.length
          ? `${u.referredByUser[0].name}(${u.referredByUser[0].mobile})`
          : "",
      referralCode: u.referralCode,
      walletCredits: u.walletCredits,
      id: u._id,
      //referredBy: u.referredBy
    };
    let referralCredits = u.walletLogs
      .filter((l) => l.type == "Referral")
      .reduce((acc, l) => {
        return acc + l.credits;
      }, 0);

    let signupCredits = u.walletLogs
      .filter((l) => l.type == "Signup")
      .reduce((acc, l) => {
        return acc + l.credits;
      }, 0);
    let topupCredits = u.walletLogs
      .filter((l) => l.type == "Topup")
      .reduce((acc, l) => {
        return acc + l.credits;
      }, 0);

    let refund = u.walletLogs
      .filter((l) => l.type == "Refund")
      .reduce((acc, l) => {
        return acc + l.credits;
      }, 0);
    let usedCredits = u.walletLogs
      .filter((l) => l.type == "Debit")
      .reduce((acc, l) => {
        return acc + l.credits;
      }, 0);
    let creditUsage = u.walletLogs.filter((l) => l.type == "Debit");

    data["referralCredits"] = referralCredits;
    data["signupCredits"] = signupCredits;
    data["totalUsed"] = usedCredits;
    data["refunds"] = refund;
    data["referalCount"] = u.referredUsers.length;
    data["usedCredits"] = usedCredits - +refund;
    data["topupCredits"] = topupCredits;
    data["createdAt"] = moment(u["createdAt"]).format("YYYY-MMM-DD");
    let matches =
      +referralCredits + +signupCredits - +data["usedCredits"] ==
      +u.walletCredits;
    data["matches"] = matches.toString();
    //data['lastUsed'] =  creditUsage && creditUsage.length ? moment(creditUsage[0]['createdAt']).format('YYYY-MMM-DD') : 'Never'
    const creditedOn = moment(u["createdAt"]);
    const lastUsed =
      creditUsage && creditUsage.length
        ? moment(creditUsage[0]["createdAt"])
        : moment(new Date());
    data["lastUsed"] = lastUsed.diff(creditedOn, "days") + " days";
    let balance = Number(
      Number(referralCredits) - (Number(usedCredits) + Number(u.walletCredits))
    );
    /*
    if(!matches && balance > 0){
      let id = u._id;
      let user = await User.findById(id);
      //await User.updateOne({_id: id},  {walletCredits: (user.walletCredits||0) + +balance})
      console.log('Balance:'+u.name, balance)
      console.log('User '+id+'  updated balance is ' +((user.walletCredits||0) + +balance) + ' Prev balance is '+user.walletCredits)
    } else if(balance< 0){
      console.log('need to check')
    }
    */
    return data;
  });

  const dirPath = path.join(__dirname, "../../../../files/");
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
  }

  const workbook = new excelJS.Workbook(); // Create a new workbook

  const worksheet = workbook.addWorksheet(`Users`);
  let columns = [
    { header: "Name", key: "name", width: 25 },
    { header: "Mobile", key: "mobile", width: 14 },
    { header: "Email", key: "email", width: 30 },
    { header: "Registered On", key: "createdAt", width: 14 },
    { header: "ReferredBy", key: "referredBy", width: 30 },
    { header: "Referral Code", key: "referralCode", width: 15 },
    { header: "Referral Credits", key: "referralCredits", width: 14 },
    { header: "Signup Credits", key: "signupCredits", width: 14 },
    { header: "Topup Credits", key: "topupCredits", width: 14 },
    { header: "Used for Orders", key: "totalUsed", width: 14 },
    { header: "Refunds", key: "refunds", width: 10 },
    { header: "ReferalCount", key: "referalCount", width: 14 },
    { header: "Used Credits", key: "usedCredits", width: 14 },
    { header: "Wallet Balance", key: "walletCredits", width: 14 },
    { header: "Last Used", key: "lastUsed", width: 10 },
  ];
  if(env !== 'production'){
    columns.push({ header: "Matches?", key: "matches", width: 10 },)
  }
  worksheet.columns = columns
  formatted.forEach((data) => {
    worksheet.addRow(data);
  });

  return workbook;
  //res.json(formatted);
}

exports.getDailyReferralData = async () => {
  try {
    //console.log("req", req);
    //let loggedInUser = req.user;
    let query = {};

    let today = new Date();
    let before1Day = new Date();
    before1Day.setDate(before1Day.getDate() - 1);

    query["createdAt"] = { $gte: before1Day };

    let workbook = await fetchReferralData(query);
    /****** Create excel *********** */
    const dirPath = path.join(__dirname, "../../../../files/");
    let fileName = "ReferralReport_" + moment(new Date()).format("DDMMYYYY");

    try {
      
      await workbook.xlsx.writeFile(dirPath+'/'+fileName+'.xlsx');
      // return workbook.xlsx.write(res).then(function () {
      //   res.status(200).end();
      // });
      return dirPath+'/'+fileName+'.xlsx';
    } catch (err) {
      console.log(err);
      let resp = {
        status: "error",
        message: "Something went wrong",
      }
      return resp;
     
    }
  } catch (error) {
    let resp = {
      status: "error",
      message: "Something went wrong",
    }
    return resp;
  }
};

function formatProductObj(product) {
  let name = product.name;
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
      product.productId = `${product.productId}${product.attributes[i].value}`;
    }
    product.name = `${product.name} (${addOns})`;
  }
  return product;
}
