const httpStatus = require("http-status");
const { omit } = require("lodash");
const Order = require("../../models/order.model");
const Campaign = require("../../models/campaign.model");
const mongoose = require("mongoose");
const excelJS = require("exceljs");
const path = require("path");
const moment = require("moment");
var fs = require("fs");
/**
 * Customer Delivery Report
 * @public
 */
exports.getCampaignRevenueReport = async (req, res, next) => {
  try {
    //console.log("req", req);
    let loggedInUser = req.user;
    let query = {};
    if (req.body.campaignIds) {
      query["campaigns.campaignId"] = { $in: req.body.campaignIds.map(mongoose.Types.ObjectId) };
      query["status"] = { $in: ['Confirmed',  'OutForDelivery', 'Delivered'] };
    }
    let today =  new Date()
    let before30Days = new Date()
    before30Days.setDate(before30Days.getDay()-30);
    
    if (req.body.startedAfter) {
      query['createdAt'] = { $gte: new Date(req.body.startedAfter) } 
    }
    if (req.body.startedBefore) {
      query['createdAt'] = { $lte: new Date(req.body.startedBefore) } 
    }
    if(!req.body.startedAfter && !req.body.startedBefore) {
      query['createdAt'] = { $gte: before30Days } 
    }

    let clusterIds = req.body.clusterIds ? req.body.clusterIds : [];
    let apartmentSets = req.body.apartmentSets ? req.body.apartmentSets : [];
    let fileName = "Revenue_Report_"+moment(new Date()).format('DDMMYYYY');
   
    let orders = await Order.aggregate([
      {
        $match: query,
      },
      {
        $unwind: "$address",
      },
      {
        $set: {
          apartmentName: "$address.apartment",
        },
      },
      {
        $lookup: {
          from: "apartments",
          let: { apartment: "$address.apartment" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$$apartment", "$name"] },
              },
            },
          ],
          as: "apartment",
        },
      },

      {
        $unwind: {
          path: "$apartment",
          preserveNullAndEmptyArrays: false,
        },
      },
      
    ]);


    let campaignIds = req.body.campaignIds || []
    console.log('Records found:', orders.length, query);
    let campaigns = {}
    
    let campaignList = await Campaign.find()

    campaignList = campaignList.reduce((acc, c) => {
      acc[c._id.toString()] = {
        createdAt: c.createdAt,
        endTime: c.endTime
      }
      return acc
    },{})

    orders.forEach(( o, idx) => {
      let products = [];
      o.campaigns.forEach(async (c) => {
        let cId = c.campaignId.toString()
       
        if(campaignIds.indexOf(c.campaignId.toString()) !== -1 || campaignIds.length == 0) {
          if(campaigns[cId]) {
            campaigns[cId].revenue =  (campaigns[cId].revenue||0)  + c.amount;
            campaigns[cId].orderCount = campaigns[cId].orderCount+1;
            let cProducts = campaigns[cId].products;
            c.products.forEach((p) => {
              //console.log('cProducts', cProducts, p.productId.toString(), cProducts[p.productId.toString()])
              if(cProducts[p.productId.toString()]) {
                cProducts[p.productId.toString()].revenue = cProducts[p.productId.toString()].revenue + (p.total||0)
              } else {
                cProducts[p.productId.toString()] = {
                  productName: p.name,
                  revenue: p.total||0
                }
              }
            })
          } else {
            let products = c.products.reduce((acc,product) => {
              acc[product.productId.toString()]= {
                productName: product.name,
                revenue: product.total||0
              }
              return acc;
            },{})
            campaigns[cId] = {
              campaignName: c.name,
              orderCount: 1,
              startedOn: moment(campaignList[cId].createdAt).format("Do MMM YYYY"),
              endTime: moment(campaignList[cId].endTime).format("Do MMM YYYY"),
              revenue: c.amount||0,
              products: products
            }
          }

        }
      });
    });
   
  //  console.log('formatted', campaigns)
  //   res.json(campaigns);
    /****** Create excel *********** */
 
    const dirPath = path.join(__dirname, "../../../../files/");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }

    const workbook = new excelJS.Workbook(); // Create a new workbook
    let campaignsFormatted = Object.values(campaigns)
    campaignsFormatted = campaignsFormatted.map(c => {
      c.products = Object.values(c.products)
      return c;
    })
    //res.json(campaignsFormatted);
    let sheets = campaignsFormatted
    
    //console.log('shee', sheets)
    //res.json(sheets);
    if(sheets.length) {
        for (let s = 0; s < sheets.length; s++) {
          
            sheetData = sheets[s];
            const worksheet = workbook.addWorksheet(
              `${sheetData.campaignName.replace(/[&\/\\#,+()$~%.'":*?<>{}]/g,'_')} ${sheetData.startedOn}`
            );
           
 
            worksheet.getCell('A1').value = `Campaign Name`
            worksheet.getCell('B1').value = `${sheetData.campaignName}`
            worksheet.getCell('A2').value = `Started On`
            worksheet.getCell('B2').value = `${sheetData.startedOn}`
            worksheet.getCell('A3').value = `Completed On`
            worksheet.getCell('B3').value = `${sheetData.endTime}`

            worksheet.getCell('A4').value = `Revenue`
            worksheet.getCell('B4').value = sheetData.revenue

            worksheet.getCell('A5').value = `Total Number of Orders`
            worksheet.getCell('B5').value = sheetData.orderCount

            
            worksheet.getRow(1).eachCell((cell) => {
              cell.font = { bold: true };
            });
            
            worksheet.getColumn(2).width = 30;
            worksheet.getColumn(3).width = 30;

            worksheet.getRow(2).eachCell((cell) => {
              cell.font = { bold: true };
            });

            worksheet.getRow(3).eachCell((cell) => {
              cell.font = { bold: true };
            });
            worksheet.getRow(4).eachCell((cell) => {
              cell.font = { bold: true };
            });
            worksheet.getRow(5).eachCell((cell) => {
              cell.font = { bold: true };
            });

            
            //worksheet.columns[2].width = 30
            worksheet.getRow(7).values = ['Product', 'Revenue'];
            worksheet.getRow(7).eachCell((cell) => {
              cell.font = { bold: true };
            });
            worksheet.columns = [
              { key: "productName", width: 30 },
              { key: "revenue", width: 20 },
            ];
            sheetData.products.forEach(function(product, index) {
              worksheet.addRow(product)
            })

            //const filePath = dirPath; // Path to download excel
            // Column for data in excel. key must match data key
            // worksheet.columns = [
            //   { header: "Campaign", key: "campaignName", width: 30 },
            //   { header: "Started On", key: "startedOn", width: 30 },
            //   { header: "Revenue", key: "revenue", width: 10 },
            // ];
            // Looping through User data
           
            let orderData = [];
            // sheetData.forEach((o) => {
            //   let products = Object.values(o.products);
            //   let obj = {
            //     apartment: o.apartment,
            //     tower: o.tower,
            //     flat: o.flat,
            //     mobile: o.mobile,
            //   };
            //   obj["product"] = products[0].name || "";
            //   obj["qty"] = products[0].quantity;
            //   orderData.push(obj);
            //   worksheet.addRow(obj);
              
            //   worksheet.addRow({});
            //   let row = worksheet.addRow({});
            //   row.eachCell((cell) => {
            //     cell.fill = {
            //       type: "pattern",
            //       pattern: "darkVertical",
            //       fgColor: { argb: "FFFF0000" },
            //     };
            //   });
            //   row.fill = {
            //     type: "pattern",
            //     pattern: "darkVertical",
            //     fgColor: { argb: "FFFF0000" },
            //   };
            // });
            // Making first line in excel bold
            worksheet.getRow(1).eachCell((cell) => {
              cell.font = { bold: true };
            });
         
        }
        
        try {
          res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
          res.setHeader(
            "Content-Disposition",
            "attachment; filename=" + fileName+".xlsx"
          );
          return workbook.xlsx.write(res).then(function () {
            res.status(200).end();
          });
        } catch (err) {
          res.send({
            status: "error",
            message: "Something went wrong",
          });
        }
      } else {
        res.send({
          message: "No records",
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

function formatProductObj(product) {
  let name = product.name;
  let addOns = ''
  if(product.attributes && product.attributes.length) {
    for(let i = 0; i < product.attributes.length; i++) {
      addOns = addOns+(addOns.length ? ' ,': '') +product.attributes[i].name + ':' + product.attributes[i].value;
      product.price+= +product.attributes[i].price;
      product.productId = `${product.productId}${product.attributes[i].value}`
      product.quantity = product.attributes[i].quantity ? product.attributes[i].quantity : product.quantity;
    }
    product.name = `${product.name} (${addOns})`
    
  }
  return product;

}
