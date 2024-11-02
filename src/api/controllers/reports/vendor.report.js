const httpStatus = require("http-status");
const { omit } = require("lodash");
const Order = require("../../models/order.model");
const Vendor = require("../../models/vendor.model");
const mongoose = require("mongoose");
const excelJS = require("exceljs");
const path = require("path");
var fs = require('fs');
/**
 * Customer Delivery Report
 * @public
 */
exports.getVendorOrderReport = async (req, res, next) => {
  try {
    //console.log("req", req);
    let loggedInUser = req.user;
    //let query = {'status': 'Delivered'};
    let query = {};
    query["paymentStatus"] = { $nin: ['PAYMENT_FAILED', 'PAYMENT_CANCELLED'] };
    if(req.body.from || req.body.to) {
      query['createdAt'] = {};
      if(req.body.from) {
          query['createdAt']['$gte'] = req.body.from;
      }
      if(req.body.to) {
          let endDate = new Date(req.body.to);
          endDate.setDate(endDate.getDate() + 1);
          query['createdAt']['$lte'] = endDate;
      }
  }

    if (req.body.campaignIds && req.body.campaignIds.length) {
      query["campaigns.campaignId"] = { $in: req.body.campaignIds.map(mongoose.Types.ObjectId) };
    }

    let campaignIds = req.body.campaignIds || []
    
    
    let orders = await Order.aggregate([
      {
        $match: query,
      },
      { $project: {
        // campaigns: {$filter: {
        //     input: '$campaigns',
        //     as: 'campaign',
        //       cond: {$in: ['$$campaign.status', ['Confirmed',  'OutForDelivery', 'Delivered']]}
        //   }},
        campaigns: 1,
        _id: 0,
        orderId: 1,
        customerId: 1,
        paymentStatus: 1,
        address: 1,
        CFOrderId: 1,
        createdAt: 1,
      }},
      {
        $match: {
          "campaigns.0": { $exists: true }  
        },
      },

     
      //{ $sort: sortObj },
      //{ $skip: parseInt(skip) },
      //{ $limit: parseInt(size) },
    ])
   
    //let orders = await Order.find(query).lean()
    console.log('Vendor Report', query, orders.length);
    if(!orders.length)  {
      res.json("No Records");
      res.end();
    } else {
      let vendors = await Vendor.find().lean();
      vendors = vendors.reduce((acc, vendor) => {
        acc[vendor._id] = vendor;
        return acc;
      }, {})
      let products = [];
      orders.forEach(order => {
        let campaigns = order.campaigns;
        
        let cProducts = [];
        campaigns.forEach(campaign => {
          if((campaignIds.indexOf(campaign.campaignId.toString()) !== -1 || campaignIds.length == 0) && ['Confirmed',  'OutForDelivery', 'Delivered'].indexOf(campaign.status) !== -1) {
            let formattedProducts = []
            let p = campaign.products.map(product => {


              if(product.attributes && product.attributes.length > 1) {
                 
                for(let a=0;a<product.attributes.length;a++) {
                  let prd = {...product, attributes: [product.attributes[a]]}
                  let pr = formatProductObj(prd);
                  pr['campaign'] = campaign.name;
                  formattedProducts.push(pr)
                }
              } else {
                
                let pr = formatProductObj(product);
                pr['campaign'] = campaign.name;
                formattedProducts.push(pr)
              }
              
            })
            //console.log('pp', p)
            cProducts = [...cProducts, ...formattedProducts];
          }
        });
        products = [...products, ...cProducts];
      })
    
      products = products.map(product => {
        product['vendor'] = vendors[product.vendorId.toString()];
        return product;
      })
      //console.log('products', products)

      let formatted = products.reduce((result, product, idx) => {
        let productId = product.productId.toString();
        let vendorId = product.vendorId.toString();

        if(result[vendorId]) {
          //console.log('Vendor exist', vendorId, productId)
            if(result[vendorId][productId]) {
              //console.log('Product exist')
              result[vendorId][productId]['count'] = result[vendorId][productId]['count'] + +product.quantity;
            } else {
              result[vendorId][productId] = {...product, count: +product.quantity}
            }
        } else {
          result[vendorId] = {[productId]: {...product, count: +product.quantity}}
        }
        return result;
      },{});
      //console.log('result', formatted);

      //res.json(formatted);
      /****** Create excel *********** */
      //console.log('__dirname', path.join(__dirname,'../../../../files/'))
    
      const dirPath = path.join(__dirname,'../../../../files/');
      if (!fs.existsSync(dirPath)){
        fs.mkdirSync(dirPath);
      }
      
      const workbook = new excelJS.Workbook(); // Create a new workbook
      
      
      let sheets = Object.values(formatted);
     // console.log('formatted', formatted)
      //res.json(sheets);
      for(let s=0;s<sheets.length;s++){
            sheetData = Object.values(sheets[s])
            const vendor = sheetData[0].vendor? sheetData[0].vendor.name : 'Vendor '+s
            const worksheet = workbook.addWorksheet(`${vendor}`); 
            //const filePath = dirPath; // Path to download excel
            // Column for data in excel. key must match data key
            worksheet.columns = [
              { header: "Product", key: "name", width: 40 },
              { header: "Campaign", key: "campaign", width: 40 },
              { header: "Total", key: "count", width: 10 }
            ];
            // Looping through User data
            

            let orderData = [];
            sheetData.forEach(o => {
              
          
              worksheet.addRow(o)
              
            })
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
          "attachment; filename=" + "Vendor_Report.xlsx"
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
    }

  } catch (error) {
    return next(error);
  }
};

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
