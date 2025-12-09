# EEF Manager - JavaScript Modules

This directory contains the modularized JavaScript code for the EEF Manager application.

## Module Overview

### 1. **config.js**
- Firebase configuration and initialization
- Exports: `db` (Firestore instance)

### 2. **utils.js**
- DOM manipulation helpers (`$`, `setText`, `showEl`, `esc`, `attr`)
- Data formatting (`fmtMoney`, `firstName`, `toLocalYMD`)
- CSV utilities
- Download helper
- Toast notifications
- SharePoint link canonicalization
- URL and filename detection

### 3. **storage.js**
- All Firestore I/O operations
- Dataset-scoped storage functions
- Functions: `loadTabs`, `saveTab`, `deleteTab`, `loadSurveys`, `saveSurvey`, `deleteSurvey`, `loadAssignments`, `saveAssignments`, `loadApprovedData`, `saveApprovedData`, `loadProposalMeta`, `saveProposalField`, `loadUIConfig`, `saveUIConfig`

### 4. **csv.js**
- XLSX file parsing utilities
- Functions: `readAsArrayBuffer`, `parseWorksheet`
- Extracts data, headers, and hyperlinks from Excel files

### 5. **ui-builders.js**
- UI component mounting functions
- Functions: `mountSurveyUI`, `mountTrackerUI`, `mountApprovedUI`, `mountModal`, `notifyModal`, `clearModalToasts`

### 6. **dashboard.js**
- Dashboard rendering and metrics
- Functions: `renderDashboard`, `renderReviewerDashboard`
- Calculates proposal counts, funding status, and reviewer progress

### 7. **data.js**
- Data tab operations
- Functions: `autoDetectMatchColumn`, `setMatchColumn`, `updateMatchControlsUI`, `renderData`, `app_toggleHideDataRow`, `deleteActiveTab`, `downloadActiveCSV`, `uploadXLSX`
- Match column detection with locking mechanism

### 8. **survey.js**
- Survey form and response management
- Functions: `findProposalUrlByName`, `detectSpeedtypeFromRow`, `updateSurveyProposalLink`, `renderSurvey`, `submitSurvey`, `exportSurveys`
- Window functions: `app_toggleSurveyRow`, `app_editSurvey`, `app_deleteSurvey`

### 9. **tracker.js**
- Reviewer assignment and progress tracking
- Functions: `startBulkAssign`, `endBulkAssign`, `buildStatusDropdown`, `toggleStatusHighlight`, `toggleDueSort`, `renderTracker`, `getProposalUrl`
- Window functions: `app_openDetailAndFocus`, `app_rowToggleBulk`, `app_goSubmit`, `app_saveDueDate`

### 10. **approved.js**
- Approved projects management
- Functions: `renderApproved`, `exportApproved`, `remapApproved`
- Window functions: `app_editApproved`, `app_deleteApproved`

### 11. **modal.js**
- Detail modal operations
- Functions: `openDetail`, `updateApproveButton`
- Handles approve/unapprove and autosave for notes

### 12. **app.js** (Main Entry Point)
- Application initialization and orchestration
- Password authentication
- App state management
- Navigation between sections
- UI binding
- Imports and coordinates all other modules

## Module Dependencies

```
app.js (main)
├── config.js
├── utils.js
├── storage.js
├── csv.js
├── ui-builders.js
├── dashboard.js
├── data.js
│   ├── utils.js
│   ├── storage.js
│   └── csv.js
├── survey.js
│   ├── utils.js
│   └── storage.js
├── tracker.js
│   ├── utils.js
│   └── storage.js
├── approved.js
│   ├── utils.js
│   ├── storage.js
│   └── survey.js
└── modal.js
    ├── utils.js
    ├── storage.js
    ├── ui-builders.js
    ├── tracker.js
    └── survey.js
```

## Usage in HTML

To use these modules in your HTML file, replace the existing `<script>` tag with:

```html
<script type="module">
  import app from './js/app.js';
  // The app will initialize automatically
</script>
```

Or if you need to maintain compatibility with the existing inline script approach, you would need to:
1. Load all scripts in order (dependencies first)
2. Keep window-level function assignments
3. Adjust import/export syntax if not using ES6 modules

## Global Variables

The following are exposed to `window` for legacy compatibility:
- `window.app` - Main application state
- `window.showSection` - Navigation function
- `window.app_toggleSurveyRow`
- `window.app_editSurvey`
- `window.app_deleteSurvey`
- `window.app_toggleHideDataRow`
- `window.app_openDetailFromData`
- `window.openDetail`
- `window.app_openDetailAndFocus`
- `window.app_rowToggleBulk`
- `window.app_goSubmit`
- `window.app_saveDueDate`
- `window.app_editApproved`
- `window.app_deleteApproved`

## Key Features

1. **ES6 Modules**: Clean import/export syntax
2. **Separation of Concerns**: Each file has a specific responsibility
3. **Dependency Management**: Clear module dependencies
4. **Code Organization**: Related functions grouped together
5. **Maintainability**: Easier to locate and update specific functionality
6. **Reusability**: Functions can be imported where needed

## Notes

- All modules use ES6 module syntax (`import`/`export`)
- Firebase must be loaded before these modules
- XLSX library must be available globally
- The modules maintain backward compatibility with window-level functions where needed for inline event handlers
