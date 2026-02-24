/**
 * Tracker Functions
 *
 * This module handles tracker tab operations including auto assignment,
 * rendering tracker table with status/due date filtering (and always-ascending due sorting),
 * and helper functions for tracker interactions.
 */

import {
  $,
  setText,
  esc,
  attr,
  notify,
  toLocalYMD,
  firstName,
  looksLikeUrl,
  canonicalizeSharePointLink,
} from "./utils.js";
import { storage } from "./storage.js";

// Global filter/sort state
let activeStatusFilters = new Set();
let dueSort = "asc"; // ALWAYS ascending (no UI toggle)
let trkDateFilter = ""; // yyyy-mm-dd or empty (stored as local date)

// Keep a stable rerender callback for dropdown interactions
let trackerRerender = null;

/**
 * Build status dropdown
 * NOTE: No inline onclick handlers (safer + avoids callback signature issues).
 */
export function buildStatusDropdown(uniqueStatuses) {
  const dd = $("status-dropdown");
  if (!dd) return;

  dd.innerHTML = uniqueStatuses
    .map((st) => {
      const isActive = activeStatusFilters.has(st);
      return `
        <div class="status-option ${isActive ? "active" : ""}"
             data-status="${esc(st)}">
          ${esc(st)}
        </div>`;
    })
    .join("");

  dd.querySelectorAll(".status-option").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const status = el.getAttribute("data-status") || "";
      toggleStatusHighlight(status, el);
    });
  });
}

/**
 * Toggle status highlight & re-render tracker
 */
export function toggleStatusHighlight(status, el) {
  if (!status || !el) return;

  const wasActive = el.classList.contains("active");
  el.classList.toggle("active");

  if (wasActive) activeStatusFilters.delete(status);
  else activeStatusFilters.add(status);

  if (typeof trackerRerender === "function") trackerRerender();
}

/**
 * Due sort is ALWAYS ascending now (kept only for compatibility if something calls it).
 */
export function toggleDueSort(order, el, renderTrackerFn) {
  dueSort = "asc";
  $("due-popup")?.classList.remove("show");
  if (typeof renderTrackerFn === "function") renderTrackerFn();
  else if (typeof trackerRerender === "function") trackerRerender();
}

/**
 * Main render tracker function
 */
