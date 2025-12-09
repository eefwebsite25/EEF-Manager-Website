# Firebase Setup Guide for EEF Manager

This guide will walk you through setting up a new Firebase project for the EEF Manager application, including creating the database, configuring security rules, and migrating from an existing Firebase project.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Creating a New Firebase Project](#creating-a-new-firebase-project)
3. [Enabling Firestore Database](#enabling-firestore-database)
4. [Configuring Firestore Security Rules](#configuring-firestore-security-rules)
5. [Setting Up Firestore Indexes](#setting-up-firestore-indexes)
6. [Updating Application Configuration](#updating-application-configuration)
7. [Migrating Data from Existing Project](#migrating-data-from-existing-project)
8. [Testing the Setup](#testing-the-setup)
9. [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have:

- A Google account
- Access to [Firebase Console](https://console.firebase.google.com/)
- Basic understanding of Firebase/Firestore
- Text editor (VS Code, Notepad++, etc.)
- Modern web browser

## Creating a New Firebase Project

### Step 1: Access Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Sign in with your Google account
3. Click **"Add project"** or **"Create a project"**

### Step 2: Configure Project

1. **Project Name**:
   - Enter a name like `EEF-Manager` or `Educational-Excellence-Fund`
   - Firebase will auto-generate a unique Project ID (e.g., `eef-manager-a1b2c`)
   - Click **Continue**

2. **Google Analytics** (Optional):
   - Choose whether to enable Google Analytics
   - For internal tools, you can disable this
   - Click **Continue**

3. **Confirm**:
   - Review Firebase terms
   - Click **Create project**
   - Wait for project creation (30-60 seconds)

4. **Finish**:
   - Click **Continue** when setup is complete

### Step 3: Note Your Project Details

You'll need these later:
- **Project ID**: Found in Project Settings (gear icon)
- **Project Name**: Your chosen name

## Enabling Firestore Database

### Step 1: Navigate to Firestore

1. In Firebase Console, select your new project
2. In the left sidebar, click **"Build"** → **"Firestore Database"**
3. Click **"Create database"**

### Step 2: Choose Security Mode

You'll be presented with two options:

**Option 1: Production Mode (Recommended)**
- Starts with secure rules (denies all reads/writes)
- You'll add custom rules next
- Better for security
- **Select this option**

**Option 2: Test Mode**
- Allows all reads/writes for 30 days
- Insecure - anyone with your config can access data
- Not recommended for production

Click **Next** after selecting Production Mode.

### Step 3: Choose Location

1. Select a Firestore location (cannot be changed later):
   - **North America**: `us-central1`, `us-east1`, `us-west1`
   - **Europe**: `europe-west1`, `europe-west2`
   - **Asia**: `asia-northeast1`, `asia-south1`

2. Consider:
   - Choose closest to your users for better performance
   - Must match Firebase Hosting location if using same region

3. Click **Enable**

4. Wait for database creation (1-2 minutes)

### Step 4: Verify Database Creation

You should see an empty Firestore Database with:
- A **"Start collection"** button
- Tabs for **Data**, **Rules**, **Indexes**, **Usage**, **Monitoring**

## Configuring Firestore Security Rules

Security rules control who can read/write data in Firestore.

### Step 1: Access Security Rules

1. In Firestore Database, click the **"Rules"** tab
2. You'll see the default rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Step 2: Update Security Rules

Replace the default rules with the following:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Allow all authenticated users to read/write
    // Replace with stricter rules if implementing Firebase Auth
    match /{document=**} {
      allow read, write: if true;
    }

    // Tabs (Datasets) - Top-level collection
    match /tabs/{tabId} {
      allow read, write: if true;

      // Surveys subcollection
      match /surveys/{surveyId} {
        allow read, write: if true;
      }

      // Proposals subcollection
      match /proposals/{proposalId} {
        allow read, write: if true;
      }

      // Meta documents
      match /meta/{docId} {
        allow read, write: if true;
      }
    }

    // Global config
    match /config/{docId} {
      allow read, write: if true;
    }
  }
}
```

### Step 3: Publish Rules

1. Click **"Publish"** button
2. Confirm the changes
3. Wait for rules to deploy (5-10 seconds)

### Security Notes

⚠️ **Current Rules**: The above rules allow **anyone** with your Firebase config to read/write data. This is acceptable for:
- Internal tools within a trusted network
- Applications with application-level password protection (like EEF Manager)

🔒 **For Better Security**: If you implement Firebase Authentication later, update rules to:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

This requires users to be signed in with Firebase Auth.

## Setting Up Firestore Indexes

Indexes improve query performance for sorted/filtered data.

### Automatic Index Creation

The EEF Manager app will trigger automatic index creation when you first use certain features. Firebase will show a link in the browser console to create required indexes.

### Manual Index Creation

For optimal performance, create these indexes manually:

#### Step 1: Access Indexes Tab

1. In Firestore Database, click **"Indexes"** tab
2. Click **"Create Index"**

#### Step 2: Create Survey Timestamp Index

1. **Collection ID**: `surveys`
2. **Fields to index**:
   - Field: `timestamp`, Order: `Descending`
3. **Query scope**: `Collection`
4. Click **Create**

Wait for index to build (shows "Building..." then "Enabled")

#### Step 3: Create Composite Indexes (Optional)

These are created automatically when needed. If you want to pre-create them:

**Index for filtering surveys by project and timestamp**:
- Collection: `surveys`
- Fields:
  - `projectName` - Ascending
  - `timestamp` - Descending

### Monitoring Index Status

- **Building**: Index is being created (can take minutes for large datasets)
- **Enabled**: Index is ready for use
- **Error**: Check field names and types

## Updating Application Configuration

Now you need to update the EEF Manager app to use your new Firebase project.

### Step 1: Get Firebase Config

1. In Firebase Console, click the **gear icon** (⚙️) → **Project settings**
2. Scroll down to **"Your apps"** section
3. Click the **Web icon** (`</>`) to add a web app
4. **Register app**:
   - App nickname: `EEF Manager Web`
   - **Do NOT** check "Also set up Firebase Hosting" (we'll do this separately)
   - Click **"Register app"**

5. You'll see a config object like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890",
  measurementId: "G-XXXXXXXXXX"
};
```

6. **Copy this entire config object**

### Step 2: Update index.html

1. Open `index.html` in your text editor
2. Search for this line (around line 700-800):

```javascript
const firebaseConfig = {
```

3. Replace the entire `firebaseConfig` object with your new config
4. It should look like this:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_NEW_API_KEY",
  authDomain: "YOUR_NEW_PROJECT.firebaseapp.com",
  projectId: "YOUR_NEW_PROJECT_ID",
  storageBucket: "YOUR_NEW_PROJECT.appspot.com",
  messagingSenderId: "YOUR_NEW_SENDER_ID",
  appId: "YOUR_NEW_APP_ID",
  measurementId: "YOUR_NEW_MEASUREMENT_ID"
};
```

5. **Save the file**

### Step 3: Verify Configuration

1. Open `index.html` in your web browser
2. Open browser console (F12)
3. Enter password: `eef2025`
4. Check console for errors:
   - ✅ No errors = Configuration successful
   - ❌ Errors about permissions = Check security rules
   - ❌ Errors about "apiKey" = Check configuration copy/paste

## Migrating Data from Existing Project

If you have an existing Firebase project with data, you can migrate it to your new project.

### Option 1: Manual Export/Import (Small Datasets)

#### Export from Old Project

1. Go to old Firebase Console
2. Open Firestore Database
3. For each collection:
   - Use EEF Manager's export features (CSV)
   - Or use browser console to export JSON:

```javascript
// In old project, open browser console on EEF Manager
const db = firebase.firestore();

// Export tabs
db.collection('tabs').get().then(snapshot => {
  const data = [];
  snapshot.forEach(doc => {
    data.push({ id: doc.id, ...doc.data() });
  });
  console.log(JSON.stringify(data, null, 2));
  // Copy this JSON to a file
});
```

#### Import to New Project

1. Update `index.html` with new Firebase config
2. Open in browser with new config
3. Use browser console to import:

```javascript
// Paste your exported JSON as a variable
const importedTabs = [ /* your data */ ];

// Import to new project
importedTabs.forEach(tab => {
  db.collection('tabs').doc(tab.id).set(tab);
});
```

### Option 2: Firebase CLI Export/Import (Large Datasets)

For large datasets, use Firebase CLI:

#### Install Firebase CLI

```bash
npm install -g firebase-tools
```

#### Export from Old Project

```bash
# Login to Firebase
firebase login

# Export Firestore data
firebase firestore:export gs://OLD_PROJECT_ID.appspot.com/firestore-backup

# Download backup locally
gsutil -m cp -r gs://OLD_PROJECT_ID.appspot.com/firestore-backup ./firestore-backup
```

#### Import to New Project

```bash
# Select new project
firebase use NEW_PROJECT_ID

# Upload backup to new project's storage
gsutil -m cp -r ./firestore-backup gs://NEW_PROJECT_ID.appspot.com/

# Import to new Firestore
firebase firestore:import gs://NEW_PROJECT_ID.appspot.com/firestore-backup
```

### Option 3: Use Firestore Data Viewer Extension (Easiest)

1. Install [Firestore Data Viewer](https://firebase.google.com/products/extensions/firestore-data-viewer) extension
2. Export collections as JSON
3. Import into new project

### What to Migrate

Ensure you migrate these collections:

- ✅ `tabs` (all documents)
- ✅ `tabs/{tabId}/surveys` (all subcollections)
- ✅ `tabs/{tabId}/proposals` (all subcollections)
- ✅ `tabs/{tabId}/meta/assignments` (metadata documents)
- ✅ `tabs/{tabId}/meta/approvedData` (metadata documents)
- ✅ `config/ui` (global settings)

## Testing the Setup

### Step 1: Basic Functionality Test

1. Open `index.html` with new Firebase config
2. Enter password
3. **Test Data Tab**:
   - Upload a sample XLSX file
   - Verify data appears in table
   - Check browser console for errors

### Step 2: Verify Firestore Data

1. Go to Firebase Console → Firestore Database
2. Click **"Data"** tab
3. You should see:
   - `tabs` collection with one document (your uploaded dataset)
   - `config` collection with `ui` document

### Step 3: Test Survey Functionality

1. Go to **Survey** tab
2. Fill out a sample survey
3. Submit
4. Check Firestore:
   - Navigate to `tabs/{your-tab-id}/surveys`
   - Verify survey document exists

### Step 4: Test Tracker & Approval

1. **Tracker Tab**:
   - Assign a reviewer to a project
   - Set a due date
   - Check `tabs/{tabId}/meta/assignments` in Firestore

2. **Approved Tab**:
   - Mark a project as approved
   - Check `tabs/{tabId}/meta/approvedData` in Firestore

### Step 5: Performance Test

1. Upload a larger XLSX file (100+ rows)
2. Check load times:
   - Initial load should be <3 seconds
   - Switching tabs should be instant
   - If slow, create indexes (see previous section)

## Troubleshooting

### Error: "Missing or insufficient permissions"

**Cause**: Security rules are blocking access

**Solution**:
1. Go to Firestore → Rules tab
2. Verify rules allow read/write (see [Security Rules section](#configuring-firestore-security-rules))
3. Publish rules
4. Wait 10 seconds, then refresh app

### Error: "Firebase: No Firebase App"

**Cause**: Firebase not initialized properly

**Solution**:
1. Verify `firebaseConfig` in `index.html` is correct
2. Check that Firebase SDK scripts are loading (check Network tab in F12)
3. Ensure no typos in config object

### Error: "Document does not exist"

**Cause**: Trying to read data that hasn't been created yet

**Solution**:
1. This is normal for a new project
2. Upload a dataset to create initial data
3. Error will go away once data exists

### App loads but data doesn't save

**Cause**: Network issues or quota limits

**Solution**:
1. Check browser console for specific errors
2. Verify internet connection
3. Check Firebase Console → Usage tab for quota limits
4. Free tier limits:
   - 50K reads/day
   - 20K writes/day
   - 20K deletes/day

### Indexes not building

**Cause**: Large dataset or Firebase service delay

**Solution**:
1. Check Firestore → Indexes tab for status
2. Index building can take up to 15 minutes for large datasets
3. You can still use the app (queries will be slower)
4. If stuck for >30 minutes, delete and recreate index

### Data from old project not appearing

**Cause**: Migration incomplete or config pointing to wrong project

**Solution**:
1. Verify `projectId` in `firebaseConfig` matches new project
2. Check Firestore Data tab in Firebase Console to confirm data was imported
3. Try refreshing browser cache (Ctrl+Shift+R / Cmd+Shift+R)

## Email Reminder SMTP Setup

1. **Reviewer directory**  
   In Firestore add the document `config/reviewers` containing a JSON map of reviewer names to email addresses:
   ```json
   {
     "Bianca": "bianca@example.edu",
     "Jake": "jake@example.edu"
   }
   ```
   Only reviewers that appear in this document will receive reminders.

2. **Server environment variables**  
   Add these to `.env` (or your hosting provider’s secrets):
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USERNAME=your_username@gmail.com
   SMTP_PASSWORD=your_app_password
   FROM_EMAIL=your_email@gmail.com
   ```
   The tracker button calls `POST /api/email/reminders` on the Node server, which reads these values and sends emails via SMTP. Adjust them if you switch providers or sender addresses.

3. **Test locally**  
   Start the backend with `npm run dev`, load the frontend, and click **Email Reminders**. The server logs will show the delivery results; the UI will display warnings for reviewers that are missing directory entries.

## Firebase Quotas & Limits

### Free Tier (Spark Plan)

- **Firestore**:
  - 50,000 document reads/day
  - 20,000 document writes/day
  - 20,000 document deletes/day
  - 1 GB stored data

- **Hosting**:
  - 10 GB storage
  - 360 MB/day bandwidth

### Blaze Plan (Pay-as-you-go)

For larger usage, upgrade to Blaze plan:
- Same free tier included
- Pay only for usage beyond free tier
- Typical costs for EEF Manager: $0-5/month

### Monitoring Usage

1. Firebase Console → **Usage and billing**
2. View current usage per service
3. Set up budget alerts (recommended: 50% and 80% of limits)

## Best Practices

### 1. Security

- ✅ Keep Firebase config in version control (it's safe for web apps)
- ✅ Never commit service account keys or admin SDK credentials
- ✅ Use environment-specific projects (dev, staging, production)
- ✅ Enable Firebase App Check for additional security (optional)

### 2. Data Management

- ✅ Regularly export Firestore data as backups
- ✅ Use meaningful document IDs (`dt_` prefix for tabs, `s_` for surveys)
- ✅ Avoid deeply nested data (max 3 levels)
- ✅ Use subcollections for 1-to-many relationships

### 3. Performance

- ✅ Create indexes for all filtered/sorted queries
- ✅ Limit query results with `.limit()`
- ✅ Use pagination for large datasets
- ✅ Cache frequently accessed data in app state

### 4. Cost Optimization

- ✅ Minimize unnecessary reads (cache data client-side)
- ✅ Use batch writes when updating multiple documents
- ✅ Delete unused collections and documents
- ✅ Monitor usage dashboard regularly

## Next Steps

After completing Firebase setup:

1. **Deploy to Firebase Hosting**: See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
2. **Configure Team Access**: Invite team members in Firebase Console → Project Settings → Users and permissions
3. **Set Up Backups**: Schedule regular Firestore exports
4. **Monitor Performance**: Use Firebase Performance Monitoring (optional)

## Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Security Rules Guide](https://firebase.google.com/docs/firestore/security/get-started)
- [Firestore Pricing](https://firebase.google.com/pricing)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)

## Support

For Firebase-specific issues:
- [Firebase Support](https://firebase.google.com/support)
- [Stack Overflow: firebase](https://stackoverflow.com/questions/tagged/firebase)
- [Firebase Community Slack](https://firebase.community/)

---

**Last Updated**: November 2025
