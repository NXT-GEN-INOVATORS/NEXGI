# VisionTrace AI interface refresh

## Direction
Keep the professional charcoal sidebar, light workspace, and emerald accent. Replace Public Sans with **Sora for headings and Manrope for body text**, improve readability, and use consistent spacing and restrained borders throughout.

## Home and About
- Make `/` a proper public Home page rather than opening directly into the operator overview.
- Add an About page with the product purpose, evidence-focused workflow, and clear distinction between VisionTrace and the external AWS intelligence service.
- Use public navigation with Home, About, and Sign in. Feature **VisionTrace AI** prominently with the existing surveillance image, clearly marked as sample footage.
- Keep Home concise: a strong opening, a preview of the footage-to-evidence workflow, and a sign-in action. Do not show upload forms or operator inputs here.

## Sign-in and dashboard
- After successful sign-in, open the dashboard overview at `/dashboard`.
- Keep the existing operator pages and sidebar inside the workspace, separate from Home and About.
- Preserve clearly labeled sample browsing through a secondary demo action; signing in remains required to upload or save records.
- Handle returning Google sign-ins and email confirmation without briefly showing the wrong workspace state. Signing out returns to Home.

## Clearer video uploads
- Replace the crowded combined upload form with two explicit options: **Upload file** and **Video URL**.
- Show only the input required by the selected option, with a visible selected-file name and file replacement/removal controls.
- Group camera details separately from recording date and start time. Keep existing metadata, while making the form easier to scan.
- Keep the current 50 MB upload limit visible and provide validation, submission progress, and errors inside the upload dialog.
- Preserve existing private storage, video viewing, deletion, and external AWS processing behavior.

## Highlighted AI access
- Add a prominent **AI Search** action fixed at the bottom center of the workspace, using the emerald accent and a recognizable AI/search icon.
- On public pages, its action opens sign-in with AI Search as the destination.
- Leave space below page content so the action never covers tables, forms, or footer text; keep it out of modal dialogs.
- On AI Search itself, emphasize the main search input instead of placing a duplicate floating action over the search controls.

## Technical details
- Retain TanStack file routing, Material UI, and the centralized CSS-token-backed theme.
- Separate public navigation from workspace chrome while retaining shared session and theme providers.
- Update navigation references from the current overview `/` to `/dashboard`, and add unique page metadata for Home, About, and Dashboard.
- Keep AWS calls in the browser adapter and preserve user-scoped data access; no model inference or new intelligence backend work.
- Record the chosen page structure in the project architecture rules during implementation.

## Acceptance checks
- Verify Home and About navigation, email sign-in, Google return handling where available, dashboard entry, and sign-out.
- Check both upload options, required-field validation, file removal, and submission feedback.
- Check the bottom-center AI action and confirm it does not obscure content on narrow or wide screens.
- Confirm sample evidence remains labeled and existing video/search workflows still work.

**Default assumptions:** retain the existing emerald/charcoal palette, use Sora + Manrope, keep a secondary sample-demo option, and interpret “AI on the bottom middle” as a highlighted AI Search action—not a new chatbot.