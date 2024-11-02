
const winston = require('winston');
const path = require('path');
const DailyRotateFile = require('winston-daily-rotate-file');
const appRoot = path.join(__dirname, '../../');
const { format } = winston;
const moment = require("moment");

const { combine, timestamp, prettyPrint, colorize, errors,  } = format;
dateFormat = () => {
  //let now = new Date();
  // const clientTimeOffset = -330;
  // let serverTimeOffset = now.getTimezoneOffset();
  // let timeDiff = clientTimeOffset - serverTimeOffset;
  //now.setMinutes(now.getMinutes() + 330);

  // Create a UTC date object. The moment constructor will recognize the date as UTC since it includes the 'Z' timezone specifier.
  let utcDate = moment(new Date());
  // Convert the UTC date into IST
  let istDate = moment(utcDate).tz("Asia/Kolkata");

  return istDate.format("ddd, DD MMM YYYY hh:mm:ss A");

  const now = new Date().toLocaleString(undefined, {timeZone: 'Asia/Kolkata'});
  //Sun, 16 Oct 2022 19:01:16
};

const dailyLogOptions = {
    filename: `${appRoot}/logs/application-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: false,
    maxSize: '20m',
    maxFiles: '14d'
};

logOptions = (type) => {
    return {
      filename:`${appRoot}/logs/${type}-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: type
    }
  }

var options = {
    file: {
      level: 'info',
      filename: `${appRoot}/logs/app.log`,
      handleExceptions: true,
      json: true,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      colorize: false,
    },
    console: {
      level: 'debug',
      handleExceptions: true,
      json: false,
      colorize: true,
    },
  };

  const myFormat = winston.format.printf((info, opts) => {
    const args = info[Symbol.for('splat')];
    //console.log('logging opts' , args)
    let message = `${dateFormat()} | ${info.level.toUpperCase()}`
    if(info.path) {
      message += ' | ' + info.path;
    }
    message += ' | ' +(typeof info.message == 'string' ? info.message : JSON.stringify(info.message))
    if(args && Object.keys(args[0]).length > 1) {
      message += '\t\nData: ';
      message +=  (typeof args == 'string' ? args : JSON.stringify(args))
    }
    message = message  +(info.stack ? ` | ${(info.stack)}`: '');
   
    return message;
  });

  var logger = winston.createLogger({
    transports: [
      new winston.transports.File(options.file),
      new winston.transports.Console(options.console)
    ],
    exitOnError: false, // do not exit on handled exceptions
    format: combine(
      errors({ stack: true }), // <-- use errors format
      //colorize(),
      timestamp(),
      prettyPrint(),
      myFormat,
      format.splat(),
      
    ),
  });

  logger.configure({
    level: 'verbose',
    transports: [
      new DailyRotateFile(logOptions('info')),
      new DailyRotateFile(logOptions('debug')),
      new DailyRotateFile(logOptions('error')),
    ],
    // exceptionHandlers: [new DailyRotateFile(logOptions('exceptions')),],
    // rejectionHandlers: [new DailyRotateFile(logOptions('rejections')),],
  });

  // logger.stream = {
  //   write: function(message, encoding) {
  //     logger.info(message);
  //   },
  // };



class LoggerService {
  constructor(route) {
    
    this.log_data = null;
    this.route = route;
    this.logger = logger;
  }

  setLogData(log_data) {
    this.log_data = log_data;
  }
  
  async info(message, obj={}) {
    obj['path'] = this.route
    
    this.logger.log("info", message, obj);
  }
  async debug(message, obj={}) {
    obj['path'] = this.route
    this.logger.log("debug", message, obj);
  }
  async error(message, obj={}) {
    obj['path'] = this.route
    this.logger.log("error", message, obj);
  }
}
module.exports = LoggerService;


  //module.exports = logger