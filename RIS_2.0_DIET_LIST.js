const DIET_STORAGE_KEY = "lghDietListV1";
const MEDICATION_STORAGE_KEY = "lghMedicationOrdersV1";
const DIET_OPTIONS_KEY = "lghDietOptionsV1";
const DIET_PRINT_PAPER_KEY = "lghDietPrintPaperV1";
const FALLBACK_ROWS_PER_PAGE = 36;
const activeToken = new URLSearchParams(location.search).get("token") || "";

let sourceOrders = [];
let receivedFromOpener = false;
let basePageTemplate = null;
let rowsPerPage = FALLBACK_ROWS_PER_PAGE;


function normalizePaperSize(value) {
    return String(value || "").toLowerCase() === "legal" ? "legal" : "a4";
}

function applyDietPrintPaperSize(value) {
    const paper = normalizePaperSize(value);
    document.documentElement.dataset.printPaper = paper;
    const selector = document.getElementById("dietPaperSize");
    if (selector && selector.value !== paper) selector.value = paper;

    let style = document.getElementById("dietDynamicPageSize");
    if (!style) {
        style = document.createElement("style");
        style.id = "dietDynamicPageSize";
        document.head.appendChild(style);
    }
    style.textContent = `@media print { @page { size: ${paper === "legal" ? "legal" : "A4"} portrait; margin: .2in; } }`;
    return paper;
}

function setDietPaperSize(value) {
    const paper = applyDietPrintPaperSize(value);
    try { RISStore.setItem(DIET_PRINT_PAPER_KEY, paper); } catch (_) {}
    showToast(`Print paper set to ${paper === "a4" ? "A4" : "Legal"}.`);
}

function printDietList() {
    const selector = document.getElementById("dietPaperSize");
    applyDietPrintPaperSize(selector?.value || "a4");
    prepareDietPrint();
    window.print();
}

function safeJsonClone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return value; }
}

function getDietStore() {
    try { return JSON.parse(RISStore.getItem(DIET_STORAGE_KEY)) || {}; }
    catch (_) { return {}; }
}

function setDietStore(store) {
    try { RISStore.setItem(DIET_STORAGE_KEY, JSON.stringify(store)); }
    catch (_) {}
}

function getMedicationOrders() {
    try { return JSON.parse(RISStore.getItem(MEDICATION_STORAGE_KEY)) || []; }
    catch (_) { return []; }
}

function getDietOptions() {
    try {
        const parsed = JSON.parse(RISStore.getItem(DIET_OPTIONS_KEY)) || [];
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
        return [];
    }
}

function todayLocal() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function sortRoom(a, b) {
    return String(a.roomNumber || "").localeCompare(String(b.roomNumber || ""), undefined, { numeric: true, sensitivity: "base" }) ||
        String(a.patientName || "").localeCompare(String(b.patientName || ""), undefined, { sensitivity: "base" });
}

function pageElements() {
    return [...document.querySelectorAll(".diet-page")];
}

function rowElements() {
    return [...document.querySelectorAll(".diet-page .diet-rows tr")];
}

function primaryWardInput() {
    return document.querySelector(".diet-page .ward-input");
}

function primaryDateInput() {
    return document.querySelector(".diet-page .diet-date-input");
}

function getDietDate() {
    return primaryDateInput()?.value || todayLocal();
}

function getWard() {
    return primaryWardInput()?.value.trim() || "";
}

function renumberRow(tr, globalIndex) {
    tr.dataset.row = String(globalIndex);
    tr.querySelectorAll("input, select").forEach((control) => {
        const label = control.getAttribute("aria-label") || "";
        if (label) control.setAttribute("aria-label", label.replace(/row\s+\d+/i, `row ${globalIndex + 1}`));
    });
    ensureDietDisplay(tr, globalIndex);
}

function ensureDietDisplay(tr, index = Number(tr?.dataset?.row || 0)) {
    if (!tr) return null;
    const cell = tr.querySelector(".remarks-cell");
    if (!cell) return null;
    const select = cell.querySelector(".diet-select");
    if (select) {
        select.hidden = true;
        select.tabIndex = -1;
        select.setAttribute("aria-hidden", "true");
    }
    let display = cell.querySelector(".diet-display");
    if (!display) {
        display = document.createElement("span");
        display.className = "diet-display";
        cell.appendChild(display);
    }
    display.setAttribute("aria-label", `Selected Kardex diet row ${index + 1}`);
    return display;
}

