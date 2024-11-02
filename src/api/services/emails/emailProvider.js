const Email = require('email-templates');
const nodemailer = require('nodemailer');
const { emailConfig } = require('../../../config/vars');
const fs = require('fs'); 
const path = require('path');
const Logger = require('../../../config/winston');
const logger = new Logger('/emails')
const { env } = require('../../../config/vars');
const dirPath = path.join(__dirname, './images');
// SMTP is the main transport in Nodemailer for delivering messages.
// SMTP is also the protocol used between almost all email hosts, so its truly universal.
// if you dont want to use SMTP you can create your own transport here
// such as an email service API or nodemailer-sendgrid-transport
let masterMailingList = 'amol@combuyn.in,nitin@combuyn.in,prateek@combuyn.in,amolag92@gmail.com'
if(env!== 'production'){
  masterMailingList = 'vneesh@gmail.com'
}
const attachments = [
  {   
      filename: 'logo512.png',
      path: dirPath+'/logo512.png',
      cid: 'logo512.png'
  }
];

const transporter = nodemailer.createTransport({
  port: emailConfig.port,
  host: emailConfig.host,
  auth: {
    user: emailConfig.username,
    pass: emailConfig.password,
  },
  secure: true, // upgrades later with STARTTLS -- change this based on the PORT
});

// verify connection configuration
transporter.verify((error) => {
  if (error) {
    console.log('error with email connection');
  }
});

exports.sendPasswordReset = async (passwordResetObject) => {
  const email = new Email({
    views: { root: __dirname },
    message: {
      from: 'support@your-app.com',
    },
    // uncomment below to send emails in development/test env:
    send: true,
    transport: transporter,
  });

  email
    .send({
      template: 'passwordReset',
      message: {
        to: passwordResetObject.userEmail,
      },
      locals: {
        productName: 'Test App',
        // passwordResetUrl should be a URL to your app that displays a view where they
        // can enter a new password along with passing the resetToken in the params
        passwordResetUrl: `https://your-app/new-password/view?resetToken=${passwordResetObject.resetToken}`,
      },
    })
    .catch(() => console.log('error sending password reset email'));
};

exports.sendPasswordChangeEmail = async (user) => {
  const email = new Email({
    views: { root: __dirname },
    message: {
      from: 'support@your-app.com',
    },
    // uncomment below to send emails in development/test env:
    send: true,
    transport: transporter,
  });

  email
    .send({
      template: 'passwordChange',
      message: {
        to: user.email,
      },
      locals: {
        productName: 'Test App',
        name: user.name,
      },
    })
    .catch(() => console.log('error sending change password email'));
};
console.log('__dirname', __dirname)

exports.sendOTP = async (user, otp) => {
  const filePath = path.join(__dirname, '/templates/otp.email.html');
  var emailTemplate = fs.readFileSync(filePath, {encoding:'utf8', flag:'r'}); 
  if(user && user.email) {
    const userData = {
        'otp': otp
    }
    Object.keys(userData).forEach( key => {
        emailTemplate = emailTemplate.replace('{{'+key+'}}', userData[key]);
    });

    var mailOptions = {
        from: '"Combuyn" <noreply@combuyn.in>',
        to: user.email,
        //bcc: emailIds,
        attachments: attachments,
        subject: 'Login/Signup OTP',
        html: emailTemplate
    };
    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
            logger.error(error)
        } else {
            console.log('Email sent to: '+user.email, info.response);
        }
    });
  } else {
    console.log('No email found')
  }
}

exports.sendApartmentRequestEmail = async (mobile, apartment) => {
  const filePath = path.join(__dirname, '/templates/apartment.request.email.html');
  var emailTemplate = fs.readFileSync(filePath, {encoding:'utf8', flag:'r'}); 
  if(mobile && apartment) {
    const userData = {
        'mobileNo': mobile,
        'apartmentName': apartment
    }
    Object.keys(userData).forEach( key => {
        emailTemplate = emailTemplate.replace('{{'+key+'}}', userData[key]);
    });

    var mailOptions = {
        from: '"Combuyn" <noreply@combuyn.in>',
        to: masterMailingList,
        subject: 'Apartment Request',
        attachments: attachments,
        html: emailTemplate
    };
    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
            logger.error(error)
        } else {
            console.log('Email sent to: '+user.email, info.response);
        }
    });
  } else {
    console.log('No email found')
  }
}

exports.sendCustomEmail = async (mailOptions) => {
  const filePath = path.join(__dirname, '/templates/otp.email.html');
  var emailTemplate = fs.readFileSync(filePath, {encoding:'utf8', flag:'r'}); 
  // if(user && user.email) {
  //   const userData = {
  //       'otp': otp
  //   }
  //   Object.keys(userData).forEach( key => {
  //       emailTemplate = emailTemplate.replace('{{'+key+'}}', userData[key]);
  //   });

    
    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
            logger.error(error)
        } else {
            console.log('Email sent to: '+user.email, info.response);
        }
    });
  // } else {
  //   console.log('No email found')
  // }
}

