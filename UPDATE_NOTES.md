# RIS 6.3 — Floating Diet List + Medication DB dock

On the Medication Order Form a floating bar now sits at the bottom of the screen
(hidden on the Main Menu and when printing).

- **DIET LIST tab** – mini list of all saved patients (room order) with their diets.
  Pick a patient (the one on the form is selected automatically), tick diets, then SAVE DIET.
  Saved to the same fields the Kardex and Diet List read, so they update too.
  Add or remove custom diet options (shared with Kardex / Diet List).
- **MEDICATION DB tab** – search, add, edit, delete medicines; USE puts a medicine into the
  next empty row of the form with its dose/route/frequency filled.

New files: RIS_2.0_FLOAT_DOCK.js / .css. Changed: app-loader.js (optional data-after-script),
RIS_2.0_Reference_Print_Updated.html (2 lines).

# RIS 6.2 — Saved in the cloud and on the device

Everything RIS saves now goes to **both** the browser on the device and the
signed-in cloud account, and a change can no longer be lost because the cloud
was unreachable when it was made.

## Form Heading Printer: Save Alignment

- **Save Alignment** now stores the profile on this device **and** in the cloud
  account (one profile per form and paper size). It was browser-only before.
- The status line under the button says what actually happened: saved on this
  device and to the cloud account, or saved on this device with cloud sync
  pending (it is sent automatically once the connection returns).
- A profile saved on another computer appears in an open heading page
  automatically, unless that page has unsaved alignment edits.
- Alignment profiles already saved in a browser are **uploaded the next time
  that browser signs in** — nothing is lost or needs to be re-saved.
- The newest save wins. If two computers print to differently calibrated
  printers, check alignment on a blank sheet after switching computers.

## Sync layer (ris-cloud.js)

- Previously, if a cloud save failed (offline, weak connection) and the page
  was reloaded, the older cloud copy replaced the newer local one and the
  change was lost. Changes the cloud has not confirmed are now remembered on
  the device, kept on reload, and pushed to the cloud automatically.
- Failed saves retry on their own (every 5 s, backing off to 1 min), when the
  connection returns and when the tab is shown again.
- An older failed save can no longer overwrite a newer value, a delete is
  remembered if it was made offline, and a queued save can no longer bring a
  deleted item back.
- A live update from another device no longer reverts a change that has not
  reached the cloud yet.
- **Sign out** asks first if anything has not reached the cloud yet, instead
  of discarding it silently.
- The account bar shows the state: *Saved to cloud + this device*, *Saving…*,
  or *Saved on this device · retrying cloud*.
- No SQL, configuration or file-structure change is needed.

## Verification

57 checks in headless Chrome against a fake Supabase backend: dual save,
failure and automatic retry, reload with unsynced changes, offline delete,
first sign-in, account switching, live updates, sign-out guard, and Save
Alignment on the real heading page (online, offline, remote update, echo,
unsaved edits). The four data-loss cases fail on the previous ris-cloud.js
and pass now. These tests used a fake Supabase backend, not your live project,
so try one Save Alignment on the hosted site and confirm the status line says
“saved on this device and to your cloud account”.

# RIS 6.1 — Custom patient order and room-separated Vital Signs

## Drag a patient to set the order (Medication Order Main Menu)

- Each patient card in a room section now has a drag handle. Grab it and
  drop the patient where you want them in that room's list.
- Works with a **mouse and with touch**, so it can be used on a tablet at
  the station. **Up / down arrow keys** move a focused handle, and small
  **▲ / ▼ buttons** on each card do the same thing without dragging.
- A patient is only moved **inside their own room**. The room stays a saved
  data field and can never be changed by dropping a card somewhere else.
- The new order is written to the saved patient list and syncs through the
  same cloud store as everything else, so it survives a reload and reaches
  other signed-in devices.
