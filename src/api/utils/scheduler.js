
const schedule = require('node-schedule');
const cron = require('node-cron');
const {scheduleCampaignEnd, inactivateCampaign, processMissingReferralRewards, dailyReferralSummary} = require('./jobs')
const Logger = require('../../config/winston');
const logger = new Logger('/scheduler')
const moment = require('moment')
const { env} = require('../../config/vars');
let d = new Date()
var m = moment(d).utc().format('YYYY-MM-DD HH:mm:ss');

console.log("Serve Time:", new Date())
console.log("UTC Time:", m)
var n = moment(d).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
console.log("IST Time", n);
console.log("Servr Timezone offset:",  new Date().getTimezoneOffset() )
//scheduleCampaignEnd()
exports.startCronJob = function() {
    console.info('Starting the cron job')
    const job = cron.schedule('0 */15 * * * *', async () => {
        console.info('Running 15 minutes Cron Job at ',new Date())
        logger.info('Running 15 minutes Cron Job at '+new Date())
        try {
            let now = new Date();
            let campaigns = await scheduleCampaignEnd()
            let campaignDetails = campaigns.map(c => {
                let cp = {
                    id: c._id,
                    name: c.name,
                    startTime: c.startTime
                }
                return cp;
            })
            console.log('Found '+ campaigns.length+ ' campaigns: '+ JSON.stringify(campaignDetails))
            logger.info('Found '+ campaigns.length+ ' campaigns: '+ JSON.stringify(campaignDetails))
            for(let i = 0; i < campaigns.length; i++) {
                const duration = moment.duration(moment(campaigns[i].endTime).diff(now));
                const minutes = duration.asMinutes();
                scheduleJob(minutes, () => {
                    inactivateCampaign(campaigns[i]._id);
                });
            }

        } catch(e){
            console.log(e);
            
        }
    });
    //console.log('After job instantiation');
    job.start();

    const dailyJob = cron.schedule('0 0 0 * * *', async () => {
        //will run every day at 12:00 AM
        console.log('Running cron job for every day'); 
        processMissingReferralRewards()
        // if(env == 'production'){
        //     dailyReferralSummary()
        // }
    })

    const dailyReportsJob = cron.schedule('0 30 16 * * *', async () => {
        //will run every day at 4.30 PM (Central Time) 10.00 PM IST
        if(env == 'production'){
            dailyReferralSummary()
        }
    })
    dailyReportsJob.start();
    dailyJob.start();
}



// cron.schedule('* * * * *', () => {
//   console.log('running a task every minute');
// });
function scheduleJob(after, fn) {
    let now = new Date();
    scheduledTime = now.setSeconds(now.getSeconds() + after);
    /*
    let year = scheduledTime.getYear();
    let month = scheduledTime.getMonth();
    let day = scheduledTime.getDay();
    let hour = scheduledTime.getHours();
    let minutes = scheduledTime.getMinutes();
    let seconds = scheduledTime.getMinutes();
    */
    console.log('Scheduled job on ', new Date(scheduledTime))
    const job = schedule.scheduleJob(scheduledTime, fn);
}


exports.scheduleOn = function(date, fn, options) {
    let now = new Date(date);
    let scheduledTime = new Date(date);;
    scheduledTime.setSeconds(scheduledTime.getSeconds() + 30);
    let clientTimeOffset = -330;
    let serverTimeOffset = now.getTimezoneOffset();
    console.log('Scheduling',clientTimeOffset, serverTimeOffset) 
    
    let timeDiff = clientTimeOffset + serverTimeOffset;
    scheduledTime.setMinutes(scheduledTime.getMinutes() + timeDiff);
    console.log('Scheduled job on ', date, new Date(scheduledTime), 'current time', new Date())
    const job = schedule.scheduleJob(scheduledTime, fn)
}

exports.scheduleJob = scheduleJob