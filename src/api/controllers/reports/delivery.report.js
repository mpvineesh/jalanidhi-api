const httpStatus = require("http-status");
const { omit } = require("lodash");
const Order = require("../../models/order.model");
const mongoose = require("mongoose");
const excelJS = require("exceljs");
const path = require("path");
const moment = require("moment");
var fs = require("fs");
/**
 * Customer Delivery Report
 * @public
 */
exports.getCustomerDeliveryReport = async (req, res, next) => {
  try {
    //console.log("req", req);
    let loggedInUser = req.user;
    let query = {};
    query["paymentStatus"] = { $nin: ['PAYMENT_FAILED', 'PAYMENT_CANCELLED'] };
   
    if (req.body.campaignIds) {
      query["campaigns.campaignId"] = { $in: req.body.campaignIds.map(mongoose.Types.ObjectId) };
      //query["status"] = { $in: ['Confirmed',  'OutForDelivery', 'Delivered'] };
    }
    let clusterIds = req.body.clusterIds ? req.body.clusterIds : [];
    let apartmentSets = req.body.apartmentSets ? req.body.apartmentSets : [];
    let fileName = "Customer_Delivery_Report_"+moment(new Date()).format('DDMMYYYY');
    //console.log(clusterIds);
    let orders = await Order.aggregate([
      {
        $match: query,
      },
      { $project: {
          // campaigns: {$filter: {
          //     input: '$campaigns',
          //     as: 'campaign',
          //     cond: [
          //       { "$and": [ 
          //         {$in: ['$$campaign.campaignId', campaignIdList]},
          //         {$in: ['$$campaign.status', ['Confirmed',  'OutForDelivery', 'Delivered']]}
          //       ]}
          //     ]
          // }},
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
      {
        $lookup: {
          from: "users",
          let: { customerId: "$customerId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ["$$customerId", "$_id"] }],
                },
              },
            },
          ],
          as: "customer",
        },
      },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

      {
        $set: {
          clusterIdCheck: clusterIds.length > 0,
        },
      },

      { $unwind: "$apartment" },
      {
        $match: {
          $or: [
            { "apartment.cluster": { $in: clusterIds } },
            { "apartment.cluster": { $nin: [] }, clusterIdCheck: false },
          ],
        },
      },

      {
        $project: {
          tracking: 0,
          deleted: 0,
          placedProposals: 0,
        },
      },
      //{ $sort: sortObj },
      //{ $skip: parseInt(skip) },
      //{ $limit: parseInt(size) },
    ]);
    //res.json(orders)
    let campaignIds = req.body.campaignIds || []
    //console.log('Records found:', orders.length, query, JSON.stringify(orders[0].campaigns));
    let formatted = orders.reduce((result, o, idx) => {
      //let flatId = `${o.address.apartment}-${o.address.tower}-${o.address.flatNo}`;
      let flatId = o.customer._id.toString()+o.address.apartment;
      let products = [];
     
      o.campaigns.forEach((c) => {
        if((campaignIds.indexOf(c.campaignId.toString()) !== -1 || campaignIds.length == 0) && ['Confirmed',  'OutForDelivery', 'Delivered'].indexOf(c.status) !== -1) {
          c.products.forEach((p) => {
            if(p.attributes && p.attributes.length > 1) {

              for(let a=0;a<p.attributes.length;a++) {
                let pr = {...p, attributes: [p.attributes[a]]}
                let obj = {
                  apartment: o.address.apartment,
                  apartmentId: o.apartment._id.toString(),
                  tower: o.address.tower,
                  flat: o.address.flatNo,
                  mobile: o.customer,
                  product: formatProductObj(pr),
                  cluster: o.apartment.cluster,
                };
                products.push(obj);
              }
            } else {
              let obj = {
                apartment: o.address.apartment,
                apartmentId: o.apartment._id.toString(),
                tower: o.address.tower,
                flat: o.address.flatNo,
                mobile: o.customer,
                product: formatProductObj(p),
                cluster: o.apartment.cluster,
              };
              products.push(obj);
            }
            
          });
        }
      });

        //console.log('ppppp', products, o)
      if (result[flatId]) {
        products.forEach((p) => {
          const product = p.product;
          if (result[flatId].products[product.productId]) {
            result[flatId].products[product.productId].quantity +=
              product.quantity;
          } else {
            result[flatId].products[product.productId] = {
              name: product.name,
              quantity: product.quantity,
            };
          }
        });
      } else {
        let groupedProducts = products.reduce((grouped, p) => {
          const product = p.product;
          grouped[product.productId] = {
            name: product.name,
            quantity: product.quantity,
          };
          return grouped;
        }, {});

        result[flatId] = {
          products: groupedProducts,
          apartment: o.address.apartment,
          apartmentId: o.apartment._id.toString(),
          tower: o.address.tower,
          flat: o.address.flatNo,
          mobile: o.customer.mobile || "",
          cluster: o.apartment.cluster,
        };
      }
      return result;
    }, {});
   //console.log('formatted', formatted)
    
    /****** Create excel *********** */
    
    const dirPath = path.join(__dirname, "../../../../files/");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }

    const workbook = new excelJS.Workbook(); // Create a new workbook

    let sheets = [];
    if (apartmentSets.length) {
      const data = Object.values(formatted).reduce((res, obj) => {
        //console.log(obj)
        if (res[obj.apartmentId]) {
          res[obj.apartmentId].push(obj);
        } else {
          res[obj.apartmentId] = [obj];
        }
        return res;
      }, {});
      //console.log('data', data)
      sheets = apartmentSets.map((sets) => {
        let dataSet = sets.map((id) => data[id]||[]).filter((d) => d.length > 0);
        //console.log('dataset', dataSet)
        return dataSet.flat();
      });
    } else {
      if (clusterIds.length) {
        const data = Object.values(formatted).reduce((res, obj) => {
          //console.log(obj)
          if (res[obj.cluster]) {
            res[obj.cluster].push(obj);
          } else {
            res[obj.cluster] = [obj];
          }
          return res;
        }, {});
        sheets = clusterIds.map((cId) => data[cId]);
      } else {
        formatted = Object.values(formatted);
        sheets[0] = formatted;
      }
    }
    
    //console.log('shee', sheets)
    //res.json(sheets);
     
    if(sheets.length) {
        for (let s = 0; s < sheets.length; s++) {
          if(sheets[s].length > 0) {
            sheetData = sheets[s];
            const worksheet = workbook.addWorksheet(
              `Customer Delivery Report Set ${s + 1}`
            );
            //const filePath = dirPath; // Path to download excel
            // Column for data in excel. key must match data key
            worksheet.columns = [
              { header: "Apartment", key: "apartment", width: 30 },
              { header: "Block n Flat", key: "flat", width: 30 },
              { header: "Tower", key: "tower", width: 30 },
              { header: "Item", key: "product", width: 60 },
              { header: "Quantity", key: "qty", width: 20 },
              { header: "Mobile", key: "mobile", width: 20 },
            ];
            // Looping through User data

            let orderData = [];
            sheetData.forEach((o) => {
              let products = Object.values(o.products);
              let obj = {
                apartment: o.apartment,
                tower: o.tower,
                flat: o.flat,
                mobile: o.mobile,
              };
              if (products.length > 0) {
                //console.log('products', products, o.apartment);
                obj["product"] = products[0].name || "";
                obj["qty"] = products[0].quantity;
                orderData.push(obj);
                worksheet.addRow(obj);
              
                for (let i = 1; i < products.length; i++) {
                  let obj = {
                    apartment: "",
                    tower: "",
                    flat: "",
                    mobile: "",
                    product: products[i].name,
                    qty: products[i].quantity,
                  };
                  worksheet.addRow(obj);
                  orderData.push(obj);
                }
              }
              worksheet.addRow({});
              let row = worksheet.addRow({});
              row.eachCell((cell) => {
                cell.fill = {
                  type: "pattern",
                  pattern: "darkVertical",
                  fgColor: { argb: "FFFF0000" },
                };
              });
              row.fill = {
                type: "pattern",
                pattern: "darkVertical",
                fgColor: { argb: "FFFF0000" },
              };
            });
            // Making first line in excel bold
            worksheet.getRow(1).eachCell((cell) => {
              cell.font = { bold: true };
            });
          }
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

exports.getApartmentDeliveryReport = async (req, res, next) => {
  try {
    //console.log("req", req);
    let loggedInUser = req.user;
    let query = {};
    query["paymentStatus"] = { $nin: ['PAYMENT_FAILED', 'PAYMENT_CANCELLED'] };
    
    if (req.body.campaignIds) {
      query["campaigns.campaignId"] = { $in: req.body.campaignIds.map(mongoose.Types.ObjectId) };
      //query["status"] = { $in: ['Confirmed',  'OutForDelivery', 'Delivered'] };
    }
    let fileName = "Apartment_Delivery_Report_"+moment(new Date()).format('DDMMYYYY');
    let clusterIds = req.body.clusterIds ? req.body.clusterIds : [];
    let apartmentSets = req.body.apartmentSets ? req.body.apartmentSets : [];

    //console.log(clusterIds);
    let orders = await Order.aggregate([
      {
        $match: query,
      },
      { $project: {
          campaigns: {$filter: {
              input: '$campaigns',
              as: 'campaign',
              cond: {$in: ['$$campaign.status', ['Confirmed',  'OutForDelivery', 'Delivered']]}
          }},
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
      {
        $lookup: {
          from: "users",
          let: { customerId: "$customerId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ["$$customerId", "$_id"] }],
                },
              },
            },
          ],
          as: "customer",
        },
      },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

      {
        $set: {
          clusterIdCheck: clusterIds.length > 0,
        },
      },

      { $unwind: "$apartment" },
      {
        $match: {
          $or: [
            { "apartment.cluster": { $in: clusterIds } },
            { "apartment.cluster": { $nin: [] }, clusterIdCheck: false },
          ],
        },
      },

      {
        $project: {
          tracking: 0,
          deleted: 0,
          placedProposals: 0,
        },
      },
      //{ $sort: sortObj },
      //{ $skip: parseInt(skip) },
      //{ $limit: parseInt(size) },
    ]);
    let campaignIds = req.body.campaignIds || []
    let formatted = orders.reduce((result, o, idx) => {
      //let flatId = `${o.address.apartment}-${o.address.tower}-${o.address.flatNo}`;
      let flatId = o.apartment._id.toString();
      let products = [];
      o.campaigns.forEach((c) => {
        if(campaignIds.indexOf(c.campaignId.toString()) !== -1 || campaignIds.length == 0) {
          c.products.forEach((p) => {
            if(p.attributes && p.attributes.length > 1) {
              for(let a=0;a<p.attributes.length;a++) {
                let pr = {...p, attributes: [p.attributes[a]]}
                let obj = {
                  apartment: o.address.apartment,
                  apartmentId: o.apartment._id.toString(),
                  product: formatProductObj(pr),
                };
                products.push(obj);
              }
            } else {
              let obj = {
                apartment: o.address.apartment,
                apartmentId: o.apartment._id.toString(),
                product: formatProductObj(p),
              };
              products.push(obj);
            }
          });
        }
      });
      if (result[flatId]) {
        products.forEach((p) => {
          const product = p.product;
          if (result[flatId].products[product.productId]) {
            result[flatId].products[product.productId].quantity +=
              product.quantity;
          } else {
            result[flatId].products[product.productId] = {
              name: product.name,
              quantity: product.quantity,
            };
          }
        });
      } else {
        let groupedProducts = products.reduce((grouped, p) => {
          const product = p.product;
          grouped[product.productId] = {
            name: product.name,
            quantity: product.quantity,
          };
          return grouped;
        }, {});

        result[flatId] = {
          products: groupedProducts,
          apartment: o.address.apartment,
          apartmentId: o.apartment._id.toString(),
        };
      }
      return result;
    }, {});
   
    //res.json(formatted);
    /****** Create excel *********** */

    const dirPath = path.join(__dirname, "../../../../files/");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }

    const workbook = new excelJS.Workbook(); // Create a new workbook

    let sheets = [];
    if (apartmentSets.length) {
      const data = Object.values(formatted).reduce((res, obj) => {
        //console.log(obj)
        if (res[obj.apartmentId]) {
          res[obj.apartmentId].push(obj);
        } else {
          res[obj.apartmentId] = [obj];
        }
        return res;
      }, {});
      sheets = apartmentSets.map((sets) => {
        let dataSet = sets.map((id) => data[id] || []).filter(s => s.length > 0);
        return dataSet.flat();
      });
    } else {
      formatted = Object.values(formatted);
      sheets[0] = formatted;
    }
    // res.json(orders);
    for (let s = 0; s < sheets.length; s++) {
      sheetData = sheets[s];
      if (sheetData && sheetData.length) {
        const worksheet = workbook.addWorksheet(
          `Customer Delivery Report Set ${s + 1}`
        );
        //const filePath = dirPath; // Path to download excel
        // Column for data in excel. key must match data key
        worksheet.columns = [
          { header: sheetData[0].apartment, key: "product", width: 30 },
          { header: "Sum of Item Quantity", key: "qty", width: 30 },
        ];
        // Looping through User data

        let orderData = [];
        let page = 1;
        sheetData.forEach((o) => {
          if (page > 1) {
            let obj = {
              product: o.apartment,
              qty: "Sum of Item Quantity",
            };
            //worksheet.addRow({})
            let row = worksheet.addRow(obj);
            row.eachCell((cell) => {
              cell.font = { bold: true };
            });
          }
          let products = Object.values(o.products);

          for (let i = 0; i < products.length; i++) {
            let obj = {
              product: products[i].name,
              qty: products[i].quantity,
            };
            worksheet.addRow(obj);
            orderData.push(obj);
          }

          worksheet.addRow({});
          let row = worksheet.addRow({});
          row.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "darkVertical",
              fgColor: { argb: "FFFF0000" },
            };
          });
          row.fill = {
            type: "pattern",
            pattern: "darkVertical",
            fgColor: { argb: "FFFF0000" },
          };

          page++;
        });
        // Making first line in excel bold
        worksheet.getRow(1).eachCell((cell) => {
          cell.font = { bold: true };
        });
      }
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
  } catch (error) {
    console.log(error);
    return next(error);
  }
};