- Because the saved list is the one source of truth, the custom order is
  also used by **Previous / Next Patient**, **Print All**, the **Vital Signs
  sheet**, and the Patient Dashboard's default Room view.
- Reordering is **paused while a search filter is active**, since only part
  of the list is on screen then. Clear the search box to drag again.

## Vital Signs sheet: patients separated per room

- On each paired-room sheet, patients are now grouped **room by room** in
  the custom order above, with a **single blank separator row between the
  two rooms**.
- The separator row has **no input boxes and no diagonal BP / T / P / R
  guides**, so it reads as a divider and is never written in. It carries a
  **faint label naming the room that starts below it** (for example
  ROOM 904).
- If only one of the two rooms has patients, no separator is drawn. An
  empty pair still produces a plain 24-row sheet as before.
- Sheets still hold exactly **24 rows**. A separator that would land at the
  very top of a continuation sheet is dropped, since the page break already
  separates the rooms there.
- Applies on screen, to **PRINT CURRENT ROOM SHEET** and to **PRINT ALL
  SHEETS**.

## Verification

Logic tests (30) cover reordering inside a room without moving, dropping or
duplicating patients in other rooms, the arrow-key and button fallback,
room segregation, separator placement, empty and single-room pairs, and
24-row sheet packing including overflow. A further 32 checks were run in a
real headless Chrome against the live pages: a genuine pointer drag,
persistence across a reload, keyboard and button moves, the paused state
while searching, the rendered separator row, retained readings across a
room switch, and a full PRINT ALL SHEETS pass producing three 24-row
sheets. Check print preview before using it for a shift (A4, 100% scale,
browser headers and footers off).

# RIS 6.0 — Patient Dashboard update

`RIS_2.0_PATIENT_DASHBOARD.html` is now the **home page / hub** of the
package. Open it first — it links to every other page and shows the full
patient table without needing to scroll past menus first.

- **Top navigation bar** (always visible) links straight into: + New Order,
  Medication Orders (main menu), CBG Form, Vital Signs, Diet List,
  Medication Tracker, and Medication Database. These are plain links/URL
  parameters (`?view=hgb`, `?view=vital`, `?view=tracker`, `?view=database`,
  `?view=neworder`) handled by `RIS_2.0_Reference_Print_Updated.js`, not
  pop-up windows — so it behaves like a normal multi-page site.
- **No-scroll layout**: the page itself never scrolls (header, search/sort/
  room-filter bar, and the table all fit the viewport). Only the table body
  scrolls internally, with a sticky header, if there are more patients than
  fit on screen at once.
- **Table view** of every saved patient: Patient Name, Hospital Number, Room,
  CBG Frequency (OD/TID/Q6/Q4, blank if no CBG order), and an **Acuity
  Level** dropdown (Level I–IV, nursing dependency classification).
- **Room color coding** matches the rest of RIS (901 pink, 902 white, 903
  blue, 904 orange, 905 green, 906 yellow) as a left-border accent and a
  colored room badge; a room-filter legend and a free-text search box
  (name / hospital number / room) are both available, plus sorting by Room,
  Name, Level, or CBG.
- **Click a patient's name** to jump straight into that patient's Medication
  Order Form (`RIS_2.0_Reference_Print_Updated.html?openOrder=<id>`).
- **Acuity Level** selections save automatically to the same saved patient
  record used by the rest of RIS (`acuityLevel` field).
- From any other page, click **🏠 PATIENT DASHBOARD** in the Medication Order
  Main Menu header to come back home.
- A **REFRESH** button re-pulls the latest saved patient list; the dashboard
  also refreshes automatically when the browser tab regains focus.

# RIS 6.0 — 24-row Vital Signs and Print All update

Extract the complete ZIP, then open `RIS_2.0_Reference_Print_Updated.html`.

## What changed in this update

- Patients with a saved CBG order show only an underlined **CBG** beside their
  name. Frequency (OD/TID/Q4/Q6) and strips-per-shift are not displayed here.
  The original saved CBG orders and the separate CBG form are not changed.
