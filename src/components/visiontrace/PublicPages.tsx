import { useState } from 'react';
import { Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip } from '@mui/material';
import {
  ArrowForward, PlayArrow, UploadFile, ManageSearch, VerifiedOutlined,
  CenterFocusStrong, VideocamOutlined, MemoryOutlined, SearchOutlined,
  CheckCircleOutlined, StorageOutlined, HubOutlined, FlashOnOutlined,
  TuneOutlined, NotificationsActiveOutlined, InfoOutlined
} from '@mui/icons-material';
import { Link } from '@tanstack/react-router';
import { useSession } from './Session';
import hero from '@/assets/hero-vi-3d.jpg';
import gate from '@/assets/gate-camera.jpg';

// ─── Process Flow Bar ──────────────────────────────────────────────────────────
const processFlow = [
  {
    icon: VideocamOutlined,
    step: '01',
    label: 'Camera Ingestion',
    detail: 'Register each camera with a unique ID, name, zone and GPS location. Feeds can come from an HTTP/HLS stream, an RTSP/ONVIF IP camera, or an uploaded video file. Every feed is tagged with this metadata so every later result can be traced to its source.',
    desc: 'Cameras registered with ID, location & metadata stream footage in real-time.',
    color: 'var(--info)',
  },
  {
    icon: StorageOutlined,
    step: '02',
    label: 'Video Indexing',
    detail: 'Incoming footage is split into time-stamped segments and stored privately for your operator account. Each segment keeps its camera ID, recording date and start time, which makes it searchable and lets you delete recordings at any time.',
    desc: 'Footage is chunked, timestamped and stored with object-detection metadata.',
    color: 'var(--primary)',
  },
  {
    icon: MemoryOutlined,
    step: '03',
    label: 'AI Processing',
    detail: 'Your AWS vision service runs object detection frame by frame to find people, vehicles and other objects, with bounding boxes and confidence scores. Processing is triggered from the Video Intelligence page and its status is shown per video.',
    desc: 'Computer vision models detect objects, persons, and events frame-by-frame.',
    color: 'var(--success)',
  },
  {
    icon: SearchOutlined,
    step: '04',
    label: 'Natural Language Search',
    detail: "Type a question such as 'person in a red jacket near the main gate'. The AI search maps it to detections across all indexed cameras and returns ranked matches with timestamps.",
    desc: 'Ask in plain English — AI maps your query across all indexed cameras.',
    color: 'var(--warning)',
  },
  {
    icon: HubOutlined,
    step: '05',
    label: 'Spatial Memory',
    detail: 'Matches of the same object across different cameras are linked by time and camera location, building a movement path through your site.',
    desc: 'Cross-camera traces link matching objects across locations and time.',
    color: 'var(--primary)',
  },
  {
    icon: VerifiedOutlined,
    step: '06',
    label: 'Evidence Verification',
    detail: 'Each match is backed by a clip, timestamp, confidence score and bounding box so an operator can verify it before acting.',
    desc: 'Timestamped clips, confidence scores and bounding boxes for every match.',
    color: 'var(--success)',
  },
  {
    icon: HubOutlined,
    step: '07',
    label: 'Object Tracking',
    detail: 'Pick an object and follow it on a Leaflet map. Using each camera location, sightings are plotted in time order and joined into a movement path, with a timeline of where and when it was seen.',
    desc: 'Follow one object across camera locations on a live map.',
    color: 'var(--info)',
  },
];

// ─── Camera Cards for Home ──────────────────────────────────────────────────
const featuredCameras = [
  { id: 'CAM-01', name: 'Front Entrance', location: 'North Wing · Level 0', status: 'Live', fps: '30fps', res: '4K', tags: ['Person Detection', 'Face Blur'], thumb: gate },
  { id: 'CAM-03', name: 'Main Gate', location: 'Perimeter · East', status: 'Live', fps: '25fps', res: '1080p', tags: ['Vehicle', 'LPR'], thumb: gate },
  { id: 'CAM-06', name: 'East Walkway', location: 'Building B · Ground', status: 'Live', fps: '30fps', res: '2K', tags: ['Person', 'Backpack'], thumb: gate },
];

