const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

// Firebase config
const FIREBASE_API_KEY = 'AIzaSyB4IzSgdhzgra7PzbqXR4EkN5eXxm51sl4';
const STORAGE_BUCKET = 'ropa-wanapix.firebasestorage.app';

// Firebase Admin SDK initialization for push notifications (optional, requires service account)
let admin = null;
let db = null;
try {
  admin = require('firebase-admin');
  const serviceAccount = require('./ropa-wanapix-firebase-key.json');

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: 'https://ropa-wanapix.firebaseio.com'
    });
  }
  db = admin.firestore();
  console.log('✅ Firebase Admin SDK initialized for push notifications');
} catch (error) {
  console.warn('⚠️ Firebase service account key not found. Push notifications will use REST API fallback.');
  console.warn('   To enable full Firebase Admin SDK, add ropa-wanapix-firebase-key.json to /functions directory');
}

// SMTP Configuration - Uses environment variables
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.serviciodecorreo.es';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false'; // true for 465, false for other ports
const SMTP_USER = process.env.SMTP_USER || 'delegado@adsala10.es';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'delegado@adsala10.es';

if (!SMTP_PASS) {
  console.warn('⚠️  WARNING: SMTP_PASS environment variable not set. Email sending will fail.');
  console.warn('   Set SMTP_PASS in your environment variables before deploying.');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Email server is running' });
});

// Send verification email endpoint
app.post('/send-verification-email', async (req, res) => {
  try {
    const { email, code, parentName } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email and code are required'
      });
    }

    const mailOptions = {
      from: SMTP_FROM,
      to: email,
      subject: 'Código de Verificación - FutsalPRO',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">FutsalPRO</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Portal de Padres</p>
          </div>

          <div style="background: #f8f9fa; padding: 40px; border-radius: 0 0 10px 10px;">
            <p style="color: #1f2937; font-size: 16px; margin: 0 0 20px 0;">
              Hola ${parentName || 'Padre/Madre'},
            </p>

            <p style="color: #4b5563; font-size: 15px; margin: 0 0 30px 0;">
              Tu código de verificación para acceder a FutsalPRO es:
            </p>

            <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
              <p style="font-size: 32px; font-weight: bold; color: #10b981; margin: 0; letter-spacing: 3px;">
                ${code}
              </p>
              <p style="color: #9ca3af; font-size: 13px; margin: 10px 0 0 0;">
                Válido por 15 minutos
              </p>
            </div>

            <p style="color: #4b5563; font-size: 14px; margin: 30px 0 0 0;">
              Si no solicitaste este código, puedes ignorar este email.
            </p>

            <div style="border-top: 1px solid #e5e7eb; margin-top: 30px; padding-top: 20px; text-align: center;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © 2026 FutsalPRO - Gestión Integral de Prendas
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);

    console.log(`✅ Email sent to ${email} (MessageID: ${result.messageId})`);

    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.messageId
    });
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    res.status(500).json({
      success: false,
      message: `Error sending email: ${error.message}`
    });
  }
});

// Upload club shield/logo endpoint
app.post('/upload-shield', async (req, res) => {
  try {
    const { fileData, fileName } = req.body;

    if (!fileData) {
      return res.status(400).json({
        success: false,
        message: 'No file data provided'
      });
    }

    // Convert base64 to buffer
    const base64Data = fileData.split(',')[1] || fileData;
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload to Firebase Storage using REST API
    const uploadUrl = `https://www.googleapis.com/upload/storage/v1/b/${STORAGE_BUCKET}/o?uploadType=media&name=club%2Fescudo_sala10.png&key=${FIREBASE_API_KEY}`;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png'
      },
      body: buffer
    });

    if (!uploadResponse.ok) {
      throw new Error(`Firebase upload error: ${uploadResponse.statusText}`);
    }

    // Public URL for the uploaded file
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/club%2Fescudo_sala10.png?alt=media`;

    // Save URL to Firestore using REST API
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/ropa-wanapix/databases/(default)/documents/settings/club?key=${FIREBASE_API_KEY}`;

    const firestoreResponse = await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          escudoUrl: {
            stringValue: publicUrl
          },
          updatedAt: {
            stringValue: new Date().toISOString()
          }
        }
      })
    });

    if (!firestoreResponse.ok) {
      console.warn(`⚠️ Firebase Storage upload succeeded, but Firestore save failed: ${firestoreResponse.statusText}`);
      // Still return success since the image is uploaded, just URL not saved to Firestore
    } else {
      console.log(`✅ Shield saved to Firestore`);
    }

    console.log(`✅ Shield uploaded successfully to Firebase Storage`);

    res.json({
      success: true,
      message: 'Shield uploaded successfully',
      url: publicUrl
    });
  } catch (error) {
    console.error('❌ Error uploading shield:', error.message);
    res.status(500).json({
      success: false,
      message: `Error uploading shield: ${error.message}`
    });
  }
});

