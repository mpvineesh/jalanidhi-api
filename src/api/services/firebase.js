//import admin from 'firebase-admin';
const{ getMessaging }  = require('firebase-admin/messaging');
const serviceAccount = require('../../config/firebase');
const admin = require('firebase-admin');

 
module.exports.init = function() {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

// let token  = 'ftRnOKZUQFpwj3ntdbv4x0:APA91bGnqUTaRUafzgsTnlBxxKPPxvVH-RJaisoUTdiuxg3s7CNU0HxuTgjAkLFB04ij6ebDBKuqDgd9vc0SSWCCdMIvxAZzbS-IgKZeeFcUlcOJ4IPwH9Fe_JPkEVBD_Z46SnDK9rBo'
// sendFCMMessage(token, message)
module.exports.sendFCMMessage = async function(fcmToken, msg) {
    try {
        const res = await getMessaging().send({
            webpush: {
                notification: {
                    ...msg,
                    icon: 'https://cdn-icons-png.flaticon.com/512/1312/1312183.png',
                    image: 'https://cdn-icons-png.flaticon.com/512/1312/1312183.png',
                    requireInteraction: msg.requireInteraction || false,
                    actions: [{
                        title: 'Open',
                        action: 'open',
                    }],
                    // data: {
                    //     link: msg.link,
                    // },
                },
            },
            token: fcmToken,
        });
        console.log('response', res);
        return res;
    } catch (e) {
        console.error('sendFCMMessage error', e);
    }
}
async function notify(fcmToken, msg) {
    try {
        const options = {
            priority: "high",
            timeToLive: 60 * 60 * 24,
            contentAvailable: true,
          };
        const  registrationToken = fcmToken
        const message =  {
            topic: "test",
            data: {
                ...msg,
                icon: 'https://cdn-icons-png.flaticon.com/512/1312/1312183.png',
                image: 'https://cdn-icons-png.flaticon.com/512/1312/1312183.png',
                requireInteraction: msg.requireInteraction || "false",
                // actions: [{
                //     title: 'Open',
                //     action: 'open',
                // }],
                // data: {
                //     link: msg.link,
                // },
            },
        }
       
       
        //Send message to topic
        const res = await getMessaging().send( message)
        .then( response => {
            console.log("Notification sent successfully", fcmToken)
        })
        .catch( error => {
            console.log(error);
        });
       
        //send message to device
        const res1 = await getMessaging().sendToDevice(fcmToken, message, options)
        .then( response => {
            console.log("Notification sent successfully", fcmToken)
        })
        .catch( error => {
            console.log(error);
        });

    } catch (e) {
        console.error('sendFCMMessage error', e);
    }
}

async function notifyTopic(msg, topic) {
    try {
        const options = {
            priority: "high",
            timeToLive: 60 * 60 * 24,
            contentAvailable: true,
          };
        const message =  {
            topic: topic,
            data: {
                ...msg,
                icon: 'https://cdn-icons-png.flaticon.com/512/1312/1312183.png',
                image: msg.image || 'https://cdn-icons-png.flaticon.com/512/1312/1312183.png',
                requireInteraction: msg.requireInteraction || "false",
                // actions: [{
                //     title: 'Open',
                //     action: 'open',
                // }],
                // data: {
                //     link: msg.link,
                // },
            },
        }
       
       
        //Send message to topic
        const res = await getMessaging().send( message)
        .then( response => {
            console.log("Notification sent successfully", yopic)
        })
        .catch( error => {
            console.log(error);
        });
       

    } catch (e) {
        console.error('sendFCMMessage error', e);
    }
}

async function subscribeToTopic(tokens, topic) {
    getMessaging().subscribeToTopic(tokens, topic)
        .then((response) => {
            console.log('Successfully subscribed to topic:', response);
        })
        .catch((error) => {
            console.log('Error subscribing to topic:', error);
        });
}

async function notifyDevice(fcmToken, msg) {
    try {
        const options = {
            priority: "high",
            timeToLive: 60 * 60 * 24,
            contentAvailable: true,
          };
        const  registrationToken = fcmToken
        const message =  {
           
            data: {
                ...msg,
                icon: 'https://cdn-icons-png.flaticon.com/512/1312/1312183.png',
                image: 'https://cdn-icons-png.flaticon.com/512/1312/1312183.png',
                requireInteraction: msg.requireInteraction || "false",
                
            },
        }
        //send message to device
        const res1 = await getMessaging().sendToDevice(fcmToken, message, options)
        .then( response => {
            console.log("Notification sent successfully", fcmToken)
        })
        .catch( error => {
            console.log(error);
        });

    } catch (e) {
        console.error('sendFCMMessage error', e);
    }
}

module.exports.sendNotifications = async function(tokens, payload) {
    for(let i = 0; i < tokens.length; i++) {
        notify(tokens[i], payload)
    }
}


module.exports.notify = notify
module.exports.subscribeToTopic = subscribeToTopic
module.exports.notifyTopic = notifyTopic
module.exports.notifyDevice = notifyDevice