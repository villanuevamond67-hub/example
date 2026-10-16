/* =========================================================
   FLOATING DOCK — mini Diet List + mini Medication Database
   Loaded by app-loader.js AFTER RIS_2.0_Reference_Print_Updated.js,
   so it can use that script's globals:
     getSavedOrders / setSavedOrders, currentOrderId,
     medicationDatabase, persistMedicationDatabase, parseMedicationList,
     normalizeMedicationDatabaseEntry, addMedicineRow
   Diet data is written exactly where the Kardex and the Diet List
   already read it (order.kardexExtra.diet and order.dietList), and the
   custom diet options share the existing lghDietOptionsV1 key.
   ========================================================= */
(function () {
    "use strict";

    const ORDERS_KEY = "lghMedicationOrdersV1";
    const DIET_OPTIONS_KEY = "lghDietOptionsV1";
    const DIET_STORE_KEY = "lghDietListV1";
    const MED_DB_KEY = "lghMedicationDatabaseV1";
    const UI_KEY = "risDockStateV1";
    const MEALS = ["breakfast", "lunch", "supper"];

    // Same list as the Kardex (RIS_2.0_KARDEX.js) so every page agrees.
    const BASE_DIETS = [
        "Regular / Full Diet", "Soft Diet", "Mechanical Soft Diet", "Pureed Diet",
        "Clear Liquid Diet", "Full Liquid Diet", "Tube Feeding / Enteral Feeding",
        "NPO (Nothing by Mouth)", "Diabetic / Consistent Carbohydrate Diet",
        "Low Salt / Low Sodium Diet", "Cardiac Diet", "Renal Diet", "Low Fat Diet",
        "Low Cholesterol Diet", "Low Purine Diet", "High Protein Diet", "Low Protein Diet",
        "High Calorie Diet", "Low Calorie Diet", "High Fiber Diet",
        "Low Fiber / Low Residue Diet", "Bland Diet", "Gluten-Free Diet",
        "Lactose-Free Diet", "Vegetarian Diet", "Pediatric Diet", "Other Therapeutic Diet"
    ];

    const st = {
        open: false,
        tab: "diet",
        followId: null,      // patient currently open in the medication form
        selectedId: null,    // patient whose diet is being edited
        draft: [],
        dirty: false,
        medEdit: null,       // index in medicationDatabase being edited
        medFormOpen: false
    };

    let dock = null;
    const els = {};
    let msgTimer = null;

    /* ---------- helpers ---------- */
    const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[ch]));

    function readJSON(key, fallback) {
        try {
            const value = JSON.parse(window.RISStore.getItem(key));
            return value ?? fallback;
        } catch (_) {
            return fallback;
        }
    }

    function sortedOrders() {
        try { return window.RISPatientOrder.sortByRoom(getSavedOrders()); }
        catch (_) { return []; }
    }

    function findOrder(id) {
        return id ? sortedOrders().find(order => order.id === id) : null;
    }

    function customDiets() {
        const list = readJSON(DIET_OPTIONS_KEY, []);
        return Array.isArray(list) ? list.map(item => String(item).trim()).filter(Boolean) : [];
    }

    function allDietOptions() {
        const seen = new Set(BASE_DIETS.map(item => item.toLowerCase()));
        const out = [...BASE_DIETS];
        customDiets().forEach(item => {
            if (!seen.has(item.toLowerCase())) { seen.add(item.toLowerCase()); out.push(item); }
        });
        return out;
    }

    // Diet(s) saved for an order — Kardex value wins, as in the Diet List page.
    function currentDiets(order) {
        if (!order) return [];
        const extra = order.kardexExtra;
        const source = extra && Object.prototype.hasOwnProperty.call(extra, "diet")
            ? extra.diet
            : (order.dietList?.remarks ?? "");
        const options = allDietOptions();
        const list = (Array.isArray(source) ? source : [source])
            .map(item => String(item || "").trim())
            .filter(Boolean)
            .map(item => options.find(option => option.toLowerCase() === item.toLowerCase()) || item);
        return [...new Set(list)];
    }

    // Same rule the Diet List uses to tick the meal boxes.
    function mealKind(diets) {
        const t = diets.join(" ").toLowerCase();
        if (!t || t.includes("npo")) return "";
        if (t.includes("tube") || t.includes("enteral")) return "tf";
        if (t.includes("liquid")) return "liq";
        if (t.includes("soft") || t.includes("puree")) return "soft";
        return "full";
    }

    function mergeChecks(oldChecks, oldDiets, newDiets) {
        const hadChecks = oldChecks && Object.values(oldChecks).some(Boolean);
        const oldKind = mealKind(oldDiets);
        const newKind = mealKind(newDiets);
        if (hadChecks && oldKind === newKind) return { ...oldChecks };
        const checks = {};
        if (newKind) MEALS.forEach(meal => { checks[`${meal}_${newKind}`] = true; });
        return checks;
    }

    function todayLocal() {
        const now = new Date();
        return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }

    function setMsg(el, text, type) {
        if (!el) return;
        el.textContent = text || "";
        el.className = "rd-msg" + (type ? " is-" + type : "");
        if (el === els.dietMsg) {
            clearTimeout(msgTimer);
            if (text) msgTimer = setTimeout(() => { el.textContent = ""; }, 4000);
        }
    }

    /* ---------- DOM ---------- */
    function build() {
        dock = document.createElement("aside");
        dock.id = "risDock";
        dock.className = "ris-dock";
        dock.hidden = true;
        dock.setAttribute("aria-label", "Diet list and medication database quick panel");
        dock.innerHTML = `
            <div class="ris-dock-bar" role="tablist">
                <button type="button" class="ris-dock-tab" role="tab" data-tab="diet" id="rdTabDiet">🍽 DIET LIST</button>
                <button type="button" class="ris-dock-tab" role="tab" data-tab="meds" id="rdTabMeds">💊 MEDICATION DB</button>
                <span class="ris-dock-patient" id="rdBarPatient"></span>
                <button type="button" class="ris-dock-toggle" id="rdToggle" aria-expanded="false" aria-controls="rdPanel" title="Expand / collapse">▲</button>
            </div>
            <div class="ris-dock-panel" id="rdPanel" hidden>
                <section id="rdPaneDiet" role="tabpanel" aria-labelledby="rdTabDiet">
                    <div class="rd-grid">
                        <div class="rd-col">
                            <h3>Mini diet list</h3>
                            <input type="search" id="rdPatSearch" placeholder="Search patient, room, hospital no…" aria-label="Search patients">
                            <div class="rd-patients" id="rdPatients"></div>
                        </div>
                        <div class="rd-col">
                            <div class="rd-placeholder" id="rdNoPatient" hidden></div>
                            <div id="rdEditor" hidden>
                                <div class="rd-editor-head">
                                    <strong id="rdEditing"></strong>
                                    <span class="rd-dirty" id="rdDirty" hidden>● Unsaved changes</span>
                                </div>
                                <div class="rd-chips" id="rdChips" aria-label="Selected diets"></div>
                                <input type="search" id="rdDietFilter" placeholder="Filter diet options…" aria-label="Filter diet options">
                                <div class="rd-options" id="rdOptions"></div>
                                <div class="rd-add">
                                    <input type="text" id="rdNewDiet" placeholder="Add a custom diet option (e.g. DAT, Low Potassium Diet)" maxlength="80" aria-label="New custom diet option">
                                    <button type="button" class="rd-btn" data-action="add-diet">ADD OPTION</button>
                                </div>
                                <div class="rd-actions">
                                    <button type="button" class="rd-btn rd-primary" data-action="save-diet">SAVE DIET</button>
                                    <button type="button" class="rd-btn" data-action="undo-diet">UNDO</button>
                                    <button type="button" class="rd-btn rd-danger" data-action="clear-diet">CLEAR ALL</button>
                                    <span class="rd-msg" id="rdDietMsg" role="status" aria-live="polite"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="rdPaneMeds" role="tabpanel" aria-labelledby="rdTabMeds" hidden>
                    <div class="rd-med-tools">
                        <input type="search" id="rdMedSearch" placeholder="Search medication, dose, route, frequency…" aria-label="Search medication database">
                        <span class="rd-med-count" id="rdMedCount"></span>
                        <button type="button" class="rd-btn rd-primary" data-action="med-toggle-form" id="rdMedAddBtn">+ ADD MEDICATION</button>
                    </div>
                    <div class="rd-med-form" id="rdMedForm" hidden>
                        <label>Medicine name *<input type="text" id="rdMedName" placeholder="Paracetamol"></label>
                        <label>Approved doses *<input type="text" id="rdMedDoses" placeholder="500 mg, 1 g"></label>
                        <label>Approved routes *<input type="text" id="rdMedRoutes" placeholder="PO, IV"></label>
                        <label>Approved frequencies *<input type="text" id="rdMedFreqs" placeholder="OD, BID, Q8H"></label>
                        <div class="rd-actions">
                            <button type="button" class="rd-btn rd-primary" data-action="med-save" id="rdMedSave">ADD MEDICATION</button>
                            <button type="button" class="rd-btn" data-action="med-cancel">CANCEL</button>
                            <span class="rd-msg" id="rdMedMsg" role="status" aria-live="polite"></span>
                        </div>
                    </div>
                    <div class="rd-med-list" id="rdMedList"></div>
                </section>
            </div>`;
        document.body.appendChild(dock);

        const ids = {
            bar: "rdBarPatient", toggle: "rdToggle", panel: "rdPanel",
            paneDiet: "rdPaneDiet", paneMeds: "rdPaneMeds",
            patSearch: "rdPatSearch", patients: "rdPatients",
            noPatient: "rdNoPatient", editor: "rdEditor", editing: "rdEditing", dirty: "rdDirty",
            chips: "rdChips", dietFilter: "rdDietFilter", options: "rdOptions", newDiet: "rdNewDiet",
            dietMsg: "rdDietMsg",
            medSearch: "rdMedSearch", medCount: "rdMedCount", medForm: "rdMedForm",
            medName: "rdMedName", medDoses: "rdMedDoses", medRoutes: "rdMedRoutes", medFreqs: "rdMedFreqs",
            medSave: "rdMedSave", medMsg: "rdMedMsg", medList: "rdMedList", medAddBtn: "rdMedAddBtn"
        };
        Object.entries(ids).forEach(([key, id]) => { els[key] = document.getElementById(id); });
        els.tabs = [...dock.querySelectorAll(".ris-dock-tab")];

        if ("ResizeObserver" in window) {
            new ResizeObserver(() => {
                document.documentElement.style.setProperty("--ris-dock-h", dock.offsetHeight + "px");
            }).observe(dock);
        }
    }

    /* ---------- open / close / tabs ---------- */
    function loadUI() {
        try {
            const saved = JSON.parse(localStorage.getItem(UI_KEY) || "{}");
            if (saved.tab === "meds" || saved.tab === "diet") st.tab = saved.tab;
            st.open = Boolean(saved.open);
        } catch (_) { /* device preference only */ }
    }

    function saveUI() {
        try { localStorage.setItem(UI_KEY, JSON.stringify({ tab: st.tab, open: st.open })); }
        catch (_) { /* ignore */ }
    }

    function applyUI() {
        els.panel.hidden = !st.open;
        els.toggle.setAttribute("aria-expanded", String(st.open));
        els.toggle.textContent = st.open ? "▼" : "▲";
        els.tabs.forEach(tab => {
            const active = tab.dataset.tab === st.tab;
            tab.setAttribute("aria-selected", String(active));
            tab.classList.toggle("is-open", active && st.open);
        });
        els.paneDiet.hidden = st.tab !== "diet";
        els.paneMeds.hidden = st.tab !== "meds";
        saveUI();
        if (st.open) renderActivePane();
    }

    function renderActivePane() {
        if (st.tab === "diet") renderDiet(); else renderMeds();
    }

    /* =========================================================
       DIET LIST
       ========================================================= */
    function loadDraft() {
        const order = findOrder(st.selectedId);
        st.draft = currentDiets(order);
        st.dirty = false;
    }

    function selectPatient(id, force) {
        if (id === st.selectedId) return;
        if (!force && st.dirty) {
            const name = findOrder(st.selectedId)?.patientName || "this patient";
            if (!confirm(`Discard unsaved diet changes for ${name}?`)) return;
        }
        st.selectedId = id;
        loadDraft();
        setMsg(els.dietMsg, "");
        renderDiet();
    }

    function renderDiet() {
        renderPatients();
        renderEditor();
    }

    function renderPatients() {
        const q = els.patSearch.value.trim().toLowerCase();
        const list = sortedOrders().filter(order =>
            !q || [order.patientName, order.roomNumber, order.hospitalNo].join(" ").toLowerCase().includes(q));

        if (!list.length) {
            els.patients.innerHTML = `<div class="rd-empty">No saved patients${q ? " match your search" : " yet"}.</div>`;
            return;
        }

        els.patients.innerHTML = list.map(order => {
            const diets = order.id === st.selectedId && st.dirty ? st.draft : currentDiets(order);
            const room = String(order.roomNumber || "").trim();
            return `<button type="button" class="rd-pat${order.id === st.selectedId ? " is-selected" : ""}" data-action="pick" data-id="${esc(order.id)}">
                <span class="rd-room" data-room="${esc(room)}">${esc(room || "—")}</span>
                <span class="rd-pat-main">
                    <b>${esc(order.patientName || "(no name)")}</b>
                    <small class="${diets.length ? "" : "is-empty"}">${diets.length ? esc(diets.join(", ")) : "No diet set"}</small>
                </span>
                ${order.id === st.followId ? '<em class="rd-here">ON FORM</em>' : ""}
            </button>`;
        }).join("");
    }

    function renderEditor() {
        const order = findOrder(st.selectedId);
        if (!order) {
            els.editor.hidden = true;
            els.noPatient.hidden = false;
            els.noPatient.textContent = st.followId
                ? "Pick a patient from the list to edit their diet."
                : "This form has not been saved yet. Press SAVE FORM first to set this patient's diet, or pick a saved patient from the list.";
            return;
        }
        els.noPatient.hidden = true;
        els.editor.hidden = false;
        const room = String(order.roomNumber || "").trim();
        els.editing.textContent = `${order.patientName || "(no name)"}${room ? " · Room " + room : ""}`;
        els.dirty.hidden = !st.dirty;
        renderChips();
        renderOptions();
    }

    function renderChips() {
        els.chips.innerHTML = st.draft.length
            ? st.draft.map(value => `<span class="rd-chip">${esc(value)}<button type="button" data-action="chip-x" data-value="${esc(value)}" aria-label="Remove ${esc(value)}">×</button></span>`).join("")
            : '<span class="rd-none">No diet selected</span>';
    }

    function renderOptions() {
        const filter = els.dietFilter.value.trim().toLowerCase();
        const custom = customDiets();
        const known = allDietOptions();
        const legacy = st.draft.filter(value => !known.some(opt => opt.toLowerCase() === value.toLowerCase()));
        const options = known.concat(legacy).filter(value => !filter || value.toLowerCase().includes(filter));

        els.options.innerHTML = options.length ? options.map(value => {
            const on = st.draft.includes(value);
            const isCustom = custom.includes(value) && !BASE_DIETS.includes(value);
            const isLegacy = legacy.includes(value);
            return `<label class="rd-opt${on ? " is-on" : ""}">
                <input type="checkbox" data-action="toggle-diet" value="${esc(value)}"${on ? " checked" : ""}>
                <span>${esc(value)}</span>
                ${isLegacy ? "<em>saved text</em>" : ""}
                ${isCustom ? `<button type="button" class="rd-x" data-action="del-option" data-value="${esc(value)}" title="Remove from custom list" aria-label="Remove custom option ${esc(value)}">×</button>` : ""}
            </label>`;
        }).join("") : '<div class="rd-empty">No diet options match.</div>';
    }

    function markDirty() {
        st.dirty = true;
        els.dirty.hidden = false;
        renderChips();
        renderPatients();
    }

    function toggleDiet(value, on) {
        const has = st.draft.includes(value);
        if (on && !has) st.draft.push(value);
        if (!on && has) st.draft = st.draft.filter(item => item !== value);
        markDirty();
        renderOptions();
    }

    function addDietOption() {
        const value = els.newDiet.value.trim();
        if (!value) return;
        const existing = allDietOptions().find(opt => opt.toLowerCase() === value.toLowerCase());
        if (existing) {
            if (st.selectedId && !st.draft.includes(existing)) { st.draft.push(existing); markDirty(); }
            setMsg(els.dietMsg, `"${existing}" is already in the list.`, "ok");
        } else {
            const list = customDiets();
            list.push(value);
            window.RISStore.setItem(DIET_OPTIONS_KEY, JSON.stringify(list));
            if (st.selectedId) { st.draft.push(value); markDirty(); }
            setMsg(els.dietMsg, `Added "${value}" to the diet list.`, "ok");
        }
        els.newDiet.value = "";
        renderOptions();
    }

    function removeDietOption(value) {
        if (!confirm(`Remove "${value}" from the custom diet list?\nPatients already using it keep their saved diet.`)) return;
        window.RISStore.setItem(DIET_OPTIONS_KEY, JSON.stringify(customDiets().filter(item => item !== value)));
        renderOptions();
        setMsg(els.dietMsg, `Removed "${value}" from the custom list.`, "ok");
    }

    function saveDiet() {
        const orders = getSavedOrders();
        const index = orders.findIndex(order => order.id === st.selectedId);
        if (index < 0) {
            setMsg(els.dietMsg, "Save this patient's medication form first.", "error");
            return;
        }

        const order = orders[index];
        const diets = [...st.draft];
        const checks = mergeChecks(order.dietList?.checks, currentDiets(order), diets);
        const today = todayLocal();

        order.kardexExtra = { ...(order.kardexExtra || {}), diet: diets };
        order.dietList = {
            ...(order.dietList || {}),
            orderId: order.id,
            hospitalNo: order.hospitalNo || "",
            roomNumber: order.roomNumber || "",
            patientName: order.patientName || "",
            age: order.age || "",
            ward: order.ward || "",
            date: order.dietList?.date || today,
            remarks: diets,
            checks
        };
        order.updatedAt = new Date().toISOString();
        setSavedOrders(orders);

        // Today's Diet List sheet keeps its own per-day copy; keep it in step.
        const store = readJSON(DIET_STORE_KEY, {});
        const key = `${today}::${order.id}`;
        if (store && store[key]) {
            store[key] = { ...store[key], remarks: diets, checks };
            window.RISStore.setItem(DIET_STORE_KEY, JSON.stringify(store));
        }

        st.dirty = false;
        els.dirty.hidden = true;
        renderPatients();
        renderBarPatient(true);
        setMsg(els.dietMsg, "Diet saved. Kardex and Diet List will show it.", "ok");
    }

    /* =========================================================
       MEDICATION DATABASE
       ========================================================= */
    function medDb() {
        return typeof medicationDatabase !== "undefined" && Array.isArray(medicationDatabase) ? medicationDatabase : [];
    }

    function renderMeds() {
        const db = medDb();
        const q = els.medSearch.value.trim().toLowerCase();
        const rows = db
            .map((med, index) => ({ med, index }))
            .filter(({ med }) => !q || [med.name, med.doses.join(" "), med.routes.join(" "), med.frequencies.join(" ")]
                .join(" ").toLowerCase().includes(q));

        els.medCount.textContent = `${rows.length} of ${db.length}`;
        els.medList.innerHTML = rows.length ? rows.map(({ med, index }) => `
            <div class="rd-med-row">
                <strong>${esc(med.name)}</strong>
                <div class="rd-med-meta">
                    <b>Dose:</b> ${esc(med.doses.join(", "))} &nbsp; <b>Route:</b> ${esc(med.routes.join(", "))} &nbsp; <b>Freq:</b> ${esc(med.frequencies.join(", "))}
                </div>
                <div class="rd-row-actions">
                    <button type="button" class="rd-btn rd-primary" data-action="med-use" data-index="${index}" title="Put this medicine in the next empty row of the form">USE</button>
                    <button type="button" class="rd-btn" data-action="med-edit" data-index="${index}">EDIT</button>
                    <button type="button" class="rd-btn rd-danger" data-action="med-del" data-index="${index}">DELETE</button>
                </div>
            </div>`).join("") : '<div class="rd-empty">No matching medications.</div>';
    }

    function openMedForm(open) {
        st.medFormOpen = open;
        els.medForm.hidden = !open;
        els.medAddBtn.textContent = open ? "− HIDE FORM" : "+ ADD MEDICATION";
        if (!open) clearMedForm();
        else els.medName.focus();
    }

    function clearMedForm() {
        st.medEdit = null;
        [els.medName, els.medDoses, els.medRoutes, els.medFreqs].forEach(input => { input.value = ""; });
        els.medSave.textContent = "ADD MEDICATION";
        setMsg(els.medMsg, "");
    }

    function saveMed() {
        const name = els.medName.value.trim();
        const doses = parseMedicationList(els.medDoses.value);
        const routes = parseMedicationList(els.medRoutes.value, true);
        const freqs = parseMedicationList(els.medFreqs.value, true);
        const db = medDb();

        if (!name || !doses.length || !routes.length || !freqs.length) {
            setMsg(els.medMsg, "Complete the name, doses, routes and frequencies.", "error");
            return;
        }
        const duplicate = db.findIndex((med, i) => i !== st.medEdit && med.name.toLowerCase() === name.toLowerCase());
        if (duplicate >= 0) {
            setMsg(els.medMsg, "A medication with this name already exists.", "error");
            return;
        }

        const entry = { name, doses, routes, frequencies: freqs };
        const editing = st.medEdit !== null;
        if (editing) db[st.medEdit] = entry; else db.push(entry);
        db.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

        persistMedicationDatabase();
        afterMedChange();
        clearMedForm();
        setMsg(els.medMsg, editing ? "Medication updated." : "Medication added.", "ok");
        els.medName.focus();
    }

    function editMed(index) {
        const med = medDb()[index];
        if (!med) return;
        openMedForm(true);
        st.medEdit = index;
        els.medName.value = med.name;
        els.medDoses.value = med.doses.join(", ");
        els.medRoutes.value = med.routes.join(", ");
        els.medFreqs.value = med.frequencies.join(", ");
        els.medSave.textContent = "UPDATE MEDICATION";
        setMsg(els.medMsg, "Editing " + med.name + ".");
        els.medName.focus();
    }

    function deleteMed(index) {
        const med = medDb()[index];
        if (!med || !confirm(`Delete "${med.name}" from the medication database?`)) return;
        medDb().splice(index, 1);
        persistMedicationDatabase();
        if (st.medEdit === index) clearMedForm();
        else if (st.medEdit !== null && st.medEdit > index) st.medEdit--;
        afterMedChange();
    }

    function afterMedChange() {
        renderMeds();
        try { renderMedicationDatabase(); } catch (_) { /* main-menu panel is optional */ }
    }

    // Drops the medicine into the next empty row and lets the form fill
    // dose/route/frequency exactly as if the name had been typed there.
    function useMed(index) {
        const med = medDb()[index];
        if (!med) return;
        const emptyRow = () => [...document.querySelectorAll("#medicineRows tr")]
            .find(row => !(row.querySelector(".medicine-input")?.value || "").trim());
        let row = emptyRow();
        if (!row) { addMedicineRow(); row = emptyRow(); }
        const input = row?.querySelector(".medicine-input");
        if (!input) return;
        input.value = med.name;
        input.dispatchEvent(new Event("blur"));
        row.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    /* =========================================================
       FORM TRACKING
       ========================================================= */
    function formPage() {
        return document.querySelector(".page:not(.hgb-page)");
    }

    function formVisible() {
        const page = formPage();
        const menu = document.getElementById("mainMenu");
        const shown = el => el && getComputedStyle(el).display !== "none";
        return shown(page) && !shown(menu);
    }

    let lastBar = "";
    function renderBarPatient(force) {
        const order = findOrder(st.followId);
        const typedName = (document.getElementById("patientName")?.value || "").trim();
        const room = (document.getElementById("roomNumber")?.value || "").trim();
        const name = typedName || order?.patientName || "";
        const diets = currentDiets(order);
        const html = st.followId || name
            ? `<b>${esc(name || "(no name)")}</b>${room ? " · Rm " + esc(room) : ""} · Diet: ${order ? (diets.length ? esc(diets.join(", ")) : "none set") : "save form to set"}`
            : "New patient — not saved yet";
        if (force || html !== lastBar) { els.bar.innerHTML = html; lastBar = html; }
    }

    function onFormPatientChanged() {
        const id = typeof currentOrderId !== "undefined" ? currentOrderId : null;
        st.followId = id;
        st.selectedId = findOrder(id) ? id : null;
        loadDraft();
        if (st.open && st.tab === "diet") renderDiet();
    }

    function tick() {
        const visible = formVisible();
        dock.hidden = !visible;
        document.body.classList.toggle("ris-dock-active", visible);
        if (!visible) return;

        const id = typeof currentOrderId !== "undefined" ? currentOrderId : null;
        if (id !== st.followId) onFormPatientChanged();
        renderBarPatient();
    }

    // Data changed elsewhere (another tab, cloud sync, the main form's SAVE).
    function refreshFromStorage(key) {
        if (key && ![ORDERS_KEY, DIET_OPTIONS_KEY, MED_DB_KEY].includes(key)) return;
        if (!st.dirty) loadDraft();
        renderBarPatient(true);
        if (st.open) renderActivePane();
    }

    /* ---------- events ---------- */
    function bind() {
        els.tabs.forEach(tab => tab.addEventListener("click", () => {
            if (st.open && st.tab === tab.dataset.tab) st.open = false;
            else { st.tab = tab.dataset.tab; st.open = true; }
            applyUI();
        }));
        els.toggle.addEventListener("click", () => { st.open = !st.open; applyUI(); });

        dock.addEventListener("click", event => {
            const target = event.target.closest("[data-action]");
            if (!target || !dock.contains(target)) return;
            const { action, id, value, index } = target.dataset;
            switch (action) {
                case "pick": selectPatient(id); break;
                case "chip-x": toggleDiet(value, false); break;
                case "del-option": event.preventDefault(); removeDietOption(value); break;
                case "add-diet": addDietOption(); break;
                case "save-diet": saveDiet(); break;
                case "undo-diet": loadDraft(); renderDiet(); setMsg(els.dietMsg, "Changes undone.", "ok"); break;
                case "clear-diet": st.draft = []; markDirty(); renderOptions(); break;
                case "med-toggle-form": openMedForm(!st.medFormOpen); break;
                case "med-cancel": openMedForm(false); break;
                case "med-save": saveMed(); break;
                case "med-use": useMed(Number(index)); break;
                case "med-edit": editMed(Number(index)); break;
                case "med-del": deleteMed(Number(index)); break;
                default: break;
            }
        });

        dock.addEventListener("change", event => {
            const box = event.target.closest('input[data-action="toggle-diet"]');
            if (box) toggleDiet(box.value, box.checked);
        });

        els.patSearch.addEventListener("input", renderPatients);
        els.dietFilter.addEventListener("input", renderOptions);
        els.medSearch.addEventListener("input", renderMeds);
        els.newDiet.addEventListener("keydown", event => {
            if (event.key === "Enter") { event.preventDefault(); addDietOption(); }
        });
        [els.medName, els.medDoses, els.medRoutes, els.medFreqs].forEach(input =>
            input.addEventListener("keydown", event => {
                if (event.key === "Enter") { event.preventDefault(); saveMed(); }
            }));

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && st.open && dock.contains(document.activeElement)) {
                st.open = false;
                applyUI();
            }
        });

        window.addEventListener("storage", event => refreshFromStorage(event.key));
        window.addEventListener("ris-cloud-change", event => refreshFromStorage(event.detail?.key));
        window.addEventListener("beforeunload", event => {
            if (st.dirty) { event.preventDefault(); event.returnValue = ""; }
        });
    }

    function init() {
        try {
            build();
            loadUI();
            bind();
            applyUI();
            tick();
            setInterval(tick, 350);
        } catch (error) {
            // The dock is an add-on; it must never stop the medication form.
            console.error("RIS floating dock could not start:", error);
            dock?.remove();
        }
    }

    init();
})();
