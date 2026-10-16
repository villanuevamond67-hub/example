const KARDEX_EXTRA_STORAGE_KEY = "lghKardexExtrasV1";
const DIET_OPTIONS_KEY = "lghDietOptionsV1";
const STANDING_ROW_COUNT = 20;
const IVF_ROW_COUNT = 7;
const SIDE_DRIP_ROW_COUNT = 10;
const STAT_ROW_COUNT = 4;
const LAB_ROW_COUNT = 12;
const IMAGING_ROW_COUNT = 5;

const BASE_DIET_OPTIONS = [
    "Regular / Full Diet",
    "Soft Diet",
    "Mechanical Soft Diet",
    "Pureed Diet",
    "Clear Liquid Diet",
    "Full Liquid Diet",
    "Tube Feeding / Enteral Feeding",
    "NPO (Nothing by Mouth)",
    "Diabetic / Consistent Carbohydrate Diet",
    "Low Salt / Low Sodium Diet",
    "Cardiac Diet",
    "Renal Diet",
    "Low Fat Diet",
    "Low Cholesterol Diet",
    "Low Purine Diet",
    "High Protein Diet",
    "Low Protein Diet",
    "High Calorie Diet",
    "Low Calorie Diet",
    "High Fiber Diet",
    "Low Fiber / Low Residue Diet",
    "Bland Diet",
    "Gluten-Free Diet",
    "Lactose-Free Diet",
    "Vegetarian Diet",
    "Pediatric Diet",
    "Other Therapeutic Diet"
];

let activeOrder = null;
let patientOrders = [];
let activePatientIndex = -1;
let activeToken = new URLSearchParams(location.search).get("token") || "";

const DIET_LIST_PAGE = "RIS_2.0_DIET_LIST.html";
const pendingDietPayloads = new Map();

function safeClone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return value; }
}

