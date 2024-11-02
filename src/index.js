// make bluebird default Promise
Promise = require('bluebird'); // eslint-disable-line no-global-assign
const { port, env } = require('./config/vars');
const logger = require('./config/logger');
const app = require('./config/express');
const mongoose = require('./config/mongoose');
const https = require('https');
const fs = require('fs');
const scheduler = require('../src/api/utils/scheduler');
const firebaseService = require('../src/api/services/firebase')
// open mongoose connection
mongoose.connect();
// try{
//     firebaseService.init()
// }catch(e){
//     console.log('ee',e)
// }
// let message = {
//     title: "Fresh Fruits campaign is live",
//     body: "Fresh Fruits Campaign is live. Place your orders now!!",
//     requireInteraction: true,
//     link: ""
// }
// let token  = 'coOb90KB4G5_Q_AivbmPU5:APA91bHPidhHXIiKz-gcGBjFMwlsjq6Tuaagggdfw9D50WZwj3lrqJf2GIbWWKl0yZnsGYmALFScgW1WAMdmqOjT-oJBwXAUYCmSp2V4Ip_PwHkeqkQ6zUd3fwEf0Ls_HnbEhUSTwSHZ'
// firebaseService.sendFCMMessage(token, message)
// }catch(e){
//     console.log(e)
// }6376
/*
try{
    const privateKey  = fs.readFileSync('key.pem');
    const certificate = fs.readFileSync('cert.pem');

    const credentials = {key: privateKey, cert: certificate};
    const httpsServer = https.createServer(credentials, app);
    httpsServer.listen(8443, () => logger.info(`https server started on port 8443 (${env})`));
} catch(e) {
    console.log('Failed to start https server')
}
*/
// listen to requests
try{
    app.listen(port, () => {
        if(process.env.NODE_ENV !== 'development') {
            console.log('Starting cron jobs');
            scheduler.startCronJob()
        }
        logger.info(`server started on port ${port} (${env})`)
    });
} catch(e) {
    console.log('Failed to start https server', e)
}

/**
* Exports express
* @public
*/
module.exports = app;
