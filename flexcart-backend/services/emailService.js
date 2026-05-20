const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: parseInt(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendOtpEmail = async (to, otp, username) => {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'FlexCart <noreply@flexcart.com>',
    to,
    subject: 'FlexCart – Your Password Reset OTP',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;border:1px solid #e0e7ff">
        <div style="margin-bottom:24px">
          <span style="font-size:22px;font-weight:700;color:#6366f1">FlexCart</span>
        </div>
        <h2 style="color:#111827;font-size:18px;margin:0 0 8px">Password Reset Request</h2>
        <p style="color:#6b7280;margin:0 0 8px;font-size:14px">Hi${username ? ' ' + username : ''},</p>
        <p style="color:#6b7280;margin:0 0 24px;font-size:14px">Use the OTP below to reset your password. It expires in <strong>10 minutes</strong>.</p>
        <div style="background:#ffffff;border:2px solid #e0e7ff;border-radius:10px;padding:24px;text-align:center;margin:0 0 24px">
          <span style="font-size:40px;font-weight:700;letter-spacing:14px;color:#6366f1">${otp}</span>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin:0">If you didn't request a password reset, you can safely ignore this email. Your password will not change.</p>
      </div>
    `,
  });
};

module.exports = { sendOtpEmail };
