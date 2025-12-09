/**
 * Firestore Storage Functions
 *
 * This module provides all dataset-scoped Firestore I/O operations including
 * tabs/datasets, surveys, reviewer assignments, approved data, proposal metadata,
 * and UI configuration.
 */

import { db } from './config.js';

export const storage = {
    // --- Tabs / Datasets ---
    async loadTabs() {
        const s = await db.collection("tabs").get();
        return s.docs.map(d => ({ id: d.id, linkMap: {}, ...d.data() }));
    },
    async saveTab(t) { await db.collection("tabs").doc(t.id).set(t, { merge: true }); },
    async deleteTab(id) { await db.collection("tabs").doc(id).delete(); },

    // --- Surveys (scoped) ---
    async loadSurveys(tabId) {
        if (!tabId) return [];
        const s = await db.collection("tabs").doc(tabId).collection("surveys").orderBy("timestamp", "desc").get();
        return s.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    async saveSurvey(tabId, v) {
        if (!tabId) return;
        await db.collection("tabs").doc(tabId).collection("surveys").doc(v.id).set(v, { merge: true });
    },
    async deleteSurvey(tabId, id) {
        if (!tabId) return;
        await db.collection("tabs").doc(tabId).collection("surveys").doc(id).delete();
    },

    // --- Reviewer Assignments (scoped) ---
    async loadAssignments(tabId) {
        if (!tabId) return { assignments: {}, overflow: [] };
        const doc = await db.collection("tabs").doc(tabId).collection("meta").doc("assignments").get();
        const data = doc.exists ? (doc.data() || {}) : {};
        const overflow = Array.isArray(data.__overflow) ? data.__overflow : [];
        const assignments = { ...data };
        delete assignments.__overflow;
        return { assignments, overflow };
    },
    async saveAssignments(tabId, a) {
        if (!tabId) return;
        await db.collection("tabs").doc(tabId).collection("meta").doc("assignments").set(a, { merge: true });
    },

    // --- Approved Table (already scoped) ---
    async loadApprovedData(tabId) {
        if (!tabId) return [];
        const doc = await db.collection("tabs").doc(tabId).collection("meta").doc("approvedData").get();
        return doc.exists ? (doc.data().rows || []) : [];
    },
    async saveApprovedData(tabId, rows) {
        if (!tabId) return;
        const tab = app.tabs.find(t => t.id === tabId);
        const datasetName = tab ? tab.name : "(unknown dataset)";
        await db.collection("tabs").doc(tabId).collection("meta").doc("approvedData").set({ rows, datasetName, lastUpdated: new Date().toISOString() });
    },

    // --- Proposal Meta (notes, amounts, status, due) scoped ---
    async loadProposalMeta(tabId) {
        if (!tabId) return { amounts: {}, notes: {}, status: {}, due: {} };
        const s = await db.collection("tabs").doc(tabId).collection("proposals").get();
        const amounts = {}, notes = {}, status = {}, due = {};
        s.forEach(doc => {
            const d = doc.data(); const k = d.projectName || doc.id; if (!k) return;
            if (d.givenAmount != null) amounts[k] = d.givenAmount;
            if (d.notes != null) notes[k] = d.notes;
            if (d.fundingStatus != null) status[k] = d.fundingStatus;
            if (d.dueDate != null) due[k] = d.dueDate;
        });
        return { amounts, notes, status, due };
    },
    async saveProposalField(tabId, project, patch) {
        if (!tabId || project == null) return;
        // Use a safe Firestore doc id (encodeURIComponent) so special characters (slashes, etc.)
        // in the project name cannot break the document path. The document still stores the
        // original project name in the `projectName` field so reads use that canonical key.
        const safeId = encodeURIComponent(project);
        await db.collection("tabs").doc(tabId).collection("proposals").doc(safeId).set({ projectName: project, ...patch }, { merge: true });
    },

    // --- UI Config (global) ---
    async loadUIConfig() {
        const doc = await db.collection("config").doc("ui").get();
        return doc.exists ? doc.data() : {};
    },
    async saveUIConfig(patch) {
        await db.collection("config").doc("ui").set(patch, { merge: true });
    },

    // --- Reviewer directory (global) ---
    async loadReviewerDirectory() {
        const doc = await db.collection("config").doc("reviewers").get();
        if (!doc.exists) return {};
        const data = doc.data() || {};
        if (data.directory && typeof data.directory === "object") {
            return data.directory;
        }
        return data;
    },
    async saveReviewerDirectory(directory) {
        await db.collection("config").doc("reviewers").set({ directory }, { merge: true });
    },

    // --- Admin config (global) ---
    async loadAdminConfig() {
        const doc = await db.collection("config").doc("admins").get();
        return doc.exists ? doc.data() : {};
    },
    async saveAdminConfig(patch) {
        await db.collection("config").doc("admins").set(patch, { merge: true });
    },
};
