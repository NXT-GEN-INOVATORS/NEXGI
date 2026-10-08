# Local Multi-Camera CCTV Violence Detection MVP

An end-to-end, local-first multi-camera CCTV violence monitoring system powered by the pretrained **MoViNet-A0 5-FPS streaming model** (`engares/MoViNet4Violence-Detection`).

Zero external cloud dependencies (no AWS, no Supabase, no external DB, no external AI APIs).

---

## 1. System Architecture

```text
                        LOCAL VIDEO FILES
          cam01.mp4    cam02.mp4    cam03.mp4    cam04.mp4
             │            │            │            │
             ▼            ▼            ▼            ▼
         Worker 1     Worker 2     Worker 3     Worker 4
       (State 1)    (State 2)    (State 3)    (State 4)
             │            │            │            │
             └────────────┬────────────┘────────────┘
                          ▼
            Sampling (~5-8 FPS per camera)
                          ▼
             MoViNet-A0 Streaming Model
                  (172x172 RGB)
                          ▼
             Temporal Smoothing State Machine
     [NORMAL] -> [CANDIDATE] -> [VIOLENCE] -> [COOLDOWN]
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
      Normal Status              Evidence Capture
      (No violence)                     │
                             ┌──────────┴──────────┐
                             ▼                     ▼
                        image.jpg              clip.mp4
                             └──────────┬──────────┘
                                        ▼
                               local_data/ Directory
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                             ▼
                 FastAPI Backend                Next.js Frontend
               (REST + WebSockets)             (2x2 Video Wall)
```

---

## 2. Benchmark Results

Measured using `scripts/benchmark.py` on local CPU:

| Metric | Measured Value |
|---|---|
| **CAM 1 Throughput** | **8.4 FPS** (93.1 ms latency) |
| **CAM 2 Throughput** | **8.7 FPS** (94.8 ms latency) |
| **CAM 3 Throughput** | **9.1 FPS** (94.7 ms latency) |
| **CAM 4 Throughput** | **9.2 FPS** (93.2 ms latency) |
| **Total Inference Throughput** | **35.4 FPS** |
| **Average Latency** | **94.0 ms** |
| **System CPU Utilization** | **~51%** |
| **Process RAM Utilization** | **~0.32 GB (320 MB)** |

---

## 3. Pretrained Model Verification & Class Mapping

The system uses the author's pretrained streaming MoViNet-A0 violence detection checkpoint:
- **Repository**: [engares/MoViNets-for-Violence-Detection-in-Live-Video-Streaming](https://github.com/engares/MoViNets-for-Violence-Detection-in-Live-Video-Streaming)
- **HuggingFace**: [engares/MoViNet4Violence-Detection](https://huggingface.co/engares/MoViNet4Violence-Detection)

### Verified Class Mapping:
- **Index 0**: `Fight` (Violence probability)
- **Index 1**: `No_Fight` (Normal probability)

### Verification Summary (`scripts/verify_model.py`):
- **Normal Footage (`cam01.mp4`)**: Average violence probability: **0.328** (Class: `No_Fight`)
- **Violence Footage (`cam03.mp4`)**: Average violence probability: **0.574** -> climbs sustained to **0.78+** (Class: `Fight`)

---

## 4. Project Structure

```text
violence-sentiment-analysis/
│
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app & WebSocket endpoint
│   │   ├── config.py                # Configuration and camera list
│   │   ├── models/
│   │   │   └── movinet/
│   │   │       ├── detector.py      # MoViNet-A0 TFLite streaming runner
│   │   │       ├── model.tflite     # Pretrained streaming model
│   │   │       └── checkpoints/     # HuggingFace raw checkpoint files
│   │   ├── services/
│   │   │   ├── video_processor.py   # 4-camera concurrent processor manager
│   │   │   ├── camera_worker.py     # Independent thread, temporal smoothing, buffer
│   │   │   ├── evidence_manager.py  # Evidence JPEG and MP4 clip encoder
│   │   │   └── event_manager.py     # SQLite persistence for events
│   │   ├── api/
│   │   │   ├── cameras.py           # /api/cameras and /api/cameras/{id}/stream
│   │   │   └── events.py            # /api/events and /api/events/{id}
│   │   └── schemas/
│   │       └── events.py            # Pydantic data schemas
│   ├── requirements.txt
│   └── run.py                       # Backend launcher script
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Real-time monitoring dashboard
│   │   └── globals.css              # Dark surveillance HUD theme
│   ├── components/
│   │   ├── CameraFeed.tsx           # Single camera tile with live stream & probability meter
│   │   ├── RecentEvents.tsx         # Chronological list of confirmed incidents
│   │   ├── EvidenceModal.tsx        # High-res image & MP4 clip player modal
│   │   └── StatsBar.tsx             # Telemetry banner (throughput, CPU, RAM)
│   ├── package.json
│   └── tsconfig.json
│
├── videos/
│   ├── cam01.mp4                    # Normal CCTV footage
│   ├── cam02.mp4                    # Normal CCTV footage
│   ├── cam03.mp4                    # Violent altercation CCTV footage
│   └── cam04.mp4                    # Normal CCTV footage
│
├── local_data/                      # Disposable generated artifacts
│   ├── evidence/                    # Evidence JPG frames
│   ├── clips/                       # Evidence MP4 video clips
│   └── events/events.db             # Local SQLite event database
│
├── scripts/
│   ├── download_model.py            # Fetch model weights & sample videos
│   ├── verify_model.py              # Phase 1 model verification
│   ├── benchmark.py                 # Multi-camera concurrency benchmark
│   └── clean_local_data.py          # Safe local cleanup script
│
├── .env.example
├── .gitignore
└── README.md
```

---

## 5. Quick Start

### Step 1: Set up Virtual Environment
```bash
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

### Step 2: Download Model & Videos (Already included)
```bash
.venv\Scripts\python.exe scripts/download_model.py
```

### Step 3: Run Verification & Benchmark
```bash
.venv\Scripts\python.exe scripts/verify_model.py
.venv\Scripts\python.exe scripts/benchmark.py
```

### Step 4: Start Backend
```bash
.venv\Scripts\python.exe backend/run.py
```
Backend runs at `http://127.0.0.1:8001`.

### Step 5: Start Frontend
```bash
cd frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 6. Local Artifact Cleanup

To safely remove all generated evidence images, video clips, and database records without touching video sources or model weights:

```bash
.venv\Scripts\python.exe scripts/clean_local_data.py
```

Or via PowerShell:
```powershell
Remove-Item -Recurse -Force local_data/evidence/*, local_data/clips/* -ErrorAction SilentlyContinue
```

---

## 7. API Endpoints

- `GET /api/health`: Health status
- `GET /api/stats`: Aggregate inference throughput, CPU %, RAM %
- `GET /api/cameras`: Current status, violence probabilities, and inference FPS of all 4 cameras
- `GET /api/cameras/{camera_id}/status`: Specific camera status
- `GET /api/cameras/{camera_id}/stream`: Real-time MJPEG live stream for camera
- `GET /api/events`: Recent violence events
- `GET /api/events/{event_id}`: Event details
- `GET /api/events/{event_id}/evidence`: Evidence paths
- `WS /ws/live`: Real-time WebSocket push updates (cameras status + alerts)
