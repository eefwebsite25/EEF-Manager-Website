/**
 * Data Tab Functions
 *
 * This module handles data tab operations including auto-detection of match columns,
 * rendering data tables, hide/unhide rows, delete tabs, download CSV, and XLSX upload/replace.
 */

import { $, esc, attr, fmtMoney, notify, looksLikeFilename, looksLikeUrl, canonicalizeSharePointLink } from './utils.js';
import { storage } from './storage.js';
import { readAsArrayBuffer, parseWorksheet } from './csv.js';

const cssEscape = (value) => {
    if (window.CSS && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_\-]/g, (ch) => `\\${ch}`);
};

let dataFocusState = null;

const rememberDataFocus = (info) => { dataFocusState = info; };

const restoreDataFocus = () => {
    if (!dataFocusState) return;
    if (dataFocusState.type === "global") {
        const input = $("data-global-filter");
        if (input) {
            const pos = Math.min(dataFocusState.caret ?? input.value.length, input.value.length);
            input.focus();
            input.setSelectionRange(pos, pos);
        }
    } else if (dataFocusState.type === "column" && dataFocusState.key) {
        const selector = `input.col-filter[data-filter="${cssEscape(dataFocusState.key)}"]`;
        const input = document.querySelector(selector);
        if (input) {
            const pos = Math.min(dataFocusState.caret ?? input.value.length, input.value.length);
            input.focus();
            input.setSelectionRange(pos, pos);
        }
    }
    dataFocusState = null;
};

/**
 * Auto-detect the best match column for `tab`.
 * Heuristics:
 *  - header name hints (Project, Title, Name, Application, Q5 is tolerated)
 *  - uniqueness (many unique non-empty values)
 *  - non-empty ratio
 *  - how many survey projectName values are found in the column (if surveys loaded)
 *  - penalize columns that look like attachments / filenames / URLs
 */
export function autoDetectMatchColumn(tab, app) {
    if (!tab || !Array.isArray(tab.headers) || !Array.isArray(tab.data)) return tab?.headers?.[0] || "";

    const headers = tab.headers;
    const rows = tab.data;
    const surveys = (app.surveys || []).map(s => String(s.projectName || "").trim().toLowerCase()).filter(Boolean);
    const surveySet = new Set(surveys);

    // whitelist / strong hints
    const nameHints = ["project name", "project", "title", "application", "name", "submission", "proposal", "q5", "q4", "projecttitle"];

    const scores = headers.map(h => {
        const col = String(h || "");
        const values = rows.map(r => String(r[col] ?? "").trim());
        const nonEmpty = values.filter(v => v !== "");
        const nonEmptyRatio = (nonEmpty.length / Math.max(1, values.length));
        const uniq = new Set(nonEmpty);
        const uniqueRatio = (nonEmpty.length ? (uniq.size / nonEmpty.length) : 0);

        // survey match ratio: percent of survey names found among column values (exact case-insensitive)
        let surveyMatches = 0;
        if (surveySet.size && nonEmpty.length) {
            const lower = new Set(nonEmpty.map(v => v.toLowerCase()));
            for (const s of surveySet) {
                if (lower.has(s)) surveyMatches++;
            }
        }
        const surveyMatchRatio = surveySet.size ? (surveyMatches / surveySet.size) : 0;

        // file-like ratio - penalize columns that are attachments / filenames / urls
        const fileLikeCount = nonEmpty.filter(v => looksLikeFilename(v) || looksLikeUrl(v)).length;
        const fileLikeRatio = (fileLikeCount / Math.max(1, nonEmpty.length));

        // name hint bonus
        const lname = col.toLowerCase();
        const nameBonus = nameHints.some(hint => lname.includes(hint)) ? 1200 : 0;

        // compute score
        // prioritize name hint, then survey matches, uniqueness, completeness; penalize file-like heavily
        const score = nameBonus
            + (surveyMatchRatio * 300)
            + (uniqueRatio * 120)
            + (nonEmptyRatio * 80)
            - (fileLikeRatio * 800);

        return { header: col, score, nonEmptyRatio, uniqueRatio, surveyMatchRatio, fileLikeRatio };
    });

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    // sanity: if best has extremely high fileLikeRatio, fallback to header "Project Name" if present, else first header
    if (best && best.fileLikeRatio > 0.6) {
        if (tab.headers.includes("Project Name")) return "Project Name";
        // look for any header with low fileLikeRatio
        const alt = scores.find(s => s.fileLikeRatio < 0.3);
        if (alt) return alt.header;
    }

    // choose best if it has a reasonable score, else fallback
    if (best && best.score > 5) return best.header;
    return tab.headers[0] || "";
}

