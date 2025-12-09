# Recent Changes Overview

This document captures the recent UX and infrastructure updates made to the EEF Manager project, the problems they solve, and how to use them.

## 1. Authentication Flow

- **What changed:** Firebase email/password authentication was wired into the app and later wrapped in a toggle so we can fall back to the original shared password overlay when needed. The header now shows the signed-in user (or “Local mode” during fallback) and offers a sign-out button when Firebase Auth is active.
- **Problem solved:** The original build required everyone to share a single password, making it impossible to assign roles or audit usage. Introducing Firebase Auth sets up role-based dashboards and lays the groundwork for personalized UX. The temporary toggle retains the ability to test features locally without the new Auth seed data.

## 2. Dataset Selector Experience

- **What changed:** The header selector for datasets is now a searchable combobox with a running row count, last refresh time, and quick actions (duplicate & archive). Datasets can be picked by typing part of their name, duplicated to spin up experiments, or archived to keep the list tidy. A visual pill shows the active dataset for clarity.
- **Problem solved:** Previously, power users had to scroll through long dropdowns and manually manage dataset copies. The enhancements drastically reduce navigation friction and make dataset maintenance (renaming, duplicating, archiving) a first-class workflow.

## 3. Data Tab Productivity

- **What changed:** The Data tab table now offers column-level filters, a global quick-search box, pinned columns (sticky scrollers), and keyboard navigation between cells. A toolbar shows how many rows are currently filtered and which columns have been pinned.
- **Problem solved:** Large XLSX imports were painful to audit because the table was essentially static HTML. Reviewers can now zero in on a subset of rows, keep critical columns visible, and navigate with arrow keys without losing context—making review sessions significantly faster.

## 4. Survey Typeahead & Context

- **What changed:** The survey submission form includes a datalist typeahead backed by the active dataset. Once a project is selected, the UI displays its requested amount, due date, and assignees inline; the proposal button activates automatically. Logged-in reviewers are auto-filled into the form.
- **Problem solved:** Reviewers previously had to memorize exact project names and often mis-typed them, breaking the linkage to datasets. Typeahead and inline context remove that friction, help reviewers verify they’re writing notes for the right project, and reduce duplicate entries.

## 5. Firebase Auth Seeding Script

- **What changed:** Added `scripts/seed-auth-users.js` and a sample `seed-data/users.json`, plus documentation on how to run it with a Firebase service account.
- **Problem solved:** Instead of manually entering users via the Firebase console, coordinators can now seed accounts (and custom claims) in bulk, making initial onboarding or large cohort refreshes repeatable.

## 6. Local Auth Toggle

- **What changed:** A `USE_EMAIL_AUTH` flag in `js/app.js` and the original password prompt in `index.html` allow running the app locally without Firebase credentials. When set to `false`, the overlay falls back to the shared password; when `true`, the Firebase Auth UI is shown.
- **Problem solved:** Development and testing no longer block on seeding Firebase Auth. Teams can keep building features locally while the production-ready auth flow remains in code, ready to re-enable once credentials are prepared.