function formatProductObj(product) {
  //console.log('formatting', product)
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



exports.exportOrderData = async (req, res, next) => {
  try {
    //console.log("req", req);
    let loggedInUser = req.user;
    let query = {};
    // if (req.body.status) {
    //   query["status"] = { $in: req.body.status };
    // }
    // if (req.body.campaignIds) {
    //   query["campaigns.campaignId"] = { $in: req.body.campaignIds.map(mongoose.Types.ObjectId) };
    // }
    // if(req.body.from || req.body.to) {
    //   query['createdAt'] = {};
    //   if(req.body.from) {
    //       query['createdAt']['$gte'] = new Date(req.body.from);
    //   }
    //   if(req.body.to) {
    //       let endDate = new Date(req.body.to);
    //       endDate.setDate(endDate.getDate() + 1);
    //       query['createdAt']['$lte'] = endDate;
    //   }
    // }
    
    console.log('Order dump query: ' , query);
    let fileName = "Orders_"+moment(new Date()).format('DDMMYYYY');
    //let clusterIds = req.body.clusterIds ? req.body.clusterIds : [];
    //let apartmentSets = req.body.apartmentSets ? req.body.apartmentSets : [];

    //console.log(clusterIds);
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
      {
        $lookup: {
          from: "users",
          let: { customerId: "$customerId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ["$$customerId", "$_id"] }],
                },
              },
            },
          ],
          as: "customer",
        },
      },
      {
        $unwind: {
          path: "$customer",
          preserveNullAndEmptyArrays: false,
        },
      },
      // { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

      // {
      //   $set: {
      //     clusterIdCheck: clusterIds.length > 0,
      //   },
      // },

      // { $unwind: "$apartment" },
      // {
      //   $match: {
      //     $or: [
      //       { "apartment.cluster": { $in: clusterIds } },
      //       { "apartment.cluster": { $nin: [] }, clusterIdCheck: false },
      //     ],
      //   },
      // },
     
      //},
      //{ $sort: sortObj },
      //{ $skip: parseInt(skip) },
      //{ $limit: parseInt(size) },
    ]);
    let campaignIds = req.body.campaignIds || []
    let products = [];
    let formatted = orders.forEach((o, idx) => {
      
      o.campaigns.forEach((c) => {
        if(campaignIds.indexOf(c.campaignId.toString()) !== -1 || campaignIds.length == 0) {
          c.products.forEach((p) => {
            
            let obj = {
                campaign: c.name,
                paymentDate: o.createdAt,
                orderId: o.orderId,
                subOrderId: c.subOrderId||'',
                //productName: product.name||'',
                //productPrice: p.price||'',
                quantity: p.quantity||'',
                paymentStatus: o.paymentStatus||'',
                orderStatus: c.status||'',
                paymentId: o.CFOrderId||'',
                mobile: o.customer.mobile||'',
                email: o.customer.email||'',
                apartment: o.address.apartment||'',
                tower: o.address.tower||'',
                flatNo: o.address.flatNo||'',
            
            };
            console.log('p.attributes', p.attributes)
            if(p.attributes && p.attributes.length > 0) {
             
              for(let a=0;a<p.attributes.length;a++) {
                let pr = {...p, attributes: [p.attributes[a]]}
                let attrObj = {...obj}
                let product = formatProductObj(pr);
                
                attrObj['productName'] =  product.name||'';
                attrObj['productPrice'] =  product.price||'';
                attrObj['quantity'] =  product.quantity||'';
                products.push(attrObj);
                console.log('attrObj', product, product.name, attrObj.productName)
               
              }
            } else {
              let product = formatProductObj(p);
              obj['productName'] =  product.name||'';
              obj['productPrice'] =  p.price||'';
              products.push(obj);
            }
           
          });
        }
      });
    });
   
  // res.json(products);
  //   return;
    /****** Create excel *********** */
 
    const dirPath = path.join(__dirname, "../../../../files/");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }

    const workbook = new excelJS.Workbook(); // Create a new workbook

    let sheets = [];
   

    const worksheet = workbook.addWorksheet(
      `Orders`
    );
    // Column for data in excel. key must match data key
    worksheet.columns = [
      { header: "Campaign Name", key: "campaign", width: 30 },
      { header: "Payment Date", key: "paymentDate", width: 10 },
      { header: "Order Id", key: "orderId", width: 14 },
      { header: "Sub Order Id", key: "subOrderId", width: 14 },
      { header: "Product Name", key: "productName", width: 40 },
      { header: "Price", key: "productPrice", width: 6 },
      { header: "Quantity", key: "quantity", width: 8 },
      { header: "Order Status", key: "orderStatus", width: 12 },
      { header: "Payment Status", key: "paymentStatus", width: 30 },
      { header: "Payment ID", key: "paymentId", width: 30 },
      { header: "Mobile", key: "mobile", width: 10 },
      { header: "Email", key: "email", width: 30 },
      { header: "Apartment", key: "apartment", width: 30 },
      { header: "Tower", key: "tower", width: 30 },
      { header: "Flat", key: "flatNo", width: 30 },
    ];

    for (let i = 0; i < products.length; i++) {
          worksheet.addRow(products[i]);
   

        };
        // Making first line in excel bold
        worksheet.getRow(1).eachCell((cell) => {
          cell.font = { bold: true };
        });
    //   }
    // }

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
  
  } catch (error) {
    console.log(error);
    return next(error);
  }
};