function ensureRowsOnPage(page, pageIndex) {
    const tbody = page.querySelector(".diet-rows") || page.querySelector("#dietRows");
    if (!tbody) return;
    tbody.classList.add("diet-rows");
    const firstRow = tbody.querySelector("tr");
    if (!firstRow) return;

    while (tbody.querySelectorAll("tr").length < rowsPerPage) {
        tbody.appendChild(firstRow.cloneNode(true));
    }
    while (tbody.querySelectorAll("tr").length > rowsPerPage) {
        tbody.lastElementChild.remove();
    }

    [...tbody.querySelectorAll("tr")].forEach((tr, localIndex) => {
        renumberRow(tr, pageIndex * rowsPerPage + localIndex);
    });
}

function configurePage(page, pageIndex) {
    page.classList.add("diet-page");
    page.dataset.pageIndex = String(pageIndex);
    page.id = pageIndex === 0 ? "dietSheet" : `dietSheet-${pageIndex + 1}`;

    const ward = page.querySelector("#wardInput, .ward-input");
    const date = page.querySelector("#dietDate, .diet-date-input");
    const rows = page.querySelector("#dietRows, .diet-rows");
    const bTotal = page.querySelector("#breakfastTotal, .breakfast-total");
    const lTotal = page.querySelector("#lunchTotal, .lunch-total");
    const sTotal = page.querySelector("#supperTotal, .supper-total");

    if (ward) {
        ward.classList.add("ward-input");
        ward.id = pageIndex === 0 ? "wardInput" : `wardInput-${pageIndex + 1}`;
    }
    if (date) {
        date.classList.add("diet-date-input");
        date.id = pageIndex === 0 ? "dietDate" : `dietDate-${pageIndex + 1}`;
    }
    if (rows) {
        rows.classList.add("diet-rows");
        rows.id = pageIndex === 0 ? "dietRows" : `dietRows-${pageIndex + 1}`;
    }
    if (bTotal) {
        bTotal.classList.add("breakfast-total");
        bTotal.id = pageIndex === 0 ? "breakfastTotal" : `breakfastTotal-${pageIndex + 1}`;
    }
    if (lTotal) {
        lTotal.classList.add("lunch-total");
        lTotal.id = pageIndex === 0 ? "lunchTotal" : `lunchTotal-${pageIndex + 1}`;
    }
    if (sTotal) {
        sTotal.classList.add("supper-total");
        sTotal.id = pageIndex === 0 ? "supperTotal" : `supperTotal-${pageIndex + 1}`;
    }

    ensureRowsOnPage(page, pageIndex);
}

function clearRow(tr) {
    tr.dataset.orderId = "";
    tr.dataset.hospitalNo = "";
    const room = tr.querySelector(".room-input");
    const patient = tr.querySelector(".patient-input");
    const age = tr.querySelector(".age-input");
    const select = tr.querySelector(".diet-select");
    if (room) room.value = "";
    if (patient) patient.value = "";
    if (age) age.value = "";
    tr.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    if (select) [...select.options].forEach(option => option.selected = false);
    tr.dataset.diets = "[]";
    const display = ensureDietDisplay(tr);
    if (display) display.textContent = "";
}

function clearPage(page) {
    page.querySelectorAll(".diet-rows tr").forEach(clearRow);
    page.querySelectorAll(".ward-input, .diet-date-input, .breakfast-total, .lunch-total, .supper-total").forEach(input => {
        input.value = "";
    });
}

function initializePaging() {
    const firstPage = document.getElementById("dietSheet");
    if (!firstPage) return;

    // The authored table defines the printable capacity. If the form is
    // redesigned with a different number of cells, pagination follows it.
    const authoredRowCount = firstPage.querySelectorAll("#dietRows > tr").length;
    rowsPerPage = authoredRowCount || FALLBACK_ROWS_PER_PAGE;

    configurePage(firstPage, 0);
    clearPage(firstPage);
    basePageTemplate = firstPage.cloneNode(true);
}

function ensurePageCount(pageCount) {
    const needed = Math.max(1, pageCount);
    let pages = pageElements();

    while (pages.length > needed) {
        pages[pages.length - 1].remove();
        pages = pageElements();
    }

    while (pages.length < needed) {
        const clone = basePageTemplate.cloneNode(true);
        configurePage(clone, pages.length);
        clearPage(clone);
        pages[pages.length - 1].after(clone);
        pages = pageElements();
    }

    pages.forEach((page, index) => {
        configurePage(page, index);
        ensureRowsOnPage(page, index);
    });

    refreshDietOptions();
}