export function renderTracker(app, renderReviewerDashboard, openDetail) {
  // Store rerender callback so dropdown click handlers can re-render without passing functions around
  trackerRerender = () => renderTracker(app, renderReviewerDashboard, openDetail);

  const tab = app.activeTab;
  app.trackerData = []; // reset for dashboard summary

  if (!tab) {
    setText("trk-meta", "No dataset selected");
    const b = $("trk-body");
    if (b) b.innerHTML = "";
    return;
  }

  const matchCol = tab.matchColumn || tab.headers?.[0];
  const matchSel = $("trk-match");
  if (matchSel) {
    matchSel.innerHTML = (tab.headers || [])
      .map((h) => `<option ${h === matchCol ? "selected" : ""}>${esc(h)}</option>`)
      .join("");
    matchSel.value = matchCol;
  }

  let projects = [
    ...new Set((tab.data || []).map((r) => String(r[matchCol] || "").trim()).filter(Boolean)),
  ];

  // Exclude projects that are fully hidden
  projects = projects.filter((p) =>
    (tab.data || []).some((r) => String(r[matchCol] || "").trim() === p && !r._hidden)
  );

  const assigns = app.assignments || {};
  if (app.assigneeQuery) {
    projects = projects.filter((p) =>
      (assigns[p] || []).some((a) => (a || "").toLowerCase().includes(app.assigneeQuery))
    );
  }

  // Build unique due dates for dropdown
  const dateSet = new Set();
  projects.forEach((p) => {
    const tabLocal = app.activeTab;
    const matchLocal = tabLocal.matchColumn || tabLocal.headers?.[0];
    const row = (tabLocal.data || []).find((r) => String(r[matchLocal] || "").trim() === p) || {};
    const rawDate = (app.proposalDue && app.proposalDue[p]) || row["Due Date"] || row.Due || "";
    const ymd = toLocalYMD(rawDate);
    if (ymd) dateSet.add(ymd);
  });
  const dates = Array.from(dateSet).sort();

  // Populate due filter select
  const dueFilterSel = $("due-filter");
  if (dueFilterSel) {
    dueFilterSel.innerHTML =
      `<option value="">All dates</option>` +
      dates
        .map((d) => {
          const human = new Date(d + "T00:00:00").toLocaleDateString();
          return `<option value="${d}">${esc(human)}</option>`;
        })
        .join("");

    dueFilterSel.value = trkDateFilter || "";
    dueFilterSel.onchange = () => {
      trkDateFilter = dueFilterSel.value || "";
      trackerRerender?.();
    };
  }

  const tbody = $("trk-body");
  if (!tbody) return;

  // Build rows as models first, then filter/sort, then render HTML.
  const rowModels = [];

  projects.forEach((p) => {
    const assignees = assigns[p] || [];
    const survs = (app.surveys || []).filter((s) => s.projectName === p);

    const submitters = [...new Set(survs.map((s) => s.reviewerName || ""))];
    const submitterFirstSet = new Set(submitters.map((n) => firstName(n)));
    const notesCount = survs.filter((s) => s.overall || s.lineItems || s.funding).length;

    const amt = app.proposalAmounts?.[p];
    const statusVal = app.proposalStatus?.[p];
    const amountFilled = amt != null && amt !== "" && parseFloat(amt) > 0;
    const statusFilled = statusVal != null && statusVal !== "";

    const approvedRec = (app.approved?.data || []).find((r) => r["Project Name"] === p);

    // dataset row lookup
    const tabLocal = app.activeTab;
    const matchLocal = tabLocal.matchColumn || tabLocal.headers?.[0];
    const row = (tabLocal.data || []).find((r) => String(r[matchLocal] || "").trim() === p) || {};

    const reqKey = [
      "Amount",
      "Requested Amount",
      "Amount Requested",
      "Total Requested",
      "Submission Amount",
      "Budget",
      "Q7",
    ].find((k) => row[k] != null && row[k] !== "");

    const requested = reqKey
      ? "$" +
        Number(String(row[reqKey]).replace(/[^0-9.\-]/g, "") || 0).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })
      : "—";

    const overflowSet = app.assignmentOverflow || new Set();
    let label, cls;
    if (approvedRec) {
      label = "Approved";
      cls = "st-approve";
    } else if (overflowSet.has(p)) {
      label = "Unassigned (Overflow)";
      cls = "st-unassigned";
    } else if (assignees.length === 0) {
      label = "Unassigned";
      cls = "st-unassigned";
    } else if (!amountFilled && !statusFilled && assignees.length > 0 && notesCount >= assignees.length) {
      label = "Ready for Review";
      cls = "st-ready";
    } else if (statusFilled) {
      label = "Waiting Approval";
      cls = "st-wait";
    } else {
      label = "Under Review";
      cls = "st-under";
    }

    const dueVal = toLocalYMD(app.proposalDue?.[p] || row["Due Date"] || row.Due || "");

    // ---- APPLY FILTERS ----
    if (trkDateFilter && dueVal !== trkDateFilter) return;
    if (activeStatusFilters.size > 0 && !activeStatusFilters.has(label)) return;

    // Feed data to reviewer dashboard (for filtered rows only)
    app.trackerData ||= [];
    assignees.forEach((name) => {
      if (!name) return;
      const reviewer = name.trim();
      const submission = survs.find((s) => firstName(s.reviewerName) === firstName(reviewer));
      app.trackerData.push({
        Reviewer: reviewer,
        "Project Name": p,
        Status: label,
        "Due Date": app.proposalDue?.[p] || row["Due Date"] || "",
        timestamp: submission?.timestamp || null,
      });
    });

    const amtDisp = `
      <div style="display:flex;flex-direction:column;gap:2px;line-height:1.3">
        <div><span class="text-muted text-sm">Req:</span> <strong style="color:#10B981">${requested}</strong></div>
        <div><span class="text-muted text-sm">Given:</span> <strong style="color:#FBBF24">${
          amountFilled
            ? "$" + Number(amt).toLocaleString(undefined, { maximumFractionDigits: 2 })
            : "—"
        }</strong></div>
      </div>`;

    const assigneeHtml = assignees.length
      ? `<span class="assignees" title="${esc(assignees.join(", "))}" style="display:block;margin-top:6px;color:#94A3B8;font-size:12px">` +
        assignees
          .slice(0, 8)
          .map((n) => {
            const aFirst = firstName(n);
            const submitted = submitterFirstSet.has(aFirst);
            const style = submitted
              ? "color:#3B82F6;font-weight:800;text-decoration:underline;cursor:pointer"
              : "text-decoration:underline;cursor:pointer";
            return `<span class="assignee-name"
                      data-action="assignee"
                      data-project="${encodeURIComponent(p)}"
                      data-assignee="${encodeURIComponent(n)}"
                      style="${style}">${esc(n)}</span>`;
          })
          .join(" ") +
        (assignees.length > 8 ? ` <span>…</span>` : "") +
        `</span>`
      : `<span class="assignees" style="display:block;margin-top:6px;color:#94A3B8;font-size:12px">—</span>`;

    const submitBtnHtml = `<button class="btn btn-success btn-sm" data-action="submit">Submit</button>`;
    const editBtnHtml = app.isAdmin
      ? `<button class="btn btn-sm btn-outline" data-action="edit-assignees">Assign</button>`
      : "";

    const html = `<tr data-project="${encodeURIComponent(p)}">
      <td title="${esc(p)}"><span class="proj-name" style="max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:bottom">${esc(
        p
      )}</span></td>
      <td>${amtDisp}</td>
      <td>
        <div><strong>Submitted:</strong> ${submitters.length}</div>
        <div><strong>Assigned:</strong> ${assignees.length}</div>
        ${assigneeHtml}
      </td>
      <td><span class="status-badge ${cls}">${label}</span></td>
      <td class="actions-col">
        <button class="btn btn-sm" data-action="details">Details</button>
        ${editBtnHtml}
        ${submitBtnHtml}
      </td>
      <td>
        <input type="date" data-action="due" value="${dueVal}" />
      </td>
    </tr>`;

    rowModels.push({ project: p, dueVal: dueVal || "", html });
  });

  // ---- ALWAYS SORT ASCENDING BY DUE DATE ----
  rowModels.sort((a, b) => {
    const da = a.dueVal || "9999-12-31"; // empty due dates go last
    const db = b.dueVal || "9999-12-31";
    if (da === db) return a.project.localeCompare(b.project);
    return da.localeCompare(db);
  });

  // Render rows
  tbody.innerHTML = rowModels.map((r) => r.html).join("");

  // Meta + dashboard use FILTERED view
  setText("trk-meta", `${rowModels.length} project(s)`);
  renderReviewerDashboard(app);

  // Attach event listeners after HTML is inserted
  tbody.querySelectorAll("tr").forEach((tr) => {
    const projEncoded = tr.getAttribute("data-project") || "";
    const project = projEncoded ? decodeURIComponent(projEncoded) : "";

    const detailsBtn = tr.querySelector('button[data-action="details"]');
    if (detailsBtn) {
      detailsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openDetail(project);
      });
    }

    const editBtn = tr.querySelector('button[data-action="edit-assignees"]');
    if (editBtn) {
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editProjectAssignees(
          project,
          app,
          () => renderTracker(app, renderReviewerDashboard, openDetail),
          renderReviewerDashboard
        );
      });
    }

    const submitBtn = tr.querySelector('button[data-action="submit"]');
    if (submitBtn) {
      submitBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        app_goSubmit(project);
      });
    }

    const dueInput = tr.querySelector('input[data-action="due"]');
    if (dueInput) {
      dueInput.addEventListener("change", (e) => {
        e.stopPropagation();
        app_saveDueDate(project, dueInput.value, app);
      });
    }

    tr.querySelectorAll('[data-action="assignee"]').forEach((span) => {
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        const assignee = span.getAttribute("data-assignee")
          ? decodeURIComponent(span.getAttribute("data-assignee"))
          : "";
        app_openDetailAndFocus(project, assignee, e, openDetail);
      });
    });
  });

  // === Calculate live Given Amount total (MATCHES FILTERED VIEW) ===
  let totalGiven = 0;
  rowModels.forEach((r) => {
    const p = r.project;
    const amt = app.proposalAmounts?.[p];
    const val = parseFloat((amt || "0").toString().replace(/[^0-9.-]/g, ""));
    if (!isNaN(val)) totalGiven += val;
  });

  const totalGivenFormatted =
    "$" +
    totalGiven.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  const amtHeader = document.querySelector("#trk-table thead th:nth-child(2) .th-inner");
  if (amtHeader) {
    amtHeader.innerHTML = `
      <span class="text-muted" style="text-transform:uppercase; font-size:12px; letter-spacing:0.5px;">
        G.Amt:
      </span>
      <span style="color: var(--amber); font-weight:800; font-size:12px; margin-left:6px;">
        ${totalGivenFormatted}
      </span>
    `;
  }
}

