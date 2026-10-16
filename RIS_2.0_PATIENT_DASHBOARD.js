const STORAGE_KEY = "lghMedicationOrdersV1";
const MAIN_MENU_PAGE = "RIS_2.0_Reference_Print_Updated.html";
const KARDEX_EXTRA_STORAGE_KEY = "lghKardexExtrasV1";

let sourceOrders = [];
let activeRoomFilter = "";
let confinementExtras = {};
let dailyReport = null;

/* Admission dates use the existing KARDEX field, never the order date.
   Match KARDEX's merge precedence, including an explicitly cleared date. */
function getConfinementExtras() {
    try {
        const data = JSON.parse(RISStore.getItem(KARDEX_EXTRA_STORAGE_KEY));
        return data && typeof data === "object" && !Array.isArray(data) ? data : {};
    } catch (_) { return {}; }
}

function getAdmissionValue(order, extras = confinementExtras) {
    const extra = { ...(extras[order.id] || {}), ...(order.kardexExtra || {}) };
    return String(extra.dateTimeAdmission || "").trim();
}

function localDateValue(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseConfinementDate(value) {
    // KARDEX stores datetime-local values; retain the calendar date as entered.
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.exec(String(value || ""));
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (year < 1000) return null;
    const utc = Date.UTC(year, month - 1, day);
    const date = new Date(utc);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { value: `${match[1]}-${match[2]}-${match[3]}`, utc };
}

function confinementDetails(value, today = new Date()) {
    const admission = parseConfinementDate(value);
    if (!admission) return { value: "", days: null, overdue: false, message: value ? "Check confinement date" : "Confinement date not set" };
    // UTC ordinals of local dates avoid daylight-saving / timezone day shifts.
    const days = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - admission.utc) / 86400000);
    if (days < 0) return { value: admission.value, days: null, overdue: false, message: "Check future confinement date" };
    return { value: admission.value, days, overdue: days > 5, message: "" };
}

/* Mirrors HGB_FREQUENCY_USAGE / normalizeHgbFrequency from the main
   Medication Order app so the dashboard shows the same CBG frequency
   without needing to load that whole script. */
const HGB_FREQUENCY_USAGE = {
    "OD":  { defaultPerShift: 1 },
    "TID": { defaultPerShift: 1 },
    "Q6":  { defaultPerShift: 1 },
    "Q4":  { defaultPerShift: 2 }
};

function normalizeHgbFrequency(order) {
    const saved = String(order?.hgbFrequency || "").toUpperCase();
    if (HGB_FREQUENCY_USAGE[saved]) return saved;

    if (order?.hgbSelected) {
        const oldQuantity = Number(order.hgbStripsPerShift || 0);
        if (oldQuantity === 6) return "Q4";
        if (oldQuantity === 4) return "Q6";
        if (oldQuantity === 3) return "TID";
        return "OD";
    }
    return "";
}

const ACUITY_LEVELS = [
    { value: "", label: "Not set" },
    { value: "I", label: "Level I \u2013 Minimal / self-care" },
    { value: "II", label: "Level II \u2013 Moderate care" },
    { value: "III", label: "Level III \u2013 Highly dependent" },
    { value: "IV", label: "Level IV \u2013 Highly critical / intensive" }
];

const ROOM_ORDER = ["901", "902", "903", "904", "905", "906"];

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
}

function getMedicationOrders() {
    try { return JSON.parse(RISStore.getItem(STORAGE_KEY)) || []; }
    catch (_) { return []; }
}

function levelClass(value) {
    const normalized = String(value || "").toUpperCase();
    if (normalized === "I") return "level-i";
    if (normalized === "II") return "level-ii";
    if (normalized === "III") return "level-iii";
    if (normalized === "IV") return "level-iv";
    return "";
}

function roomKey(order) {
    return String(order?.roomNumber || "").trim();
}

/* ---------- Load data ---------- */

function populateFromOrders(orders) {
    sourceOrders = Array.isArray(orders) ? orders : [];
    renderDashboardTable();
}

function reloadDashboardPatients() {
    confinementExtras = getConfinementExtras();
    populateFromOrders(getMedicationOrders());
    if (!document.getElementById("dashDailyReport").hidden) renderDailyConfinementReport();
}

// Keep the dashboard in sync if a patient is edited in another tab.
window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY || event.key === KARDEX_EXTRA_STORAGE_KEY || event.key === null) reloadDashboardPatients();
});

// Keep the dashboard fresh whenever the user comes back to this tab
// (e.g. after saving a patient on the Medication Order page and then
// clicking back / re-opening the dashboard tab).
window.addEventListener("focus", reloadDashboardPatients);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reloadDashboardPatients();
});

/* ---------- Render ---------- */

function filterDashboardRoom(room) {
    activeRoomFilter = room || "";
    renderDashboardTable();
}