function normalizeDietText(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const firstSelect = document.querySelector(".diet-select");
    const options = firstSelect ? [...firstSelect.options].map(o => o.value).filter(Boolean) : [];
    const direct = options.find(opt => opt.toLowerCase() === text.toLowerCase());
    if (direct) return direct;
    const t = text.toLowerCase();
    if (t.includes("npo")) return "NPO (Nothing by Mouth)";
    if (t.includes("tube") || t.includes("enteral") || /^tf\b/.test(t)) return "Tube Feeding / Enteral Feeding";
    if (t.includes("clear") && t.includes("liquid")) return "Clear Liquid Diet";
    if (t.includes("full") && t.includes("liquid")) return "Full Liquid Diet";
    if (t.includes("mechanical") && t.includes("soft")) return "Mechanical Soft Diet";
    if (t.includes("soft")) return "Soft Diet";
    if (t.includes("puree")) return "Pureed Diet";
    if (t.includes("diabet") || t.includes("carbohydrate")) return "Diabetic / Consistent Carbohydrate Diet";
    if (t.includes("low salt") || t.includes("low sodium")) return "Low Salt / Low Sodium Diet";
    if (t.includes("cardiac")) return "Cardiac Diet";
    if (t.includes("renal")) return "Renal Diet";
    if (t.includes("regular") || t.includes("full diet")) return "Regular / Full Diet";
    return text;
}

function inferredMealKind(diet) {
    const t = String(diet || "").toLowerCase();
    if (!t || t.includes("npo")) return "";
    if (t.includes("tube") || t.includes("enteral")) return "tf";
    if (t.includes("liquid")) return "liq";
    if (t.includes("soft") || t.includes("puree")) return "soft";
    return "full";
}

function dietKey(rowData, index) {
    const date = getDietDate();
    const base = rowData.orderId || rowData.hospitalNo || `${rowData.roomNumber || "room"}-${rowData.patientName || index}`;
    return `${date}::${base}`;
}

function collectRow(tr, index) {
    const checks = {};
    tr.querySelectorAll('input[type="checkbox"][data-meal][data-kind]').forEach(cb => {
        checks[`${cb.dataset.meal}_${cb.dataset.kind}`] = cb.checked;
    });
    return {
        orderId: tr.dataset.orderId || "",
        hospitalNo: tr.dataset.hospitalNo || "",
        roomNumber: tr.querySelector(".room-input")?.value.trim() || "",
        patientName: tr.querySelector(".patient-input")?.value.trim() || "",
        age: tr.querySelector(".age-input")?.value.trim() || "",
        ward: getWard(),
        date: getDietDate(),
        remarks: (() => {
            try { return JSON.parse(tr.dataset.diets || "[]").filter(Boolean); }
            catch (_) { return []; }
        })(),
        checks,
        index
    };
}

function applyRow(tr, data, index, store) {
    clearRow(tr);
    tr.dataset.orderId = data.id || data.orderId || "";
    tr.dataset.hospitalNo = data.hospitalNo || "";
    tr.querySelector(".room-input").value = data.roomNumber || "";
    tr.querySelector(".patient-input").value = data.patientName || "";
    tr.querySelector(".age-input").value = data.age || "";

    const current = {
        orderId: tr.dataset.orderId,
        hospitalNo: tr.dataset.hospitalNo,
        roomNumber: data.roomNumber || "",
        patientName: data.patientName || ""
    };
    const saved = store[dietKey(current, index)] || data.dietList || {};
    const hasKardexDiet = data.kardexExtra && Object.prototype.hasOwnProperty.call(data.kardexExtra, "diet");
    const sourceDiet = hasKardexDiet ? data.kardexExtra.diet : (saved.remarks || "");
    const normalizedDiets = [...new Set((Array.isArray(sourceDiet) ? sourceDiet : [sourceDiet])
        .map(normalizeDietText)
        .filter(Boolean))];

    const select = tr.querySelector(".diet-select");
    if (select) [...select.options].forEach(option => option.selected = normalizedDiets.includes(option.value));
    tr.dataset.diets = JSON.stringify(normalizedDiets);
    const display = ensureDietDisplay(tr, index);
    if (display) display.textContent = normalizedDiets.join(", ");

    const checks = saved.checks || {};
    const hasSavedChecks = Object.values(checks).some(Boolean);
    tr.querySelectorAll('input[type="checkbox"][data-meal][data-kind]').forEach(cb => {
        cb.checked = Boolean(checks[`${cb.dataset.meal}_${cb.dataset.kind}`]);
    });

    if (!hasSavedChecks) {
        const kind = inferredMealKind(normalizedDiets.join(" "));
        if (kind) {
            ["breakfast", "lunch", "supper"].forEach(meal => {
                const cb = tr.querySelector(`input[data-meal="${meal}"][data-kind="${kind}"]`);
                if (cb) cb.checked = true;
            });
        }
    }
}