export function Home() {
  const { user, signIn } = useSession();
  const [info, setInfo] = useState<number | null>(null);

  return (
    <>
      {/* ── Hero ── */}
      <section className="home-hero">
        <img className="hero-footage" src={hero} alt="Video Intelligence Command Center" />
        <div className="hero-shade" />

        {/* Animated scan line */}
        <div className="hero-scanline" />

        {/* Camera badge top-left */}
        <div className="hero-camera">
          <span style={{ fontWeight: 600 }}>CAM-03 · MAIN GATE</span>
          <Chip label="● LIVE STREAM" size="small" sx={{ background: 'var(--danger)', color: '#fff', fontSize: 9, height: 20, fontWeight: 700 }} />
        </div>

        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span className="dot pulse-dot" />
            VIDEO INTELLIGENCE · IN 3D
          </div>
          <h1>
            NEXGI <span>Vision</span>
          </h1>
          <p className="hero-tagline">See Everything. Miss Nothing.</p>
          <p className="hero-description">
            AI-powered CCTV intelligence that turns hours of footage into instant,
            verifiable evidence — across every camera in your network.
          </p>
          <div className="hero-actions">
            {user ? (
              <Button component={Link} to="/dashboard" variant="contained" endIcon={<ArrowForward />}>
                Open Dashboard
              </Button>
            ) : (
              <Button onClick={() => signIn('/dashboard')} variant="contained" endIcon={<ArrowForward />}>
                Enter Workspace
              </Button>
            )}
            <Button component={Link} to="/dashboard" variant="outlined" startIcon={<PlayArrow />}>
              Explore Demo
            </Button>
          </div>
        </div>

        {/* Stats bar inside hero */}
        <div className="hero-stats-bar">
          {[
            { v: '8+', l: 'Cameras' },
            { v: '12K+', l: 'Indexed Events' },
            { v: '94%', l: 'Match Accuracy' },
            { v: '< 2s', l: 'Search Latency' },
          ].map(s => (
            <div key={s.l} className="hero-stat">
              <span className="hero-stat-value">{s.v}</span>
              <span className="hero-stat-label">{s.l}</span>
            </div>
          ))}
        </div>

        <div className="hero-caption">
          <CenterFocusStrong /> Grounded in footage. Built for the operator.
        </div>
      </section>

      {/* ── Process Flow Bar ── */}
      <section className="process-flow-section">
        <div className="process-flow-header">
          <span className="eyebrow">VIDEO INTELLIGENCE PIPELINE</span>
          <h2>How NEXGI Vision works — end to end.</h2>
          <p>From camera registration to verified evidence, every step is traceable.</p>
          <div style={{ marginTop: 14 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<InfoOutlined />}
              onClick={() => setInfo(0)}
              sx={{
                borderColor: 'var(--border)',
                color: 'var(--card)',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: 13,
                background: 'color-mix(in oklch, var(--primary) 12%, transparent)',
                '&:hover': {
                  background: 'color-mix(in oklch, var(--primary) 22%, transparent)',
                  borderColor: 'var(--primary)',
                }
              }}
            >
              Explain Our Process (Full Pipeline Walkthrough)
            </Button>
          </div>
        </div>

        <div className="process-flow-track">
          {processFlow.map((s, i) => (
            <div
              key={s.step}
              className="pf-step"
              style={{ '--pf-color': s.color, cursor: 'pointer' } as React.CSSProperties}
              onClick={() => setInfo(i)}
            >
              <div className="pf-icon-wrap">
                <s.icon />
              </div>
              <div className="pf-connector" />
              <div className="pf-body">
                <span className="pf-step-num">{s.step}</span>
                <h4>{s.label}</h4>
                <p>{s.desc}</p>
                <div style={{ marginTop: 8 }}>
                  <Chip
                    icon={<InfoOutlined style={{ fontSize: 13 }} />}
                    label="Explain"
                    size="small"
                    variant="outlined"
                    sx={{
                      fontSize: 10,
                      height: 20,
                      cursor: 'pointer',
                      color: s.color,
                      borderColor: 'color-mix(in oklch, var(--pf-color) 40%, transparent)',
                      background: 'color-mix(in oklch, var(--pf-color) 8%, transparent)',
                    }}
                  />
                </div>
              </div>
              {i < processFlow.length - 1 && <div className="pf-arrow">→</div>}
            </div>
          ))}
        </div>
      </section>

      <Dialog open={info !== null} onClose={() => setInfo(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1, borderBottom: '1px solid var(--border)' }}>
          <InfoOutlined color="primary" />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>NEXGI Vision — Architecture & Process Flow</div>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 400 }}>Comprehensive guide on how our AI camera vision engine operates</div>
          </div>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(320px, 1.8fr)', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {processFlow.map((s, i) => (
                <div
                  key={s.step}
                  onClick={() => setInfo(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: `1px solid ${info === i ? s.color : 'var(--border)'}`,
                    background: info === i ? 'color-mix(in oklch, var(--primary) 10%, transparent)' : 'transparent',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.step}</span>
                  <div style={{ fontSize: 12.5, fontWeight: info === i ? 700 : 500 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {info !== null && processFlow[info] && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 18, background: 'var(--muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: processFlow[info].color, color: '#fff', fontSize: 11, fontWeight: 800 }}>
                    STEP {processFlow[info].step}
                  </span>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{processFlow[info].label}</h3>
                </div>
                <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, marginBottom: 12 }}>
                  {processFlow[info].desc}
                </div>
                <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.6, color: 'inherit' }}>
                  {processFlow[info].detail}
                </p>

                <div style={{ padding: 10, borderRadius: 6, background: 'color-mix(in oklch, var(--card) 60%, transparent)', border: '1px solid var(--border)', fontSize: 11.5 }}>
                  <strong>How to use this in NEXGI:</strong>
                  <div style={{ color: 'var(--muted-foreground)', marginTop: 4 }}>
                    {info === 0 && 'Go to Cameras & Video Feeds to add HTTP, RTSP or local video files.'}
                    {info === 1 && 'Visit Video Intelligence to upload footage or browse your private recordings library.'}
                    {info === 2 && 'In Video Intelligence, click the sparkles (✨) button to trigger AWS vision processing.'}
                    {info === 3 && 'Visit AI Search to run semantic natural language queries across all indexed cameras.'}
                    {info === 4 && 'Spatial Memory displays multi-camera connections and cross-camera topology.'}
                    {info === 5 && 'Verify matched events with normalized bounding boxes, timestamps, and confidence ratings in Investigations.'}
                    {info === 6 && 'Open Object Tracking to inspect real-time movement trajectories on the interactive Leaflet map.'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid var(--border)', px: 3 }}>
          <Button onClick={() => setInfo(prev => (prev !== null && prev > 0 ? prev - 1 : 0))} disabled={info === 0}>
            Previous Step
          </Button>
          <Button onClick={() => setInfo(prev => (prev !== null && prev < processFlow.length - 1 ? prev + 1 : prev))} disabled={info === processFlow.length - 1} variant="outlined">
            Next Step
          </Button>
          <Button onClick={() => setInfo(null)} variant="contained" sx={{ ml: 'auto' }}>
            Got It
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Featured Cameras ── */}
      <section className="public-section">
        <div className="public-section-heading">
          <div>
            <span className="eyebrow">CAMERA NETWORK</span>
            <h2>Live cameras with intelligence.</h2>
          </div>
          <Button component={Link} to="/cameras" endIcon={<ArrowForward />}>
            View All Cameras
          </Button>
        </div>

        <div className="featured-cameras-grid">
          {featuredCameras.map(cam => (
            <div key={cam.id} className="feat-cam-card">
              <div className="feat-cam-header">
                <div className="feat-cam-id-badge">
                  <VideocamOutlined sx={{ fontSize: 13 }} />
                  {cam.id}
                </div>
                <Chip
                  label={`● ${cam.status}`}
                  size="small"
                  sx={{ background: 'color-mix(in oklch,var(--danger) 18%,transparent)', color: 'var(--danger)', fontSize: 9, height: 20 }}
                />
              </div>
              <div className="feat-cam-preview">
                <img src={cam.thumb} alt={cam.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div className="feat-cam-scan" />
                <div className="feat-cam-overlay-grid" />
                <div className="feat-cam-info">
                  <FlashOnOutlined sx={{ fontSize: 12 }} />
                  AI Tracking Active
                </div>
              </div>
              <div className="feat-cam-body">
                <strong>{cam.name}</strong>
                <p>{cam.location}</p>
                <div className="feat-cam-specs">
                  <span>{cam.res}</span>
                  <span>{cam.fps}</span>
                </div>
                <div className="feat-cam-tags">
                  {cam.tags.map(t => (
                    <span key={t} className="feat-cam-tag">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Workflow Section ── */}
      <section className="public-section workflow-bg-section">
        <div className="public-section-heading">
          <div>
            <span className="eyebrow">FROM FOOTAGE TO EVIDENCE</span>
            <h2>A clearer path to the right moment.</h2>
          </div>
          <Button component={Link} to="/about" endIcon={<ArrowForward />}>
            About NEXGI Vision
          </Button>
        </div>
        <div className="workflow-grid">
          {[
            { icon: UploadFile, n: '01', title: 'Bring your footage', text: 'Your recordings, organized by camera ID, location, and time — always traceable.' },
            { icon: ManageSearch, n: '02', title: 'Ask your question', text: 'Search across cameras in natural language. AI understands context, not just keywords.' },
            { icon: VerifiedOutlined, n: '03', title: 'Verify the evidence', text: 'Review matching clips, timestamps, confidence scores and bounding boxes before drawing conclusions.' },
          ].map(s => (
            <article key={s.n}>
              <div className="workflow-top">
                <s.icon />
                <span>{s.n}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="cta-banner">
        <div className="cta-glow" />
        <span className="eyebrow">GET STARTED</span>
        <h2>Ready to see your footage like never before?</h2>
        <p>Connect your camera network and start searching in minutes.</p>
        <div className="hero-actions" style={{ justifyContent: 'center', marginTop: 28 }}>
          {user ? (
            <Button component={Link} to="/dashboard" variant="contained" endIcon={<ArrowForward />} size="large">
              Open Dashboard
            </Button>
          ) : (
            <Button onClick={() => signIn('/dashboard')} variant="contained" endIcon={<ArrowForward />} size="large">
              Start Free
            </Button>
          )}
          <Button component={Link} to="/about" variant="outlined" size="large">
            Learn More
          </Button>
        </div>
      </section>
    </>
  );
}

export function About() {
  const { signIn, user } = useSession();
  return (
    <>
      <section className="about-intro public-section">
        <span className="eyebrow">ABOUT NEXGI VISION</span>
        <h1>Evidence first.<br />Every investigation.</h1>
        <p className="about-lead">
          NEXGI Vision gives security operators a focused platform to manage cameras, index footage,
          and surface the exact moments that matter — with AI confidence and full traceability.
        </p>
      </section>
      <section className="about-image">
        <img src={hero} alt="NEXGI Vision Command Center" />
        <Chip label="Video Intelligence · 3D Command Center" />
      </section>
      <section className="public-section about-details">
        <div>
          <span className="eyebrow">SEARCH. TRACE. VERIFY.</span>
          <h2>Context makes the difference.</h2>
        </div>
        <div>
          <p>
            A result is only useful when you can trace it back to its source. NEXGI Vision brings camera
            identity, recording time, detected objects, confidence scores, and matching clips into one
            evidence review — all in real time.
          </p>
          <h3>Your footage. Your workspace.</h3>
          <p>
            Sign in to add cameras with custom IDs, upload private recordings and save investigations.
            The sample demo is separate from your records and clearly marked.
          </p>
          <h3>Connected intelligence, not simulated certainty.</h3>
          <p>
            Computer vision and AI processing run on your external AWS service. NEXGI Vision is the
            operator interface. Sample detections demonstrate the review experience; they are not live intelligence.
          </p>
          {user ? (
            <Button component={Link} to="/dashboard" variant="contained" endIcon={<ArrowForward />}>
              Open Dashboard
            </Button>
          ) : (
            <Button onClick={() => signIn('/dashboard')} variant="contained" endIcon={<ArrowForward />}>
              Enter Workspace
            </Button>
          )}
        </div>
      </section>
    </>
  );
}
