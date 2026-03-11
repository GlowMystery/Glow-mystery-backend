const nodemailer = require('nodemailer');

// Configure the email transport using SMTP
// User must provide EMAIL_USER and EMAIL_PASS in .env
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Function to send Registration Email
const sendRegistrationEmail = async (toEmail, name) => {
  const mailOptions = {
    from: `"Glow Mystery" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Welcome to Glow Mystery!',
    html: `
      <h2>Welcome, ${name}!</h2>
      <p>Thank you for registering at Glow Mystery. We are thrilled to have you here.</p>
      <p>Explore our premium skincare products and reveal your glow.</p>
      <br>
      <p>Best Regards,</p>
      <p>Glow Mystery Team</p>
    `,
  };
  return transporter.sendMail(mailOptions);
};

// Function to send OTP on Registration
const sendRegistrationOTPEmail = async (toEmail, name, otp) => {
  const mailOptions = {
    from: `"Glow Mystery" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Welcome to Glow Mystery! Verify your email',
    html: `
      <h2>Welcome, ${name}!</h2>
      <p>Thank you for registering at Glow Mystery. We are thrilled to have you here.</p>
      <p>To complete your registration, please verify your email address using the OTP below:</p>
      <h3 style="background:#f3c462; color:#000; display:inline-block; padding:10px 20px; border-radius:5px;">${otp}</h3>
      <p>This code will expire in 15 minutes.</p>
      <br>
      <p>Best Regards,</p>
      <p>Glow Mystery Team</p>
    `,
  };
  return transporter.sendMail(mailOptions);
};

// Function to send OTP for Password Reset
const sendOTPEmail = async (toEmail, otp) => {
  const mailOptions = {
    from: `"Glow Mystery Support" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Password Reset OTP - Glow Mystery',
    html: `
      <h2>Password Reset Request</h2>
      <p>You requested to reset your password. Use the OTP below to complete the process:</p>
      <h3 style="background:#f3c462; color:#000; display:inline-block; padding:10px 20px; border-radius:5px;">${otp}</h3>
      <p>This code will expire in 15 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    `,
  };
  return transporter.sendMail(mailOptions);
};

// Function to send Order Status Update
const sendOrderStatusEmail = async (toEmail, name, orderId, status) => {
  const mailOptions = {
    from: `"Glow Mystery Orders" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `Order Update #${orderId} - Glow Mystery`,
    html: `
      <h2>Order Status Update</h2>
      <p>Hi ${name},</p>
      <p>The status of your order <strong>#${orderId}</strong> is now: <strong style="color:#d8a648;">${status}</strong>.</p>
      <p>Thank you for shopping with us!</p>
    `,
  };
  return transporter.sendMail(mailOptions);
};

// Function to send Order Invoice
const sendInvoiceEmail = async (toEmail, name, order) => {
  let itemsHtml = order.orderItems.map(item => `
    <tr>
      <td style="padding:10px; border-bottom:1px solid #ccc;">Product ID: ${item.productId}</td>
      <td style="padding:10px; border-bottom:1px solid #ccc;">${item.quantity}</td>
      <td style="padding:10px; border-bottom:1px solid #ccc;">₹${item.price.toFixed(2)}</td>
    </tr>
  `).join('');

  const mailOptions = {
    from: `"Glow Mystery Billing" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `Invoice for Order #${order.id} - Glow Mystery`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2 style="color: #d8a648;">Glow Mystery Invoice</h2>
        <p>Dear ${name},</p>
        <p>Thank you for your purchase. Your payment was successful.</p>
        
        <h3>Order #${order.id}</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background:#f4f4f4;">
              <th style="padding:10px; text-align:left;">Item</th>
              <th style="padding:10px; text-align:left;">Qty</th>
              <th style="padding:10px; text-align:left;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:10px; text-align:right; font-weight:bold;">Total Amount:</td>
              <td style="padding:10px; font-weight:bold; color:#d8a648;">₹${order.totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        
        <p>If you have any questions, feel free to reply to this email or contact support.</p>
      </div>
    `,
  };
  return transporter.sendMail(mailOptions);
};

module.exports = {
  sendRegistrationEmail,
  sendRegistrationOTPEmail,
  sendOTPEmail,
  sendOrderStatusEmail,
  sendInvoiceEmail
};
