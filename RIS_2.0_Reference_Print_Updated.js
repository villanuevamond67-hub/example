/*
=========================================================
MEDICATION DATABASE
=========================================================
IMPORTANT:
The values below are examples for demonstrating the
search/cascade functionality only.

Replace them with your institution-approved medication
database. Do not use this demo database as a prescribing
reference.
*/

const DEFAULT_MEDICATION_DATABASE = [
    {
        name: "Paracetamol",
        doses: ["500 mg", "1 g"],
        routes: ["PO", "IV"],
        frequencies: ["Q4H", "Q6H", "Q8H", "PRN"]
    },
    {
        name: "Amoxicillin",
        doses: ["250 mg", "500 mg"],
        routes: ["PO"],
        frequencies: ["Q8H", "Q12H"]
    },
    {
        name: "Ceftriaxone",
        doses: ["1 g", "2 g"],
        routes: ["IV", "IM"],
        frequencies: ["OD", "Q12H"]
    },
    {
        name: "Metronidazole",
        doses: ["500 mg"],
        routes: ["PO", "IV"],
        frequencies: ["Q8H", "Q12H"]
    },
    {
        name: "Omeprazole",
        doses: ["20 mg", "40 mg"],
        routes: ["PO", "IV"],
        frequencies: ["OD", "BID"]
    },
    {
        name: "Furosemide",
        doses: ["20 mg", "40 mg"],
        routes: ["PO", "IV", "IM"],
        frequencies: ["OD", "BID", "PRN"]
    },
    {
        name: "Amlodipine",
        doses: ["5 mg", "10 mg"],
        routes: ["PO"],
        frequencies: ["OD"]
    },
    {
        name: "Losartan",
        doses: ["25 mg", "50 mg", "100 mg"],
        routes: ["PO"],
        frequencies: ["OD", "BID"]
    }
];

const MEDICATION_DATABASE_KEY = "lghMedicationDatabaseV1";
let editingMedicationIndex = null;

function cloneDefaultMedicationDatabase() {
    return DEFAULT_MEDICATION_DATABASE.map(med => ({
        name: med.name,
        doses: [...med.doses],
        routes: [...med.routes],
        frequencies: [...med.frequencies]
    }));
}

function normalizeMedicationDatabaseEntry(entry) {
    if (!entry || typeof entry !== "object") return null;

    const name = String(entry.name || "").trim();
    const doses = Array.isArray(entry.doses)
        ? entry.doses.map(value => String(value).trim()).filter(Boolean)
        : [];
    const routes = Array.isArray(entry.routes)
        ? entry.routes.map(value => String(value).trim()).filter(Boolean)
        : [];
    const frequencies = Array.isArray(entry.frequencies)
        ? entry.frequencies.map(value => String(value).trim()).filter(Boolean)
        : [];

    if (!name || !doses.length || !routes.length || !frequencies.length) {
        return null;
    }

    return { name, doses, routes, frequencies };
}

function loadMedicationDatabase() {
    try {
        const saved = JSON.parse(RISStore.getItem(MEDICATION_DATABASE_KEY));
        if (!Array.isArray(saved)) return cloneDefaultMedicationDatabase();

        const validEntries = saved
            .map(normalizeMedicationDatabaseEntry)
            .filter(Boolean);

        return validEntries.length ? validEntries : cloneDefaultMedicationDatabase();
    } catch (error) {
        return cloneDefaultMedicationDatabase();
    }
}

let medicationDatabase = loadMedicationDatabase();


 /*
 =========================================================
 QUANTITY OPTIONS DEPEND ON FREQUENCY
 =========================================================
 These are DEMONSTRATION choices. In an actual medication
 order system, quantity should normally also consider the
 prescribed duration and the facility's approved ordering
 rules.
 */
const quantityByFrequency = {
    "OD": ["1", "2", "3", "5", "7", "10", "14", "30"],
    "BID": ["2", "4", "6", "10", "14", "20", "28", "60"],
    "TID": ["3", "6", "9", "15", "21", "30", "42", "90"],
    "QID": ["4", "8", "12", "20", "28", "40", "56", "120"],
    "Q4H": ["6", "12", "18", "24", "42", "72"],
    "Q6H": ["4", "8", "12", "16", "28", "48"],
    "Q8H": ["3", "6", "9", "12", "21", "30", "42"],
    "Q12H": ["2", "4", "6", "10", "14", "20", "28"],
    "PRN": ["1", "2", "5", "10", "20", "30"]
};

const fallbackQuantityOptions = [
    "1", "2", "3", "4", "5", "6", "7", "10", "14", "20", "28", "30", "60"
];

let rowNumber = 0;

/*
Create a medication row.
*/
function addMedicineRow() {
    rowNumber++;

    const tbody = document.getElementById("medicineRows");

    const tr = document.createElement("tr");

    tr.innerHTML = `
        <td>
            <div class="medicine-wrap">
                <input
                    type="search"
                    class="medicine-input"
                    placeholder="Search medicine..."
                    autocomplete="off"
                    aria-label="Search medicine"
                >
                <div class="status"></div>
            </div>
        </td>

        <td>
            <select class="dependent-select dose" disabled>
                <option value="">Select dose</option>
            </select>
        </td>

        <td>
            <select class="dependent-select route" disabled>
                <option value="">Select route</option>
            </select>
        </td>

        <td>
            <select class="dependent-select frequency" disabled>
                <option value="">Select frequency</option>
            </select>
        </td>

        <td>
            <select class="dependent-select quantity" disabled>
                <option value="">Select frequency first</option>
            </select>
        </td>

        <td>
            <input type="date" class="day1">
        </td>

        <td>
            <input type="text" class="remarks">
        </td>
    `;

    tbody.appendChild(tr);

    setupMedicineSearch(tr);

    /*
    Automatically calculate the inclusive AMS day count.
    The selected Day 1 date itself is counted as Day 1.
    */
    const day1Input = tr.querySelector(".day1");
    day1Input.addEventListener("change", function() {
        updateAmsRemarksForRow(tr);
    });
}

/*
Calculate the current AMS day using date-only values so the
result is not affected by time zones or daylight-saving changes.
*/
function calculateAmsDay(day1Value, currentDate = new Date()) {

    if (!day1Value) return null;

    const parts = day1Value.split("-").map(Number);

    if (parts.length !== 3 || parts.some(Number.isNaN)) {
        return null;
    }

    const [year, month, day] = parts;
    const day1Utc = Date.UTC(year, month - 1, day);
    const todayUtc = Date.UTC(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate()
    );

    const elapsedDays = Math.floor((todayUtc - day1Utc) / 86400000);

    if (elapsedDays < 0) return null;

    return elapsedDays + 1;
}

/*
Build the automatic remarks text while preserving any additional
manual note entered after the AMS day count.
*/
function buildAmsRemarks(day1Value, existingRemarks = "") {

    const amsDay = calculateAmsDay(day1Value);
    const existing = String(existingRemarks || "").trim();

    const manualNote = existing
        .replace(/^Day\s+\d+\s+of\s+AMS(?:\s*\|\s*)?/i, "")
        .trim();

    if (amsDay === null) {
        return manualNote;
    }

    const automaticText = `Day ${amsDay} of AMS`;

    return manualNote
        ? `${automaticText} | ${manualNote}`
        : automaticText;
}

/*
Update one medicine row's Remarks field.
*/
function updateAmsRemarksForRow(row) {

    const day1Input = row.querySelector(".day1");
    const remarksInput = row.querySelector(".remarks");

    if (!day1Input || !remarksInput) return;

    remarksInput.value = buildAmsRemarks(
        day1Input.value,
        remarksInput.value
    );
}

/*
Refresh all visible AMS remarks, including when the calendar date
changes while a previously saved order is reopened.
*/
function updateAllAmsRemarks() {
    document.querySelectorAll("#medicineRows tr").forEach(updateAmsRemarksForRow);
}

/*
Search/cascade behavior for each row.
*/
function setupMedicineSearch(row) {

    const input = row.querySelector(".medicine-input");
    const list = row.querySelector(".status");

    const doseSelect = row.querySelector(".dose");
    const routeSelect = row.querySelector(".route");
    const frequencySelect = row.querySelector(".frequency");
    const quantitySelect = row.querySelector(".quantity");

    /*
    Populate one dependent dropdown.
    */
    function populateSelect(select, values, placeholder) {

        select.innerHTML = "";

        const firstOption = document.createElement("option");
        firstOption.value = "";
        firstOption.textContent = placeholder;
        select.appendChild(firstOption);

        values.forEach(value => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });

        select.disabled = values.length === 0;
    }

    /*
    Reset all dependent dropdowns.
    */
    function resetDependentDropdowns() {
        populateSelect(doseSelect, [], "Select dose");
        populateSelect(routeSelect, [], "Select route");
        populateSelect(frequencySelect, [], "Select frequency");

        quantitySelect.innerHTML = "";
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Select frequency first";
        quantitySelect.appendChild(option);
        quantitySelect.disabled = true;
    }

    /*
    Quantity is the next dependent level:
    Medicine -> Dose/Route/Frequency -> Quantity
    */
    function updateQuantityDropdown() {

        const frequency = frequencySelect.value;

        quantitySelect.innerHTML = "";

        if (!frequency) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "Select frequency first";
            quantitySelect.appendChild(option);
            quantitySelect.disabled = true;
            return;
        }

        const quantities = quantityByFrequency[frequency] || fallbackQuantityOptions;

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select quantity";
        quantitySelect.appendChild(placeholder);

        quantities.forEach(quantity => {
            const option = document.createElement("option");
            option.value = quantity;
            option.textContent = quantity;
            quantitySelect.appendChild(option);
        });

        quantitySelect.disabled = quantities.length === 0;
    }

    /*
    Selecting the medicine activates the dependent
    Dose -> Route -> Frequency dropdowns.
    */
    function selectMedicine(med) {

        input.value = med.name;

        // Populate the dependent dropdowns.
        populateSelect(doseSelect, med.doses, "Select dose");
        populateSelect(routeSelect, med.routes, "Select route");
        populateSelect(frequencySelect, med.frequencies, "Select frequency");

        /*
        Automatically DISPLAY the first approved value for each
        field immediately after selecting the medicine.

        The user can still open the dropdown and select another
        available value.
        */
        if (med.doses.length > 0) {
            doseSelect.value = med.doses[0];
        }

        if (med.routes.length > 0) {
            routeSelect.value = med.routes[0];
        }

        if (med.frequencies.length > 0) {
            frequencySelect.value = med.frequencies[0];
        }

        // Frequency now determines the Quantity dropdown.
        updateQuantityDropdown();

        // Automatically display the first quantity available.
        if (quantitySelect.options.length > 1) {
            quantitySelect.selectedIndex = 1;
        }

        list.style.display = "none";
    }
    /*
    Search medicines as the user types.
    */
    function showResults(searchText) {

        const text = searchText.trim().toLowerCase();

        list.innerHTML = "";

        const results = medicationDatabase.filter(med =>
            med.name.toLowerCase().includes(text)
        );

        if (results.length === 0) {
            const noResult = document.createElement("div");
            noResult.className = "no-result";
            noResult.textContent = "No medicine found";
            list.appendChild(noResult);
            list.style.display = "block";
            return;
        }

        results.forEach(med => {

            const item = document.createElement("div");
            item.textContent = med.name;

            item.addEventListener("mousedown", function(e) {
                e.preventDefault();
                selectMedicine(med);
            });

            list.appendChild(item);
        });

        list.style.display = "block";
    }

    input.addEventListener("focus", function() {
        showResults(input.value);
    });

    input.addEventListener("input", function() {

        /*
        While searching for another medicine, clear the old
        dependent values so values from the previous medicine
        are never carried into the new selection.
        */
        resetDependentDropdowns();

        showResults(input.value);
    });

    input.addEventListener("blur", function() {

        setTimeout(() => {

            const typedName = input.value.trim().toLowerCase();

            const selected = medicationDatabase.find(
                med => med.name.toLowerCase() === typedName
            );

            if (selected) {
                selectMedicine(selected);
            } else {
                resetDependentDropdowns();
            }

            list.style.display = "none";

        }, 150);
    });

    /*
    Dose, Route and Frequency are real dropdowns.
    Their choices are dependent on the selected medicine.
    */
    doseSelect.addEventListener("change", function() {
        console.log("Selected dose:", doseSelect.value);
    });

    routeSelect.addEventListener("change", function() {
        console.log("Selected route:", routeSelect.value);
    });

    frequencySelect.addEventListener("change", function() {
        console.log("Selected frequency:", frequencySelect.value);

        // Frequency controls the available Quantity choices.
        updateQuantityDropdown();
    });
}
/*
Clear the complete form.
*/
function clearForm() {

    if (!confirm("Clear all information in this medication order form?")) {
        return;
    }

    document.querySelectorAll(".page:not(.hgb-page) input").forEach(input => {
        input.value = "";
    });

    document.getElementById("medicineRows").innerHTML = "";
    rowNumber = 0;
    currentOrderId = null;

    createInitialRows();
    updateMedicationPatientNavigation();
}

