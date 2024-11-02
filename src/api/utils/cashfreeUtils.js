const https = require("https");
const moment = require('moment');
const {
  CASH_FREE_APP_ID,
  CASH_FREE_SECRET_KEY,
  CASH_FREE_NOTIFY_URL,
  CASH_FREE_BASE_URL,
  CASH_FREE_BASE_PG_URL
} = require("../../config/vars");


let headers = {};
headers["x-client-id"] = CASH_FREE_APP_ID;
headers["x-client-secret"] = CASH_FREE_SECRET_KEY;
headers["x-api-version"] = "2022-09-01";
headers["Content-Type"] = "application/json";

exports.createOrder = async (body) => {
  let data = {
    order_id: "order_1626945143520",
    order_amount: 10.12,
    order_currency: "INR",
    order_note: "Additional order info",
    customer_details: {
      customer_id: "12345",
      customer_email: "techsupport@cashfree.com",
      customer_phone: "9816512345",
    },
    order_meta: {
      notify_url: "",
    },
  };
  const options = {
    hostname: CASH_FREE_BASE_PG_URL,
    port: 443,
    path: "/pg/orders",
    method: "POST",
    headers: headers,
    data: body,
  };
  let payload = JSON.stringify(body);
  console.log("payload", payload);
  return new Promise((resolve, reject) => {
    let response = "";

    const req = https.request(options, (res) => {
      res.on("data", (d) => {
        response += d;
      });

      res.on("end", () => {
        console.log("resp", response);
        resolve(JSON.parse(response));
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
};

exports.createVendor = async (data) => {
  const options = {
    hostname: CASH_FREE_BASE_URL,
    port: 443,
    path: "/api/v2/easy-split/vendors",
    method: "POST",
    headers: headers,
    data: data,
  };
  let payload = JSON.stringify(options.data);
  console.log("payload", payload);
  return new Promise((resolve, reject) => {
    let response = "";

    const req = https.request(options, (res) => {
      res.on("data", (d) => {
        response += d;
      });

      res.on("end", () => {
        console.log("resp", response);
        let resp = JSON.parse(response);
        if (resp.status === "ERROR") {
          reject(resp);
        } else {
          resolve(resp);
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
};

exports.updateVendor = async (data, vendorId) => {
  try{
    const options = {
      hostname: CASH_FREE_BASE_URL,
      port: 443,
      path: "/api/v2/easy-split/vendors/" + vendorId,
      method: "PUT",
      headers: headers,
      data: data,
    };
    let payload = JSON.stringify(options.data);
    console.log("payload", payload);
    return new Promise((resolve, reject) => {
      let response = "";

      const req = https.request(options, (res) => {
        res.on("data", (d) => {
          response += d;
        });

        res.on("end", () => {
          console.log("resp", response);
          let resp = JSON.parse(response);
          if (resp.status === "ERROR") {
            reject(resp);
          } else {
            resolve(resp);
          }
        });
      });

      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  } catch(e){
    console.log('err', e)
    reject(e);
  }
};

exports.createCFOrder = async (orderObj, customer, vendorSplitPayments) => {
  console.log('Creating Cashfree Order', )
  try{
    let data = {
      order_id: orderObj.orderId,
      order_amount: orderObj.amount - 0.01,
      order_currency: "INR",
      order_note: "Order for "+customer.name,
      customer_details: {
        customer_id: orderObj.customerId,
        customer_email: customer.email,
        customer_name: customer.name,
        customer_phone: customer.mobile.toString(),
      },
      order_meta: {
        notify_url: CASH_FREE_NOTIFY_URL,
      }
    };
    //TODO: Commenting temporarily to skip vendor split payment
    if(vendorSplitPayments && vendorSplitPayments.length > 1) {
      //data['order_splits'] = vendorSplitPayments
    }
    if(orderObj.redirectUrl) {
      data.order_meta['return_url'] = `${orderObj.redirectUrl}?cf_id={order_id}`
    }
    const options = {
      hostname: CASH_FREE_BASE_PG_URL,
      port: 443,
      path: "/pg/orders",
      method: "POST",
      headers: headers,
      data: data,
    };
    let payload = JSON.stringify(data);
    console.log("payload", payload);
    return new Promise((resolve, reject) => {
      let response = "";

      const req = https.request(options, (res) => {
        
        res.on("data", (d) => {
          response += d;
        });

        res.on("end", () => {
          console.log("resp", response);
          console.log("statusCode: ", res.statusCode)
          if(res.statusCode == 200) {
            resolve(JSON.parse(response));
          } else {
            console.log(response)
            reject(response);
          }
          
        });
      });

      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  } catch(e){
    console.log('create cf order', e)
  }
};


exports.updateVendorSettlementDate = async (date, vendorId, orderId) => {
  let payload = {settlementEligibilityDate: moment(date).format("YYYY-MM-DD")}
  const options = {
    hostname: CASH_FREE_BASE_URL,
    port: 443,
    path: `api/v2/easy-split/orders/${orderId}/settlement-eligibility/vendors/${vendorId}`,
    method: "PUT",
    headers: headers,
    data: payload,
  };
  //let payload = JSON.stringify({settlementEligibilityDate: moment(date).format("MMM Do YY")});
  console.log("payload", payload);
  return new Promise((resolve, reject) => {
    let response = "";

    const req = https.request(options, (res) => {
      res.on("data", (d) => {
        response += d;
      });

      res.on("end", () => {
        console.log("resp", response);
        let resp = JSON.parse(response);
        if (resp.status === "ERROR") {
          reject(resp);
        } else {
          resolve(resp);
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
};


exports.createRefund = async (data) => {
  let d = {
    refund_amount: data.refundAmount,
    refund_id: data.merchantRefundId,
    refund_note: data.refundNotes,
    //refund_splits: data.splitDetails
  }
  let payload = JSON.stringify(d);
  console.log('h', headers)
  const options = {
    hostname: CASH_FREE_BASE_PG_URL,
    port: 443,
    path: `/pg/orders/${data.referenceId}/refunds`,
    method: "POST",
    headers: headers,
    data: data,
  };
  console.log("payload", payload);
  return new Promise((resolve, reject) => {
    let response = "";

    const req = https.request(options, (res) => {
      res.on("data", (d) => {
        response += d;
      });

      res.on("end", () => {
        console.log("resp", response);
        let resp = JSON.parse(response);
        if (resp.status === "ERROR") {
          reject(resp);
        } else {
          resolve(resp);
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
};

exports.createVendorAdjustment = async (vendorId, adjustmentId, amount, type, remarks) => {
  let payload = {
    adjustmentId:adjustmentId,
    amount: amount,
    type: type,
    remarks: remarks
  }
  const options = {
    hostname: CASH_FREE_BASE_URL,
    port: 443,
    path: `api/v2/easy-split/vendors/${vendorId}/adjustment`,
    method: "POST",
    headers: headers,
    data: payload,
  };
  console.log("payload", payload);
  return new Promise((resolve, reject) => {
    let response = "";

    const req = https.request(options, (res) => {
      res.on("data", (d) => {
        response += d;
      });

      res.on("end", () => {
        console.log("resp", response);
        let resp = JSON.parse(response);
        if (resp.status === "ERROR") {
          reject(resp);
        } else {
          resolve(resp);
        }
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
};

exports.getOrderStatus = async (orderId) => {
  console.log('get Cashfree Order status', )
  try{
    
    const options = {
      hostname: CASH_FREE_BASE_PG_URL,
      port: 443,
      path: "/pg/orders/"+orderId,
      method: "GET",
      headers: headers
    };
    
    return new Promise((resolve, reject) => {
      let response = "";

      const req = https.request(options, (res) => {
        
        res.on("data", (d) => {
          response += d;
        });

        res.on("end", () => {
          console.log("resp", response);
          console.log("statusCode: ", res.statusCode)
          if(res.statusCode == 200) {
            resolve(JSON.parse(response));
          } else {
            reject(JSON.parse(response));
          }
          
        });
      });

      req.on("error", reject);
      req.write('');
      req.end();
    });
  } catch(e){
    reject(e);
    console.log(' cf order', e)
  }
};



exports.getPaymentStatus = async (orderId) => {
  console.log('get Cashfree Payment status', )
  try{
    
    const options = {
      hostname: CASH_FREE_BASE_PG_URL,
      port: 443,
      path: "/pg/orders/"+orderId+"/payments",
      method: "GET",
      headers: headers
    };
    
    return new Promise((resolve, reject) => {
      let response = "";

      const req = https.request(options, (res) => {
        
        res.on("data", (d) => {
          response += d;
        });

        res.on("end", () => {
          console.log("statusCode: ", res.statusCode)
          console.log("statusCode: ", response)
          if(res.statusCode == 200) {
            resolve(JSON.parse(response));
          } else {
            reject(JSON.parse(response));
          }
          
        });
      });

      req.on("error", reject);
      req.write('');
      req.end();
    });
  } catch(e){
    reject(e);
    console.log(' cf order', e)
  }
};
