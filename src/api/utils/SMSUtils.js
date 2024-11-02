const https = require("https");
/**
 *
 * @param authKey
 * @param senderId
 * @param route : Value can be 1 for Promotional Router or 4 for Transactional Route or 106 for SendOTP
 * @param DLT_TE_ID : Issued DLT template from TRAI
 */
/*
module.exports = function (authKey, senderId, route=4) {

    if (authKey == null || authKey == "") {
        throw new Error("MSG91 Authorization Key not provided.");
    }

    if (senderId == null || senderId == "") {
        throw new Error("MSG91 Sender Id is not provided.");
    }

    if (route == null || route == "") {
        throw new Error("MSG91 router Id is not provided.");
    }

    this.send = function (mobileNos, message, DLT_TE_ID, callback) {

        callback = modifyCallbackIfNull(callback);

        mobileNos = validateMobileNos(mobileNos);

        message = validateMessage(message);

        var isUnicode = isUnicodeString(message);
        // Adding support for DLT template to accommodate changes by TRAI
        var postData = "authkey=" + authKey + "&sender=" + senderId + "&mobiles=" + mobileNos + "&message=" + message + "&route=" + route + "&DLT_TE_ID=" + DLT_TE_ID;

        if(isUnicode) {
            postData += "&unicode=1";
        }

        var options = {
            hostname: 'control.msg91.com',
            port: 80,
            path: '/api/sendhttp.php',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }
        };

        makeHttpRequest(options, postData, function(err, data){
            callback(err, data);
        });



    };

    this.getBalance = function(customRoute, callback) {

        if(arguments.length == 1) {
            callback = customRoute;
            customRoute = null;
        }

        callback = modifyCallbackIfNull(callback);

        var currentRoute = customRoute || route;

        var options = {
            hostname: 'control.msg91.com',
            port: 80,
            path: '/api/balance.php?authkey=' + authKey + '&type=' + currentRoute,
            method: 'GET'
        };

        makeHttpRequest(options, null, function(err, data){
            callback(err, data);
        });

    }

    return this;

};
*/

function validateMobileNos(mobileNos){

    if (mobileNos == null || mobileNos == "") {
        throw new Error("MSG91 : Mobile No is not provided.");
    }

    if(mobileNos instanceof Array){
        mobileNos = mobileNos.join(",");
    }

    return mobileNos
}

function validateMessage(message){

    if (message == null || message == "") {
        throw new Error("MSG91 : message is not provided.");
    }

    return message;
}

function modifyCallbackIfNull(callback){
    return callback || function(){};
}

function isUnicodeString(str) {
    for (var i = 0, n = str.length; i < n; i++) {
        if (str.charCodeAt( i ) > 255) { return true; }
    }
    return false;
}

exports.sendOTP = function(otp, mobile) {
  let payload = {
    "flow_id": "6173e3bf3cc6b715440c8f26",
    "sender": "CMBUYN",
    "short_url": "1 (On) or 0 (Off)",
    "mobiles": mobile,
    "otp": otp
  } 
  return makeHttpRequest(payload)
}

exports.sendReferralcreditNotification = function(credits, mobile,refferedUser) {
    let payload = {
      "flow_id": "63cf80d82b285d1ef81a3ef4",
      "sender": "CMBUYN",
      "short_url": "1 (On) or 0 (Off)",
      "mobiles": mobile,
      "credits": credits,
      "referreduser": refferedUser,
      "URL": "https://combuyn.in"

    } 
    return makeHttpRequest(payload)
  }

  exports.sendOrderConfimation = function(orderTotal, mobile) {
    let payload = {
      "flow_id": "63d38b04d6fc050eeb295914",
      "sender": "CMBUYN",
      "short_url": "1 (On) or 0 (Off)",
      "total_order_value": orderTotal,
      "mobiles": mobile

    } 
    return makeHttpRequest(payload)
  }


function makeHttpRequest(postData, callback) {
    const options = {
        hostname: 'api.msg91.com',
        path: '/api/v5/flow/',
        method: 'POST',
        port: 443,
        headers: {
            'authkey': '368641A8B4av1gLpJu616d5329P1',
            'content-type': 'application/json'
        }
    }

   return new Promise((resolve, reject) => {
        
        var data = "";
        var req = https.request(options, function (res) {
            console.log(`STATUS: ${res.statusCode}`);
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function () {
                resolve(data) 
            })
        });

        req.on('error', function (e) {
            reject(e)
        });
        req.write(JSON.stringify(postData));
        

        req.end();
         
   })
    

   
    

}