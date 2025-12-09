# EEF Manager

A modern SaaS application for managing EEF proposals.

## Features

-  **Dashboard**: Overview of proposals, reviewers, and statistics
-  **Data Management**: Upload and manage proposal datasets
-  **Survey System**: Review submission and tracking
-  **Tracker**: Assignment management and status tracking
-  **Approval Workflow**: Track approved proposals and funding

## Refactoring History

This is a refactored version of the original EEF Manager application. The original monolithic HTML file has been split into modular, maintainable files.

## Project Structure

```
EEF Manager/
├── api/                        # Vercel serverless functions
│   └── index.js               # Express API entry point
├── server/                     # Backend Node.js server (local dev)
│   ├── index.js               # Express server entry point
│   └── middleware/
│       └── errorHandler.js   # Error handling
├── js/                         # Frontend JavaScript modules
│   ├── config.js              # Firebase configuration
│   ├── utils.js               # DOM helpers, formatting, notifications
│   ├── storage.js             # Firestore database operations
│   ├── csv.js                 # XLSX parsing utilities
│   ├── ui-builders.js         # UI component builders
│   ├── dashboard.js           # Dashboard rendering
│   ├── data.js                # Data tab operations
│   ├── survey.js              # Survey functionality
│   ├── tracker.js             # Tracker view logic
│   ├── approved.js            # Approved tab logic
│   ├── modal.js               # Modal/detail view
│   └── app.js                 # Main application orchestrator
├── index.html                  # Main HTML file
├── styles.css                  # Modern SaaS styling
├── package.json                # Node.js dependencies
├── .env.example                # Environment template
├── .gitignore                  # Git ignore rules
└── README.md                   # This file
```

## File Descriptions

### Core Files

- **index.html** - Minimal HTML structure with semantic sections
- **styles.css** - Complete styling (CSS variables, utilities, components)

### JavaScript Modules

- **js/config.js** - Firebase configuration and initialization
- **js/utils.js** - Shared utilities (DOM manipulation, formatting, notifications)
- **js/storage.js** - Centralized Firestore database operations
- **js/csv.js** - XLSX file parsing and processing
- **js/ui-builders.js** - Dynamic UI component generation

### Feature Modules

- **js/dashboard.js** - Dashboard metrics and reviewer progress
- **js/data.js** - Dataset management (upload, download, column detection)
- **js/survey.js** - Survey/review submission and management
- **js/tracker.js** - Proposal tracking, assignments, status filters
- **js/approved.js** - Approved proposals table and export
- **js/modal.js** - Proposal detail modal with autosave

### Main Application

- **js/app.js** - Application entry point, auth, navigation, state management


## Technology Stack

### Frontend
- Vanilla JavaScript (ES6 modules)
- Modern CSS with Inter font
- Firebase (Firestore, Authentication)
- Chart.js for visualizations
- XLSX for Excel file handling

### Backend
- Node.js with Express
- CORS, Helmet, Morgan for security and logging

## Setup Instructions

### Prerequisites

1. **Node.js** (v18 or higher)
2. **Firebase Project** with Firestore and Authentication enabled

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your actual values:
   ```env
   PORT=3000
   NODE_ENV=development
   FRONTEND_URL=http://localhost:8000

   # SMTP Configuration (required for email reminders)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USERNAME=your-email@gmail.com
   SMTP_PASSWORD=your-gmail-app-password
   FROM_EMAIL=your-email@gmail.com
   ```

   See [.env.example](.env.example) for detailed documentation on all variables.

3. **Configure Firebase**:
   - Update `js/config.js` with your Firebase configuration

## Usage

### Running the Application

#### Development Mode

1. **Start the backend server**:
   ```bash
   npm run dev
   ```
   Server will run on `http://localhost:3000`

2. **Start the frontend** (in a separate terminal):
   ```bash
   python3 -m http.server 8000
   ```
   Frontend will be available at `http://localhost:8000`

#### Production Mode

```bash
npm start
```

## Email Reminder Automation

Use the **Email Reminders** button in the Tracker tab to email each reviewer a summary of their assigned projects/due dates. The frontend gathers reviewer metadata and calls the backend route `POST /api/email/reminders`, which in turn uses basic SMTP credentials.

