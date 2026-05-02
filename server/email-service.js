const nodemailer = require('nodemailer');

const createTransporter = () => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_PORT == 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
};

const sendLowFilamentAlert = async (filament, remainingWeight, recipientEmail) => {
    // Check if SMTP is configured
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('SMTP not configured, skipping alert email.');
        return;
    }

    const transporter = createTransporter();

    const mailOptions = {
        from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
        to: recipientEmail || process.env.ALERT_EMAIL || process.env.SMTP_USER,
        subject: `⚠️ Low Filament Alert: ${filament.brand} ${filament.color_name}`,
        text: `The following filament is running low:\n\nBrand: ${filament.brand}\nMaterial: ${filament.material}\nColor: ${filament.color_name}\nRemaining: ${remainingWeight}g\n\nTime to order more!`,
        html: `
            <h3>⚠️ Low Filament Alert</h3>
            <p>The following filament is running low:</p>
            <ul>
                <li><strong>Brand:</strong> ${filament.brand}</li>
                <li><strong>Material:</strong> ${filament.material}</li>
                <li><strong>Color:</strong> ${filament.color_name}</li>
                <li><strong>Remaining:</strong> ${remainingWeight}g</li>
            </ul>
            <p>Time to order more!</p>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Alert email sent for ${filament.brand} ${filament.color_name}`);
    } catch (error) {
        console.error('Error sending alert email:', error);
    }
};

const sendPasswordResetEmail = async (recipientEmail, resetLink) => {
    const transporter = createTransporter();
    if (!transporter) {
        console.warn('SMTP not configured, skipping password reset email.');
        return false;
    }

    const mailOptions = {
        from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
        to: recipientEmail,
        subject: 'Reset your SPOOOL password',
        text: `We received a password reset request.\n\nUse this link (valid for 15 minutes):\n${resetLink}\n\nIf you did not request this, you can ignore this email.`,
        html: `
            <h3>Reset your SPOOOL password</h3>
            <p>We received a password reset request.</p>
            <p><a href="${resetLink}">Click here to reset your password</a> (valid for 15 minutes).</p>
            <p>If you did not request this, you can ignore this email.</p>
        `,
    };

    await transporter.sendMail(mailOptions);
    return true;
};

module.exports = { sendLowFilamentAlert, sendPasswordResetEmail };
