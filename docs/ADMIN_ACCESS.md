## Admin access (free tier, no Cloud Functions)

The app now treats any email listed in Firestore at `config/admins` → field `emails` as an admin. No paid plan or Functions needed.

### Set admins in Firebase Console
1. Go to **Firestore Database** → **Data**.
2. In collection path `config`, create/open document `admins`.
3. Add a field `emails` with type **array**. Enter each admin’s email as a separate array item (e.g., `"alice@example.edu"`, `"karen@example.edu"`).
4. Save. Have the user sign out/in; the app will read the list and unlock admin-only UI.

### Optional Firestore rule (limit edits to admins)
Paste this in **Firestore → Rules** if you want only existing admins to edit the list:
```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null &&
             get(/databases/$(database)/documents/config/admins)
               .data.emails.hasAny([request.auth.token.email]);
    }
    match /config/admins {
      allow read, write: if isAdmin();
    }
  }
}
```
