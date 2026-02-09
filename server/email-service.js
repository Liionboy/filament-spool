const nodemailer = require('nodemailer');

const sendLowFilamentAlert = async (filament, remainingWeight) => {
    // Check if SMTP is configured
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('SMTP not configured, skipping alert email.');
        return;
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_PORT == 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const mailOptions = {
        from: `"Filament Inventory" <${process.env.SMTP_USER}>`,
        to: process.env.ALERT_EMAIL || process.env.SMTP_USER,
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

module.exports = { sendLowFilamentAlert };
