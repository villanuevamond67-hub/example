# LGH RIS Online

Static RIS forms hosted on GitHub Pages with Supabase email/password authentication and per-user cloud data storage.

## Supabase setup

1. Create or select a Supabase project.
2. Open **SQL Editor**, paste `supabase-schema.sql`, and run it. The script can also be rerun on an existing project after this update; it preserves existing RIS data.
3. Open **Project Settings → Data API** and copy the Project URL and publishable/anon key.
4. Put those two public values in `supabase-config.js`. Never use the service-role key in this repository.
5. In **Authentication → URL Configuration**, add the GitHub Pages URL as the Site URL and Redirect URL.
6. In **Authentication → Providers → Email**, keep email/password enabled. Disable public sign-ups after creating the authorized accounts if registration should be restricted.

## GitHub Pages deployment

1. Push these files to a GitHub repository.
2. Open **Settings → Pages**.
3. Set the source to **Deploy from a branch**, select the main branch and `/ (root)`, then save.
4. Open the GitHub Pages URL and create or sign in to an account.

## Security

- Patient records are stored in `ris_user_data` and protected by Row Level Security.
- Each account can only read and change its own records.
- The Supabase anon/publishable key may be public; the service-role key must remain secret.
- This project should be reviewed against the hospital's privacy, access-control, audit, retention, and compliance requirements before clinical use.

## Form Heading Printer

The automated heading printer is integrated with saved RIS patients. Open **FORM HEADING PRINTER** from the dashboard or main menu. See `FORM_HEADING_INTEGRATION.md` for patient fields, alignment and installation instructions.

The heading printer includes **Save Alignment**, room filtering, individual patient checkboxes, **Select All**, **Print selected headings**, and **Print entire room**. Each batch prints one heading-only page per patient.

The existing `ris_user_data` table stores confirmed heading names inside the medication-order JSON and sex/birthdate in Kardex extras. No additional patient table or data migration is needed. **Save Alignment** now keeps each profile on the device *and* in the signed-in account (one `ris_user_data` row per form and paper size, key `heading-alignment-v1-<form>-<paper>`), so it follows the account to other computers. A profile saved on one device replaces the one on the others (last save wins), so if different computers print to differently calibrated printers, re-check alignment on a blank sheet after switching. Profiles saved in this browser before this update are uploaded automatically the next time you sign in. The revised SQL script documents this contract and explicitly grants authenticated accounts access under the existing row policies.

The four reference scans are embedded directly in the heading script. Selecting a form updates its preview and **View reference image** link to the designated original JPEG. No separate scan folder is needed.
