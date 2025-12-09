/**
 * Vercel Serverless Function Entry Point
 * Wraps the Express app for Vercel deployment
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

// Load environment variables
dotenv.config();

const app = express();

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_SECURE = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : SMTP_PORT === 465;
const SMTP_USERNAME = process.env.SMTP_USERNAME || '';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || '';
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USERNAME;

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // In production (Vercel), allow same-origin requests
    if (process.env.NODE_ENV === 'production') {
      return callback(null, true);
    }

    // In development, allow localhost and 127.0.0.1
    const allowedOrigins = [
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      process.env.FRONTEND_URL
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));

// Logging middleware
app.use(morgan('dev'));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'EEF Manager Backend'
  });
});

function buildAssignmentCopy(assignments = []) {
  const html = assignments.map(item => {
    if (!item?.projectName) return '';
    const due = item.dueDateHuman || item.dueDate || '';
    const link = item.proposalUrl ? ` (<a href="${item.proposalUrl}">proposal</a>)` : '';
    const dueCopy = due ? ` – due ${due}` : '';
    return `<li><strong>${item.projectName}</strong>${dueCopy}${link}</li>`;
  }).join('');
  const text = assignments.map(item => {
    if (!item?.projectName) return '';
    const due = item.dueDateHuman || item.dueDate || '';
    const link = item.proposalUrl ? ` (${item.proposalUrl})` : '';
    const dueCopy = due ? ` – due ${due}` : '';
    return `• ${item.projectName}${dueCopy}${link}`;
  }).filter(Boolean).join('\n');
  return { html, text };
}

function ensureMailer() {
  if (!SMTP_USERNAME || !SMTP_PASSWORD || !FROM_EMAIL) {
    throw new Error('SMTP credentials are missing. Set SMTP_USERNAME, SMTP_PASSWORD, and FROM_EMAIL environment variables.');
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USERNAME,
      pass: SMTP_PASSWORD,
    },
  });
}

app.post('/api/email/reminders', async (req, res, next) => {
  try {
    const reviewers = Array.isArray(req.body?.reviewers) ? req.body.reviewers : [];
    if (!reviewers.length) {
      return res.status(400).json({ error: 'No reviewers supplied.' });
    }
    const datasetName = req.body?.datasetName || 'EEF Assignments';
    const trackerUrl = req.body?.trackerUrl;
    const triggeredBy = req.body?.triggeredBy || 'EEF Manager';

    const sanitized = reviewers.map(r => ({
      name: (r?.name || '').trim() || 'Reviewer',
      email: (r?.email || '').trim(),
      assignments: Array.isArray(r?.assignments) ? r.assignments : [],
    })).filter(r => r.email && r.assignments.length);

    if (!sanitized.length) {
      return res.status(400).json({ error: 'Reviewer payload missing valid email addresses.' });
    }

    const transporter = ensureMailer();
    await Promise.all(sanitized.map(async reviewer => {
      const subject = `[EEF Manager] ${datasetName} reminder`;
      const { html, text } = buildAssignmentCopy(reviewer.assignments);
      const greeting = reviewer.name || 'Reviewer';
      const trackerHtml = trackerUrl ? `<p>Tracker: <a href="${trackerUrl}">${trackerUrl}</a></p>` : '';
      const triggeredHtml = triggeredBy ? `<p>Requested by: ${triggeredBy}</p>` : '';

      const htmlBody = `
        <p>Hi ${greeting},</p>
        <p>Here are the projects currently assigned to you in ${datasetName}:</p>
        <ul>${html}</ul>
        ${trackerHtml}
        ${triggeredHtml}
        <p>— EEF Manager</p>
      `;

      const textBody = [
        `Hi ${greeting},`,
        '',
        `Here are the projects currently assigned to you in ${datasetName}:`,
        text,
        '',
        trackerUrl ? `Tracker: ${trackerUrl}` : '',
        triggeredBy ? `Requested by: ${triggeredBy}` : '',
        '',
        '— EEF Manager'
      ].filter(Boolean).join('\n');

      await transporter.sendMail({
        from: FROM_EMAIL,
        to: reviewer.email,
        subject,
        text: textBody,
        html: htmlBody,
      });
    }));

    res.json({
      sent: sanitized.map(r => r.email),
      requestedBy: triggeredBy,
    });
  } catch (err) {
    next(err);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// Export the Express app for Vercel
export default app;
