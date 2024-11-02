const httpStatus = require("http-status");
const { omit } = require("lodash");
const Order = require("../../models/order.model");
const Transaction = require("../../models/transaction.model");
const Campaign = require("../../models/campaign.model");
const User = require("../../models/user.model");
const mongoose = require("mongoose");
const excelJS = require("exceljs");
const path = require("path");
const moment = require("moment");
var fs = require("fs");
/**
 * Customer Delivery Report
 * @public
 */
exports.getTransactionReport = async (req, res, next) => {
  try {
    //console.log("req", req);
    let loggedInUser = req.user;
    let query = {};
    let d = new Date()
    
    let today = new Date();
    let before30Days = new Date();
    before30Days.setDate(before30Days.getDate() - 0);

    const d1 = new Date(today.getFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0);

    var m = moment(before30Days).utc().format('YYYY-MM-DD HH:mm:ss');
    let dateRangeStr = ''
    if (req.query.from) {
      let d = new Date(req.query.from)
      dateRangeStr = `From ${moment(d).format('YYYY-MM-DD')}`
      query["createdAt"] = { $gte: new Date(d.getFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0) };
    }
    if (req.query.to) {
      
      let d = new Date(req.query.to)
      if(dateRangeStr.length) dateRangeStr+= ' - '
      dateRangeStr = `To ${moment(d).format('YYYY-MM-DD')}`
      query["createdAt"] = { $lte: new Date(d.getFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0) };
    }
    if (!req.query.from && !req.query.to) {
      dateRangeStr = `${moment(d1).format('YYYY MMM DD')}`
      query["createdAt"] = { $gte: d1 };
    }

    let {orders, workbook} = await fetchTransactionData(query, dateRangeStr);
    //res.json(orders);
    /****** Create excel *********** */

    let fileName = "TransactionReport_" + moment(new Date()).format("DDMMYYYY");

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

async function fetchTransactionData(query, dateRangeStr) {
  let orders = await Order.aggregate([
    {
      $match: query,
    },
    {
        $addFields: {
          strOrderId: { $toString: "$_id" }
      }
    },
    {
      $lookup: {
        from: "walletlogs",
        let: { userId: "$customerId", orderId: "$strOrderId" },
        pipeline: [
          {
            $match: {
              $and: [
                {$expr: { $eq: ["$$userId", "$userId"] }},
                {$expr: { $eq: ["$status", "Confirmed"] }},
                {$expr: { $eq: ["$$orderId", "$refId"] }}
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
        let: { userId: "$customerId" },
        
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
              walletCredits:true
            },
          },
        ],
        as: "customer",
      },
    },
    {
      $unwind: {
        path: "$customer",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "transactions",
        let: { orderId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$$orderId", "$orderId"] },
            },
          },
          
        ],
        as: "transaction",
      },
    },
    {
      $unwind: {
        path: "$transaction",
        preserveNullAndEmptyArrays: true,
      },
    },

    // {
    //   $project: {
    //     name: true,
    //     mobile: true,
    //     email: true,
    //     referredBy: true,
    //     createdAt: true,
    //     referralCode: true,
    //     walletLogs: true,
    //     referredByUser: true,
    //     referredUsers: true,
    //     walletCredits: true,
    //     //referredBy: $referredByUser.name
    //   },
    // },
    {
      $sort: {
        createdAt: -1,
      },
    },
  ]);
console.log('Records', orders.length)
  //res.json(formatted);
  let formatted = orders.map((o) => {
    let paymentBreakUp = o.transaction && o.transaction.paymentMethods? o.transaction.paymentMethods : []
    let walletTxn = paymentBreakUp.find( m => m.method === 'Wallet')
    let cashfreeTxn = paymentBreakUp.find( m => m.method === 'Cashfree')
    let walletAmount = walletTxn ? walletTxn.amount : 0
    let cashfreeAmount = cashfreeTxn ? cashfreeTxn.amount : 0
    let data = {
      orderId: o.orderId,
      orderStatus: o.status,
      orderTotal: o.total,
      walletCreditsUsed:walletAmount,
      cashfreeAmount:cashfreeAmount,
      customerMobile:o.customer.mobile,
      customerName:o.customer.name,
      customerWalletBalance:o.customer.walletCredits,
    };
    let refunds = o.walletLogs
      .filter((l) => l.type == "Refund")
      .reduce((acc, l) => {
        return acc + l.credits;
      }, 0);
    data["refunds"] = refunds;

    // let signupCredits = u.walletLogs
    //   .filter((l) => l.type == "Signup")
    //   .reduce((acc, l) => {
    //     return acc + l.credits;
    //   }, 0);

    // let refund = u.walletLogs
    //   .filter((l) => l.type == "Refund")
    //   .reduce((acc, l) => {
    //     return acc + l.credits;
    //   }, 0);
    // let usedCredits = u.walletLogs
    //   .filter((l) => l.type == "Debit")
    //   .reduce((acc, l) => {
    //     return acc + l.credits;
    //   }, 0);
    // let creditUsage = u.walletLogs.filter((l) => l.type == "Debit");

    // data["referralCredits"] = referralCredits;
    // data["signupCredits"] = signupCredits;
    // data["totalUsed"] = usedCredits;
    // data["refunds"] = refund;
    // data["referalCount"] = u.referredUsers.length;
    // data["usedCredits"] = usedCredits - +refund;
    // data["createdAt"] = moment(u["createdAt"]).format("YYYY-MMM-DD");
    // let matches =
    //   +referralCredits + +signupCredits - +data["usedCredits"] ==
    //   +u.walletCredits;
    // data["matches"] = matches.toString();
    // //data['lastUsed'] =  creditUsage && creditUsage.length ? moment(creditUsage[0]['createdAt']).format('YYYY-MMM-DD') : 'Never'
    // const creditedOn = moment(u["createdAt"]);
    // const lastUsed =
    //   creditUsage && creditUsage.length
    //     ? moment(creditUsage[0]["createdAt"])
    //     : moment(new Date());
    // data["lastUsed"] = lastUsed.diff(creditedOn, "days") + " days";
    // let balance = Number(
    //   Number(referralCredits) - (Number(usedCredits) + Number(u.walletCredits))
    // );
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
    { header: "Order Id", key: "orderId", width: 16 },
    { header: "Order Status", key: "orderStatus", width: 14 },
    { header: "Customer Name", key: "customerName", width: 18 },
    { header: "Customer Mobile", key: "customerMobile", width: 18 },
    { header: "Total Amount", key: "orderTotal", width: 18 },
    { header: "Wallet Credit Used", key: "walletCreditsUsed", width: 18 },
    { header: "Cashfree Amount", key: "cashfreeAmount", width: 18 },
    { header: "Wallet Refunds", key: "refunds", width: 18 },
    { header: "Wallet Balance", key: "customerWalletBalance", width: 18 },
   
  ];

  worksheet.columns = columns.map(c => ({key: c.key}))

  worksheet.addRow({});
  worksheet.addRow({});
  worksheet.addRow({});

  const status = ['Confirmed', 'OutForDelivery', 'Delivered','PartialDelivery'];

  //Summary
  let confirmedOrders = formatted.filter(txn => status.indexOf(txn.orderStatus) !== -1)
  let totalCashfreeAmount = confirmedOrders.reduce((acc, txn) => {
      return acc + txn.cashfreeAmount
  }, 0);
  let totalWalletAmount = confirmedOrders.reduce((acc, txn) => {
    return acc + txn.walletCreditsUsed
  }, 0);
  const START = 2
  let rowNum =START
  worksheet.mergeCells(`A${rowNum}`, `B${rowNum}`);
  worksheet.getCell(`A${rowNum}`).value = 'Date'
  worksheet.getCell(`C${rowNum}`).value = dateRangeStr
  rowNum++
  worksheet.mergeCells(`A${rowNum}`, `B${rowNum}`);
  worksheet.getCell(`A${rowNum}`).value = 'Total Confirmed Orders'
  worksheet.getCell(`C${rowNum}`).value = confirmedOrders.length
  rowNum++
  worksheet.mergeCells(`A${rowNum}`, `B${rowNum}`);
  worksheet.getCell(`A${rowNum}`).value = 'Total Cashfree Amount'
  worksheet.getCell(`C${rowNum}`).value = Number((totalCashfreeAmount - confirmedOrders.length*0.01).toFixed(2))
  rowNum++
  worksheet.mergeCells(`A${rowNum}`, `B${rowNum}`);
  worksheet.getCell(`A${rowNum}`) .value = 'Total Wallet Amount'
  worksheet.getCell(`C${rowNum}`).value = totalWalletAmount
  for(let i = START; i <=rowNum; i++){
    worksheet.getRow(i).eachCell((cell) => {
      cell.font = { bold: true, size: 13 };
    });
  }
  

  rowNum+=3
  let headers = columns.map(c => c.header)
  worksheet.getRow(rowNum).values = headers;

  worksheet.getRow(rowNum).eachCell((cell) => {
    cell.font = { bold: true };
    cell.width = 30
  });
  worksheet.columns.forEach(function (column, i) {
    column.width = columns[i].width || 30
  })
  
  // worksheet.getColumn(2).width = 30;
  // worksheet.getColumn(3).width = 30;

  // worksheet.getRow(2).eachCell((cell) => {
  //   cell.font = { bold: true };
  // });



  
  formatted.forEach((data) => {
    worksheet.addRow(data);
  });

  return {orders, workbook};
  //res.json(formatted);
}