- Every Vital Signs sheet has **24 patient rows**, with unused rows left blank.
  Empty room pairs still produce a 24-row sheet. More than 24 patients continue
  on another 24-row sheet, accessible with Previous Sheet / Next Sheet.
- **PRINT ALL SHEETS** prints all three room pairs in one print job, including
  empty pairs and continuation sheets. Each sheet starts on a new A4 page.
- Entered vital readings are retained during room switching and printing in the
  current session. These readings are not permanently saved across page reloads.
- The **IVF** column in the Vital Signs form is now **O2Sat**.
- Patients are separated into three paired-room sheets. Use the room buttons to
  open and print one pair at a time:
  - Rooms **901 and 904**
  - Rooms **902 and 903**
  - Rooms **905 and 906**
- The hospital header, reference details, remaining Vital Signs columns and
  diagonal BP/T/P/R guides are retained. Print rules keep sheets separate.

- The **VITAL SIGN FORM** page (opened from the main menu) has been replaced with
  the official DOH-style **Vital Signs Monitoring Sheet** layout — matching the
  hospital's printed form (Reference Code HF-NRS-016, Revision 1, Date Effective
  October 14, 2024), including the hospital logo, letterhead, and the diagonal
  guide lines on the BP / T / P / R columns for handwritten multi-reading entries
  per shift.
- **Patient Name**, **Room**, and **CBG** are pulled automatically from saved
  patient records (same source as the rest of RIS), so the sheet is pre-filled
  every time it's opened or refreshed:
  - CBG indicates monitoring only beside the name. Patients without a saved
    CBG order show no CBG line.
  - BP, T, P, R, O2Sat, PO/NGT, UO and BM remain blank, editable cells for staff
    to fill in by hand or on-screen each shift, same as the printed original.
- **PRINT CURRENT ROOM SHEET** prints the selected room pair, including any
  continuation sheets, with the same date, shift and prepared-by details.
- **REFRESH PATIENTS** re-pulls the latest saved patient list, room, and CBG
  values without leaving the page.

## Previous changes (carried over)

- Medical Supplies Inventory has been removed from the main menu and the package, including its RIS patient connection code.
- RIS, Kardex and Diet List retain the teal screen theme and existing official print layouts.
- Main-menu room sections are color-coded: 901 pink, 902 white, 903 blue, 904 orange, 905 green and 906 yellow.
- Compliance controls and labels are removed. **Print All** includes every saved medication order, grouped by room.
- Previous/Next Patient in RIS and Kardex follows the saved patient order, without alphabetical sorting.
- The separate **Medication Tracker** button opens a panel showing each medication's total Quantity, recorded doses and number of saved patients. Click a medication to see its patients, then click a patient to open that medication order.

## Medication tracker scope

Totals use all saved medication orders, including orders outside the current search results. They update when the main menu is opened or refreshed. Medication names are grouped without regard to letter case. Quantity is the entered item count; it is not a dose calculation, stock-on-hand balance, usage history or monetary total. The Dose(s) column identifies the different recorded doses included in each medication total.

## Verification

JavaScript syntax and automated function tests passed for CBG-only indicators,
24-row empty/filled/overflow sheets, room grouping, a single print-all call,
metadata/readings retained in print copies, and print cleanup. Tests use a DOM
test double; a browser executable was not available for live visual or print
preview verification. Check print preview before using it for a shift (A4,
100% scale, browser headers/footers off).

## Patient navigation follows room order

- Kardex and medication form Previous/Next controls now follow the Main Menu's room sequence.
- Patient order within each room is preserved, including manually rearranged patients.
- The Main Menu and both forms use the shared `patient-order.js` helper.
- Medication navigation recalculates the active position after a room change is saved.
- Existing navigation save behavior and first/last patient boundaries are preserved.

Copy the complete updated project together so both form pages can load `patient-order.js`.