/**
 * Safely set match column for a tab with validation and audit metadata.
 * opts: { force: boolean, user: string }
 */
export async function setMatchColumn(tab, column, app, opts = { force: false, user: "system" }) {
    if (!tab) return;
    const prev = tab.matchColumn || "";
    if (prev === column) return;

    // Respect lock
    if (tab.matchColumnLocked && !opts.force) {
        // ask admin to confirm unlocking
        const ok = confirm(`The match column for dataset "${tab.name || tab.id}" is locked. Unlock and change match column to "${column}"?`);
        if (!ok) return;
        tab.matchColumnLocked = false;
    }

    // Validate existence
    if (!tab.headers.includes(column)) {
        notify(`Column "${column}" not found in dataset headers.`, "error");
        return;
    }

    // Basic validation of content (ensure not mostly empty)
    const values = (tab.data || []).map(r => String(r[column] ?? "").trim());
    const nonEmptyRatio = values.filter(v => v !== "").length / Math.max(1, values.length);
    if (nonEmptyRatio < 0.05 && !opts.force) {
        const ok = confirm(`Column "${column}" is mostly empty (${(nonEmptyRatio*100).toFixed(1)}% non-empty). Proceed?`);
        if (!ok) return;
    }

    // Avoid obvious file columns unless forced
    const fileLikeCount = values.filter(v => looksLikeFilename(v) || looksLikeUrl(v)).length;
    const fileLikeRatio = fileLikeCount / Math.max(1, values.length);
    if (fileLikeRatio > 0.6 && !opts.force) {
        const ok = confirm(`Column "${column}" appears to contain attachments/filenames (${Math.round(fileLikeRatio*100)}%). Are you sure this is the project name column?`);
        if (!ok) return;
    }

    // record history
    tab._matchHistory = tab._matchHistory || [];
    tab._matchHistory.push({
        changedAt: new Date().toISOString(),
        changedBy: opts.user || "unknown",
        from: prev,
        to: column
    });

    tab.matchColumn = column;

    // re-lock after manual change unless forced override
    if (!opts.force) tab.matchColumnLocked = true;

    try {
        await storage.saveTab(tab);
        // ensure local in-memory tab updated
        const t = app.tabs.find(x => x.id === tab.id);
        if (t) Object.assign(t, tab);
        notify(`Match column set to "${column}"`, "success");
    } catch (err) {
        console.error("Failed to save match column:", err);
        notify("Failed to save match column (see console).", "error");
    }
}

/**
 * Update the small match-controls UI next to the select in Data view.
 * Creates a lock/unlock button and a label showing locked state and history link.
 */
export function updateMatchControlsUI(tab, renderData) {
    const container = $("match-controls");
    if (!container) return;
    container.innerHTML = ""; // reset

    if (!tab) return;

    const lockLabel = document.createElement("span");
    lockLabel.className = "match-lock";
    lockLabel.id = "match-lock-label";

    const btn = document.createElement("button");
    btn.className = "btn btn-sm";
    btn.id = "match-lock-btn";

    if (tab.matchColumnLocked) {
        lockLabel.textContent = "Locked";
        btn.textContent = "Unlock";
        btn.onclick = async () => {
            if (!confirm("Unlock match column for editing? This will allow changing the dataset's match key. Continue?")) return;
            tab.matchColumnLocked = false;
            await storage.saveTab(tab);
            notify("Match column unlocked", "info");
            renderData();
        };
    } else {
        lockLabel.textContent = "Unlocked";
        btn.textContent = "Lock";
        btn.onclick = async () => {
            if (!confirm("Lock match column to prevent accidental changes?")) return;
            tab.matchColumnLocked = true;
            await storage.saveTab(tab);
            notify("Match column locked", "success");
            renderData();
        };
    }

    // history quick link (if exists)
    const histBtn = document.createElement("button");
    histBtn.className = "btn btn-sm";
    histBtn.textContent = "History";
    histBtn.onclick = () => {
        const hist = (tab._matchHistory || []).slice().reverse();
        if (hist.length === 0) {
            alert("No match history for this dataset.");
            return;
        }
        const out = hist.map(h => `${h.changedAt} — ${h.changedBy} — ${h.from || "(none)"} → ${h.to}`).join("\n");
        // show in small prompt; could be replaced with modal later
        alert(out);
    };

    container.appendChild(btn);
    container.appendChild(lockLabel);
    container.appendChild(histBtn);
}