// Window helper functions
window.app_openDetailAndFocus = (project, reviewer, evt, openDetail) => {
  if (evt) evt.stopPropagation();
  openDetail(project);
};

window.app_goSubmit = (project) => {
  const form = $("survey");
  if (form && form.projectName) {
    form.projectName.value = project;
    const inputEvent = new Event("input", { bubbles: true });
    form.projectName.dispatchEvent(inputEvent);
  }
  if ($("svy-filter")) $("svy-filter").value = project;

  // Switch to Survey section
  showSection("Survey");

  // Scroll to form
  const y = form ? form.getBoundingClientRect().top + window.scrollY - 90 : 0;
  window.scrollTo({ top: y, behavior: "smooth" });
  setTimeout(() => (form?.overall || form?.projectName)?.focus(), 150);
};

window.app_saveDueDate = async (project, value, app) => {
  await storage.saveProposalField(app.selectedId, project, { dueDate: value || "" });
  app.proposalDue[project] = value || "";
  notify("Due date saved", "success");
};

// Helper function to get proposal URL
export function getProposalUrl(project, tab, matchCol) {
  if (!tab || !matchCol || !project) return null;

  const idx = (tab.data || []).findIndex(
    (r) => String(r[matchCol] || "").trim().toLowerCase() === String(project).trim().toLowerCase()
  );
  if (idx < 0) return null;

  const row = tab.data[idx];
  const rowLinks = tab.linkMap?.[idx];
  const pref = ["Proposal", "Proposal Link", "Link", "URL", "Application", "Document", "Doc", "Attachment"];

  if (rowLinks) {
    for (const h of pref) {
      if (rowLinks[h]) return canonicalizeSharePointLink(rowLinks[h]);
    }
    const first = Object.values(rowLinks).find(Boolean);
    if (first) return canonicalizeSharePointLink(first);
  }

  // fallback: scan raw row values for an http(s) URL
  for (const k of Object.keys(row || {})) {
    const v = String(row[k] ?? "").trim();
    if (looksLikeUrl(v)) return canonicalizeSharePointLink(v);
  }

  return null;
}

