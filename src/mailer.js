const nodemailer = require('nodemailer');

function createTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'Info@syrianchristiancongress.org';

async function sendRegistrationNotification(reg) {
  const transporter = createTransport();
  if (!transporter) return;

  await transporter.sendMail({
    from: `"Syrian Christian Congress" <${process.env.SMTP_USER}>`,
    to: ADMIN_EMAIL,
    subject: `New Registration: ${reg.first_name} ${reg.last_name}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#1e3a5f">New Member Registration</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#666;width:140px">Name</td><td style="padding:6px 0"><strong>${reg.first_name} ${reg.last_name}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${reg.email}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Country</td><td style="padding:6px 0">${reg.country || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#666">State / Region</td><td style="padding:6px 0">${reg.state || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Denomination</td><td style="padding:6px 0">${reg.denomination || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#666;vertical-align:top">About</td><td style="padding:6px 0">${reg.about_yourself || '—'}</td></tr>
        </table>
        <p style="margin-top:1.5rem;font-size:.85rem;color:#999">View all registrations in the <a href="${process.env.SITE_URL || ''}/admin/">Admin Dashboard</a>.</p>
      </div>
    `,
  });
}

async function sendContactNotification(msg) {
  const transporter = createTransport();
  if (!transporter) return;

  await transporter.sendMail({
    from: `"Syrian Christian Congress" <${process.env.SMTP_USER}>`,
    to: ADMIN_EMAIL,
    replyTo: msg.email,
    subject: `New Contact Message: ${msg.subject || '(no subject)'}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#1e3a5f">New Contact Message</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#666;width:140px">From</td><td style="padding:6px 0"><strong>${msg.name}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${msg.email}</td></tr>
          <tr><td style="padding:6px 0;color:#666">Subject</td><td style="padding:6px 0">${msg.subject || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#666;vertical-align:top">Message</td><td style="padding:6px 0;white-space:pre-wrap">${msg.message}</td></tr>
        </table>
        <p style="margin-top:1.5rem;font-size:.85rem;color:#999">View all messages in the <a href="${process.env.SITE_URL || ''}/admin/">Admin Dashboard</a>.</p>
      </div>
    `,
  });
}

module.exports = { sendRegistrationNotification, sendContactNotification };