// Render Data tab
export function renderData(app, setMatchColumn, updateMatchControlsUI, updateSurveyProposalLink) {
    const tab = app.activeTab;
    const head = $("data-head"), body = $("data-body"), matchSel = $("match-col");
    const toolbar = $("data-toolbar");
    if (!tab) {
        if (head) head.innerHTML = "";
        if (body) body.innerHTML = "";
        if (matchSel) matchSel.innerHTML = "";
        if (toolbar) toolbar.innerHTML = `<div class="text-muted">No dataset loaded.</div>`;
        updateMatchControlsUI(null);
        return;
    }

    const matchCol = tab.matchColumn || tab.headers?.[0];
    app.pinnedColumns = new Set(matchCol ? [matchCol] : []);
    tab.pinnedColumns = Array.from(app.pinnedColumns);

    const globalSearch = (app.dataSearch || "").toLowerCase();
    const columnOrder = [
        ...tab.headers.filter(h => app.pinnedColumns.has(h)),
        ...tab.headers.filter(h => !app.pinnedColumns.has(h))
    ];

    if (head) {
        const headerRow = "<tr>" + columnOrder.map(h => `<th data-col="${attr(h)}">
            <div class="th-inner th-flex">
                <span>${esc(h)}</span>
            </div>
        </th>`).join("") + "<th><div class='th-inner'>Actions</div></th></tr>";
        head.innerHTML = headerRow;
    }

    if (matchSel) {
        matchSel.innerHTML = tab.headers.map(h => `<option ${h === tab.matchColumn ? "selected" : ""}>${esc(h)}</option>`).join("");
        // disable select if locked
        matchSel.disabled = !!tab.matchColumnLocked;
        matchSel.onchange = async () => {
            const newCol = matchSel.value;
            await setMatchColumn(tab, newCol, app, { force: false, user: "interface" });
            // renderTracker is called from tracker.js
            updateSurveyProposalLink();
            renderData(app, setMatchColumn, updateMatchControlsUI, updateSurveyProposalLink); // refresh UI so lock state and controls update
        };
    }

    // update controls (lock/unlock/history)
    updateMatchControlsUI(tab, () => renderData(app, setMatchColumn, updateMatchControlsUI, updateSurveyProposalLink));

    const datasetRows = (tab.data || []).map((row, idx) => ({ row, idx }));
    const filteredRows = datasetRows.filter(({ row }) => {
        if (!globalSearch) return true;
        return Object.values(row || {}).some(v => String(v ?? "").toLowerCase().includes(globalSearch));
    });

    if (toolbar) {
        toolbar.innerHTML = `
            <div class="data-toolbar-row">
                <input id="data-global-filter" placeholder="Quick search" value="${esc(app.dataSearch || "")}">
                <button id="data-clear-filters" class="btn btn-sm">Clear filters</button>
                <div class="data-toolbar-meta">Showing ${filteredRows.length} of ${(tab.data || []).length} rows</div>
            </div>
        `;
        const globalInput = $("data-global-filter");
        if (globalInput) {
            globalInput.addEventListener("input", (e) => {
                rememberDataFocus({ type: "global", caret: e.target.selectionStart });
                app.dataSearch = e.target.value;
                renderData(app, setMatchColumn, updateMatchControlsUI, updateSurveyProposalLink);
            });
        }
        const clearBtn = $("data-clear-filters");
        if (clearBtn) {
            clearBtn.onclick = () => {
                rememberDataFocus({ type: "global", caret: 0 });
                app.dataFilters = {};
                app.dataSearch = "";
                renderData(app, setMatchColumn, updateMatchControlsUI, updateSurveyProposalLink);
            };
        }
    }

    if (body) {
        body.innerHTML = filteredRows.map(({ row, idx }, visibleIdx) => {
            const tds = columnOrder.map((h, ci) => {
                const raw = row[h] ?? "";
                let url = (tab.linkMap && tab.linkMap[idx] && tab.linkMap[idx][h]) ? tab.linkMap[idx][h] : null;
                const display = app.isAmountHeader(h) ? fmtMoney(raw) : String(raw);
                if (!url) {
                    const candidate = String(raw ?? "").trim();
                    if (looksLikeUrl(candidate)) url = candidate;
                }

                const content = url
                    ? `<a href="${attr(canonicalizeSharePointLink(url))}" target="_blank" rel="noopener">${esc(display || url)}</a>`
                    : esc(display);

                return `<td data-col="${attr(h)}" data-row-idx="${idx}" data-visible-idx="${visibleIdx}" data-col-idx="${ci}" tabindex="0">${content}</td>`;
            }).join("");
            const keyVal = row[tab.matchColumn] || "";
            const isHidden = !!row._hidden;
            return `<tr class="${isHidden ? "row-hidden" : ""}">
                        ${tds}
                        <td class="actions-col">
                            <button class="btn btn-primary btn-sm" onclick="app_openDetailFromData('${esc(keyVal)}')">Go to notes</button>
                            <button class="btn btn-sm ${isHidden ? 'btn-primary' : 'btn-danger'}" onclick="app_toggleHideDataRow(${idx})">${isHidden ? 'Unhide' : 'Hide'}</button>
                        </td>
                    </tr>`;
        }).join("");
    }

    if (head) {
        head.querySelectorAll(".col-filter").forEach(input => {
            input.addEventListener("input", (e) => {
                const col = e.target.getAttribute("data-filter");
                rememberDataFocus({ type: "column", key: col, caret: e.target.selectionStart });
                if (e.target.value) app.dataFilters[col] = e.target.value;
                else delete app.dataFilters[col];
                renderData(app, setMatchColumn, updateMatchControlsUI, updateSurveyProposalLink);
            });
        });
        head.querySelectorAll("[data-pin]").forEach(btn => {
            btn.addEventListener("click", async () => {
                const col = btn.getAttribute("data-pin");
                if (!col) return;
                if (app.pinnedColumns.has(col)) app.pinnedColumns.delete(col);
                else app.pinnedColumns.add(col);
                tab.pinnedColumns = Array.from(app.pinnedColumns);
                await storage.saveTab(tab);
                renderData(app, setMatchColumn, updateMatchControlsUI, updateSurveyProposalLink);
            });
        });
    }

    applyPinnedStyles(columnOrder, app.pinnedColumns);
    bindDataTableKeyboardNav();
    restoreDataFocus();
}