function createDietToken() {
    return "DIET-KDX-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

function openDietListFromKardex() {
    if (!activeOrder) {
        showToast("Patient data has not loaded yet.");
        return;
    }

    persistActiveKardex(false, false);

    const token = createDietToken();
    const order = safeClone(activeOrder);
    pendingDietPayloads.set(token, [order]);
    const dietWindow = window.open(DIET_LIST_PAGE + "?token=" + encodeURIComponent(token), "_blank");
    if (!dietWindow) {
        pendingDietPayloads.delete(token);
        showToast("DIET LIST window was blocked. Please allow pop-ups.");
        return;
    }
    setTimeout(() => pendingDietPayloads.delete(token), 5 * 60 * 1000);
}

function escapeValue(value) {
    return String(value ?? "");
}

function normalizeCbgFrequency(order) {
    const saved = String(order?.hgbFrequency || "").toUpperCase();
    if (["OD", "TID", "Q6", "Q4"].includes(saved)) return saved;

    if (order?.hgbSelected) {
        const oldQuantity = Number(order?.hgbStripsPerShift || 0);
        if (oldQuantity === 6) return "Q4";
        if (oldQuantity === 4) return "Q6";
        if (oldQuantity === 3) return "TID";
        return "OD";
    }
    return "";
}

function formatDateTimeForPrint(input) {
    const value = String(input?.value || "").trim();
    if (!value) return "";
    const [datePart, timePart = ""] = value.split("T");
    const [year, month, day] = datePart.split("-");
    if (!year || !month || !day) return value;
    const dateText = `${month}/${day}/${year}`;
    if (input.type !== "datetime-local" || !timePart) return dateText;
    const [rawHour, minute = "00"] = timePart.split(":");
    const hour = Number(rawHour);
    if (!Number.isFinite(hour)) return `${dateText} ${timePart}`;
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${dateText} ${displayHour}:${minute} ${suffix}`;
}

function prepareDateTimeInputsForPrint() {
    document.querySelectorAll('input[type="date"], input[type="datetime-local"]').forEach((input) => {
        let mirror = input.nextElementSibling;
        if (!mirror?.classList.contains("print-date-time-value")) {
            mirror = document.createElement("span");
            mirror.className = "print-date-time-value";
            input.insertAdjacentElement("afterend", mirror);
        }
        mirror.textContent = formatDateTimeForPrint(input);
        input.classList.toggle("print-empty-date-time", !mirror.textContent);
        input.classList.toggle("print-filled-date-time", Boolean(mirror.textContent));
    });
}

function prepareStandingMedicationDatesForPrint() {
    document.querySelectorAll('#standingMedicationRows input[data-field="date"]').forEach((input) => {
        input.classList.toggle("print-empty-standing-date", !String(input.value || "").trim());
    });
}

function clearPrintOnlyDateTimeMarks() {
    document.querySelectorAll(".print-empty-date-time, .print-filled-date-time").forEach((input) => {
        input.classList.remove("print-empty-date-time", "print-filled-date-time");
    });
    document.querySelectorAll(".print-empty-standing-date").forEach((input) => {
        input.classList.remove("print-empty-standing-date");
    });
}

function calculateAgeFromDob(value) {
    if (!value) return "";
    const dob = new Date(`${value}T00:00:00`);
    if (Number.isNaN(dob.getTime())) return "";
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const beforeBirthday = today.getMonth() < dob.getMonth() ||
        (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
    if (beforeBirthday) age--;
    return age >= 0 ? String(age) : "";
}

function patientAgeFromOrder(order) {
    const value = order?.age ?? order?.patientAge ?? "";
    return String(value).trim();
}

function selectedDietValues() {
    const select = document.getElementById("diet");
    return select ? [...select.selectedOptions].map(option => option.value).filter(Boolean) : [];
}

function updateDietPrintValue() {
    const output = document.getElementById("dietPrintValue");
    if (output) output.textContent = selectedDietValues().join(", ");
}

function createSimpleRows(containerId, count, columns, className = "data-row") {
    const tbody = document.getElementById(containerId);
    tbody.innerHTML = "";
    for (let i = 0; i < count; i++) {
        const tr = document.createElement("tr");
        tr.className = className;
        columns.forEach((column) => {
            const td = document.createElement("td");
            const input = document.createElement("input");
            input.type = column.type || "text";
            input.dataset.field = column.field;
            input.dataset.index = String(i);
            if (column.className) input.className = column.className;
            if (column.placeholder) input.placeholder = column.placeholder;
            if (column.readOnly) input.readOnly = true;
            td.appendChild(input);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    }
}

function initializeRows() {
    createSimpleRows("ivfRows", IVF_ROW_COUNT, [
        { field: "no", className: "center" },
        { field: "ivf" },
        { field: "remarks" }
    ]);
    createSimpleRows("sideDripRows", SIDE_DRIP_ROW_COUNT, [
        { field: "no", className: "center" },
        { field: "ivf" },
        { field: "remarks" }
    ]);
    createSimpleRows("standingMedicationRows", STANDING_ROW_COUNT, [
        // This date is intentionally independent from the Medication Order Form date.
        { field: "date", className: "center kardex-med-date", placeholder: "MM/DD" },
        { field: "medication", className: "med-text", readOnly: true },
        { field: "freq", className: "center", readOnly: true },
        { field: "remarks", readOnly: true }
    ]);
    createSimpleRows("statMedicationRows", STAT_ROW_COUNT, [
        { field: "date", className: "center" },
        { field: "medication", className: "med-text" },
        { field: "freq", className: "center" },
        { field: "remarks" }
    ]);
    createSimpleRows("laboratoryRows", LAB_ROW_COUNT, [
        { field: "date", className: "center" },
        { field: "laboratory" },
        { field: "remarks" }
    ]);
    createSimpleRows("imagingRows", IMAGING_ROW_COUNT, [
        { field: "date", className: "center" },
        { field: "procedure" },
        { field: "remarks" }
    ]);
}

function getExtraStore() {
    try { return JSON.parse(RISStore.getItem(KARDEX_EXTRA_STORAGE_KEY)) || {}; }
    catch (_) { return {}; }
}

function setExtraStore(store) {
    try { RISStore.setItem(KARDEX_EXTRA_STORAGE_KEY, JSON.stringify(store)); }
    catch (_) {}
}

function getStoredExtra(orderId) {
    if (!orderId) return {};
    return getExtraStore()[orderId] || {};
}

function setStoredExtra(orderId, extra) {
    if (!orderId) return;
    const store = getExtraStore();
    store[orderId] = extra;
    setExtraStore(store);
}

function getDietOptions() {
    try {
        const custom = JSON.parse(RISStore.getItem(DIET_OPTIONS_KEY)) || [];
        return Array.isArray(custom) ? custom.filter(Boolean) : [];
    } catch (_) {
        return [];
    }
}

function refreshDietOptions() {
    const select = document.getElementById("diet");
    const manager = document.getElementById("dietManagerList");
    const current = select ? [...select.selectedOptions].map(option => option.value).filter(Boolean) : [];
    const custom = getDietOptions();
    const options = [...BASE_DIET_OPTIONS, ...custom.filter(item => !BASE_DIET_OPTIONS.includes(item))];

    if (select) {
        select.innerHTML = "";
        options.forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
        current.filter(value => !options.includes(value)).forEach((value) => {
            const legacy = document.createElement("option");
            legacy.value = value;
            legacy.textContent = value;
            select.appendChild(legacy);
        });
        [...select.options].forEach(option => option.selected = current.includes(option.value));
    }

    if (manager) {
        manager.innerHTML = "";
        custom.forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            manager.appendChild(option);
        });
    }
    updateDietPrintValue();
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
    if (!custom.some(item => item.toLowerCase() === value.toLowerCase()) &&
        !BASE_DIET_OPTIONS.some(item => item.toLowerCase() === value.toLowerCase())) {
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
    [...document.getElementById("diet").options]
        .filter(option => option.value === value)
        .forEach(option => option.selected = false);
    refreshDietOptions();
}

function setInput(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === "checkbox") {
        el.checked = Boolean(value);
        return;
    }
    if (el.tagName === "SELECT") {
        const selected = (Array.isArray(value) ? value : [value]).map(escapeValue).filter(Boolean);
        selected.filter(item => ![...el.options].some(option => option.value === item)).forEach((item) => {
            const option = document.createElement("option");
            option.value = item;
            option.textContent = item;
            el.appendChild(option);
        });
        [...el.options].forEach(option => option.selected = selected.includes(option.value));
        if (id === "diet") updateDietPrintValue();
        return;
    }
    el.value = escapeValue(value);
}

function getInput(id) {
    const el = document.getElementById(id);
    if (!el) return "";
    if (el.tagName === "SELECT" && el.multiple) {
        return [...el.selectedOptions].map(option => option.value).filter(Boolean);
    }
    return el.type === "checkbox" ? el.checked : el.value;
}

function setRows(containerId, rows) {
    const tbody = document.getElementById(containerId);
    const trs = [...tbody.querySelectorAll("tr")];
    trs.forEach((tr, index) => {
        const data = rows?.[index] || {};
        tr.querySelectorAll("input[data-field]").forEach((input) => {
            input.value = escapeValue(data[input.dataset.field]);
        });
    });
}

function collectRows(containerId) {
    const tbody = document.getElementById(containerId);
    return [...tbody.querySelectorAll("tr")].map((tr) => {
        const item = {};
        tr.querySelectorAll("input[data-field]").forEach((input) => {
            item[input.dataset.field] = input.value;
        });
        return item;
    });
}

function standingMedicationRowsFromOrder(order, extra = {}) {
    const medicines = Array.isArray(order?.medicines) ? order.medicines : [];
    const savedRows = Array.isArray(extra?.standingMedicationRows) ? extra.standingMedicationRows : [];
    return medicines.slice(0, STANDING_ROW_COUNT).map((item, index) => {
        const pieces = [item.medicine, item.dose, item.route].filter(Boolean);
        return {
            // Never inherit order.orderDate here. The KARDEX date belongs to this row only.
            date: savedRows[index]?.date || "",
            medication: pieces.join(" "),
            freq: item.frequency || "",
            remarks: item.remarks || ""
        };
    });
}

function mergeExtra(order) {
    const fromOrder = order?.kardexExtra && typeof order.kardexExtra === "object" ? order.kardexExtra : {};
    const fromKardexPage = getStoredExtra(order?.id);
    return { ...fromKardexPage, ...fromOrder };
}

function updateKardexNavigation() {
    const total = patientOrders.length;
    const prev = document.getElementById("prevKardexPatient");
    const next = document.getElementById("nextKardexPatient");
    const status = document.getElementById("kardexNavStatus");

    if (!total || activePatientIndex < 0) {
        if (prev) prev.disabled = true;
        if (next) next.disabled = true;
        if (status) status.textContent = "";
        return;
    }

    if (prev) prev.disabled = activePatientIndex <= 0;
    if (next) next.disabled = activePatientIndex >= total - 1;
    if (status) status.textContent = `${activePatientIndex + 1} / ${total}`;
}

function setPatientOrders(orders, activeId) {
    // Follow the same room groups and patient sequence as the Main Menu.
    patientOrders = RISPatientOrder.sortByRoom(safeClone(orders));
    if (!patientOrders.length && activeOrder) patientOrders = [safeClone(activeOrder)];
    activePatientIndex = patientOrders.findIndex(item => item.id === activeId);
    if (activePatientIndex < 0 && patientOrders.length) activePatientIndex = 0;
}

function populateKardex(order) {
    activeOrder = order || {};
    const extra = mergeExtra(activeOrder);
    activeOrder.age = patientAgeFromOrder(activeOrder);

    refreshDietOptions();

    setInput("patientName", activeOrder.patientName || "");
    setInput("age", activeOrder.age);
    setInput("hospitalNo", activeOrder.hospitalNo || "");
    setInput("admittingDiagnosis", activeOrder.diagnosis || "");

    [
        "sex", "attendingPhysician", "dob", "aog", "classification", "referrals", "weight",
        "dateTimeAdmission", "bloodType", "dateTimeTransIn", "operation", "diet", "dateTimeOperation",
        "mvHfSettings", "nvs", "vs", "io", "specialEndorsements", "ncLpm", "othersText",
        "fmLpm", "fmText", "ngtText", "ifcText", "highFlowText", "etSize", "etLevel"
    ].forEach((id) => setInput(id, extra[id] || ""));

    const hasDietSelection = (Array.isArray(extra.diet) && extra.diet.some(Boolean)) ||
        (!Array.isArray(extra.diet) && Boolean(extra.diet));
    if (!hasDietSelection && activeOrder.dietList?.remarks) {
        setInput("diet", activeOrder.dietList.remarks);
    }
    updateDietPrintValue();

    setInput("cbg", normalizeCbgFrequency(activeOrder) || extra.cbg || "");

    ["ncChecked", "othersChecked", "fmChecked", "ngtChecked", "ifcChecked", "highFlowChecked", "etChecked"]
        .forEach((id) => setInput(id, extra[id] || false));

    setRows("ivfRows", extra.ivfRows || []);
    setRows("sideDripRows", extra.sideDripRows || []);
    setRows("statMedicationRows", extra.statMedicationRows || []);
    setRows("laboratoryRows", extra.laboratoryRows || []);
    setRows("imagingRows", extra.imagingRows || []);
    setRows("standingMedicationRows", standingMedicationRowsFromOrder(activeOrder, extra));

    document.getElementById("patientBadge").textContent =
        [activeOrder.patientName, activeOrder.roomNumber ? `Room ${activeOrder.roomNumber}` : "", activeOrder.hospitalNo ? `HN ${activeOrder.hospitalNo}` : ""]
            .filter(Boolean).join(" • ") || "Patient loaded";

    activePatientIndex = patientOrders.findIndex(item => item.id === activeOrder.id);
    if (activePatientIndex < 0 && patientOrders.length === 1) activePatientIndex = 0;
    updateKardexNavigation();

    if ((activeOrder.medicines || []).length > STANDING_ROW_COUNT) {
        showToast(`First ${STANDING_ROW_COUNT} standing medications are shown on this one-page KARDEX.`);
    }
}

function collectExtra() {
    const extra = {};
    [
        "sex", "attendingPhysician", "dob", "aog", "classification", "referrals", "weight",
        "dateTimeAdmission", "bloodType", "dateTimeTransIn", "operation", "diet", "dateTimeOperation",
        "mvHfSettings", "cbg", "nvs", "vs", "io", "specialEndorsements", "ncLpm", "othersText",
        "fmLpm", "fmText", "ngtText", "ifcText", "highFlowText", "etSize", "etLevel"
    ].forEach((id) => extra[id] = getInput(id));

    ["ncChecked", "othersChecked", "fmChecked", "ngtChecked", "ifcChecked", "highFlowChecked", "etChecked"]
        .forEach((id) => extra[id] = getInput(id));

    extra.ivfRows = collectRows("ivfRows");
    extra.sideDripRows = collectRows("sideDripRows");
    extra.standingMedicationRows = collectRows("standingMedicationRows");
    extra.statMedicationRows = collectRows("statMedicationRows");
    extra.laboratoryRows = collectRows("laboratoryRows");
    extra.imagingRows = collectRows("imagingRows");
    return extra;
}

function persistActiveKardex(notifyOpener = true, showSavedToast = false) {
    if (!activeOrder) return null;
    const extra = collectExtra();
    activeOrder.age = escapeValue(getInput("age"));
    setStoredExtra(activeOrder.id, extra);
    activeOrder.kardexExtra = safeClone(extra);

    const index = patientOrders.findIndex(item => item.id === activeOrder.id);
    if (index >= 0) {
        patientOrders[index].age = activeOrder.age;
        patientOrders[index].kardexExtra = safeClone(extra);
        if (activeOrder.dietList) patientOrders[index].dietList = safeClone(activeOrder.dietList);
    }

    if (notifyOpener && window.opener) {
        window.opener.postMessage({
            type: "RIS_KARDEX_SAVE",
            token: activeToken,
            orderId: activeOrder.id || "",
            age: activeOrder.age,
            kardexExtra: extra
        }, "*");
    }

    if (showSavedToast) showToast("KARDEX saved.");
    return extra;
}

function saveKardex() {
    if (!activeOrder) {
        showToast("Patient data has not loaded yet.");
        return;
    }
    persistActiveKardex(true, true);
}

function navigateKardexPatient(direction) {
    if (!patientOrders.length) {
        showToast("No saved patients available for navigation.");
        return;
    }

    const target = activePatientIndex + Number(direction || 0);
    if (target < 0 || target >= patientOrders.length) {
        showToast(target < 0 ? "This is the first patient." : "This is the last patient.");
        return;
    }

    persistActiveKardex(true, false);
    activePatientIndex = target;
    populateKardex(patientOrders[activePatientIndex]);
}

function showToast(message) {
    const toast = document.getElementById("statusToast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

window.addEventListener("message", (event) => {
    const data = event.data || {};

    if (data.type === "RIS_KARDEX_DATA" && data.token === activeToken) {
        const incomingOrder = data.order || {};
        setPatientOrders(data.orders || [incomingOrder], incomingOrder.id);
        const selected = patientOrders.find(item => item.id === incomingOrder.id) || incomingOrder;
        populateKardex(selected);
        return;
    }

    if (data.type === "RIS_DIET_LIST_READY") {
        const orders = pendingDietPayloads.get(data.token);
        if (orders && event.source && typeof event.source.postMessage === "function") {
            event.source.postMessage({ type: "RIS_DIET_LIST_DATA", token: data.token, orders }, "*");
        }
        return;
    }

    if (data.type === "RIS_DIET_LIST_SAVE" && Array.isArray(data.entries)) {
        const entry = data.entries.find(item => item.orderId && item.orderId === activeOrder?.id) || data.entries[0];
        if (entry) {
            const selectedDiet = Array.isArray(entry.remarks) ? entry.remarks.filter(Boolean) : (entry.remarks ? [entry.remarks] : []);
            setInput("diet", selectedDiet);
            if (activeOrder) {
                activeOrder.dietList = safeClone(entry);
                activeOrder.kardexExtra = { ...(activeOrder.kardexExtra || {}), diet: selectedDiet };
            }
            showToast("Diet selection copied to KARDEX.");
        }
    }
});

window.addEventListener("storage", (event) => {
    if (event.key === DIET_OPTIONS_KEY) refreshDietOptions();
});

window.addEventListener("beforeprint", () => {
    persistActiveKardex(true, false);
    updateDietPrintValue();
    prepareDateTimeInputsForPrint();
    prepareStandingMedicationDatesForPrint();
});
window.addEventListener("afterprint", clearPrintOnlyDateTimeMarks);

initializeRows();
refreshDietOptions();
updateKardexNavigation();

document.getElementById("diet")?.addEventListener("change", updateDietPrintValue);

// Searchable diet dropdown filter
function filterDietOptions() {
    const search = document.getElementById("dietSearch");
    const select = document.getElementById("diet");
    if (!search || !select) return;

    const keyword = search.value.toLowerCase().trim();
    [...select.options].forEach(option => {
        option.hidden = keyword && !option.text.toLowerCase().includes(keyword);
    });
}

document.getElementById("dietSearch")?.addEventListener("input", filterDietOptions);
document.getElementById("dob")?.addEventListener("change", (event) => {
    const age = calculateAgeFromDob(event.target.value);
    if (age) setInput("age", age);
});

if (window.opener) {
    window.opener.postMessage({ type: "RIS_KARDEX_READY", token: activeToken }, "*");
} else {
    document.getElementById("patientBadge").textContent = "Open this KARDEX from the RIS patient list to auto-fill patient and medication data.";
}