function matchesSearch(order, search) {
    if (!search) return true;
    return String(order.patientName || "").toLowerCase().includes(search) ||
        String(order.hospitalNo || "").toLowerCase().includes(search) ||
        String(order.roomNumber || "").toLowerCase().includes(search);
}

function sortOrders(orders, sortBy) {
    const sorted = [...orders];
    if (sortBy === "name") {
        sorted.sort((a, b) => String(a.patientName || "").localeCompare(String(b.patientName || ""), undefined, { sensitivity: "base" }));
    } else if (sortBy === "level") {
        const rank = { "IV": 0, "III": 1, "II": 2, "I": 3, "": 4 };
        sorted.sort((a, b) => (rank[String(a.acuityLevel || "").toUpperCase()] ?? 4) - (rank[String(b.acuityLevel || "").toUpperCase()] ?? 4));
    } else if (sortBy === "cbg") {
        sorted.sort((a, b) => Number(Boolean(normalizeHgbFrequency(b))) - Number(Boolean(normalizeHgbFrequency(a))));
    } else {
        // room (default): known rooms in fixed order, then any other room.
        // Inside a room the saved patient order is kept, so the custom order
        // set by dragging patients in the Medication Order Main Menu shows
        // here too instead of being re-sorted alphabetically.
        const savedPosition = new Map(orders.map((order, index) => [order, index]));
        sorted.sort((a, b) => {
            const roomA = roomKey(a), roomB = roomKey(b);
            const idxA = ROOM_ORDER.includes(roomA) ? ROOM_ORDER.indexOf(roomA) : ROOM_ORDER.length;
            const idxB = ROOM_ORDER.includes(roomB) ? ROOM_ORDER.indexOf(roomB) : ROOM_ORDER.length;
            if (idxA !== idxB) return idxA - idxB;
            if (roomA !== roomB) return roomA.localeCompare(roomB, undefined, { numeric: true });
            return savedPosition.get(a) - savedPosition.get(b);
        });
    }
    return sorted;
}