function applyPinnedStyles(columnOrder, pinnedSet) {
    const table = $("data-table");
    if (!table) return;
    table.querySelectorAll(".pinned").forEach(el => {
        el.classList.remove("pinned");
        el.style.left = "";
    });
    let left = 0;
    columnOrder.forEach(col => {
        if (!pinnedSet.has(col)) return;
        const selector = `[data-col="${cssEscape(col)}"]`;
        const widthEl = table.querySelector(`tbody td${selector}`) || table.querySelector(`thead th${selector}`);
        const width = widthEl ? widthEl.getBoundingClientRect().width : 160;
        table.querySelectorAll(selector).forEach(el => {
            el.classList.add("pinned");
            el.style.left = left + "px";
        });
        left += width;
    });
}

function bindDataTableKeyboardNav() {
    const body = $("data-body");
    if (!body || body._navBound) return;
    body._navBound = true;
    body.addEventListener("keydown", (e) => {
        const cell = e.target.closest("td[data-visible-idx]");
        if (!cell) return;
        const key = e.key;
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return;
        e.preventDefault();
        const rowIdx = parseInt(cell.getAttribute("data-visible-idx"), 10);
        const colIdx = parseInt(cell.getAttribute("data-col-idx"), 10);
        let targetRow = rowIdx, targetCol = colIdx;
        if (key === "ArrowUp") targetRow = Math.max(0, rowIdx - 1);
        if (key === "ArrowDown") targetRow = rowIdx + 1;
        if (key === "ArrowLeft") targetCol = Math.max(0, colIdx - 1);
        if (key === "ArrowRight") targetCol = colIdx + 1;
        const next = body.querySelector(`td[data-visible-idx="${targetRow}"][data-col-idx="${targetCol}"]`);
        if (next) next.focus();
    });
}