1. **Reviewer directory** – In Firestore create the document `config/reviewers` with a map of reviewer names to email addresses. Names are matched case-insensitively (and by first name) so `{"Bianca": "bianca@example.edu"}` is enough.
2. **Configure SMTP env vars** – Update `.env` (or your hosting environment variables) with:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USERNAME=your-email@gmail.com
   SMTP_PASSWORD=your-app-password
   FROM_EMAIL=your-email@gmail.com
   ```
   Change these values to use your own mailbox/provider.
3. **Run the backend** – `npm run dev` (or `npm start`) must be running so the `/api/email/reminders` endpoint is available.
4. **Send emails** – Open the Tracker tab and click **Email Reminders**. The UI will disable the button while the server sends emails and will warn you if any reviewers are missing email addresses in the Firestore directory.

## Admin access (free tier)

Create `config/admins` in Firestore with an `emails` array via the Firebase console. Any email in that array is treated as admin by the app (custom claims are still honored if you ever add them). See `docs/ADMIN_ACCESS.md` for console steps and an optional Firestore rule to restrict edits to admins.

## Deployment

### Quick Deploy to Vercel

For a quick 5-minute deployment, see **[QUICKSTART.md](QUICKSTART.md)**

For detailed deployment instructions and troubleshooting, see **[DEPLOYMENT.md](DEPLOYMENT.md)**

### Deploying to Vercel

This application can be easily deployed to Vercel with both frontend and backend.

#### Prerequisites

1. **Vercel Account** - Sign up at [vercel.com](https://vercel.com)
2. **Vercel CLI** (optional) - Install with `npm install -g vercel`
3. **Firebase Project** configured with your production credentials

#### Deployment Steps

##### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Import project to Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - Vercel will auto-detect the configuration from `vercel.json`

3. **Configure Environment Variables**:
   In the Vercel dashboard, add these environment variables:
   ```
   NODE_ENV=production
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USERNAME=your-email@gmail.com
   SMTP_PASSWORD=your-app-password
   FROM_EMAIL=your-email@gmail.com
   ```

4. **Deploy**:
   - Click "Deploy"
   - Vercel will build and deploy your application
   - You'll receive a production URL (e.g., `your-app.vercel.app`)

##### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```
   Follow the prompts to link your project.

4. **Add environment variables**:
   ```bash
   vercel env add SMTP_HOST
   vercel env add SMTP_PORT
   vercel env add SMTP_USERNAME
   vercel env add SMTP_PASSWORD
   vercel env add FROM_EMAIL
   ```

5. **Deploy to production**:
   ```bash
   vercel --prod
   ```

#### Post-Deployment Configuration

1. **Update Firebase Configuration**:
   - Add your Vercel domain to Firebase Authorized Domains
   - Go to Firebase Console → Authentication → Settings → Authorized domains
   - Add your Vercel URL (e.g., `your-app.vercel.app`)

2. **Update CORS Settings**:
   - The backend automatically allows requests from the same domain
   - If you need custom CORS settings, update `server/index.js`

3. **Test Email Functionality**:
   - Verify SMTP credentials are working
   - Test the Email Reminders feature in the Tracker tab

#### Vercel Configuration

The `vercel.json` file in the project root configures:
- **Serverless Functions**: Backend API runs as serverless functions
- **Routing**: API routes are handled by the backend, static files served directly
- **Environment**: Production environment variables

#### Updating Your Deployment

**Automatic Deployments** (if connected to GitHub):
- Every push to `main` branch automatically deploys to production
- Pull requests create preview deployments

**Manual Deployments**:
```bash
vercel --prod
```

#### Custom Domain (Optional)

1. Go to your project in Vercel Dashboard
2. Navigate to Settings → Domains
3. Add your custom domain
4. Follow DNS configuration instructions
5. Update Firebase Authorized Domains with your custom domain

#### Monitoring and Logs

- **Vercel Dashboard**: View deployment logs and function logs
- **Real-time Logs**: `vercel logs` (CLI)
- **Analytics**: Available in Vercel Dashboard → Analytics

## API Endpoints

### Health Check
```http
GET /health
```

Returns server status and timestamp.

### Email Reminders
```http
POST /api/email/reminders
```

Sends email reminders to assigned reviewers. See [Email Reminder Automation](#email-reminder-automation) section.

## Development

### Adding New Features

1. Determine which module the feature belongs to
2. Add the functionality to the appropriate .js file
3. Export new functions if they need to be used elsewhere
4. Import them in the modules that need them

### Modifying Existing Features

1. Use your code editor's search to find the relevant function
2. The modular structure makes it easy to locate specific functionality
3. Make changes in the isolated module without affecting others

## Backup

The original monolithic file is preserved as index.html.backup for reference.

## Security Notes

1. **Never commit `.env` file** - It contains sensitive credentials
2. **Use HTTPS in production** for all API communications
3. **Limit CORS origins** to your production domain
4. **Keep Firebase configuration secure** - Configure proper Firestore security rules

## Troubleshooting

### Common Issues

1. **CORS errors**
   - Check `FRONTEND_URL` in `.env` matches your frontend URL
   - Ensure backend server is running

2. **"Cannot find module"**
   - Run `npm install` to install dependencies
   - Check Node.js version (v18+ required)

3. **Firebase connection issues**
   - Verify your Firebase configuration in [js/config.js](js/config.js)
   - Check that Firestore and Authentication are enabled in your Firebase project
   - Review Firestore security rules

## Browser Compatibility

Requires a modern browser with ES6 module support:
- Chrome 61+
- Firefox 60+
- Safari 11+
- Edge 16+
