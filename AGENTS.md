<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application rules
- Use TanStack file routes and shared root chrome; the template router is fixed and cannot be replaced by React Router.
- Use Material UI components and a centralized theme backed by CSS semantic tokens for all VisionTrace controls and styling.
- Keep AWS vision calls in the browser Axios adapter with VITE_AI_BACKEND_URL; implement no local inference or video processing, and use server functions only for credential-protected external services.
- Use user-scoped database and private storage records; unauthenticated operators may inspect clearly labeled sample data but must sign in to persist changes.
- Keep sample evidence explicitly distinct from AWS results to avoid presenting simulated detections as real intelligence.
- Separate public Home/About chrome from the operator workspace in the shared root; keep the overview at /dashboard so public entry and operator navigation remain distinct.
- Preserve an allowlisted destination through sign-in in origin-scoped session storage; redirect only after the session is established so OAuth returns and email sign-in share the same behavior.
- Keep video source selection and validation in the upload dialog; only the selected source is submitted to avoid conflicting File and URL inputs.

- Call Sarvam text-to-speech through an authenticated server function using a server-only secret; keep speech synthesis external and AWS vision calls unchanged.
- Render Sarvam audio with explicit native playback controls and revoke temporary object URLs to prevent autoplay failures and resource leaks.
- Capture continuous voice as complete five-second WAV windows, transcribe sequentially, and append streamed text without replacing the existing question; release microphone tracks on stop and navigation to protect privacy.