function synchronizePageHeaders() {
    const ward = getWard();
    const date = getDietDate();
    pageElements().forEach(page => {
        const wardInput = page.querySelector(".ward-input");
        const dateInput = page.querySelector(".diet-date-input");
        if (wardInput) wardInput.value = ward;
        if (dateInput) dateInput.value = date;
    });
}

function populateFromOrders(orders) {
    sourceOrders = (Array.isArray(orders) ? safeJsonClone(orders) : []).sort(sortRoom);
    const pageCount = Math.max(1, Math.ceil(sourceOrders.length / rowsPerPage));
    ensurePageCount(pageCount);

    const date = getDietDate() || todayLocal();
    const wardBefore = getWard();
    const store = getDietStore();
    const rows = rowElements();
    rows.forEach(clearRow);

    sourceOrders.forEach((order, index) => {
        if (rows[index]) applyRow(rows[index], order, index, store);
    });

    const wards = [...new Set(sourceOrders.map(o => String(o.ward || "").trim()).filter(Boolean))];
    const ward = wardBefore || (wards.length === 1 ? wards[0] : "");
    pageElements().forEach(page => {
        const wardInput = page.querySelector(".ward-input");
        const dateInput = page.querySelector(".diet-date-input");
        if (wardInput) wardInput.value = ward;
        if (dateInput) dateInput.value = date;
    });

    const status = document.getElementById("dietStatus");
    if (status) {
        status.textContent = `${sourceOrders.length} patient${sourceOrders.length === 1 ? "" : "s"} loaded` +
            (pageCount > 1 ? ` • ${pageCount} print pages` : "");
    }
    updateTotals();
}

function reloadPatients() {
    if (receivedFromOpener && sourceOrders.length) populateFromOrders(sourceOrders);
    else populateFromOrders(getMedicationOrders());
    showToast("Patient list refreshed.");
}

function updateTotals() {
    pageElements().forEach(page => {
        const totals = { breakfast: 0, lunch: 0, supper: 0 };
        page.querySelectorAll(".diet-rows tr").forEach(tr => {
            ["breakfast", "lunch", "supper"].forEach(meal => {
                if ([...tr.querySelectorAll(`input[data-meal="${meal}"]`)].some(cb => cb.checked)) totals[meal]++;
            });
        });
        const b = page.querySelector(".breakfast-total");
        const l = page.querySelector(".lunch-total");
        const s = page.querySelector(".supper-total");
        if (b) b.value = totals.breakfast || "";
        if (l) l.value = totals.lunch || "";
        if (s) s.value = totals.supper || "";
    });
}

function enforceOneDietPerMeal(event) {
    const cb = event.target;
    if (!cb.matches('input[type="checkbox"][data-meal][data-kind]')) return;
    if (cb.checked) {
        const tr = cb.closest("tr");
        tr.querySelectorAll(`input[data-meal="${cb.dataset.meal}"]`).forEach(other => {
            if (other !== cb) other.checked = false;
        });
    }
    updateTotals();
}

function autofillChecksFromRemarks(event) {
    if (!event.target.matches(".diet-select")) return;
    const tr = event.target.closest("tr");
    const kind = inferredMealKind([...event.target.selectedOptions].map(o => o.value).join(" "));
    if (!kind) return;
    ["breakfast", "lunch", "supper"].forEach(meal => {
        tr.querySelectorAll(`input[data-meal="${meal}"]`).forEach(cb => cb.checked = cb.dataset.kind === kind);
    });
    updateTotals();
}

function saveDietList() {
    const store = getDietStore();
    const entries = [];
    rowElements().forEach((tr, index) => {
        const data = collectRow(tr, index);
        if (!data.patientName && !data.roomNumber && !data.orderId) return;
        store[dietKey(data, index)] = data;
        entries.push(data);
    });
    setDietStore(store);
    if (window.opener && activeToken) {
        window.opener.postMessage({ type: "RIS_DIET_LIST_SAVE", token: activeToken, entries }, "*");
    }
    showToast("Diet list saved.");
}