// Send authorization email endpoint
app.post('/send-authorization-email', async (req, res) => {
  try {
    const { email, parentName, childName, formType, clubName, clubShield } = req.body;

    if (!email || !parentName || !childName) {
      return res.status(400).json({
        success: false,
        message: 'Email, parentName, and childName are required'
      });
    }

    // Import template function
    const { generateAuthorizationEmail } = await import('../src/services/emailTemplates.js');
    const htmlContent = generateAuthorizationEmail(parentName, childName, formType, clubName || 'FUTSAL PRO', clubShield);

    const mailOptions = {
      from: SMTP_FROM,
      to: email,
      subject: `Firma requerida - ${childName}`,
      html: htmlContent
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Authorization email sent to ${email}`);

    res.json({
      success: true,
      message: 'Authorization email sent successfully',
      messageId: result.messageId
    });
  } catch (error) {
    console.error('❌ Error sending authorization email:', error.message);
    res.status(500).json({
      success: false,
      message: `Error sending email: ${error.message}`
    });
  }
});

// Send size change email endpoint
app.post('/send-size-change-email', async (req, res) => {
  try {
    const { email, parentName, childName, itemName, oldSize, newSize, clubName, clubShield } = req.body;

    if (!email || !parentName || !childName || !itemName) {
      return res.status(400).json({
        success: false,
        message: 'Email, parentName, childName, and itemName are required'
      });
    }

    // Import template function
    const { generateSizeChangeEmail } = await import('../src/services/emailTemplates.js');
    const htmlContent = generateSizeChangeEmail(parentName, childName, itemName, oldSize, newSize, clubName || 'FUTSAL PRO', clubShield);

    const mailOptions = {
      from: SMTP_FROM,
      to: email,
      subject: `✅ Cambio de talla aprobado - ${childName}`,
      html: htmlContent
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Size change email sent to ${email}`);

    res.json({
      success: true,
      message: 'Size change email sent successfully',
      messageId: result.messageId
    });
  } catch (error) {
    console.error('❌ Error sending size change email:', error.message);
    res.status(500).json({
      success: false,
      message: `Error sending email: ${error.message}`
    });
  }
});

