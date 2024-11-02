const moment = require('moment')

exports.generateOTP = function () {
  //Generate and send OTP
  const otp = Math.floor(100000 + Math.random() * 900000);
  const expiry = new Date(new Date().getTime() + 5 * 60000);
  return { otp, expiry };
};

exports.formatISTDate = function (utcDate) {
  return moment(utcDate).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
};

exports.generateUniqueCode = function () {
  //Generate and send OTP
  const n = Math.floor(100 + Math.random() * 900);
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let str = "";

  for (let i = 0; i < 4; i++) {
    let idx = Math.floor(Math.random() * 26);
    str += characters[idx];
  }
  str += n;

  return str;
};

exports.formatJoiErrors = function (req, resp, next) {
  console.log("formatJoiErrors", resp)
  try {
    if (error.data.details) {
      let errors = error.data.details;
      
      let message = customErrorMessage(errors[0]);
      let errorObj = {
        statusCode: error.output.statusCode,
        error: error.output.payload.error,
        message: message,
      };
      resp.status(400)
      resp.json(errorObj)
       
    } else {
      resp.status(400)
      resp.json(error)
    }
  } catch (e) {
    resp.status(400)
    resp.json(error)
  }
  next();
};

function customErrorMessage(obj) {
  let msg = obj.message.replace(/"/g, "") || "";
  switch (obj.type) {
    case "any.required":
    case "any.empty": {
      msg = obj.path + " is required";
      break;
    }
    case "string.min": {
      msg = `${obj.path} should have minimum  ${obj.limit} characters`;
      break;
    }

    case "string.email": {
      msg = `${obj.path} should be valid  email`;
      break;
    }
  }
  return msg;
}

exports.handleFileUpload = (file, id) => {
  return new Promise((resolve, reject) => {
    const filePath = file.hapi.filename;
    let fileName = filePath.split("/");
    let arr = fileName[fileName.length - 1].split(".");
    const ext = arr[arr.length - 1];
    if (!fileTypeFilter(filePath)) {
      reject({ status: false, message: "The file type is not allowed" });
    }
    const uploadDir = path.join(__dirname, "../../uploads");
    console.log("Destination:", uploadDir, "fileName", fileName);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    let today = new Date().getTime();
    fs.writeFile(
      uploadDir + "/" + userId + "-" + today + "." + ext,
      file._data,
      (err) => {
        if (err) {
          console.log("Failed to upload file", fileName);
          reject({ status: false, message: err });
        }
        resolve({ fileName: userId + "-" + today + "." + ext, status: true });
      }
    );
  });
};

function fileTypeFilter(fileName) {
  if (!fileName.match(/\.(jpg|jpeg|png|pdf)$/)) {
    return false;
  }

  return true;
}