// Export filter/sort state
export { activeStatusFilters, dueSort, trkDateFilter };

let sendInFlight = false;

function getEmailEndpoint() {
  const isLocalDev =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const customBase = window.APP_CONFIG?.apiBaseUrl || (isLocalDev ? "http://localhost:3000" : "");
  const trimmed = (customBase || "").replace(/\/$/, "");
  return trimmed ? `${trimmed}/api/email/reminders` : "/api/email/reminders";
}

function buildDirectoryLookup(directory = {}) {
  const lookup = {};
  const source = directory || {};

  Object.entries(source).forEach(([key, value]) => {
    if (!value) return;

    const baseName = typeof value === "object" && value.name ? value.name : key;
    const email =
      typeof value === "string" ? value : value.email || value.address || value.mail;

    if (!email) return;

    const norm = (baseName || key || "").trim().toLowerCase();
    if (!norm) return;

    const contact = { name: baseName || key, email: email.trim() };
    lookup[norm] = contact;

    const short = firstName(baseName || key).trim().toLowerCase();
    if (short && !lookup[short]) lookup[short] = contact;
  });

  return lookup;
}

export async function editProjectAssignees(project, app, rerenderTracker, rerenderDashboard) {
  if (!project || !app) return;

  const current = (app.assignments?.[project] || []).join(", ");
  const input = prompt(`Edit assignees for "${project}" (comma or newline separated):`, current);
  if (input == null) return;

  const list = input
    .split(/\n|,/)
    .map((x) => x.trim())
    .filter(Boolean);

  app.assignments = app.assignments || {};
  app.assignments[project] = list;

  await storage.saveAssignments(app.selectedId, app.assignments);
  notify(`Saved ${list.length} assignee(s) for "${project}"`, "success");

  if (typeof rerenderTracker === "function") rerenderTracker();
  if (typeof rerenderDashboard === "function") rerenderDashboard(app);
}