/*
Create the initial medication rows to resemble
the supplied medication order form.
*/
function createInitialRows() {

    for (let i = 0; i < 10; i++) {
        addMedicineRow();
    }
}

/*
Close search lists when clicking elsewhere.
*/
document.addEventListener("click", function(event) {

    document.querySelectorAll(".status").forEach(list => {

        if (!list.parentElement.contains(event.target)) {
            list.style.display = "none";
        }

    });
});


/* =========================================================
   MEDICATION DATABASE MANAGER
   ========================================================= */

function parseMedicationList(value, uppercase = false) {
    const seen = new Set();

    return String(value || "")
        .split(/[,;\n]+/)
        .map(item => item.trim())
        .filter(Boolean)
        .map(item => uppercase ? item.toUpperCase() : item)
        .filter(item => {
            const key = item.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function persistMedicationDatabase() {
    RISStore.setItem(
        MEDICATION_DATABASE_KEY,
        JSON.stringify(medicationDatabase)
    );
}

function setMedicationDatabaseMessage(message, type = "") {
    const target = document.getElementById("databaseMessage");
    if (!target) return;

    target.textContent = message;
    target.className = "database-message" + (type ? " " + type : "");
}

function toggleMedicationDatabaseManager(forceOpen) {
    const panel = document.getElementById("medicationDatabasePanel");
    if (!panel) return;

    const shouldOpen = typeof forceOpen === "boolean"
        ? forceOpen
        : !panel.classList.contains("is-open");

    panel.classList.toggle("is-open", shouldOpen);

    if (shouldOpen) {
        renderMedicationDatabase();
        document.getElementById("databaseMedicineName")?.focus();
    } else {
        clearMedicationDatabaseEditor();
    }
}

function clearMedicationDatabaseEditor() {
    editingMedicationIndex = null;

    [
        "databaseMedicineName",
        "databaseDoses",
        "databaseRoutes",
        "databaseFrequencies"
    ].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = "";
    });

    const saveButton = document.getElementById("saveMedicationDatabaseButton");
    const cancelButton = document.getElementById("cancelMedicationEditButton");

    if (saveButton) saveButton.textContent = "ADD MEDICATION";
    if (cancelButton) cancelButton.style.display = "none";

    setMedicationDatabaseMessage("");
}

function saveMedicationDatabaseEntry() {
    const name = document.getElementById("databaseMedicineName").value.trim();
    const doses = parseMedicationList(
        document.getElementById("databaseDoses").value
    );
    const routes = parseMedicationList(
        document.getElementById("databaseRoutes").value,
        true
    );
    const frequencies = parseMedicationList(
        document.getElementById("databaseFrequencies").value,
        true
    );

    if (!name || !doses.length || !routes.length || !frequencies.length) {
        setMedicationDatabaseMessage(
            "Complete the medicine name, doses, routes, and frequencies.",
            "error"
        );
        return;
    }

    const duplicateIndex = medicationDatabase.findIndex((med, index) =>
        index !== editingMedicationIndex &&
        med.name.toLowerCase() === name.toLowerCase()
    );

    if (duplicateIndex >= 0) {
        setMedicationDatabaseMessage(
            "A medication with this name already exists.",
            "error"
        );
        return;
    }

    const entry = { name, doses, routes, frequencies };
    const wasEditing = editingMedicationIndex !== null;

    if (wasEditing) {
        medicationDatabase[editingMedicationIndex] = entry;
    } else {
        medicationDatabase.push(entry);
    }

    medicationDatabase.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

    persistMedicationDatabase();
    clearMedicationDatabaseEditor();
    renderMedicationDatabase();
    renderSavedOrders();

    setMedicationDatabaseMessage(
        wasEditing ? "Medication updated successfully." : "Medication added successfully.",
        "success"
    );
}

function editMedicationDatabaseEntry(index) {
    const med = medicationDatabase[index];
    if (!med) return;

    editingMedicationIndex = index;

    document.getElementById("databaseMedicineName").value = med.name;
    document.getElementById("databaseDoses").value = med.doses.join(", ");
    document.getElementById("databaseRoutes").value = med.routes.join(", ");
    document.getElementById("databaseFrequencies").value = med.frequencies.join(", ");

    document.getElementById("saveMedicationDatabaseButton").textContent =
        "UPDATE MEDICATION";
    document.getElementById("cancelMedicationEditButton").style.display = "inline-block";

    setMedicationDatabaseMessage("Editing " + med.name + ".");
    document.getElementById("databaseMedicineName").focus();
}

function deleteMedicationDatabaseEntry(index) {
    const med = medicationDatabase[index];
    if (!med) return;

    if (!confirm('Delete "' + med.name + '" from the medication database?')) {
        return;
    }

    medicationDatabase.splice(index, 1);
    persistMedicationDatabase();

    if (editingMedicationIndex === index) {
        clearMedicationDatabaseEditor();
    } else if (editingMedicationIndex !== null && editingMedicationIndex > index) {
        editingMedicationIndex--;
    }

    renderMedicationDatabase();
    renderSavedOrders();
    setMedicationDatabaseMessage("Medication deleted.", "success");
}

function renderMedicationDatabase() {
    const list = document.getElementById("medicationDatabaseList");
    const count = document.getElementById("databaseCount");
    const searchInput = document.getElementById("databaseSearch");

    if (!list || !count) return;

    const search = String(searchInput?.value || "").trim().toLowerCase();

    const matching = medicationDatabase
        .map((med, originalIndex) => ({ med, originalIndex }))
        .filter(({ med }) =>
            !search ||
            med.name.toLowerCase().includes(search) ||
            med.doses.join(" ").toLowerCase().includes(search) ||
            med.routes.join(" ").toLowerCase().includes(search) ||
            med.frequencies.join(" ").toLowerCase().includes(search)
        );

    count.textContent = matching.length + " of " + medicationDatabase.length + " medication(s)";

    if (!matching.length) {
        list.innerHTML = '<div class="database-empty">No matching medications found.</div>';
        return;
    }

    list.innerHTML = matching.map(({ med, originalIndex }) => `
        <div class="database-row">
            <div><strong>${escapeHtml(med.name)}</strong></div>
            <div><b>Dose:</b> ${escapeHtml(med.doses.join(", "))}</div>
            <div><b>Route:</b> ${escapeHtml(med.routes.join(", "))}</div>
            <div><b>Frequency:</b> ${escapeHtml(med.frequencies.join(", "))}</div>
            <div class="database-row-actions">
                <button type="button" onclick="editMedicationDatabaseEntry(${originalIndex})">EDIT</button>
                <button type="button" onclick="deleteMedicationDatabaseEntry(${originalIndex})">DELETE</button>
            </div>
        </div>
    `).join("");
}

/* =========================================================
   MAIN MENU / SAVE / PRINT / ROOM SORTING
   ========================================================= */

const STORAGE_KEY = "lghMedicationOrdersV1";
let currentOrderId = null;

/* =========================================================
   KARDEX INTEGRATION
   Opens the separate nursing KARDEX page and transfers the
   selected patient's medication-order data safely by postMessage.
   ========================================================= */
const KARDEX_PAGE = "RIS_2.0_KARDEX.html";
const pendingKardexPayloads = new Map();

const DIET_LIST_PAGE = "RIS_2.0_DIET_LIST.html";
const pendingDietPayloads = new Map();

function createDietToken() {
    return "DIET-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

function launchDietList(orders) {
    const token = createDietToken();
    const payload = Array.isArray(orders) ? orders : [];
    pendingDietPayloads.set(token, JSON.parse(JSON.stringify(payload)));
    const dietWindow = window.open(DIET_LIST_PAGE + "?token=" + encodeURIComponent(token), "_blank");
    if (!dietWindow) {
        pendingDietPayloads.delete(token);
        alert("The DIET LIST window was blocked. Please allow pop-ups for this file and try again.");
        return;
    }
    setTimeout(() => pendingDietPayloads.delete(token), 5 * 60 * 1000);
}

function openDietList() {
    launchDietList(getSavedOrders());
}

/* =========================================================
   PATIENT DASHBOARD INTEGRATION
   The Patient Dashboard (RIS_2.0_PATIENT_DASHBOARD.html) is the
   app's home page and reads/writes the same saved-order storage
   directly, so getting there is a plain same-tab navigation.
   ========================================================= */
const DASHBOARD_PAGE = "RIS_2.0_PATIENT_DASHBOARD.html";

function openPatientDashboard() {
    window.location.href = DASHBOARD_PAGE;
}

function createKardexToken() {
    return "KDX-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

function launchKardex(order) {
    if (!order) return;
    const token = createKardexToken();

    // Send the complete saved-patient list so the KARDEX can navigate
    // Previous / Next without reopening a new window.
    const savedOrders = getSavedOrders();
    const orders = savedOrders.map(item => ({ ...item }));
    const existingIndex = orders.findIndex(item => item.id === order.id);
    if (existingIndex >= 0) {
        orders[existingIndex] = { ...orders[existingIndex], ...JSON.parse(JSON.stringify(order)) };
    } else {
        orders.push(JSON.parse(JSON.stringify(order)));
    }

    pendingKardexPayloads.set(token, {
        order: JSON.parse(JSON.stringify(order)),
        orders: JSON.parse(JSON.stringify(RISPatientOrder.sortByRoom(orders)))
    });

    const kardexWindow = window.open(
        KARDEX_PAGE + "?token=" + encodeURIComponent(token),
        "_blank"
    );

    if (!kardexWindow) {
        pendingKardexPayloads.delete(token);
        alert("The KARDEX window was blocked. Please allow pop-ups for this file and try again.");
        return;
    }

    setTimeout(() => pendingKardexPayloads.delete(token), 5 * 60 * 1000);
}

function openKardexForOrder(id) {
    const order = getSavedOrders().find(item => item.id === id);
    if (!order) {
        alert("Patient medication order was not found.");
        return;
    }
    launchKardex(order);
}

function openCurrentKardex() {
    const order = collectFormData();
    if (!order.patientName && !order.hospitalNo && !order.roomNumber) {
        alert("Please enter patient information before opening the KARDEX.");
        return;
    }
    const saved = getSavedOrders().find(item => item.id === order.id);
    if (saved?.kardexExtra) order.kardexExtra = saved.kardexExtra;
    launchKardex(order);
}

window.addEventListener("message", (event) => {
    const data = event.data || {};

    if (data.type === "RIS_DIET_LIST_READY") {
        const orders = pendingDietPayloads.get(data.token);
        if (orders && event.source && typeof event.source.postMessage === "function") {
            event.source.postMessage({
                type: "RIS_DIET_LIST_DATA",
                token: data.token,
                orders: orders
            }, "*");
        }
        return;
    }

    if (data.type === "RIS_DIET_LIST_SAVE" && Array.isArray(data.entries)) {
        const orders = getSavedOrders();
        let changed = false;
        data.entries.forEach(entry => {
            if (!entry?.orderId) return;
            const index = orders.findIndex(item => item.id === entry.orderId);
            if (index < 0) return;
            orders[index].dietList = entry;
            orders[index].kardexExtra = { ...(orders[index].kardexExtra || {}) };
            if (entry.remarks) orders[index].kardexExtra.diet = entry.remarks;
            orders[index].updatedAt = new Date().toISOString();
            changed = true;
        });
        if (changed) {
            setSavedOrders(orders);
            renderSavedOrders();
        }
        const pending = pendingDietPayloads.get(data.token);
        if (pending) {
            data.entries.forEach(entry => {
                const item = pending.find(order => order.id === entry.orderId);
                if (item) {
                    item.dietList = entry;
                    item.kardexExtra = { ...(item.kardexExtra || {}) };
                    if (entry.remarks) item.kardexExtra.diet = entry.remarks;
                }
            });
        }
        return;
    }

    if (data.type === "RIS_KARDEX_READY") {
        const payload = pendingKardexPayloads.get(data.token);
        if (payload && event.source && typeof event.source.postMessage === "function") {
            event.source.postMessage({
                type: "RIS_KARDEX_DATA",
                token: data.token,
                order: payload.order,
                orders: payload.orders
            }, "*");
        }
        return;
    }

    if (data.type === "RIS_KARDEX_SAVE" && data.orderId && data.kardexExtra) {
        const orders = getSavedOrders();
        const index = orders.findIndex(item => item.id === data.orderId);
        if (index >= 0) {
            if (data.age !== undefined) orders[index].age = String(data.age || "");
            orders[index].kardexExtra = data.kardexExtra;
            orders[index].updatedAt = new Date().toISOString();
            setSavedOrders(orders);
        }
        if (currentOrderId === data.orderId && data.age !== undefined) {
            document.getElementById("age").value = String(data.age || "");
        }
        const pending = pendingKardexPayloads.get(data.token);
        if (pending) {
            if (pending.order?.id === data.orderId) {
                pending.order.kardexExtra = data.kardexExtra;
                if (data.age !== undefined) pending.order.age = String(data.age || "");
                if ((!currentOrderId || currentOrderId === data.orderId) && data.age !== undefined) {
                    document.getElementById("age").value = String(data.age || "");
                }
            }
            const pendingOrder = pending.orders?.find(item => item.id === data.orderId);
            if (pendingOrder) {
                pendingOrder.kardexExtra = data.kardexExtra;
                if (data.age !== undefined) pendingOrder.age = String(data.age || "");
            }
        }
    }
});

function getSavedOrders() {
    try {
        return JSON.parse(RISStore.getItem(STORAGE_KEY)) || [];
    } catch (error) {
        return [];
    }
}

function setSavedOrders(orders) {
    RISStore.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function getMedicationNavigationOrders() {
    // Follow the displayed room groups and the saved patient order per room.
    return RISPatientOrder.sortByRoom(getSavedOrders());
}

function updateMedicationPatientNavigation() {
    const prev = document.getElementById("prevMedicationPatient");
    const next = document.getElementById("nextMedicationPatient");
    const status = document.getElementById("medicationNavStatus");
    if (!prev || !next || !status) return;

    const orders = getMedicationNavigationOrders();
    const index = orders.findIndex(item => item.id === currentOrderId);

    if (!orders.length || index < 0) {
        prev.disabled = true;
        next.disabled = true;
        status.textContent = orders.length ? `0 / ${orders.length}` : "";
        return;
    }

    prev.disabled = index <= 0;
    next.disabled = index >= orders.length - 1;
    status.textContent = `${index + 1} / ${orders.length}`;
}

function persistCurrentMedicationOrderSilently() {
    if (!currentOrderId) return;
    const data = collectFormData();
    if (!data.patientName && !data.hospitalNo && !data.roomNumber) return;

    const orders = getSavedOrders();
    const index = orders.findIndex(item => item.id === currentOrderId);
    if (index < 0) return;

    orders[index] = {
        ...orders[index],
        ...data,
        status: orders[index].status || data.status || "PENDING",
        kardexExtra: orders[index].kardexExtra,
        dietList: orders[index].dietList
    };
    setSavedOrders(orders);
}

function navigateMedicationPatient(direction) {
    const ordersBeforeSave = getMedicationNavigationOrders();
    if (!ordersBeforeSave.length) {
        alert("No saved patients are available for navigation.");
        return;
    }

    let index = ordersBeforeSave.findIndex(item => item.id === currentOrderId);
    if (index < 0) {
        index = Number(direction) >= 0 ? -1 : ordersBeforeSave.length;
    } else {
        persistCurrentMedicationOrderSilently();
    }

    const orders = getMedicationNavigationOrders();
    // Saving can change the patient's room and therefore their position.
    const savedIndex = orders.findIndex(item => item.id === currentOrderId);
    if (savedIndex >= 0) index = savedIndex;
    const targetIndex = index + Number(direction || 0);
    if (targetIndex < 0 || targetIndex >= orders.length) {
        alert(targetIndex < 0 ? "This is the first patient." : "This is the last patient.");
        updateMedicationPatientNavigation();
        return;
    }

    loadFormData(orders[targetIndex]);
    document.getElementById("mainMenu").style.display = "none";
    document.getElementById("hgbPage").style.display = "none";
    document.querySelector(".page:not(.hgb-page)").style.display = "block";
}

/*
Collect all fields from the current medication order form.
*/
function collectFormData() {

    // Recalculate AMS day numbers using today's date before saving.
    updateAllAmsRemarks();

    const medicines = [];

    document.querySelectorAll("#medicineRows tr").forEach(row => {

        const medicine = row.querySelector(".medicine-input")?.value.trim();

        if (!medicine) return;

        medicines.push({
            medicine: medicine,
            dose: row.querySelector(".dose")?.value || "",
            route: row.querySelector(".route")?.value || "",
            frequency: row.querySelector(".frequency")?.value || "",
            quantity: row.querySelector(".quantity")?.value || "",
            day1: row.querySelector(".day1")?.value || "",
            remarks: row.querySelector(".remarks")?.value || ""
        });
    });

    return {
        id: currentOrderId || ("MO-" + Date.now()),
        patientName: document.getElementById("patientName").value.trim(),
        orderDate: document.getElementById("orderDate").value,
        age: document.getElementById("age").value,
        hospitalNo: document.getElementById("hospitalNo").value.trim(),
        ward: document.getElementById("ward").value.trim(),
        roomNumber: document.getElementById("roomNumber").value.trim(),
        diagnosis: document.getElementById("diagnosis").value.trim(),

        requestedDesignation: document.getElementById("requestedDesignation").value,
        requestedDate: document.getElementById("requestedDate").value,
        issuedDesignation: document.getElementById("issuedDesignation").value,
        issuedDate: document.getElementById("issuedDate").value,
        receivedDesignation: document.getElementById("receivedDesignation").value,
        receivedDate: document.getElementById("receivedDate").value,

        medicines: medicines,
        hgbFrequency: (() => {
            const existing = getSavedOrders().find(order => order.id === (currentOrderId || ""));
            return normalizeHgbFrequency(existing || {});
        })(),
        hgbSelected: (() => {
            const existing = getSavedOrders().find(order => order.id === (currentOrderId || ""));
            return Boolean(normalizeHgbFrequency(existing || {}));
        })(),
        hgbStripsPerShift: Number(getSavedOrders().find(order => order.id === (currentOrderId || ""))?.hgbStripsPerShift || 0),
        hgbNeedlesPerShift: Number(getSavedOrders().find(order => order.id === (currentOrderId || ""))?.hgbNeedlesPerShift || 0),
        hgbRemarks: getSavedOrders().find(order => order.id === (currentOrderId || ""))?.hgbRemarks || "",
        status: "PENDING",
        updatedAt: new Date().toISOString()
    };
}

/*
Load data into the form.
*/
function loadFormData(order) {

    currentOrderId = order.id;

    document.getElementById("patientName").value = order.patientName || "";
    document.getElementById("orderDate").value = order.orderDate || "";
    document.getElementById("age").value = order.age || "";
    document.getElementById("hospitalNo").value = order.hospitalNo || "";
    document.getElementById("ward").value = order.ward || "";
    document.getElementById("roomNumber").value = order.roomNumber || "";
    document.getElementById("diagnosis").value = order.diagnosis || "";

    document.getElementById("requestedDesignation").value = order.requestedDesignation || "";
    document.getElementById("requestedDate").value = order.requestedDate || "";
    document.getElementById("issuedDesignation").value = order.issuedDesignation || "";
    document.getElementById("issuedDate").value = order.issuedDate || "";
    document.getElementById("receivedDesignation").value = order.receivedDesignation || "";
    document.getElementById("receivedDate").value = order.receivedDate || "";

    document.getElementById("medicineRows").innerHTML = "";
    rowNumber = 0;

    const medicines = order.medicines || [];

    for (let i = 0; i < Math.max(10, medicines.length); i++) {
        addMedicineRow();
    }

    medicines.forEach((item, index) => {

        const row = document.querySelectorAll("#medicineRows tr")[index];

        if (!row) return;

        const medInput = row.querySelector(".medicine-input");
        const medicine = medicationDatabase.find(
            med => med.name.toLowerCase() === item.medicine.toLowerCase()
        );

        if (medicine) {
            medInput.value = medicine.name;

            const dose = row.querySelector(".dose");
            const route = row.querySelector(".route");
            const frequency = row.querySelector(".frequency");
            const quantity = row.querySelector(".quantity");

            function setOptions(select, values, selectedValue, placeholder) {
                select.innerHTML = "";

                const first = document.createElement("option");
                first.value = "";
                first.textContent = placeholder;
                select.appendChild(first);

                values.forEach(value => {
                    const option = document.createElement("option");
                    option.value = value;
                    option.textContent = value;
                    select.appendChild(option);
                });

                select.disabled = values.length === 0;

                if (values.includes(selectedValue)) {
                    select.value = selectedValue;
                } else if (values.length) {
                    select.value = values[0];
                }
            }

            setOptions(dose, medicine.doses, item.dose, "Select dose");
            setOptions(route, medicine.routes, item.route, "Select route");
            setOptions(frequency, medicine.frequencies, item.frequency, "Select frequency");

            /*
            Quantity depends on the selected frequency.
            */
            const quantities = quantityByFrequency[frequency.value] || fallbackQuantityOptions;

            quantity.innerHTML = "";

            const qPlaceholder = document.createElement("option");
            qPlaceholder.value = "";
            qPlaceholder.textContent = "Select quantity";
            quantity.appendChild(qPlaceholder);

            quantities.forEach(value => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = value;
                quantity.appendChild(option);
            });

            quantity.disabled = quantities.length === 0;

            if (quantities.includes(item.quantity)) {
                quantity.value = item.quantity;
            } else if (quantities.length) {
                quantity.value = quantities[0];
            }
        }

        row.querySelector(".day1").value = item.day1 || "";
        row.querySelector(".remarks").value = item.remarks || "";

        // Refresh the inclusive AMS day count against today's date.
        updateAmsRemarksForRow(row);
    });

    updateMedicationPatientNavigation();
}

/*
Save or update the current form.
*/
function saveForm() {

    const data = collectFormData();

    if (!data.patientName && !data.hospitalNo && !data.roomNumber) {
        alert("Please enter at least the Patient Name, Hospital Number, or Room Number before saving.");
        return;
    }

    const orders = getSavedOrders();
    const existingIndex = orders.findIndex(order => order.id === data.id);

    if (existingIndex >= 0) {
        data.status = orders[existingIndex].status || "PENDING";
        orders[existingIndex] = {
            ...orders[existingIndex],
            ...data,
            kardexExtra: orders[existingIndex].kardexExtra,
            dietList: orders[existingIndex].dietList
        };
    } else {
        orders.push(data);
    }

    setSavedOrders(orders);
    currentOrderId = data.id;
    updateMedicationPatientNavigation();

    alert("Medication order saved successfully.");
}

/*
Print the currently displayed form.
*/
function printCurrentForm() {
    updateAllAmsRemarks();
    document.body.classList.remove("hgb-form-printing");
    document.body.classList.add("individual-form-printing");
    window.print();
}

/*
Open the dashboard.
*/
function showMainMenu() {

    document.querySelectorAll(".page").forEach(page => {
        page.style.display = "none";
    });

    document.getElementById("mainMenu").style.display = "block";

    renderSavedOrders();

    if (document.getElementById("medicationDatabasePanel")?.classList.contains("is-open")) {
        renderMedicationDatabase();
    }
}

/*
Open a fresh order form.
*/
function openNewForm() {

    document.getElementById("mainMenu").style.display = "none";
    document.getElementById("hgbPage").style.display = "none";
    document.querySelector(".page:not(.hgb-page)").style.display = "block";

    currentOrderId = null;

    document.querySelectorAll(".page:not(.hgb-page) input").forEach(input => {
        input.value = "";
    });

    document.getElementById("medicineRows").innerHTML = "";
    rowNumber = 0;

    createInitialRows();

    document.getElementById("orderDate").value =
        new Date().toISOString().split("T")[0];
    updateMedicationPatientNavigation();
}

/*
Edit an existing saved order.
*/
function editSavedOrder(id) {

    const order = getSavedOrders().find(item => item.id === id);

    if (!order) {
        alert("Saved order not found.");
        return;
    }

    loadFormData(order);

    document.getElementById("mainMenu").style.display = "none";
    document.getElementById("hgbPage").style.display = "none";
    document.querySelector(".page:not(.hgb-page)").style.display = "block";
}

/*
Print a saved order by loading it first.
*/
function printSavedOrder(id) {

    const order = getSavedOrders().find(item => item.id === id);

    if (!order) return;

    loadFormData(order);

    document.getElementById("mainMenu").style.display = "none";
    document.getElementById("hgbPage").style.display = "none";
    document.querySelector(".page:not(.hgb-page)").style.display = "block";

    setTimeout(() => window.print(), 150);
}

/*
Delete a saved order.
*/
function deleteSavedOrder(id) {

    if (!confirm("Delete this saved medication order?")) return;

    const orders = getSavedOrders().filter(item => item.id !== id);
    setSavedOrders(orders);

    renderSavedOrders();
}


/*
Create a printable copy using the same dimensions as the individual form.
This does not modify the working form.
*/
function createPrintableMedicationForm(order) {

    const copy = document.createElement("div");
    copy.className = "print-form-copy";

    copy.innerHTML = `
        <div class="header">
            <div class="logo">
                <div class="logo-circle">
                    <img
                        class="hospital-logo"
                        src="${document.querySelector('.page .hospital-logo')?.src || ''}"
                        alt="Las Piñas General Hospital and Satellite Trauma Center logo"
                    >
                </div>
            </div>

            <div class="title">
                <div>REPUBLIC OF THE PHILIPPINES</div>
                <div>Department of Health</div>
                <div>LAS PIÑAS GENERAL HOSPITAL AND SATELLITE TRAUMA CENTER</div>
                <div>PHARMACY SECTION</div>
                <div>MEDICATION ORDER FORM</div>
            </div>

            <div class="reference">
                <div><b>Reference Code:</b><br>HF-PH-008</div>
                <div><b>Revision Number:</b><br>0</div>
                <div><b>Date Effective:</b><br>APRIL 13, 2022</div>
            </div>
        </div>

        <div class="patient-grid">
            <div class="field">
                <label>Patient Name:</label>
                <input value="${escapeHtml(order.patientName || "")}" readonly>
            </div>
            <div class="field">
                <label>Date:</label>
                <input value="${escapeHtml(order.orderDate || "")}" readonly>
            </div>
            <div class="field">
                <label>Age:</label>
                <input value="${escapeHtml(order.age || "")}" readonly>
            </div>
        </div>

        <div class="patient-grid">
            <div class="field">
                <label>Hospital Number:</label>
                <input value="${escapeHtml(order.hospitalNo || "")}" readonly>
            </div>
            <div class="field">
                <label>Ward:</label>
                <input value="${escapeHtml(order.ward || "")}" readonly>
            </div>
            <div class="field">
                <label>Room No.:</label>
                <input value="${escapeHtml(order.roomNumber || "")}" readonly>
            </div>
        </div>

        <div class="ward-diagnosis">
            <div class="field">
                <label>Diagnosis:</label>
                <input value="${escapeHtml(order.diagnosis || "")}" readonly>
            </div>
            <div class="field"></div>
        </div>

        <table class="med-table">
            <colgroup>
                <col style="width:27%">
                <col style="width:12%">
                <col style="width:11%">
                <col style="width:12%">
                <col style="width:9%">
                <col style="width:13%">
                <col style="width:16%">
            </colgroup>

            <thead>
                <tr>
                    <th>NAME OF MEDICINE</th>
                    <th>DOSE</th>
                    <th>ROUTE<br><small>(PO/IV/IM)</small></th>
                    <th>FREQUENCY<br><small>(OD/Q4/Q6/Q12)</small></th>
                    <th>QTY</th>
                    <th>DATE OF DAY 1<br>ON AMS</th>
                    <th>REMARKS</th>
                </tr>
            </thead>

            <tbody></tbody>
        </table>

        <div class="footer-grid">
            <div class="footer-cell">
                <div class="footer-title">Reminder:</div>
                <b><i>Please WRITE LEGIBLY</i></b>
            </div>

            <div class="footer-cell">
                <div class="footer-title">REQUESTED BY:</div>
                ${escapeHtml(order.requestedDesignation || "")}<br>
                Date: ${escapeHtml(order.requestedDate || "")}
            </div>

            <div class="footer-cell">
                <div class="footer-title">ISSUED BY:</div>
                ${escapeHtml(order.issuedDesignation || "")}<br>
                Date: ${escapeHtml(order.issuedDate || "")}
            </div>

            <div class="footer-cell">
                <div class="footer-title">RECEIVED BY:</div>
                ${escapeHtml(order.receivedDesignation || "")}<br>
                Date: ${escapeHtml(order.receivedDate || "")}
            </div>
        </div>

        <div class="certification-row">iso tayo.. Serbisyong de kalidad at siguraDOH</div>
    `;

    const tbody = copy.querySelector("tbody");
    const medicines = order.medicines || [];

    /*
    Use the same 31px medication-row height as the individual form.
    At least eight rows are retained to preserve the original layout.
    */
    const printableRowCount = Math.max(10, medicines.length);

    for (let i = 0; i < printableRowCount; i++) {

        const item = medicines[i] || {};
        const currentRemarks = buildAmsRemarks(
            item.day1 || "",
            item.remarks || ""
        );

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td><input value="${escapeHtml(item.medicine || "")}" readonly></td>
            <td><input value="${escapeHtml(item.dose || "")}" readonly></td>
            <td><input value="${escapeHtml(item.route || "")}" readonly></td>
            <td><input value="${escapeHtml(item.frequency || "")}" readonly></td>
            <td><input value="${escapeHtml(item.quantity || "")}" readonly></td>
            <td><input value="${escapeHtml(item.day1 || "")}" readonly></td>
            <td><input value="${escapeHtml(currentRemarks)}" readonly></td>
        `;

        tbody.appendChild(tr);
    }

    return copy;
}

/*
After printing, return to the Main Menu.
*/
window.addEventListener("afterprint", function() {

    // Remove temporary classes used only for individual-form print margins.
    document.body.classList.remove("individual-form-printing", "hgb-form-printing", "vital-form-printing");

    if (document.body.classList.contains("group-printing")) {

        document.body.classList.remove("group-printing");

        document.getElementById("groupPrintWorkspace").innerHTML = "";
        document.getElementById("groupPrintWorkspace").style.display = "none";

        document.querySelector(".page").style.display = "none";
        document.getElementById("mainMenu").style.display = "block";

        renderSavedOrders();
    }
});


/* =========================================================
   CBG STRIPS AND NEEDLES FORM
   ========================================================= */
const HGB_FREQUENCY_USAGE = {
    "OD":  { defaultPerShift: 1 },
    "TID": { defaultPerShift: 1 },
    "Q6":  { defaultPerShift: 1 },
    "Q4":  { defaultPerShift: 2 }
};

function normalizeHgbFrequency(order) {
    const saved = String(order?.hgbFrequency || "").toUpperCase();
    if (HGB_FREQUENCY_USAGE[saved]) return saved;

    // Backward compatibility for records saved by the earlier checkbox version.
    if (order?.hgbSelected) {
        const oldQuantity = Number(order.hgbStripsPerShift || 0);
        if (oldQuantity === 6) return "Q4";
        if (oldQuantity === 4) return "Q6";
        if (oldQuantity === 3) return "TID";
        return "OD";
    }
    return "";
}

function getDefaultHgbPerShift(frequency) {
    return HGB_FREQUENCY_USAGE[String(frequency || "").toUpperCase()]?.defaultPerShift || 0;
}

function updateHgbFrequency(id, frequency) {
    const allowed = ["", "OD", "TID", "Q6", "Q4"];
    const normalized = String(frequency || "").toUpperCase();
    if (!allowed.includes(normalized)) return;

    const orders = getSavedOrders();
    const index = orders.findIndex(order => order.id === id);
    if (index < 0) return;

    const previousFrequency = normalizeHgbFrequency(orders[index]);
    orders[index].hgbFrequency = normalized;
    orders[index].hgbSelected = Boolean(normalized); // Keeps older saved data compatible.

    if (!normalized) {
        orders[index].hgbStripsPerShift = 0;
        orders[index].hgbNeedlesPerShift = 0;
    } else {
        const defaultPerShift = getDefaultHgbPerShift(normalized);
        if (previousFrequency !== normalized || Number(orders[index].hgbStripsPerShift) < 1) {
            orders[index].hgbStripsPerShift = defaultPerShift;
        }
        if (previousFrequency !== normalized || Number(orders[index].hgbNeedlesPerShift) < 1) {
            orders[index].hgbNeedlesPerShift = Number(orders[index].hgbStripsPerShift) || defaultPerShift;
        }
    }

    orders[index].updatedAt = new Date().toISOString();
    setSavedOrders(orders);
    renderSavedOrders();
}

/*
Checkbox handler for CBG frequency. Although checkboxes are displayed,
only one frequency can be active for each patient at a time.
Unchecking the active frequency removes the patient from the CBG form.
*/
function updateHgbFrequencyCheckbox(id, frequency, checked) {
    const currentOrder = getSavedOrders().find(order => order.id === id);
    if (!currentOrder) return;

    const currentFrequency = normalizeHgbFrequency(currentOrder);
    const nextFrequency = checked
        ? String(frequency || "").toUpperCase()
        : (currentFrequency === String(frequency || "").toUpperCase() ? "" : currentFrequency);

    updateHgbFrequency(id, nextFrequency);
}

function updateHgbUsage(id, field, value) {
    if (!["hgbStripsPerShift", "hgbNeedlesPerShift"].includes(field)) return;
    const orders = getSavedOrders();
    const index = orders.findIndex(order => order.id === id);
    if (index < 0) return;

    const normalizedQuantity = Math.max(0, parseInt(value, 10) || 0);
    orders[index][field] = normalizedQuantity;

    // One needle is normally paired with each strip. Users can still
    // adjust the needle quantity separately on the CBG form if needed.
    if (field === "hgbStripsPerShift") {
        orders[index].hgbNeedlesPerShift = normalizedQuantity;
    }

    orders[index].updatedAt = new Date().toISOString();
    setSavedOrders(orders);

    if (document.getElementById("hgbPage")?.style.display === "block") {
        renderHgbRows(getHgbSelectedPatients());
    } else {
        renderSavedOrders();
    }
}

function updateHgbRemarks(id, value) {
    const orders = getSavedOrders();
    const index = orders.findIndex(order => order.id === id);
    if (index < 0) return;

    orders[index].hgbRemarks = String(value || "");
    orders[index].updatedAt = new Date().toISOString();
    setSavedOrders(orders);
}

function getHgbSelectedPatients() {
    return getSavedOrders().filter(order => Boolean(normalizeHgbFrequency(order)));
}

function openHgbForm() {
    const selectedPatients = getHgbSelectedPatients();
    if (!selectedPatients.length) {
        alert("Select OD, TID, Q6, or Q4 for at least one patient in the Main Menu.");
        return;
    }

    document.getElementById("mainMenu").style.display = "none";
    document.querySelector(".page:not(.hgb-page)").style.display = "none";
    document.getElementById("hgbPage").style.display = "block";

    const normalLogo = document.querySelector(".page:not(.hgb-page) .hospital-logo");
    const hgbLogo = document.getElementById("hgbHospitalLogo");
    if (normalLogo && hgbLogo && !hgbLogo.getAttribute("src")) {
        hgbLogo.src = normalLogo.src;
    }

    if (!document.getElementById("hgbDate").value) {
        document.getElementById("hgbDate").value = new Date().toISOString().split("T")[0];
    }
    const date = document.getElementById("hgbDate").value;
    ["hgbRequestedDate", "hgbIssuedDate", "hgbReceivedDate"].forEach(id => {
        const input = document.getElementById(id);
        if (input && !input.value) input.value = date;
    });

    renderHgbRows(selectedPatients);
}

function refreshHgbForm() {
    const selectedPatients = getHgbSelectedPatients();
    if (!selectedPatients.length) {
        alert("No patient currently has an OD, TID, Q6, or Q4 CBG frequency.");
        showMainMenu();
        return;
    }
    renderHgbRows(selectedPatients);
}

function renderHgbRows(selectedPatients) {
    const tbody = document.getElementById("hgbRows");
    tbody.innerHTML = "";

    const sortedPatients = [...selectedPatients].sort((a, b) => {
        const roomCompare = String(a.roomNumber || "").localeCompare(
            String(b.roomNumber || ""), undefined,
            { numeric: true, sensitivity: "base" }
        );
        if (roomCompare !== 0) return roomCompare;
        return String(a.patientName || "").localeCompare(
            String(b.patientName || ""), undefined,
            { sensitivity: "base" }
        );
    });

    let totalStripsShift = 0;
    let totalNeedlesShift = 0;

    for (let index = 0; index < Math.max(10, sortedPatients.length); index++) {
        const order = sortedPatients[index];
        const tr = document.createElement("tr");

        if (order) {
            const frequency = normalizeHgbFrequency(order);
            const strips = Math.max(0, Number(order.hgbStripsPerShift ?? getDefaultHgbPerShift(frequency)));
            const needles = Math.max(0, Number(order.hgbNeedlesPerShift ?? strips));

            totalStripsShift += strips;
            totalNeedlesShift += needles;

            tr.innerHTML = `
                <td><input value="${escapeHtml(order.patientName || "")}" readonly></td>
                <td><input value="${escapeHtml(order.hospitalNo || "")}" readonly></td>
                <td><input value="${escapeHtml(order.ward || "")}" readonly></td>
                <td><input value="${escapeHtml(order.roomNumber || "")}" readonly></td>
                <td><input value="${escapeHtml(frequency)}" readonly aria-label="CBG frequency"></td>
                <td><input type="number" min="0" value="${strips}" aria-label="CBG strips this shift"></td>
                <td><input type="number" min="0" value="${needles}" aria-label="Needles this shift"></td>
                <td><input type="text" value="${escapeHtml(order.hgbRemarks || "")}" aria-label="Remarks"></td>
            `;
            const inputs = tr.querySelectorAll("input");
            inputs[5].addEventListener("change", function() {
                updateHgbUsage(order.id, "hgbStripsPerShift", this.value);
            });
            inputs[6].addEventListener("change", function() {
                updateHgbUsage(order.id, "hgbNeedlesPerShift", this.value);
            });
            inputs[7].addEventListener("change", function() {
                updateHgbRemarks(order.id, this.value);
            });
        } else {
            tr.innerHTML = `
                <td><input readonly></td><td><input readonly></td>
                <td><input readonly></td><td><input readonly></td>
                <td><input readonly></td><td><input readonly></td>
                <td><input readonly></td><td><input readonly></td>
            `;
        }
        tbody.appendChild(tr);
    }

    document.getElementById("hgbTotalStrips").value = totalStripsShift;

    const totalRow = document.createElement("tr");
    totalRow.className = "hgb-total-row";
    totalRow.innerHTML = `
        <td colspan="5">TOTAL</td>
        <td><input value="${totalStripsShift}" readonly aria-label="Total CBG strips this shift"></td>
        <td><input value="${totalNeedlesShift}" readonly aria-label="Total needles this shift"></td>
        <td><input value="" readonly></td>
    `;
    tbody.appendChild(totalRow);

}

function printHgbForm() {
    if (!getHgbSelectedPatients().length) {
        alert("There are no selected patients to print.");
        return;
    }
    document.body.classList.remove("individual-form-printing");
    document.body.classList.add("hgb-form-printing");
    window.print();
}

function filterByRoom(roomNumber) {
    const search = document.getElementById("roomSearch");
    if (!search) return;
    search.value = roomNumber;
    renderSavedOrders();
}

function getRoomColorClass(roomNumber) {
    const match = String(roomNumber || "").match(/\b(901|902|903|904|905|906)\b/);
    return match ? `room-${match[1]}` : "room-default";
}

function parseMedicationQuantity(value) {
    const quantity = Number(String(value ?? "").replace(/,/g, "").trim());
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function formatMedicationQuantity(value) {
    const quantity = Number(value || 0);
    return Number.isInteger(quantity)
        ? String(quantity)
        : quantity.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function getMedicationTotals(orders) {
    const totals = new Map();

    (Array.isArray(orders) ? orders : []).forEach((order, orderIndex) => {
        const patientKey = String(order?.id || order?.hospitalNo || order?.patientName || orderIndex);

        (Array.isArray(order?.medicines) ? order.medicines : []).forEach(item => {
            const medicine = String(item?.medicine || "").trim();
            if (!medicine) return;

            const key = medicine.toLocaleLowerCase();
            if (!totals.has(key)) {
                totals.set(key, {
                    medicine,
                    quantity: 0,
                    doses: new Set(),
                    patients: new Set()
                });
            }

            const total = totals.get(key);
            total.quantity += parseMedicationQuantity(item?.quantity);
            if (String(item?.dose || "").trim()) total.doses.add(String(item.dose).trim());
            total.patients.add(patientKey);
        });
    });

    return [...totals.values()].sort((a, b) =>
        a.medicine.localeCompare(b.medicine, undefined, { sensitivity: "base" })
    );
}



function openMedicationTracker() {
    const panel = document.getElementById("medicationTrackerPanel");
    if (!panel) return;
    document.getElementById("medicationDatabasePanel")?.classList.remove("is-open");
    panel.style.display = "block";
    renderMedicationTracker(getSavedOrders());
}

function closeMedicationTracker() {
    const panel = document.getElementById("medicationTrackerPanel");
    if (panel) panel.style.display = "none";
    const patients = document.getElementById("medicationTrackerPatients");
    if (patients) patients.innerHTML = "";
}

function showMedicationPatients(medicineName) {
    const target = String(medicineName || "").toLowerCase();
    const orders = getSavedOrders().filter(order =>
        (order.medicines || []).some(item => String(item.medicine || "").toLowerCase() === target)
    );

    const box = document.getElementById("medicationTrackerPatients");
    if (!box) return;

    box.innerHTML = orders.length ? `
        <h3>${escapeHtml(medicineName)} Patients</h3>
        ${orders.map(order => `
            <div class="order-card" onclick="openExistingOrder('${order.id}')">
                <strong>${escapeHtml(order.patientName || "Unnamed Patient")}</strong><br>
                Room: ${escapeHtml(order.roomNumber || "-")} |
                Hospital No.: ${escapeHtml(order.hospitalNo || "-")}
            </div>
        `).join("")}
    ` : "<p>No patients found.</p>";
}

function renderMedicationTracker(orders) {
    const rows = document.getElementById("medicationTrackerRows");
    const totals = getMedicationTotals(orders);
    if (!rows) return totals;

    rows.innerHTML = totals.length
        ? totals.map(item => `
            <tr>
                <td><button type="button" class="medication-link" onclick="showMedicationPatients('${escapeHtml(item.medicine).replace("'","\\'")}')"><strong>${escapeHtml(item.medicine)}</strong></button></td>
                <td>${escapeHtml([...item.doses].join(", ") || "—")}</td>
                <td>${item.patients.size}</td>
                <td><strong>${formatMedicationQuantity(item.quantity)}</strong></td>
            </tr>
        `).join("")
        : '<tr><td colspan="4" class="medication-tracker-empty">No saved medications to total yet.</td></tr>';

    return totals;
}

/*
Render saved orders grouped and sorted by Room Number.
*/
function renderSavedOrders() {

    const container = document.getElementById("savedOrdersList");
    const summary = document.getElementById("orderSummary");

    const search =
        document.getElementById("roomSearch").value.trim().toLowerCase();

    let orders = getSavedOrders();

    orders = orders.filter(order => {

        const matchesSearch =
            !search ||
            String(order.roomNumber || "").toLowerCase().includes(search) ||
            String(order.patientName || "").toLowerCase().includes(search) ||
            String(order.hospitalNo || "").toLowerCase().includes(search);

        return matchesSearch;
    });

    orders = RISPatientOrder.sortByRoom(orders);

    const allOrders = getSavedOrders();
    const medicationTotals = renderMedicationTracker(allOrders);
    const totalMedicationQuantity = medicationTotals.reduce((sum, item) => sum + item.quantity, 0);
    const roomCount = new Set(allOrders.map(order => String(order.roomNumber || "NO ROOM").trim() || "NO ROOM")).size;

    summary.innerHTML = `
        <div class="summary-card">
            <b>Total Orders</b><br>${allOrders.length}
        </div>
        <div class="summary-card">
            <b>Displayed</b><br>${orders.length}
        </div>
        <div class="summary-card">
            <b>Rooms</b><br>${roomCount}
        </div>
        <div class="summary-card">
            <b>Medications Tracked</b><br>${medicationTotals.length}
        </div>
        <div class="summary-card">
            <b>Total Medication Quantity</b><br>${formatMedicationQuantity(totalMedicationQuantity)}
        </div>
        <div class="summary-card">
            <b>CBG Patients</b><br>${allOrders.filter(order => Boolean(normalizeHgbFrequency(order))).length}
        </div>
    `;

    if (!orders.length) {
        container.innerHTML =
            '<div class="empty-orders">No saved medication orders found.</div>';
        return;
    }

    /*
    Group orders by room number.
    */
    const groups = {};

    orders.forEach(order => {

        const room = String(order.roomNumber || "NO ROOM").trim() || "NO ROOM";

        if (!groups[room]) {
            groups[room] = [];
        }

        groups[room].push(order);
    });

    /*
    Patients can be dragged into a custom order inside their own room.
    While a search filter is active only part of the list is on screen,
    so reordering is paused to avoid rearranging patients that are not
    visible.
    */
    const reorderEnabled = !search;

    let output = reorderEnabled
        ? `<div class="reorder-hint">
               <span class="reorder-hint-grip">&#10303;</span>
               Drag a patient to set the order inside a room. The order you set is also used by
               Previous / Next Patient, Print All and the Vital Signs sheet.
           </div>`
        : `<div class="reorder-hint reorder-hint-locked">
               Reordering is paused while a search filter is active. Clear the search box to drag patients.
           </div>`;

    Object.keys(groups).forEach(room => {

        output += `
            <div class="room-section ${getRoomColorClass(room)}" data-room="${escapeHtml(room)}"${reorderEnabled ? ' data-reorderable="true"' : ''}>
                <div class="room-title room-clickable" role="button" tabindex="0" title="Click to filter this room" onclick="filterByRoom('${escapeHtml(room)}')" onkeydown="if(event.key==='Enter'){filterByRoom('${escapeHtml(room)}')}">
                    <span>ROOM ${escapeHtml(room)}</span>
                    <span>${groups[room].length} order(s)</span>
                </div>
        `;

        groups[room].forEach((order, positionInRoom) => {

            const medicineCount = (order.medicines || []).length;
            const patientLabel = escapeHtml(order.patientName || "Unnamed Patient");
            const orderId = escapeHtml(String(order.id ?? ""));
            const isFirst = positionInRoom === 0;
            const isLast = positionInRoom === groups[room].length - 1;

            output += `
                <div class="order-card" data-order-id="${orderId}" data-room="${escapeHtml(room)}">

                    <div class="order-card-identity">
                        <div class="order-drag">
                            <span class="drag-handle${reorderEnabled ? "" : " drag-disabled"}"
                                  role="button"
                                  tabindex="${reorderEnabled ? "0" : "-1"}"
                                  aria-label="Reorder ${patientLabel} within room ${escapeHtml(room)}; drag, or use the up and down arrow keys"
                                  title="${reorderEnabled ? "Drag to reorder this patient, or press the up / down arrow keys" : "Clear the search box to reorder patients"}">&#10303;</span>
                            <span class="drag-position" aria-hidden="true">${positionInRoom + 1}</span>
                            <span class="drag-nudge">
                                <button type="button" class="drag-nudge-btn" data-nudge="-1"
                                        title="Move up" aria-label="Move ${patientLabel} up"
                                        ${reorderEnabled && !isFirst ? "" : "disabled"}>&#9650;</button>
                                <button type="button" class="drag-nudge-btn" data-nudge="1"
                                        title="Move down" aria-label="Move ${patientLabel} down"
                                        ${reorderEnabled && !isLast ? "" : "disabled"}>&#9660;</button>
                            </span>
                        </div>

                        <div class="order-card-patient">
                            <strong>${patientLabel}</strong><br>
                            Hospital No.: ${escapeHtml(order.hospitalNo || "-")} |
                            Ward: ${escapeHtml(order.ward || "-")} |
                            ${medicineCount} medication(s)
                        </div>
                    </div>

                    <div>
                        Date:<br>
                        ${escapeHtml(order.orderDate || "-")}
                    </div>

                    <div>
                        Diagnosis:<br>
                        ${escapeHtml(order.diagnosis || "-")}
                    </div>

                    ${(() => {
                        const frequency = normalizeHgbFrequency(order);
                        const defaultShift = getDefaultHgbPerShift(frequency);
                        const stripsShift = frequency
                            ? Math.max(0, Number(order.hgbStripsPerShift ?? defaultShift))
                            : 0;
                        return `
                    <div class="hgb-selector">
                        <div class="hgb-frequency-label">
                            <span>CBG Frequency</span>
                            <div class="hgb-frequency-options" role="group" aria-label="CBG frequency for ${escapeHtml(order.patientName || "patient")}">
                                <label class="hgb-frequency-option">
                                    <input type="checkbox" value="OD"
                                           ${frequency === "OD" ? "checked" : ""}
                                           onchange="updateHgbFrequencyCheckbox('${order.id}', 'OD', this.checked)">
                                    OD
                                </label>
                                <label class="hgb-frequency-option">
                                    <input type="checkbox" value="TID"
                                           ${frequency === "TID" ? "checked" : ""}
                                           onchange="updateHgbFrequencyCheckbox('${order.id}', 'TID', this.checked)">
                                    TID
                                </label>
                                <label class="hgb-frequency-option">
                                    <input type="checkbox" value="Q6"
                                           ${frequency === "Q6" ? "checked" : ""}
                                           onchange="updateHgbFrequencyCheckbox('${order.id}', 'Q6', this.checked)">
                                    Q6
                                </label>
                                <label class="hgb-frequency-option">
                                    <input type="checkbox" value="Q4"
                                           ${frequency === "Q4" ? "checked" : ""}
                                           onchange="updateHgbFrequencyCheckbox('${order.id}', 'Q4', this.checked)">
                                    Q4
                                </label>
                            </div>
                        </div>
                        <label class="hgb-number-label">
                            Strips this shift
                            <input type="number" min="0"
                                   value="${stripsShift}"
                                   ${frequency ? "" : "disabled"}
                                   onchange="updateHgbUsage('${order.id}', 'hgbStripsPerShift', this.value)">
                        </label>
                    </div>`;
                    })()}

                    <div class="card-actions">
                        <button onclick="editSavedOrder('${order.id}')">EDIT</button>
                        <button onclick="printSavedOrder('${order.id}')">PRINT</button>
                        <button onclick="openKardexForOrder('${order.id}')">KARDEX</button>
                        <button onclick="openFormHeading('${order.id}')">FORM HEADING</button>
                        <button onclick="deleteSavedOrder('${order.id}')">DELETE</button>
                    </div>

                </div>
            `;
        });

        output += "</div>";
    });

    container.innerHTML = output;
    restorePatientReorderFocus();
}

/* =====================================================
   PATIENT ORDER (drag to reorder in the Main Menu)
   The saved patient sequence is the one source of truth used by
   Previous / Next Patient, Print All and the Vital Signs sheet, so
   dragging a card rewrites that saved sequence. A patient is only
   moved inside their own room: the room stays a saved data field and
   can never be changed by dropping a card somewhere else.
===================================================== */
let pendingReorderFocusId = "";

function getOrderRoomKey(order) {
    return String(order?.roomNumber || "NO ROOM").trim() || "NO ROOM";
}

function restorePatientReorderFocus() {
    if (!pendingReorderFocusId) return;
    const id = (window.CSS && CSS.escape)
        ? CSS.escape(pendingReorderFocusId)
        : pendingReorderFocusId.replace(/["\\]/g, "\\$&");
    const selector = `.order-card[data-order-id="${id}"] .drag-handle`;
    pendingReorderFocusId = "";
    document.querySelector(selector)?.focus();
}

/*
Write a new patient sequence for one room back into the saved orders.
Only the slots already occupied by that room are rewritten, so patients
in every other room keep their own positions.
*/
function applyRoomOrderSequence(room, idSequence) {

    const orders = getSavedOrders();
    const slots = [];

    orders.forEach((order, index) => {
        if (getOrderRoomKey(order) === room) slots.push(index);
    });

    const byId = new Map(orders.map(order => [String(order.id), order]));
    const seen = new Set();
    const reordered = [];

    idSequence.forEach(id => {
        const key = String(id);
        if (seen.has(key)) return;
        const order = byId.get(key);
        if (order && getOrderRoomKey(order) === room) {
            seen.add(key);
            reordered.push(order);
        }
    });

    // Never drop a patient: anything missing from the new sequence keeps
    // its existing relative position at the end of the room.
    slots.forEach(index => {
        const order = orders[index];
        if (!seen.has(String(order.id))) {
            seen.add(String(order.id));
            reordered.push(order);
        }
    });

    if (reordered.length !== slots.length) return false;

    slots.forEach((slot, index) => {
        orders[slot] = reordered[index];
    });

    setSavedOrders(orders);
    return true;
}

/*
Keyboard and button fallback for the drag handle.
*/
function moveSavedOrderInRoom(orderId, direction) {

    const orders = getSavedOrders();
    const target = orders.find(order => String(order.id) === String(orderId));
    if (!target) return;

    const room = getOrderRoomKey(target);
    const sequence = orders
        .filter(order => getOrderRoomKey(order) === room)
        .map(order => String(order.id));

    const from = sequence.indexOf(String(orderId));
    const to = from + Number(direction || 0);
    if (from < 0 || to < 0 || to >= sequence.length) return;

    sequence.splice(to, 0, sequence.splice(from, 1)[0]);

    if (applyRoomOrderSequence(room, sequence)) {
        pendingReorderFocusId = String(orderId);
        renderSavedOrders();
        updateMedicationPatientNavigation();
    }
}

(function setupPatientReorder() {

    let drag = null;
    let autoScrollTimer = null;

    function stopAutoScroll() {
        if (autoScrollTimer) {
            clearInterval(autoScrollTimer);
            autoScrollTimer = null;
        }
    }

    // Keep the list moving when a card is dragged towards a screen edge.
    function autoScroll(clientY) {
        const margin = 70;
        let step = 0;
        if (clientY < margin) step = -Math.ceil((margin - clientY) / 6);
        else if (clientY > window.innerHeight - margin) step = Math.ceil((clientY - (window.innerHeight - margin)) / 6);

        if (!step) {
            stopAutoScroll();
            return;
        }
        if (autoScrollTimer) return;
        autoScrollTimer = setInterval(() => window.scrollBy(0, step), 16);
    }

    /*
    Work out the drop target from the geometry of the cards in this room
    rather than from a hit test. A captured pointer plus CSS hit-testing
    rules behave inconsistently between browsers, and the cards are a
    simple vertical stack, so comparing positions is both simpler and
    more reliable.
    */
    function dropTarget(y, state) {

        const cards = Array.from(state.section.querySelectorAll(".order-card"));

        for (const card of cards) {
            if (card === state.card) continue;
            const rect = card.getBoundingClientRect();
            if (y >= rect.top && y <= rect.bottom) {
                return { card, after: y > rect.top + rect.height / 2 };
            }
        }

        return null;
    }

    document.addEventListener("pointerdown", event => {

        if (event.button > 0) return;

        const handle = event.target.closest ? event.target.closest(".drag-handle") : null;
        if (!handle || handle.classList.contains("drag-disabled")) return;

        const card = handle.closest(".order-card");
        const section = card ? card.closest(".room-section[data-reorderable]") : null;
        if (!card || !section) return;

        drag = {
            handle,
            card,
            section,
            pointerId: event.pointerId,
            startY: event.clientY,
            started: false
        };

        try { handle.setPointerCapture(event.pointerId); } catch (error) { /* older browsers */ }

        // preventDefault stops text selection, so focus the handle by hand
        // to keep the arrow-key fallback usable straight after a grab.
        event.preventDefault();
        handle.focus();
    });

    document.addEventListener("pointermove", event => {

        if (!drag || event.pointerId !== drag.pointerId) return;

        // A small threshold keeps a plain tap or click from starting a drag.
        if (!drag.started) {
            if (Math.abs(event.clientY - drag.startY) < 4) return;
            drag.started = true;
            drag.card.classList.add("order-card-dragging");
            document.body.classList.add("patient-reordering");
        }

        event.preventDefault();

        const target = dropTarget(event.clientY, drag);

        // Only touch the DOM when the card actually changes place, so the
        // list cannot oscillate between two positions under the pointer.
        if (target && target.after && drag.card.previousElementSibling !== target.card) {
            target.card.after(drag.card);
        } else if (target && !target.after && drag.card.nextElementSibling !== target.card) {
            target.card.before(drag.card);
        }

        autoScroll(event.clientY);
    });

    function endDrag(event) {

        if (!drag || (event && event.pointerId !== drag.pointerId)) return;

        const finished = drag;
        drag = null;
        stopAutoScroll();

        try { finished.handle.releasePointerCapture(finished.pointerId); } catch (error) { /* ignore */ }
        finished.card.classList.remove("order-card-dragging");
        document.body.classList.remove("patient-reordering");

        if (!finished.started) return;

        const room = finished.section.dataset.room;
        const sequence = Array.from(finished.section.querySelectorAll(".order-card"))
            .map(card => card.dataset.orderId);

        pendingReorderFocusId = finished.card.dataset.orderId || "";

        if (applyRoomOrderSequence(room, sequence)) {
            renderSavedOrders();
            updateMedicationPatientNavigation();
        } else {
            renderSavedOrders();
        }
    }

    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", endDrag);

    document.addEventListener("keydown", event => {

        const handle = event.target.closest ? event.target.closest(".drag-handle") : null;
        if (!handle || handle.classList.contains("drag-disabled")) return;
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

        const card = handle.closest(".order-card");
        if (!card) return;

        event.preventDefault();
        moveSavedOrderInRoom(card.dataset.orderId, event.key === "ArrowUp" ? -1 : 1);
    });

    document.addEventListener("click", event => {

        const button = event.target.closest ? event.target.closest(".drag-nudge-btn") : null;
        if (!button || button.disabled) return;

        const card = button.closest(".order-card");
        if (!card) return;

        moveSavedOrderInRoom(card.dataset.orderId, Number(button.dataset.nudge));
    });
})();

/*
Prevent HTML injection when displaying saved text.
*/
function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}




/* =========================================================
   REFERENCE-MATCHED PRINT ENGINE
   Replaces the older print paths with one shared engine.
   Each printed medication form contains exactly 10 medication rows.
   If a patient has more than 10 medications, continuation forms are
   generated automatically and packed two forms per portrait sheet.
   ========================================================= */
const REFERENCE_PRINT_ROWS = 10;

function getPrintLogoSource() {
    return document.querySelector('.page:not(.hgb-page) .hospital-logo')?.src ||
           document.getElementById('hgbHospitalLogo')?.src || '';
}

function referenceHeaderMarkup(sectionName, referenceCode, revisionNumber, dateEffective) {
    return `
        <div class="refprint-header">
            <div class="refprint-logo">
                <img src="${getPrintLogoSource()}" alt="Hospital logo">
            </div>
            <div class="refprint-heading">
                <div class="republic">REPUBLIC OF THE PHILIPPINES</div>
                <div class="department">Department of Health</div>
                <div class="hospital">LAS PIÑAS GENERAL HOSPITAL AND SATELLITE TRAUMA CENTER</div>
                <div class="section">${escapeHtml(sectionName)}</div>
            </div>
            <div class="refprint-reference">
                <div>Reference Code:<span class="ref-value">${escapeHtml(referenceCode || '')}</span></div>
                <div>Revision Number:<span class="ref-value">${escapeHtml(revisionNumber || '0')}</span></div>
                <div>Date Effective:<span class="ref-value">${escapeHtml(dateEffective || '')}</span></div>
            </div>
        </div>`;
}

function printValue(value, center = false) {
    return `<div class="refprint-cell-value${center ? ' center' : ''}">${escapeHtml(value || '')}</div>`;
}

function splitIntoPrintChunks(items, chunkSize = REFERENCE_PRINT_ROWS) {
    const source = Array.isArray(items) ? items : [];
    if (!source.length) return [[]];
    const chunks = [];
    for (let i = 0; i < source.length; i += chunkSize) {
        chunks.push(source.slice(i, i + chunkSize));
    }
    return chunks;
}

function createPrintableMedicationForm(order, medicineChunk) {
    const copy = document.createElement('div');
    copy.className = 'refprint-form refprint-medication';

    const medicines = Array.isArray(medicineChunk)
        ? medicineChunk
        : (Array.isArray(order?.medicines) ? order.medicines.slice(0, REFERENCE_PRINT_ROWS) : []);

    copy.innerHTML = `
        ${referenceHeaderMarkup('PHARMACY SECTION', 'HF-PH-008', '0', 'APRIL 13, 2022')}
        <div class="refprint-titlebar">MEDICATION ORDER FORM</div>

        <div class="refprint-row two-col">
            <div class="refprint-field"><strong>Patient Name:</strong><span class="refprint-value">${escapeHtml(order?.patientName || '')}</span></div>
            <div class="refprint-field"><strong>Date:</strong><span class="refprint-value">${escapeHtml(order?.orderDate || '')}</span></div>
        </div>
        <div class="refprint-row two-col">
            <div class="refprint-field"><strong>Hospital Number:</strong><span class="refprint-value">${escapeHtml(order?.hospitalNo || '')}</span></div>
            <div class="refprint-field"><strong>Age:</strong><span class="refprint-value">${escapeHtml(order?.age || '')}</span></div>
        </div>
        <div class="refprint-row ward-dx">
            <div class="refprint-field"><strong>Ward:</strong><span class="refprint-value">${escapeHtml(order?.ward || '')}</span></div>
            <div class="refprint-field"><strong>DIAGNOSIS:</strong><span class="refprint-value">${escapeHtml(order?.diagnosis || '')}</span></div>
        </div>

        <div class="refprint-table-wrap">
            <table class="refprint-table">
                <colgroup>
                    <col style="width:34%">
                    <col style="width:12%">
                    <col style="width:10%">
                    <col style="width:12%">
                    <col style="width:10%">
                    <col style="width:11%">
                    <col style="width:11%">
                </colgroup>
                <thead>
                    <tr>
                        <th>NAME OF MEDICINE</th>
                        <th>DOSE</th>
                        <th>ROUTE<small>(PO/IV/IM)</small></th>
                        <th>FREQUENCY<small>(OD/Q4/Q6/Q12)</small></th>
                        <th>QTY</th>
                        <th>DATE OF DAY 1<br>ON AMS</th>
                        <th>REMARKS</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>

        <div class="refprint-footer">
            <div class="refprint-footer-cell">
                <div class="refprint-reminder-label">Reminder:</div>
                <div class="refprint-reminder-text">Please&nbsp; <u>WRITE LEGIBLY</u></div>
            </div>
            <div class="refprint-footer-cell">
                <div class="refprint-footer-title">REQUESTED BY:</div>
                <div class="refprint-footer-line">${escapeHtml(order?.requestedDesignation || '')}</div>
                <div class="refprint-footer-line">Designation</div>
                <div class="refprint-footer-line">Date: ${escapeHtml(order?.requestedDate || '')}</div>
            </div>
            <div class="refprint-footer-cell">
                <div class="refprint-footer-title">ISSUED BY:</div>
                <div class="refprint-footer-line">${escapeHtml(order?.issuedDesignation || '')}</div>
                <div class="refprint-footer-line">Designation</div>
                <div class="refprint-footer-line">Date: ${escapeHtml(order?.issuedDate || '')}</div>
            </div>
            <div class="refprint-footer-cell">
                <div class="refprint-footer-title">RECEIVED BY:</div>
                <div class="refprint-footer-line">${escapeHtml(order?.receivedDesignation || '')}</div>
                <div class="refprint-footer-line">Designation</div>
                <div class="refprint-footer-line">Date: ${escapeHtml(order?.receivedDate || '')}</div>
            </div>
        </div>
        <div class="refprint-certification">iso tayo.. Serbisyong de kalidad at siguraDOH</div>`;

    const tbody = copy.querySelector('tbody');
    for (let i = 0; i < REFERENCE_PRINT_ROWS; i++) {
        const item = medicines[i] || {};
        const currentRemarks = item.medicine
            ? buildAmsRemarks(item.day1 || '', item.remarks || '')
            : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${printValue(item.medicine || '')}</td>
            <td>${printValue(item.dose || '', true)}</td>
            <td>${printValue(item.route || '', true)}</td>
            <td>${printValue(item.frequency || '', true)}</td>
            <td>${printValue(item.quantity || '', true)}</td>
            <td>${printValue(item.day1 || '', true)}</td>
            <td>${printValue(currentRemarks)}</td>`;
        tbody.appendChild(tr);
    }

    return copy;
}

function getHgbPrintMeta() {
    return {
        date: document.getElementById('hgbDate')?.value || '',
        shift: document.getElementById('hgbShift')?.value || '',
        ward: document.getElementById('hgbWard')?.value || '',
        preparedBy: document.getElementById('hgbPreparedBy')?.value || '',
        requestedDesignation: document.getElementById('hgbRequestedDesignation')?.value || '',
        requestedDate: document.getElementById('hgbRequestedDate')?.value || '',
        issuedDesignation: document.getElementById('hgbIssuedDesignation')?.value || '',
        issuedDate: document.getElementById('hgbIssuedDate')?.value || '',
        receivedDesignation: document.getElementById('hgbReceivedDesignation')?.value || '',
        receivedDate: document.getElementById('hgbReceivedDate')?.value || ''
    };
}

function createPrintableHgbForm(patientChunk, meta, totalStrips) {
    const copy = document.createElement('div');
    copy.className = 'refprint-form refprint-hgb';
    const patients = Array.isArray(patientChunk) ? patientChunk : [];

    copy.innerHTML = `
        ${referenceHeaderMarkup('LABORATORY SECTION', '____________', '0', '____________')}
        <div class="refprint-titlebar">CBG STRIPS AND NEEDLES FORM</div>

        <div class="refprint-row three-col">
            <div class="refprint-field"><strong>Date:</strong><span class="refprint-value">${escapeHtml(meta.date || '')}</span></div>
            <div class="refprint-field"><strong>Shift:</strong><span class="refprint-value">${escapeHtml(meta.shift || '')}</span></div>
            <div class="refprint-field"><strong>Total Strips:</strong><span class="refprint-value">${escapeHtml(totalStrips || '')}</span></div>
        </div>
        <div class="refprint-row two-col">
            <div class="refprint-field"><strong>Ward / Unit:</strong><span class="refprint-value">${escapeHtml(meta.ward || '')}</span></div>
            <div class="refprint-field"><strong>Prepared By:</strong><span class="refprint-value">${escapeHtml(meta.preparedBy || '')}</span></div>
        </div>

        <div class="refprint-table-wrap">
            <table class="refprint-table">
                <colgroup>
                    <col style="width:25%">
                    <col style="width:15%">
                    <col style="width:10%">
                    <col style="width:9%">
                    <col style="width:10%">
                    <col style="width:12%">
                    <col style="width:11%">
                    <col style="width:8%">
                </colgroup>
                <thead>
                    <tr>
                        <th>NAME OF PATIENT</th>
                        <th>HOSPITAL NUMBER</th>
                        <th>WARD</th>
                        <th>ROOM NO.</th>
                        <th>FREQUENCY</th>
                        <th>CBG STRIPS<small>THIS SHIFT</small></th>
                        <th>NEEDLES<small>THIS SHIFT</small></th>
                        <th>REMARKS</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>

        <div class="refprint-footer">
            <div class="refprint-footer-cell">
                <div class="refprint-reminder-label">Reminder:</div>
                <div class="refprint-reminder-text" style="font-size:7.2pt;white-space:normal;margin-top:.11in;">Please verify patient details and quantities.</div>
            </div>
            <div class="refprint-footer-cell">
                <div class="refprint-footer-title">REQUESTED BY:</div>
                <div class="refprint-footer-line">${escapeHtml(meta.requestedDesignation || '')}</div>
                <div class="refprint-footer-line">Designation</div>
                <div class="refprint-footer-line">Date: ${escapeHtml(meta.requestedDate || '')}</div>
            </div>
            <div class="refprint-footer-cell">
                <div class="refprint-footer-title">ISSUED BY:</div>
                <div class="refprint-footer-line">${escapeHtml(meta.issuedDesignation || '')}</div>
                <div class="refprint-footer-line">Designation</div>
                <div class="refprint-footer-line">Date: ${escapeHtml(meta.issuedDate || '')}</div>
            </div>
            <div class="refprint-footer-cell">
                <div class="refprint-footer-title">RECEIVED BY:</div>
                <div class="refprint-footer-line">${escapeHtml(meta.receivedDesignation || '')}</div>
                <div class="refprint-footer-line">Designation</div>
                <div class="refprint-footer-line">Date: ${escapeHtml(meta.receivedDate || '')}</div>
            </div>
        </div>
        <div class="refprint-certification">iso tayo.. Serbisyong de kalidad at siguraDOH</div>`;

    const tbody = copy.querySelector('tbody');
    for (let i = 0; i < REFERENCE_PRINT_ROWS; i++) {
        const order = patients[i];
        const tr = document.createElement('tr');
        if (order) {
            const frequency = normalizeHgbFrequency(order);
            const strips = Math.max(0, Number(order.hgbStripsPerShift ?? getDefaultHgbPerShift(frequency)));
            const needles = Math.max(0, Number(order.hgbNeedlesPerShift ?? strips));
            tr.innerHTML = `
                <td>${printValue(order.patientName || '')}</td>
                <td>${printValue(order.hospitalNo || '', true)}</td>
                <td>${printValue(order.ward || '', true)}</td>
                <td>${printValue(order.roomNumber || '', true)}</td>
                <td>${printValue(frequency, true)}</td>
                <td>${printValue(String(strips), true)}</td>
                <td>${printValue(String(needles), true)}</td>
                <td>${printValue(order.hgbRemarks || '')}</td>`;
        } else {
            tr.innerHTML = '<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>';
        }
        tbody.appendChild(tr);
    }

    return copy;
}

function renderTwoPerSheet(printForms) {
    const workspace = document.getElementById('groupPrintWorkspace');
    workspace.innerHTML = '';

    const forms = Array.isArray(printForms) ? printForms : [];
    for (let i = 0; i < forms.length; i += 2) {
        const sheet = document.createElement('div');
        sheet.className = 'print-sheet';

        for (let slot = 0; slot < 2; slot++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'print-form-wrapper';
            const form = forms[i + slot];
            if (form) {
                wrapper.appendChild(form);
            } else {
                wrapper.classList.add('print-blank-slot');
            }
            sheet.appendChild(wrapper);
        }
        workspace.appendChild(sheet);
    }

    return workspace;
}

function startReferenceWorkspacePrint(forms) {
    if (!forms?.length) return;

    const workspace = renderTwoPerSheet(forms);
    document.body.classList.remove('individual-form-printing', 'hgb-form-printing');
    document.body.classList.add('group-printing');

    document.querySelectorAll('.page').forEach(page => page.style.display = 'none');
    document.getElementById('mainMenu').style.display = 'none';

    // Keep the workspace measurable before print preview opens.
    workspace.style.display = 'block';

    setTimeout(() => window.print(), 180);
}

function medicationFormsForOrder(order) {
    return splitIntoPrintChunks(order?.medicines || [], REFERENCE_PRINT_ROWS)
        .map(chunk => createPrintableMedicationForm(order, chunk));
}

function printCurrentForm() {
    updateAllAmsRemarks();
    const order = collectFormData();
    startReferenceWorkspacePrint(medicationFormsForOrder(order));
}

function printSavedOrder(id) {
    const order = getSavedOrders().find(item => item.id === id);
    if (!order) return;
    startReferenceWorkspacePrint(medicationFormsForOrder(order));
}

function printAllOrders() {
    const orders = [...getSavedOrders()];
    if (!orders.length) {
        alert('There are no saved medication orders available for printing.');
        return;
    }

    // Keep rooms together while preserving each room's saved patient order.
    orders.sort((a, b) => {
        const roomA = String(a.roomNumber || 'NO ROOM').trim();
        const roomB = String(b.roomNumber || 'NO ROOM').trim();
        const numA = parseFloat(roomA);
        const numB = parseFloat(roomB);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
        return roomA.localeCompare(roomB, undefined, { numeric: true, sensitivity: 'base' });
    });

    const forms = [];
    orders.forEach(order => {
        forms.push(...medicationFormsForOrder(order));
    });
    startReferenceWorkspacePrint(forms);
}

function printHgbForm() {
    const selectedPatients = getHgbSelectedPatients();
    if (!selectedPatients.length) {
        alert('There are no selected patients to print.');
        return;
    }

    const sortedPatients = [...selectedPatients].sort((a, b) => {
        const roomCompare = String(a.roomNumber || '').localeCompare(
            String(b.roomNumber || ''), undefined, { numeric: true, sensitivity: 'base' }
        );
        if (roomCompare !== 0) return roomCompare;
        return String(a.patientName || '').localeCompare(String(b.patientName || ''), undefined, { sensitivity: 'base' });
    });

    const meta = getHgbPrintMeta();
    const chunks = splitIntoPrintChunks(sortedPatients, REFERENCE_PRINT_ROWS);
    const totalStrips = sortedPatients.reduce((sum, order) => {
        const frequency = normalizeHgbFrequency(order);
        const strips = Math.max(0, Number(order.hgbStripsPerShift ?? getDefaultHgbPerShift(frequency)));
        return sum + strips;
    }, 0);
    const forms = chunks.map(chunk => createPrintableHgbForm(chunk, meta, totalStrips));
    startReferenceWorkspacePrint(forms);
}


/*
Initialize application.
The Main Menu opens first.
*/
createInitialRows();

/*
Automatically put today's date into the order date field.
*/
document.getElementById("orderDate").value =
    new Date().toISOString().split("T")[0];

/*
Applying ?openOrder=ID / ?view=... (used by the Patient Dashboard home
page to link straight into a section) happens at the very end of this
file -- see bottom -- once every section, including the Vital Sign
Form's variables, has been declared.
*/


/* =====================================================
   VITAL SIGN FORM
   Uses saved RIS patients, grouped into paired-room sheets.
===================================================== */
const VITAL_ROOM_GROUPS = {
    "901-904": ["901", "904"],
    "902-903": ["902", "903"],
    "905-906": ["905", "906"]
};

let activeVitalRoomGroup = "901-904";
const VITAL_ROWS_PER_SHEET = 24;
let activeVitalSheet = 0;
// Keep on-screen readings when changing room groups or preparing print copies.
const vitalReadingDrafts = new Map();

function getVitalRoomNumber(order) {
    const match = String(order?.roomNumber || "").match(/\b(901|902|903|904|905|906)\b/);
    return match ? match[1] : "";
}

function getVitalPatients(groupKey = activeVitalRoomGroup) {
    const rooms = VITAL_ROOM_GROUPS[groupKey] || VITAL_ROOM_GROUPS["901-904"];
    return getSavedOrders().filter(order => rooms.includes(getVitalRoomNumber(order)));
}

function hasPatientCBG(order) {
    return Boolean(normalizeHgbFrequency(order) || order.hgbSelected || order.hgbStripsPerShift > 0);
}

function openVitalSignForm() {
    document.getElementById("mainMenu").style.display = "none";
    document.querySelectorAll(".page").forEach(p => {
        if (p.id !== "vitalSignPage") p.style.display = "none";
    });
    document.getElementById("vitalSignPage").style.display = "block";

    const normalLogo = document.querySelector(".page:not(.hgb-page):not(.vital-page) .hospital-logo");
    const vitalLogo = document.getElementById("vitalHospitalLogo");
    if (normalLogo && vitalLogo && !vitalLogo.getAttribute("src")) {
        vitalLogo.src = normalLogo.src;
    }

    if (!document.getElementById("vitalDate").value) {
        document.getElementById("vitalDate").value = new Date().toISOString().split("T")[0];
    }
    renderVitalRows();
}

function refreshVitalSignForm() {
    renderVitalRows();
}

function showVitalRoomGroup(groupKey) {
    if (!VITAL_ROOM_GROUPS[groupKey]) return;
    captureVitalReadings();
    activeVitalRoomGroup = groupKey;
    activeVitalSheet = 0;
    renderVitalRows();
}

function changeVitalSheet(direction) {
    captureVitalReadings();
    const last = getVitalSheetRows(activeVitalRoomGroup).length - 1;
    activeVitalSheet = Math.max(0, Math.min(last, activeVitalSheet + direction));
    renderVitalRows();
}

function updateVitalRoomGroupButtons() {
    document.querySelectorAll("[data-vital-group]").forEach(button => {
        const isActive = button.dataset.vitalGroup === activeVitalRoomGroup;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function captureVitalReadings() {
    document.querySelectorAll('#vitalRows tr[data-vital-row]').forEach(row => {
        vitalReadingDrafts.set(row.dataset.vitalRow,
            Array.from(row.querySelectorAll('input'), input => input.value));
    });
}

/*
Build the row sequence for one paired-room sheet.

Patients are kept together room by room, in the custom order set on the
Main Menu, with a single blank separator row between the two rooms. The
separator carries a faint label for the room that follows it, so the
break is obvious on the printed sheet without anyone writing in it.
*/
function buildVitalRowSequence(groupKey) {

    const rooms = VITAL_ROOM_GROUPS[groupKey] || VITAL_ROOM_GROUPS["901-904"];
    const saved = getSavedOrders();

    // An empty room contributes no block, so a separator is only ever
    // written between two rooms that both have patients on the sheet.
    const blocks = rooms
        .map(room => ({
            room,
            patients: saved.filter(order => getVitalRoomNumber(order) === room)
        }))
        .filter(block => block.patients.length > 0);

    const sequence = [];

    blocks.forEach((block, blockIndex) => {

        if (blockIndex > 0) {
            sequence.push({ spacer: true, room: block.room, key: `spacer:${groupKey}:${block.room}` });
        }

        block.patients.forEach((order, index) => {
            sequence.push({
                order,
                room: block.room,
                key: `patient:${order.id || `${groupKey}:${block.room}:${index}`}`
            });
        });
    });

    return sequence;
}

function getVitalSheetRows(groupKey) {

    const sequence = buildVitalRowSequence(groupKey);
    const sheets = [];
    let rows = [];

    // Every sheet keeps its full 24 rows; unused rows are left blank.
    const pushSheet = () => {
        while (rows.length < VITAL_ROWS_PER_SHEET) {
            rows.push({ key: `blank:${groupKey}:${sheets.length}:${rows.length}` });
        }
        sheets.push(rows);
        rows = [];
    };

    sequence.forEach(entry => {

        if (rows.length >= VITAL_ROWS_PER_SHEET) pushSheet();

        // A continuation sheet already starts on a new page, so a
        // separator at the very top of one would only waste a row.
        if (entry.spacer && rows.length === 0 && sheets.length > 0) return;

        rows.push(entry);
    });

    pushSheet();
    return sheets;
}

function vitalRowsHtml(rows) {
    return rows.map(entry => {

        const { order, key } = entry;

        if (entry.spacer) {
            return `<tr class="vital-spacer-row">
                <td class="vital-name"><span class="vital-spacer-label">ROOM ${escapeHtml(entry.room || '')}</span></td>
                <td class="vital-room"></td>
                ${'<td></td>'.repeat(8)}
            </tr>`;
        }

        const cbgLine = order && hasPatientCBG(order)
            ? '<span class="vital-cbg-inline">CBG</span>' : '';
        const values = vitalReadingDrafts.get(key) || [];
        const fields = ['BP', 'T', 'P', 'R', 'O2Sat', 'PO/NGT', 'UO', 'BM'];
        return `<tr data-vital-row="${escapeHtml(key)}">
            <td class="vital-name"><span class="vital-name-text">${escapeHtml(order?.patientName || '')}</span>${cbgLine}</td>
            <td class="vital-room">${escapeHtml(order?.roomNumber || '')}</td>
            ${fields.map((field, index) => `<td${index < 4 ? ' class="vital-diag"' : ''}><input aria-label="${field}" value="${escapeHtml(values[index] || '')}"></td>`).join('')}
        </tr>`;
    }).join('');
}

function renderVitalRows() {
    const tbody = document.getElementById("vitalRows");
    if (!tbody) return;
    captureVitalReadings();
    updateVitalRoomGroupButtons();
    const sheets = getVitalSheetRows(activeVitalRoomGroup);
    activeVitalSheet = Math.min(activeVitalSheet, sheets.length - 1);
    tbody.innerHTML = vitalRowsHtml(sheets[activeVitalSheet]);
    document.getElementById('vitalSheetStatus').textContent = `Sheet ${activeVitalSheet + 1} of ${sheets.length}`;
    document.getElementById('vitalPreviousSheet').disabled = activeVitalSheet === 0;
    document.getElementById('vitalNextSheet').disabled = activeVitalSheet === sheets.length - 1;
}

function printVitalSignForm() {
    printVitalRoomGroups([activeVitalRoomGroup]);
}

function printAllVitalSignSheets() {
    printVitalRoomGroups(Object.keys(VITAL_ROOM_GROUPS));
}

function printVitalRoomGroups(groupKeys) {
    captureVitalReadings();
    cleanupVitalPrint();
    const source = document.getElementById('vitalSignPage');
    const workspace = document.createElement('div');
    workspace.id = 'vitalPrintWorkspace';
    groupKeys.forEach(groupKey => {
        getVitalSheetRows(groupKey).forEach(rows => {
            const sheet = source.cloneNode(true);
            sheet.removeAttribute('id');
            sheet.classList.add('vital-print-sheet');
            sheet.style.display = 'block';
            // Copy current metadata explicitly; never reset the original form.
            ['vitalDate', 'vitalShift', 'vitalPrepared'].forEach(id => {
                sheet.querySelector('#' + id).value = document.getElementById(id).value;
            });
            sheet.querySelector('tbody').innerHTML = vitalRowsHtml(rows);
            sheet.querySelectorAll('.buttons, .help').forEach(element => element.remove());
            sheet.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
            workspace.appendChild(sheet);
        });
    });
    document.body.appendChild(workspace);
    document.body.classList.add('vital-batch-printing');
    try { window.print(); } catch (error) { cleanupVitalPrint(); throw error; }
}

function cleanupVitalPrint() {
    document.body.classList.remove('vital-batch-printing', 'vital-form-printing');
    document.getElementById('vitalPrintWorkspace')?.remove();
}

window.addEventListener('afterprint', cleanupVitalPrint);

/*
Show the Main Menu when the application starts, unless a specific
saved order was requested via ?openOrder=ID, or a specific section was
requested via ?view=hgb|vital|tracker|database|neworder. Both are used
by the Patient Dashboard (the app's home page) to link straight into a
section instead of always landing on the plain Main Menu list. This
runs last, after every section's variables (including the Vital Sign
Form's) have been declared above.
*/
(() => {
    const params = new URLSearchParams(location.search);
    const requestedOrderId = params.get("openOrder");
    const requestedView = params.get("view");

    if (requestedOrderId && getSavedOrders().some(order => order.id === requestedOrderId)) {
        editSavedOrder(requestedOrderId);
        return;
    }

    showMainMenu();

    if (requestedView === "hgb") {
        openHgbForm();
    } else if (requestedView === "vital") {
        openVitalSignForm();
    } else if (requestedView === "tracker") {
        openMedicationTracker();
    } else if (requestedView === "database") {
        toggleMedicationDatabaseManager(true);
    } else if (requestedView === "neworder") {
        openNewForm();
    }
})();


function openFormHeading(id) {
    window.location.href = "RIS_2.0_FORM_HEADING.html" + (id ? "?patient=" + encodeURIComponent(id) : "");
}
async function openCurrentFormHeading() {
    const data = collectFormData();
    if (!data.patientName && !data.hospitalNo && !data.roomNumber) {
        alert("Enter patient information before opening the Form Heading Printer."); return;
    }
    const orders = getSavedOrders(), index = orders.findIndex(o => o.id === data.id);
    if (index >= 0) orders[index] = { ...orders[index], ...data, status: orders[index].status || "PENDING" };
    else orders.push(data);
    setSavedOrders(orders); currentOrderId = data.id;
    await RISStore.flush();
    openFormHeading(data.id);
}