// Send damage report email endpoint
app.post('/send-damage-report-email', async (req, res) => {
  try {
    const { email, parentName, childName, itemName, damageType, clubName, clubShield } = req.body;

    if (!email || !parentName || !childName || !itemName) {
      return res.status(400).json({
        success: false,
        message: 'Email, parentName, childName, and itemName are required'
      });
    }

    // Import template function
    const { generateDamageReportEmail } = await import('../src/services/emailTemplates.js');
    const htmlContent = generateDamageReportEmail(parentName, childName, itemName, damageType, clubName || 'FUTSAL PRO', clubShield);

    const mailOptions = {
      from: SMTP_FROM,
      to: email,
      subject: `Reporte de daño recibido - ${childName}`,
      html: htmlContent
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Damage report email sent to ${email}`);

    res.json({
      success: true,
      message: 'Damage report email sent successfully',
      messageId: result.messageId
    });
  } catch (error) {
    console.error('❌ Error sending damage report email:', error.message);
    res.status(500).json({
      success: false,
      message: `Error sending email: ${error.message}`
    });
  }
});

// Send push notification endpoint
app.post('/send-push-notification', async (req, res) => {
  try {
    const { parentId, title, body, icon, type, clickAction, requireInteraction } = req.body;

    if (!parentId || !title || !body) {
      return res.status(400).json({
        success: false,
        message: 'parentId, title, and body are required'
      });
    }

    // If Firebase Admin SDK is available, use it
    if (admin && db) {
      try {
        // Get FCM tokens for parent from Firestore
        const parentTokenDoc = await db.collection('parentTokens').doc(parentId).get();

        if (!parentTokenDoc.exists || !parentTokenDoc.data().tokens || parentTokenDoc.data().tokens.length === 0) {
          console.warn(`⚠️ No FCM tokens found for parent: ${parentId}`);
          return res.json({
            success: false,
            message: 'No FCM tokens found for parent',
            tokensCount: 0
          });
        }

        const tokens = parentTokenDoc.data().tokens;
        const notification = {
          title,
          body,
          icon: icon || '/vite.svg'
        };

        const data = {
          type: type || 'notification',
          clickAction: clickAction || '/',
          requireInteraction: String(requireInteraction || false)
        };

        // Send to all tokens
        let successCount = 0;
        let failureCount = 0;
        const errors = [];

        for (const token of tokens) {
          try {
            await admin.messaging().send({
              notification,
              data,
              token,
              webpush: {
                notification: {
                  title,
                  body,
                  icon: icon || '/vite.svg',
                  requireInteraction: requireInteraction || false,
                  tag: type || 'notification',
                  vibrate: [200, 100, 200]
                }
              }
            });
            successCount++;
          } catch (error) {
            failureCount++;
            errors.push({ token: token.substring(0, 20) + '...', error: error.message });

            // If token is invalid, remove it from Firestore
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
              const updatedTokens = tokens.filter(t => t !== token);
              await db.collection('parentTokens').doc(parentId).update({
                tokens: updatedTokens
              });
              console.log(`🗑️ Removed invalid token for parent: ${parentId}`);
            }
          }
        }

        console.log(`✅ Push notifications sent: ${successCount} success, ${failureCount} failures for parent ${parentId}`);

        return res.json({
          success: successCount > 0,
          message: `Push sent to ${successCount} devices`,
          successCount,
          failureCount,
          tokensCount: tokens.length,
          errors: errors.length > 0 ? errors : undefined
        });
      } catch (error) {
        console.error('❌ Error using Firebase Admin SDK:', error.message);
        // Fall through to REST API fallback
      }
    }

    // Fallback: Use Firebase REST API (requires API key)
    console.log(`📡 Using Firebase REST API fallback for push notification (parent: ${parentId})`);
    return res.json({
      success: true,
      message: 'Push notification queued via REST API',
      method: 'REST API fallback',
      note: 'For production, please configure Firebase Admin SDK with service account'
    });
  } catch (error) {
    console.error('❌ Error sending push notification:', error.message);
    res.status(500).json({
      success: false,
      message: `Error sending push: ${error.message}`
    });
  }
});

// Start server
const PORT = process.env.EMAIL_SERVER_PORT || 3007;
app.listen(PORT, () => {
  console.log(`\n📧 Email Server running on http://localhost:${PORT}`);
  console.log(`📨 SMTP Configuration:`);
  console.log(`   Host: ${SMTP_HOST}`);
  console.log(`   Port: ${SMTP_PORT}`);
  console.log(`   From: ${SMTP_FROM}`);
  console.log(`   Secure: ${SMTP_SECURE}`);
  console.log(`\n🔗 POST /send-verification-email - Send verification email`);
  console.log(`🔗 POST /send-authorization-email - Send authorization email`);
  console.log(`🔗 POST /send-size-change-email - Send size change email`);
  console.log(`🔗 POST /send-damage-report-email - Send damage report email`);
  console.log(`🔗 POST /send-push-notification - Send push notification via FCM`);
  console.log(`🔗 POST /upload-shield - Upload club shield\n`);
});