function showToast(message) {
    const toast = document.getElementById("dietToast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function refreshDietOptions() {
    const custom = getDietOptions();
    const manager = document.getElementById("dietManagerList");
    if (manager) {
        manager.innerHTML = "";
        custom.forEach(value => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            manager.appendChild(option);
        });
    }

    document.querySelectorAll(".diet-select").forEach(select => {
        const selected = [...select.selectedOptions].map(option => option.value);
        const existing = [...select.options].map(option => option.value);
        custom.filter(value => !existing.includes(value)).forEach(value => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
        [...select.options].forEach(option => {
            if (option.value && !selected.includes(option.value) && custom.includes(option.value)) {
                // Keep custom options available; selection state remains unchanged.
            }
        });
        selected.forEach(value => {
            const option = [...select.options].find(item => item.value === value);
            if (option) option.selected = true;
        });
    });
}

function openDietManager() {
    refreshDietOptions();
    document.getElementById("dietManager").style.display = "flex";
}

function closeDietManager() {
    document.getElementById("dietManager").style.display = "none";
}

function addDietOption() {
    const input = document.getElementById("newDietName");
    const value = input.value.trim();
    if (!value) return;
    const custom = getDietOptions();
    const allExisting = [...document.querySelector(".diet-select").options].map(option => option.value);
    if (!allExisting.some(item => item.toLowerCase() === value.toLowerCase())) {
        custom.push(value);
        RISStore.setItem(DIET_OPTIONS_KEY, JSON.stringify(custom));
    }
    input.value = "";
    refreshDietOptions();
}

function removeDietOption() {
    const list = document.getElementById("dietManagerList");
    const value = list.value;
    if (!value) return;
    RISStore.setItem(DIET_OPTIONS_KEY, JSON.stringify(getDietOptions().filter(item => item !== value)));
    document.querySelectorAll(".diet-select").forEach(select => {
        [...select.options].filter(option => option.value === value).forEach(option => option.remove());
    });
    refreshDietOptions();
}

function prepareDietPrint() {
    synchronizePageHeaders();
    updateTotals();
    rowElements().forEach((tr, index) => {
        ensureDietDisplay(tr, index);
        tr.querySelectorAll(".check-cell").forEach(cell => {
            const checkbox = cell.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.checked) {
                cell.classList.add("print-checked");
            } else {
                cell.classList.remove("print-checked");
            }
        });
    });
}

window.addEventListener("message", event => {
    const data = event.data || {};
    if (data.type !== "RIS_DIET_LIST_DATA" || data.token !== activeToken) return;
    receivedFromOpener = true;
    populateFromOrders(data.orders || (data.order ? [data.order] : []));
});

window.addEventListener("storage", event => {
    if (event.key === DIET_OPTIONS_KEY) refreshDietOptions();
});

document.addEventListener("change", event => {
    if (event.target.closest(".diet-page")) {
        enforceOneDietPerMeal(event);
        autofillChecksFromRemarks(event);
    }

    if (event.target.matches(".ward-input")) {
        const value = event.target.value;
        pageElements().forEach(page => {
            const input = page.querySelector(".ward-input");
            if (input && input !== event.target) input.value = value;
        });
    }

    if (event.target.matches(".diet-date-input")) {
        const value = event.target.value || todayLocal();
        pageElements().forEach(page => {
            const input = page.querySelector(".diet-date-input");
            if (input) input.value = value;
        });
        populateFromOrders(sourceOrders.length ? sourceOrders : getMedicationOrders());
    }
});

window.addEventListener("beforeprint", prepareDietPrint);
window.addEventListener("afterprint", () => {
    // The Kardex diet text remains visible on screen after printing.
});


let initialPrintPaper = "a4";
try { initialPrintPaper = RISStore.getItem(DIET_PRINT_PAPER_KEY) || "a4"; } catch (_) {}
applyDietPrintPaperSize(initialPrintPaper);

initializePaging();
if (primaryDateInput()) primaryDateInput().value = todayLocal();
refreshDietOptions();

if (window.opener && activeToken) {
    window.opener.postMessage({ type: "RIS_DIET_LIST_READY", token: activeToken }, "*");
    setTimeout(() => {
        if (!receivedFromOpener) populateFromOrders(getMedicationOrders());
    }, 700);
} else {
    populateFromOrders(getMedicationOrders());
}
