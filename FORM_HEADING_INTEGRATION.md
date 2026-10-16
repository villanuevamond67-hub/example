# Automated Form Heading Printer — RIS integration

## Open the printer

Sign in to the RIS as usual. Open **FORM HEADING PRINTER** from the Patient Dashboard or Medication Order Main Menu. Use **Form heading** beside a dashboard patient or **FORM HEADING** on a saved patient card to load that patient directly.

From an open Medication Order Form, **SAVE & FORM HEADING** saves the current order and opens its heading. This works for both a new patient and an existing order.

## Patient information

| Heading field | RIS source |
| --- | --- |
| Last, first and middle names | Confirmed name fields saved with the patient; older full names are shown for review |
| Health record number | Hospital number |
| Age | Age calculated from a valid birthdate; saved age is used when birthdate is absent |
| Birthdate | Kardex DOB |
| Sex | Kardex sex |
| Ward | Saved medication order ward |

Search by name, hospital number or room. Previous/Next follows the RIS room order and preserves the saved sequence inside each room. The room is shown for identification; the supplied physical forms have a Ward box.

For older names written as `LAST, FIRST`, the surname and given-name portion are loaded. Middle names are not guessed. Names without commas are placed in the first-name input so the user can confirm the split. After confirmation, the separate fields are saved and reused. If the full name later changes elsewhere in RIS, the split must be reviewed again.

Select **Save patient information to RIS** to retain heading edits. This updates the name, hospital number, age, ward, Kardex sex and DOB, and the separate name fields. Medications, order status, diagnosis, room, diet and other Kardex information are preserved. The existing RIS account storage and cloud sync are reused; no new database table or SQL migration is needed.

Editing or printing alone does not save demographic changes. Test-print values never replace patient information. If patient information changes in another RIS page while being edited here, reload the patient before saving.

## Print onto a pre-printed form

1. Select the patient and verify the heading.
2. Choose Doctor’s Orders and Progress Notes, Medication and Treatment Record, Nurses Notes and Treatment Record, or TPR Record.
3. Choose US Letter or A4 to match the physical paper.
4. Drag individual blue text boxes, use arrow keys (Shift gives a larger step), or adjust the millimeter controls. Click **Save Alignment** to keep the adjusted positions for this form/paper combination. They are saved on this device and in your cloud account.
5. Test on a blank sheet first and compare it with the physical form.
6. Load the pre-printed form and click **Print heading only**. In the browser print dialog, use 100%/Actual size, no margins, and disable headers/footers.

The form scan, navigation, account bar and editor are excluded from printing. Only entered heading text and the selected sex mark are printed.

## Save and reuse alignment

**Save Alignment** keeps the global offsets, individual field positions and text size for the selected form and paper size. Changes update the preview immediately and remain unsaved until this button is clicked. Existing alignment profiles from the earlier version continue to load.

**Load saved alignment** restores the saved profile. **Reset alignment for this form** stages the default positions; click Save Alignment if you want those defaults to replace the saved profile. Each form has independent Letter and A4 profiles. Profiles are saved on this device and in your cloud account (one per form and paper size), so they are also available when you sign in on another computer. They are not patient data. The newest save wins: if two computers print to differently calibrated printers, check alignment on a blank sheet after switching. If the cloud cannot be reached, the profile is still saved on this device, the status line says so, and it is sent automatically once the connection returns. Profiles saved in this browser before this update are uploaded the next time you sign in.

## Print per room or select patients

Use the **Print per room / select patients** link at the top to reach the batch controls.

1. Choose the form and paper size above; adjust and save its alignment.
2. Choose a room in **Print by room or selection**. Choose All rooms to select patients across rooms.
3. Check individual patients, or use **Select all in this room** / **Select all patients**. **Clear selection** unchecks the displayed list. Changing rooms clears the selection.
4. Click **Print selected headings** for the checked patients, or **Print entire room** for every patient in the chosen room.
5. Load one pre-printed sheet per patient. Keep print Copies at 1, scale at 100%/Actual size, margins at None, and browser headers/footers disabled.

Each patient receives one heading-only page. Print order follows the saved RIS room sequence and patient order inside each room. All pages use the same chosen template, paper size and alignment. The scan and application controls are excluded; no additional patient list or cover page is printed.

Batch printing reads saved RIS information. Save or reload current patient edits before including that patient. For older names with no clear surname split, click **Review heading**, confirm last/first/middle fields, then **Save patient information to RIS** before batch printing. Test print mode disables real-patient batch printing.

## Install this update

Keep all files in the extracted `RIS supa 1` folder together. The four original reference JPEGs are embedded directly in `RIS_2.0_FORM_HEADING.js`; no separate scan files or image folder are required. Replace/upload the updated RIS files in your existing static hosting folder. Keep your existing `supabase-config.js` settings and sign-in setup. This archive retains the configuration provided in the uploaded project. Open `index.html` through the same hosted RIS address as before.

New files: `RIS_2.0_FORM_HEADING.html`, `.js`, `.css`, and this guide. Updated files: medication order HTML/JS and patient dashboard HTML/JS/CSS. Other application files are unchanged.

## Validation

Checked with synthetic patients in a headless browser: demographic loading, Kardex sex/DOB, zero age, room order, search/patient switching, saving without losing medications/status/Kardex fields, stale-update protection, saved name reuse, test-data isolation, draggable/keyboard alignment, A4/Letter selection, all four print templates, responsive layout, and dashboard/medication-form entry points. Single-patient printing produced one Letter page with only heading text. The updated batch workflow produced two pages for two selected patients across all four templates, two pages on A4, and five pages for five patients across rooms, with no extra pages. Alignment save/load/reset and persistence, Select All/partial selection, room filters, entire-room printing, missing-patient handling and mobile layout also passed.

Authentication and cloud transport were mocked during testing. Live Supabase access and physical printer calibration were not tested. Run a blank-sheet alignment test on the actual printer before printing patient forms.

## Direct reference images

Selecting Doctor’s Orders (HF-HIM-015), Medication (HF-HIM-027), Nurses Notes (HF-HIM-031), or TPR (HF-HIM-040) displays that form’s designated reference image. **View reference image** opens the same original JPEG directly in a new tab without patient text. Images are embedded in the heading script and exposed as browser image URLs, so there is no separate scan directory to upload or configure. The image URLs are recreated when the page loads; use the RIS heading page to reopen a reference after closing the application.