function renderDashboardTable() {
    const tbody = document.getElementById("dashRows");
    const search = (document.getElementById("dashSearch")?.value || "").trim().toLowerCase();
    const sortBy = document.getElementById("dashSort")?.value || "room";
    const today = new Date();

    document.querySelectorAll(".dash-room-chip").forEach(chip => {
        chip.classList.toggle("is-active", activeRoomFilter && chip.classList.contains("dash-room-" + activeRoomFilter));
    });

    let filtered = sourceOrders.filter(order => {
        if (!order || (!order.patientName && !order.hospitalNo && !order.roomNumber)) return false;
        if (activeRoomFilter && roomKey(order) !== activeRoomFilter) return false;
        return matchesSearch(order, search);
    });

    filtered = sortOrders(filtered, sortBy);

    document.getElementById("dashCount").textContent =
        `Showing ${filtered.length} of ${sourceOrders.length}`;

    if (!filtered.length) {
        tbody.innerHTML = `<tr class="dash-empty-row"><td colspan="7">No patients match this search.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(order => {
        const room = roomKey(order);
        const isKnownRoom = ROOM_ORDER.includes(room);
        const frequency = normalizeHgbFrequency(order);
        const cbgHtml = frequency
            ? `<span class="dash-cbg has-cbg">${escapeHtml(frequency)}</span>`
            : `<span class="dash-cbg no-cbg">&mdash;</span>`;
        const roomBadgeClass = isKnownRoom ? "dash-room-" + room : "";
        const level = String(order.acuityLevel || "").toUpperCase();
        const confinement = confinementDetails(getAdmissionValue(order), today);
        const remarksHtml = confinement.overdue
            ? `<span class="dash-stay-alert"><span aria-hidden="true">&#9888;</span> Admitted for more than 5 days</span>
               <label class="dash-reason-label" for="dash-reason-${escapeHtml(order.id)}">Reason for extended confinement</label>
               <textarea id="dash-reason-${escapeHtml(order.id)}" class="dash-confinement-reason"
                         data-order-id="${escapeHtml(order.id)}" rows="2" maxlength="500"
                         placeholder="Enter reason for extended confinement"
                         aria-label="Reason for extended confinement for ${escapeHtml(order.patientName || 'patient')}">${escapeHtml(order.confinementReason || "")}</textarea>`
            : `<span class="dash-stay-note">${escapeHtml(confinement.message || "\u2014")}</span>`;

        return `
        <tr ${isKnownRoom ? `data-room="${escapeHtml(room)}"` : (room ? `data-room-other="1"` : "")}>
            <td class="dash-col-name">
                <button type="button" class="dash-name-link" onclick="openInMedicationForm('${escapeHtml(order.id)}')">
                    ${escapeHtml(order.patientName || "Unnamed Patient")}
                </button>
                <a class="dash-heading-link" href="RIS_2.0_FORM_HEADING.html?patient=${encodeURIComponent(order.id)}">Form heading</a>
            </td>
            <td class="dash-col-hosp"><span class="dash-hosp">${escapeHtml(order.hospitalNo || "&mdash;")}</span></td>
            <td class="dash-col-room">
                <span class="dash-room-badge ${roomBadgeClass}">${escapeHtml(room || "&mdash;")}</span>
            </td>
            <td class="dash-col-cbg">${cbgHtml}</td>
            <td class="dash-col-level">
                <select class="dash-level-select ${levelClass(level)}"
                        aria-label="Acuity level for ${escapeHtml(order.patientName || 'patient')}"
                        onchange="updateAcuityLevel('${escapeHtml(order.id)}', this.value, this)">
                    ${ACUITY_LEVELS.map(opt =>
                        `<option value="${opt.value}" ${opt.value === level ? "selected" : ""}>${escapeHtml(opt.label)}</option>`
                    ).join("")}
                </select>
            </td>
            <td class="dash-col-confinement">
                <input type="date" class="dash-confinement-date"
                       data-order-id="${escapeHtml(order.id)}"
                       value="${escapeHtml(confinement.value)}" max="${localDateValue(today)}" min="1000-01-01"
                       aria-label="Date of confinement for ${escapeHtml(order.patientName || 'patient')}"
                       title="Select the patient's actual admission date; saves to KARDEX automatically">
                ${confinement.days !== null ? `<span class="dash-stay-days">${confinement.days} elapsed ${confinement.days === 1 ? 'day' : 'days'}</span>` : ""}
            </td>
            <td class="dash-col-remarks">${remarksHtml}</td>
        </tr>`;
    }).join("");
}

/* ---------- Actions ---------- */

function compileDailyConfinementReport(now = new Date()) {
    const extras = getConfinementExtras();
    const patients = getMedicationOrders()
        .filter(order => order && (order.patientName || order.hospitalNo || order.roomNumber))
        .map(order => ({ order, stay: confinementDetails(getAdmissionValue(order, extras), now) }))
        .filter(entry => entry.stay.overdue)
        .sort((a, b) => roomKey(a.order).localeCompare(roomKey(b.order), undefined, { numeric: true }) ||
            String(a.order.patientName || "").localeCompare(String(b.order.patientName || ""), undefined, { sensitivity: "base" }))
        .map(({ order, stay }) => ({
            patientName: String(order.patientName || "Unnamed Patient"),
            hospitalNo: String(order.hospitalNo || ""),
            room: roomKey(order),
            confinementDate: stay.value,
            elapsedDays: stay.days,
            reason: String(order.confinementReason || "").trim()
        }));
    return {
        date: localDateValue(now),
        generatedAt: now,
        patients,
        missingReasons: patients.filter(patient => !patient.reason).length
    };
}

function renderDailyConfinementReport() {
    dailyReport = compileDailyConfinementReport();
    document.getElementById("dashReportDate").textContent =
        `Report date: ${dailyReport.date} | Generated: ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(dailyReport.generatedAt)}`;
    document.getElementById("dashReportSummary").textContent =
        `${dailyReport.patients.length} ${dailyReport.patients.length === 1 ? "patient" : "patients"} confined for more than 5 days | ${dailyReport.missingReasons} without a recorded reason`;
    document.getElementById("dashReportRows").innerHTML = dailyReport.patients.length
        ? dailyReport.patients.map(patient => `
            <tr>
                <td>${escapeHtml(patient.patientName)}</td>
                <td>${escapeHtml(patient.hospitalNo || "\u2014")}</td>
                <td>${escapeHtml(patient.room || "\u2014")}</td>
                <td>${escapeHtml(patient.confinementDate)}</td>
                <td>${patient.elapsedDays}</td>
                <td class="${patient.reason ? "" : "dash-report-missing"}">${escapeHtml(patient.reason || "Reason not entered")}</td>
            </tr>`).join("")
        : '<tr><td colspan="6" class="dash-report-empty">No patients have exceeded 5 elapsed days of confinement today.</td></tr>';
    return dailyReport;
}

function openDailyConfinementReport() {
    renderDailyConfinementReport();
    document.getElementById("dashDailyReport").hidden = false;
    document.getElementById("dashReportClose").focus();
}

function closeDailyConfinementReport() {
    document.getElementById("dashDailyReport").hidden = true;
    document.getElementById("dashReportOpen").focus();
}

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !document.getElementById("dashDailyReport").hidden) {
        closeDailyConfinementReport();
    }
});

function printDailyConfinementReport() {
    renderDailyConfinementReport();
    document.body.classList.add("dash-report-printing");
    window.print();
}

window.addEventListener("afterprint", () => document.body.classList.remove("dash-report-printing"));

function csvCell(value) {
    let text = String(value ?? "");
    // Avoid spreadsheet formulas when a patient field begins with a formula character.
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
}

function downloadDailyConfinementReport() {
    const report = renderDailyConfinementReport();
    const lines = [
        ["Report Date", "Patient Name", "Hospital Number", "Room", "Confinement Date", "Elapsed Days", "Reason for Extended Confinement"],
        ...report.patients.map(patient => [
            report.date, patient.patientName, patient.hospitalNo, patient.room,
            patient.confinementDate, patient.elapsedDays, patient.reason || "Reason not entered"
        ])
    ];
    const csv = "\uFEFF" + lines.map(line => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `confinement-over-5-days-${report.date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updateConfinementDate(id, value, input) {
    const parsed = parseConfinementDate(value);
    if (value && (!parsed || value > localDateValue())) {
        input.setCustomValidity("Select a valid confinement date on or before today.");
        input.reportValidity();
        return;
    }
    input.setCustomValidity("");
    const orders = getMedicationOrders();
    const order = orders.find(item => item.id === id);
    const status = document.getElementById("dashSaveStatus");
    if (!order) {
        status.textContent = "Patient record no longer exists. Refresh the dashboard.";
        return;
    }
    const extras = getConfinementExtras();
    const previous = getAdmissionValue(order, extras);
    // Retain a recorded admission time when changing the date.
    const time = previous.match(/T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/)?.[0] || "T00:00";
    const admission = value ? value + time : "";
    order.kardexExtra = { ...(order.kardexExtra || {}), dateTimeAdmission: admission };
    order.updatedAt = new Date().toISOString();
    extras[id] = { ...(extras[id] || {}), dateTimeAdmission: admission };
    try {
        RISStore.setItem(STORAGE_KEY, JSON.stringify(orders));
        RISStore.setItem(KARDEX_EXTRA_STORAGE_KEY, JSON.stringify(extras));
        status.textContent = "";
        reloadDashboardPatients();
    } catch (_) {
        status.textContent = "Unable to save confinement date. Please try again.";
    }
}

function updateConfinementReason(id, value) {
    const orders = getMedicationOrders();
    const order = orders.find(item => item.id === id);
    const status = document.getElementById("dashSaveStatus");
    if (!order) {
        status.textContent = "Patient record no longer exists. Refresh the dashboard.";
        return;
    }
    if (!confinementDetails(getAdmissionValue(order, getConfinementExtras())).overdue) {
        status.textContent = "Confinement date changed. Refresh the dashboard before entering a reason.";
        return;
    }
    order.confinementReason = String(value || "").trim().slice(0, 500);
    order.updatedAt = new Date().toISOString();
    try {
        RISStore.setItem(STORAGE_KEY, JSON.stringify(orders));
        const current = sourceOrders.find(item => item.id === id);
        if (current) current.confinementReason = order.confinementReason;
        status.textContent = "";
    } catch (_) {
        status.textContent = "Unable to save reason. Please try again.";
    }
}

document.getElementById("dashRows").addEventListener("change", event => {
    if (event.target.matches(".dash-confinement-date")) {
        updateConfinementDate(event.target.dataset.orderId, event.target.value, event.target);
    } else if (event.target.matches(".dash-confinement-reason")) {
        updateConfinementReason(event.target.dataset.orderId, event.target.value);
    }
});

document.getElementById("dashRows").addEventListener("input", event => {
    if (event.target.matches(".dash-confinement-date")) event.target.setCustomValidity("");
});

function updateAcuityLevel(id, value, selectEl) {
    if (selectEl) {
        selectEl.className = "dash-level-select " + levelClass(value);
    }

    const index = sourceOrders.findIndex(order => order.id === id);
    if (index >= 0) sourceOrders[index].acuityLevel = value;

    const orders = getMedicationOrders();
    const storedIndex = orders.findIndex(order => order.id === id);
    if (storedIndex >= 0) {
        orders[storedIndex].acuityLevel = value;
        orders[storedIndex].updatedAt = new Date().toISOString();
        try { RISStore.setItem(STORAGE_KEY, JSON.stringify(orders)); } catch (_) {}
    }
}

function openInMedicationForm(id) {
    window.location.href = MAIN_MENU_PAGE + "?openOrder=" + encodeURIComponent(id);
}

/* ---------- Init ---------- */

reloadDashboardPatients();

// Refresh computed remarks at midnight without interrupting a date being edited.
let renderedDate = localDateValue();
setInterval(() => {
    if (localDateValue() !== renderedDate && !document.activeElement?.matches(".dash-confinement-date, .dash-confinement-reason")) {
        renderedDate = localDateValue();
        reloadDashboardPatients();
    }
}, 30000);