export async function clearAllAssignments(app, rerenderTracker, rerenderDashboard) {
  if (!app) return;

  const hasAssignments = app.assignments && Object.keys(app.assignments).length > 0;
  if (!hasAssignments) {
    notify("No assignments to clear.", "info");
    return;
  }

  if (!confirm("Clear all reviewer assignments for this dataset?")) return;

  app.assignments = {};
  app.assignmentOverflow = new Set();
  await storage.saveAssignments(app.selectedId, { __overflow: [] });

  notify("All assignments cleared.", "success");

  if (typeof rerenderTracker === "function") rerenderTracker();
  if (typeof rerenderDashboard === "function") rerenderDashboard(app);
}

export async function sendTrackerReminderEmails(app) {
  if (sendInFlight) return notify("Reminder emails are already being sent…", "info");

  const tab = app.activeTab;
  if (!tab) return notify("Select a dataset before sending emails.", "error");

  const assignments = app.assignments || {};
  const matchCol = tab.matchColumn || tab.headers?.[0];
  if (!matchCol) return notify("No match column available for this dataset.", "error");

  const lookup = buildDirectoryLookup(app.reviewerDirectory || {});
  const missing = new Set();
  const reviewerPayload = {};
  const projects = Object.keys(assignments || {});
  const rows = tab.data || [];

  const approvedSet = new Set((app.approved?.data || []).map((r) => r["Project Name"]));
  const statusLookup = app.proposalStatus || {};

  projects.forEach((project) => {
    const assignees = (assignments[project] || []).filter(Boolean);
    if (!assignees.length) return;
    if (approvedSet.has(project)) return;

    const status = statusLookup[project] || "";
    const row = rows.find((r) => String(r[matchCol] || "").trim() === project) || {};

    const dueRaw =
      app.proposalDue?.[project] || row["Due Date"] || row.Due || row["deadline"] || "";
    const dueYMD = toLocalYMD(dueRaw);
    const dueHuman = dueYMD ? new Date(`${dueYMD}T00:00:00`).toLocaleDateString() : "";
    const proposalUrl = getProposalUrl(project, tab, matchCol);

    assignees.forEach((name) => {
      const cleanName = String(name || "").trim();
      if (!cleanName) return;

      const norm = cleanName.toLowerCase();
      const alt = firstName(cleanName).toLowerCase();
      const contact = lookup[norm] || lookup[alt];

      if (!contact) {
        missing.add(cleanName);
        return;
      }

      if (!reviewerPayload[norm]) {
        reviewerPayload[norm] = {
          name: contact.name || name,
          email: contact.email,
          assignments: [],
        };
      }

      reviewerPayload[norm].assignments.push({
        projectName: project,
        status: status || "In Progress",
        dueDate: dueYMD || "",
        dueDateHuman: dueHuman || "",
        proposalUrl: proposalUrl || "",
      });
    });
  });

  const reviewerList = Object.values(reviewerPayload);
  if (!reviewerList.length) {
    if (missing.size) {
      return notify("No reviewer emails found. Update the reviewer directory in Firestore.", "error");
    }
    return notify("No reviewer assignments available to email.", "info");
  }

  const defaultMsg = app.lastReminderMessage || "";
  const customMessage = window.prompt("Optional: add a custom intro to the reminder email", defaultMsg);
  if (customMessage === null) return;
  app.lastReminderMessage = customMessage;

  const btn = $("trk-email");
  const prevLabel = btn ? btn.textContent : "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending…";
  }

  sendInFlight = true;
  try {
    const endpoint = getEmailEndpoint();
    let token = null;

    if (firebase?.auth) {
      const user = firebase.auth().currentUser;
      if (user?.getIdToken) {
        try {
          token = await user.getIdToken();
        } catch (err) {
          console.warn("getIdToken failed", err);
        }
      }
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        datasetId: app.selectedId,
        datasetName: tab.name || "(unnamed)",
        triggeredBy: app.user?.email || app.user?.displayName || "unknown user",
        reviewers: reviewerList,
        trackerUrl: window.location.href,
        customMessage: (customMessage || "").trim(),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `SMTP request failed (${res.status})`);
    }

    if (missing.size) {
      notify(`Emails sent. Missing contacts for: ${Array.from(missing).join(", ")}`, "warning");
    } else {
      notify("Reviewer reminder emails sent.", "success");
    }
  } catch (err) {
    console.error("sendReviewerReminderEmails failed", err);
    notify(err?.message || "Unable to send reminder emails.", "error");
  } finally {
    sendInFlight = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevLabel || "Email Reminders";
    }
  }
}

