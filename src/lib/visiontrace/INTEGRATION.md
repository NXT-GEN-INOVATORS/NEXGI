# VisionTrace frontend integration

Set `VITE_AI_BACKEND_URL` before building. This application uses TanStack Router (fixed host framework) rather than React Router, and Material UI throughout.

AWS must allow the frontend origin with CORS. No inference runs in this app.

- `GET /health`: successful HTTP response means connected.
- `POST /api/search`: `{query, camera_ids: string[], time_range: "hour"|"day"|"week"|"all", min_confidence: number}`.
- Response: `{results: [{id, camera_id, camera_name, location, timestamp, confidence, objects: string[], thumbnail_url?, clip_url?, bounding_box?: {x,y,width,height}}]}`. Confidence may be 0–1 or 0–100; bounding boxes are normalized 0–1.
- `POST /api/videos/process`: `{video_id,video_url,camera_id,recording_date,start_time}`. Accepted request sets Processing; status completion synchronization needs the AWS service contract.

Database and video storage are private per user. Sample data is browser-only, explicitly labeled, and never inserted as real records. Sign in to upload, add, delete, or save records. Upload cap is 50 MB; use HTTPS URLs for larger recordings. Storage URLs are signed for one hour when viewing or submitting to AWS.

Camera topology, alerts and analytics currently display sample data; they do not claim live detection. Voice input is visually represented but disabled.
