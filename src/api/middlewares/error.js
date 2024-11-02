const httpStatus = require('http-status');
const expressValidation = require('express-validation');
const APIError = require('../errors/api-error');
const { env } = require('../../config/vars');

/**
 * Error handler. Send stacktrace only during development
 * @public
 */
const handler = (err, req, res, next) => {
  const response = {
    code: err.status,
    message: err.message || httpStatus[err.status],
    errors: err.errors,
    stack: err.stack,
  };

  if (env !== 'development') {
    delete response.stack;
  }
  
  res.status(err.status);
  res.json(response);
};
exports.handler = handler;

/**
 * If error is not an instanceOf APIError, convert it.
 * @public
 */
exports.converter = (err, req, res, next) => {
  let convertedError = err;
  if (err instanceof expressValidation.ValidationError) {
    let errorsFormatted = err.errors.map(formatJoiErrors)
    
    convertedError = new APIError({
      message: 'Validation Error',
      errors: errorsFormatted.map(e => e.message[0]),
      status: err.status,
      stack: err.stack,
    });
  } else if (!(err instanceof APIError)) {
    convertedError = new APIError({
      message: err.message,
      status: err.status,
      stack: err.stack,
    });
  }

  return handler(convertedError, req, res);
};

/**
 * Catch 404 and forward to error handler
 * @public
 */
exports.notFound = (req, res, next) => {
  const err = new APIError({
    message: 'Not found',
    status: httpStatus.NOT_FOUND,
  });
  return handler(err, req, res);
};



function formatJoiErrors(error) {
  try{
    //console.log('ffff', error)
    let msg = error.messages.map(m => m.replace(/"/g, "") || '');
    let errorObj = {
        
        message: msg//+ (error.field ? ' (field: '+error.field+')': '')
    } 
    //console.log('ffff', errorObj)
    return errorObj
     
  } catch(e) {
      return error
  } 
}

function customErrorMessage(obj) {
  let msg = obj.message.replace(/"/g, "") || '';
  switch(obj.type){
      case 'any.required':
      case 'any.empty': {
          msg =  obj.path + ' is required';
          break;
      }
      case 'string.min': {
          msg =  `${obj.path} should have minimum  ${obj.limit} characters`;
          break;
      }

      case 'string.email': {
          msg =  `${obj.path} should be valid  email`;
          break;
      }

  }
  return msg;

}