export function openAutoAssignModal(app) {
  const modal = $("auto-assign-modal");
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  const cfg = app.autoAssignConfig || { meetingDates: [], reviewerCount: 2, reviewerPool: [] };
  if (!cfg.reviewerPool || cfg.reviewerPool.length === 0) {
  cfg.reviewerPool = Object.values(app.reviewerDirectory || {})
    .map(r => (typeof r === "string" ? r : r.name))
    .filter(Boolean);
}
  app.autoAssignConfig = cfg;
  $("auto-dates").value = (cfg.meetingDates || []).join("\n");
  $("auto-count").value = cfg.reviewerCount || 2;
  $("auto-reviewers").value = (cfg.reviewerPool || []).join("\n");
}

export function closeAutoAssignModal() {
  const modal = $("auto-assign-modal");
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

export async function runAutoAssign(app, rerenderTracker, rerenderDashboard) {
  const modal = $("auto-assign-modal");
  if (!modal) return;

  const rawDates = $("auto-dates").value || "";
  const reviewerCount = Math.max(1, parseInt($("auto-count").value, 10) || 2);

  const reviewerPoolRaw = $("auto-reviewers")?.value || "";
  const reviewerPool = reviewerPoolRaw
    .split(/\n|,/)
    .map((x) => x.trim())
    .filter(Boolean);

  const meetingDates = Array.from(
    new Set(
      rawDates
        .split(/\n|,/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => toLocalYMD(line) || toLocalYMD(new Date(line)))
        .filter(Boolean)
    )
  ).sort();

  if (!meetingDates.length) return notify("Please enter at least one meeting date.", "error");
  if (reviewerPool.length < reviewerCount)
    return notify("Reviewer pool must be at least the reviewers-per-proposal value.", "error");

  const tab = app.activeTab;
  if (!tab) return notify("No dataset selected.", "error");

  const matchCol = tab.matchColumn || tab.headers?.[0];
  if (!matchCol) return notify("No match column available.", "error");

  const projects = [
    ...new Set(
      (tab.data || [])
        .filter((r) => !r._hidden)
        .map((r) => String(r[matchCol] || "").trim())
        .filter(Boolean)
    ),
  ];

  if (!projects.length) return notify("No visible projects to assign.", "error");

  // --- STEP A: spread proposals evenly across weeks (round-robin) ---
  const weeks = meetingDates.length;
  const weekBuckets = Array.from({ length: weeks }, () => []);
  projects.forEach((p, i) => weekBuckets[i % weeks].push(p));

  // --- tracking structures ---
  const totalLoad = {};               // reviewer -> total assigned proposals
  const weekLoad = {};                // weekIndex -> reviewer -> assigned proposals in that week
  const pairCount = {};               // "a|b" -> number of times paired together

  reviewerPool.forEach((r) => (totalLoad[r] = 0));
  for (let w = 0; w < weeks; w++) {
    weekLoad[w] = {};
    reviewerPool.forEach((r) => (weekLoad[w][r] = 0));
  }

  const keyPair = (a, b) => {
    const [x, y] = [a, b].sort();
    return `${x}|${y}`;
  };

  // score knobs (tunable)
  const W_TOTAL = 10;     // pushes global balance hardest
  const W_WEEK = 7;       // pushes weekly balance
  const W_PAIR = 4;       // reduces repeated pairings
  const W_TIE = 0.05;     // tiny randomness to avoid deterministic “same every time”

  const pickReviewersForProject = (weekIndex) => {
    const chosen = [];

    while (chosen.length < reviewerCount) {
      let best = null;
      let bestScore = Infinity;

      for (const cand of reviewerPool) {
        if (chosen.includes(cand)) continue;

        // pair penalty vs already-chosen reviewers
        let pairPenalty = 0;
        for (const already of chosen) {
          const k = keyPair(cand, already);
          pairPenalty += pairCount[k] || 0;
        }

        const score =
          W_TOTAL * (totalLoad[cand] || 0) +
          W_WEEK * (weekLoad[weekIndex][cand] || 0) +
          W_PAIR * pairPenalty +
          (Math.random() * W_TIE); // tiny tie-break randomness

        if (score < bestScore) {
          bestScore = score;
          best = cand;
        }
      }

      // should never happen, but guard anyway
      if (!best) break;

      chosen.push(best);
    }

    // update counts
    chosen.forEach((r) => {
      totalLoad[r] = (totalLoad[r] || 0) + 1;
      weekLoad[weekIndex][r] = (weekLoad[weekIndex][r] || 0) + 1;
    });

    // update pair counts
    for (let i = 0; i < chosen.length; i++) {
      for (let j = i + 1; j < chosen.length; j++) {
        const k = keyPair(chosen[i], chosen[j]);
        pairCount[k] = (pairCount[k] || 0) + 1;
      }
    }

    return chosen;
  };

  // --- assign ---
  const newAssignments = {};
  const dueSaves = [];

  for (let w = 0; w < weeks; w++) {
    const dueDate = meetingDates[w];
    const bucket = weekBuckets[w];

    bucket.forEach((project) => {
      const reviewers = pickReviewersForProject(w);
      newAssignments[project] = reviewers;

      app.proposalDue[project] = dueDate;
      dueSaves.push(storage.saveProposalField(app.selectedId, project, { dueDate }));
    });
  }

  // no more "overflow" logic needed because we assign ALL projects evenly across dates
  // (still keep the overflow fields empty for compatibility)
  newAssignments.__overflow = [];
  app.assignmentOverflow = new Set();

  await Promise.all(dueSaves);
  await storage.saveAssignments(app.selectedId, newAssignments);

  delete newAssignments.__overflow;
  app.assignments = newAssignments;
  app.autoAssignConfig = { meetingDates, reviewerCount, reviewerPool };

  closeAutoAssignModal();

  if (typeof rerenderTracker === "function") rerenderTracker();
  if (typeof rerenderDashboard === "function") rerenderDashboard();

  // quick summary
  const loads = reviewerPool
    .map((r) => ({ r, n: totalLoad[r] || 0 }))
    .sort((a, b) => b.n - a.n);

  const hi = loads[0]?.n ?? 0;
  const lo = loads[loads.length - 1]?.n ?? 0;

  notify(
    `Auto-assign complete. Reviewer load range: ${lo}–${hi}. Weeks: ${meetingDates.length}, Proposals: ${projects.length}.`,
    "success"
  );
}