// Toggle hide for a data row (persists to Firestore)
export async function app_toggleHideDataRow(rowIndex, app, renderData, renderTracker) {
    const tab = app.activeTab;
    if (!tab) return;

    const row = tab.data[rowIndex];
    if (!row) return;

    // flip hidden flag
    row._hidden = !row._hidden;

    try {
        // Persist the tab object to Firestore
        await storage.saveTab(tab);

        notify(row._hidden ? `Row ${rowIndex + 1} hidden.` : `Row ${rowIndex + 1} unhidden.`, "success");
        renderData();
        renderTracker();
    } catch (err) {
        console.error("Error toggling hide:", err);
        notify("Failed to update row visibility. Check console for details.", "error");
    }
}

// Delete active tab
export async function deleteActiveTab(app, reloadCurrentDataset, renderAll) {
    const tab = app.activeTab; if (!tab || tab.readonly) return;
    if (!confirm(`Delete dataset "${tab.name}"?`)) return;
    await storage.deleteTab(tab.id);
    app.tabs = await storage.loadTabs();
    app.selectedId = app.tabs[0]?.id || null;
    await storage.saveUIConfig({ selectedDatasetId: app.selectedId || "" });
    await reloadCurrentDataset();
    renderAll();
    notify("Dataset deleted", "success");
}

// Download active CSV
export function downloadActiveCSV(app) {
    const tab = app.activeTab; if (!tab) return;
    const csv = CSV.stringify(tab.headers, tab.data);
    download(csv, `${tab.name}.csv`, "text/csv");
    notify("CSV downloaded", "info");
}

// Replace XLSX
export async function replaceXLSX(app, autoDetectMatchColumn, renderAll) {
    const f = $("xlsx").files?.[0];
    if (!f) return notify("Choose a file on the Dashboard first.", "error");
    const ab = await readAsArrayBuffer(f);
    const wb = XLSX.read(ab, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const { headers, data, linkMap } = parseWorksheet(ws);
    const tab = app.activeTab; if (!tab) return;
    tab.headers = headers; tab.data = data; tab.linkMap = linkMap; tab.name = wb.SheetNames[0] || tab.name;

    // auto-detect best match column and lock it by default to avoid accidental changes
    const detected = autoDetectMatchColumn(tab, app);
    tab.matchColumn = detected || (headers.includes("Project Name") ? "Project Name" : headers[0]);
    tab.matchColumnLocked = true;

    await storage.saveTab(tab);
    app.tabs = await storage.loadTabs();
    renderAll();
    notify("Dataset replaced (match column auto-detected and locked)", "success");
}

// Upload XLSX
export async function uploadXLSX(app, autoDetectMatchColumn, reloadCurrentDataset, renderAll) {
    const file = $("xlsx").files?.[0];
    if (!file) return notify("Please select an XLSX file", "error");
    const ab = await readAsArrayBuffer(file);
    const wb = XLSX.read(ab, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const { headers, data, linkMap } = parseWorksheet(ws);
    const newTab = {
        id: "dt_" + Date.now(),
        name: wb.SheetNames[0],
        headers, data, linkMap,
        readonly: false, created: new Date().toISOString()
    };

    // auto-detect match column, lock it
    newTab.matchColumn = autoDetectMatchColumn(newTab, app) || (headers.includes("Project Name") ? "Project Name" : headers[0]);
    newTab.matchColumnLocked = true;

    await storage.saveTab(newTab);
    app.tabs = await storage.loadTabs();
    app.selectedId = newTab.id;
    await storage.saveUIConfig({ selectedDatasetId: app.selectedId });
    await reloadCurrentDataset();
    renderAll();
    notify("Upload complete (match column auto-detected and locked)", "success");
}
