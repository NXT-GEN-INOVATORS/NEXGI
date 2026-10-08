import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Paper, Chip, ToggleButton, ToggleButtonGroup, Button, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  IconButton, Tooltip, MenuItem, Tabs, Tab
} from '@mui/material';
import {
  AddCircleOutlined, VideocamOutlined, Refresh, PlayArrow,
  MyLocationOutlined, RouteOutlined, DeleteOutlined, InfoOutlined
} from '@mui/icons-material';
import { PageHeading } from './Common';

export type CameraPoint = {
  id: string;
  name: string;
  zone: string;
  pos: [number, number]; // [lat, lng] camera fixed mounting location
  coverageRadius?: number; // visual coverage radius in meters
};

export type ObjectDetectionPoint = {
  id: string;
  camId: string;
  time: string;
  conf: number;
  // Exact object estimated coordinate (ground position within camera field of view or GPS track)
  objectPos?: [number, number];
  note?: string;
};

// Registered Camera Infrastructure network
const INITIAL_CAMERAS: CameraPoint[] = [
  { id: 'CAM-01', name: 'Front Entrance', zone: 'North Wing · Gate 1', pos: [12.9716, 77.5946], coverageRadius: 40 },
  { id: 'CAM-02', name: 'Loading Bay East', zone: 'Warehouse Logistics', pos: [12.9724, 77.5963], coverageRadius: 50 },
  { id: 'CAM-03', name: 'Main Security Gate', zone: 'Perimeter Access Point', pos: [12.9708, 77.5935], coverageRadius: 60 },
  { id: 'CAM-04', name: 'Visitor Parking', zone: 'Exterior South Lot', pos: [12.9696, 77.5952], coverageRadius: 65 },
  { id: 'CAM-05', name: 'Building B Walkway', zone: 'Pedestrian Transit Corridor', pos: [12.9712, 77.5972], coverageRadius: 45 },
  { id: 'CAM-06', name: 'Server Room Corridor', zone: 'Restricted Access Zone 3', pos: [12.9730, 77.5948], coverageRadius: 35 },
];

export function ObjectTracking() {
  const [cameras, setCameras] = useState<CameraPoint[]>(() => {
    try {
      const saved = localStorage.getItem('nexgi_tracking_cameras');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Storage read failed', e);
    }
    return INITIAL_CAMERAS;
  });

  // Tracked Objects with real object coordinates distinct from camera mount positions
  const [objects, setObjects] = useState<Record<string, {
    label: string;
    type: string;
    color: string;
    sightings: ObjectDetectionPoint[];
  }>>({
    'person-red': {
      label: 'Person · Red Jacket (ID: #842)',
      type: 'Person',
      color: '#ef4444',
      sightings: [
        // 1. Observed walking near Main Security Gate (approx 20m from pole)
        { id: 'S1', camId: 'CAM-03', time: '08:02:14', conf: 94, objectPos: [12.9709, 77.5937], note: 'Entered outer pedestrian turnstile' },
        // 2. Observed moving north-east along sidewalk towards Front Entrance
        { id: 'S2', camId: 'CAM-01', time: '08:03:41', conf: 91, objectPos: [12.9714, 77.5944], note: 'Crossed courtyard plaza path' },
        // 3. Observed corridor lobby exterior near Server Room wing
        { id: 'S3', camId: 'CAM-06', time: '08:05:09', conf: 88, objectPos: [12.9727, 77.5949], note: 'Walkway intersection towards East Wing' },
        // 4. Observed walkway east corridor
        { id: 'S4', camId: 'CAM-05', time: '08:07:30', conf: 90, objectPos: [12.9713, 77.5969], note: 'Approached Building B east portico' },
      ]
    },
    'vehicle-white': {
      label: 'Vehicle · White Van (Plate: KA-01-E-4920)',
      type: 'Vehicle',
      color: '#3b82f6',
      sightings: [
        { id: 'V1', camId: 'CAM-04', time: '07:51:02', conf: 96, objectPos: [12.9698, 77.5954], note: 'Departed Visitor Parking driveway' },
        { id: 'V2', camId: 'CAM-03', time: '07:53:48', conf: 95, objectPos: [12.9707, 77.5938], note: 'Perimeter perimeter service road lane 2' },
        { id: 'V3', camId: 'CAM-02', time: '07:57:20', conf: 92, objectPos: [12.9722, 77.5961], note: 'Docking bay loading ramp entrance' },
      ]
    },
    'forklift': {
      label: 'Industrial Forklift · FL-12',
      type: 'Equipment',
      color: '#f59e0b',
      sightings: [
        { id: 'F1', camId: 'CAM-02', time: '09:10:05', conf: 89, objectPos: [12.9723, 77.5964], note: 'Warehouse yard staging' },
        { id: 'F2', camId: 'CAM-01', time: '09:14:27', conf: 86, objectPos: [12.9717, 77.5948], note: 'North wing transit lane' },
      ]
    },
  });

  const [objKey, setObjKey] = useState('person-red');
  const [step, setStep] = useState(0);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showCameraLinks, setShowCameraLinks] = useState(true);

  // Add Camera Modal State
  const [addCamOpen, setAddCamOpen] = useState(false);
  const [newCam, setNewCam] = useState({
    id: `CAM-0${cameras.length + 1}`,
    name: '',
    zone: '',
    lat: '12.9719',
    lng: '77.5955',
    coverageRadius: '50'
  });

  // Add Object Sighting Modal State
  const [addSightingOpen, setAddSightingOpen] = useState(false);
  const [newSighting, setNewSighting] = useState({
    camId: cameras[0]?.id || 'CAM-01',
    time: '08:10:00',
    conf: '90',
    lat: '12.9715',
    lng: '77.5950',
    note: 'Detected in camera field of view'
  });

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const activeObj = objects[objKey] || objects['person-red']!;
  const sightings = activeObj.sightings;
  const visibleSightings = useMemo(() => sightings.slice(0, step + 1), [sightings, step]);

  // Persist cameras locally
  useEffect(() => {
    try {
      localStorage.setItem('nexgi_tracking_cameras', JSON.stringify(cameras));
    } catch (e) {
      console.warn('Storage write failed', e);
    }
  }, [cameras]);

  useEffect(() => {
    if (activeObj) {
      setStep(activeObj.sightings.length - 1);
    }
  }, [objKey]);

  // Init Leaflet map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !mapEl.current || mapRef.current) return;
      LRef.current = L;

      // Fix standard leaflet icon path issues in bundlers
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapEl.current).setView([12.9715, 77.5952], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors | NEXGI Vision Intelligence',
        maxZoom: 19
      }).addTo(map);

      // Clicking map while adding auto-fills coordinates
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        setNewCam(c => ({ ...c, lat: lat.toFixed(5), lng: lng.toFixed(5) }));
        setNewSighting(s => ({ ...s, lat: lat.toFixed(5), lng: lng.toFixed(5) }));
      });

      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Render on map: Fixed Cameras + Actual Object Trajectory Path
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();

    // 1. Plot all Fixed Physical Cameras
    const activeCameraIds = new Set(visibleSightings.map(s => s.camId));

    cameras.forEach(c => {
      const isWitness = activeCameraIds.has(c.id);

      // Camera Field of View / Coverage Circle
      if (showCoverage) {
        L.circle(c.pos, {
          radius: c.coverageRadius || 45,
          color: isWitness ? activeObj.color : '#64748b',
          weight: 1,
          opacity: 0.5,
          fillColor: isWitness ? activeObj.color : '#94a3b8',
          fillOpacity: isWitness ? 0.12 : 0.04,
          dashArray: '3 3'
        }).addTo(layer);
      }

      // Camera Mount Marker (Custom CCTV Icon)
      const cctvIcon = L.divIcon({
        className: '',
        html: `
          <div style="
            background: ${isWitness ? 'var(--card, #1e293b)' : '#334155'};
            color: ${isWitness ? activeObj.color : '#94a3b8'};
            border: 2px solid ${isWitness ? activeObj.color : '#64748b'};
            border-radius: 6px;
            padding: 3px 6px;
            font-size: 10px;
            font-weight: 700;
            font-family: monospace;
            display: flex;
            align-items: center;
            gap: 4px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            white-space: nowrap;
          ">
            <span>📷</span>
            <span>${c.id}</span>
          </div>
        `,
        iconSize: [60, 24],
        iconAnchor: [30, 12]
      });

      L.marker(c.pos, { icon: cctvIcon })
        .bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; min-width: 180px;">
            <strong style="font-size: 13px; color: #0284c7;">📹 ${c.id} · ${c.name}</strong>
            <div style="color: #64748b; font-size: 11px; margin: 4px 0;">Zone: ${c.zone}</div>
            <div style="margin-top: 6px; padding: 4px 6px; background: #f1f5f9; border-radius: 4px;">
              <div>Mount GPS: <code>${c.pos[0].toFixed(5)}, ${c.pos[1].toFixed(5)}</code></div>
              <div>Coverage Radius: ${c.coverageRadius || 45}m</div>
            </div>
            ${isWitness ? `<div style="margin-top: 6px; color: ${activeObj.color}; font-weight: 700;">● Detected: ${activeObj.label}</div>` : ''}
          </div>
        `)
        .addTo(layer);
    });

    // 2. Object Actual Trajectory Points (distinct coordinates of where the object moved!)
    const objectPositions: [number, number][] = [];

    visibleSightings.forEach((s, idx) => {
      const associatedCam = cameras.find(c => c.id === s.camId);
      // If sighting has specific estimated object position, use it. Otherwise offset from camera
      const objPos: [number, number] = s.objectPos
        ? s.objectPos
        : associatedCam
          ? [associatedCam.pos[0] + 0.0003, associatedCam.pos[1] + 0.0003]
          : [12.9715, 77.5952];

      objectPositions.push(objPos);

      // Camera sightline connection: draws ray from camera to observed object ground position
      if (showCameraLinks && associatedCam) {
        L.polyline([associatedCam.pos, objPos], {
          color: activeObj.color,
          weight: 1.5,
          opacity: 0.5,
          dashArray: '3 4'
        }).bindTooltip(`Sightline: ${associatedCam.id} observing object`).addTo(layer);
      }

      // Object Sighting Marker (Circle with chronological step number)
      const objMarkerIcon = L.divIcon({
        className: '',
        html: `
          <div style="
            background: ${activeObj.color};
            color: #ffffff;
            border-radius: 50%;
            width: 26px;
            height: 26px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 800;
            border: 2.5px solid #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.45);
          ">
            ${idx + 1}
          </div>
        `,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      L.marker(objPos, { icon: objMarkerIcon })
        .bindTooltip(`
          <div style="font-size: 12px; line-height: 1.4;">
            <strong>Step ${idx + 1}: ${activeObj.label}</strong><br/>
            Captured by: <b>${s.camId}</b> · ${s.time}<br/>
            Confidence: <b>${s.conf}%</b><br/>
            ${s.note ? `<em>"${s.note}"</em>` : ''}
          </div>
        `)
        .addTo(layer);
    });

    // 3. Draw Actual Object Movement Polyline (Path traveled by the object)
    if (objectPositions.length > 1) {
      // Main trajectory path
      L.polyline(objectPositions, {
        color: activeObj.color,
        weight: 4,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(layer);

      // Animated-style directional dashed line on top
      L.polyline(objectPositions, {
        color: '#ffffff',
        weight: 1.5,
        opacity: 0.7,
        dashArray: '6 8'
      }).addTo(layer);
    }

    // Adjust view bounds to fit all visible points
    const allPoints = [...objectPositions, ...cameras.map(c => c.pos)];
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds.pad(0.2), { maxZoom: 18 });
    }
  }, [ready, cameras, visibleSightings, activeObj, showCoverage, showCameraLinks]);

  // Handle Add Camera
  function handleAddCameraSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lat = parseFloat(newCam.lat);
    const lng = parseFloat(newCam.lng);
    const radius = parseFloat(newCam.coverageRadius) || 45;

    if (isNaN(lat) || isNaN(lng)) return;

    const added: CameraPoint = {
      id: newCam.id.trim() || `CAM-0${cameras.length + 1}`,
      name: newCam.name.trim() || 'New Perimeter Camera',
      zone: newCam.zone.trim() || 'Facility Sector',
      pos: [lat, lng],
      coverageRadius: radius
    };

    setCameras(prev => [...prev, added]);
    setAddCamOpen(false);
    setNewCam({
      id: `CAM-0${cameras.length + 2}`,
      name: '',
      zone: '',
      lat: '12.9719',
      lng: '77.5955',
      coverageRadius: '50'
    });
  }

  // Handle Add Object Sighting
  function handleAddSightingSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lat = parseFloat(newSighting.lat);
    const lng = parseFloat(newSighting.lng);
    const conf = parseInt(newSighting.conf, 10) || 90;

    if (isNaN(lat) || isNaN(lng)) return;

    const newPoint: ObjectDetectionPoint = {
      id: `S-${Date.now()}`,
      camId: newSighting.camId,
      time: newSighting.time,
      conf,
      objectPos: [lat, lng],
      note: newSighting.note
    };

    setObjects(prev => {
      const current = prev[objKey];
      if (!current) return prev;
      return {
        ...prev,
        [objKey]: {
          ...current,
          sightings: [...current.sightings, newPoint]
        }
      };
    });

    setAddSightingOpen(false);
  }

  function deleteCamera(camId: string) {
    setCameras(prev => prev.filter(c => c.id !== camId));
  }

  return (
    <>
      <PageHeading
        title="Object Tracking & Camera Trajectory"
        subtitle="Distinguish stationary camera mounts from dynamic object movement coordinates on a live Leaflet map."
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button
              variant="contained"
              startIcon={<AddCircleOutlined />}
              onClick={() => setAddCamOpen(true)}
            >
              Add Camera to Map
            </Button>
            <Button
              variant="outlined"
              startIcon={<RouteOutlined />}
              onClick={() => setAddSightingOpen(true)}
            >
              Add Object Sighting
            </Button>
          </div>
        }
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        <strong>Physical Camera Mounts vs Object Movement Path:</strong> Cameras (📷) are fixed surveillance sensors with designated coverage radii. The line ({activeObj.color}) tracks the actual physical movement path of <strong>{activeObj.label}</strong> across the premises.
      </Alert>

      {/* Control Bar */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={objKey}
          onChange={(_e, v) => v && setObjKey(v)}
        >
          {Object.entries(objects).map(([k, o]) => (
            <ToggleButton key={k} value={k}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: o.color, marginRight: 6 }} />
              {o.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Chip
          label={`${visibleSightings.length}/${sightings.length} sightings active`}
          variant="outlined"
          color="primary"
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="small" variant="outlined" onClick={() => setStep(0)}>
            Replay
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={step >= sightings.length - 1}
            onClick={() => setStep(s => Math.min(sightings.length - 1, s + 1))}
          >
            Next Sighting
          </Button>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          <Button
            size="small"
            variant={showCoverage ? 'contained' : 'outlined'}
            color="inherit"
            onClick={() => setShowCoverage(v => !v)}
            sx={{ fontSize: 11 }}
          >
            {showCoverage ? 'Hide Coverage Radii' : 'Show Coverage Radii'}
          </Button>
          <Button
            size="small"
            variant={showCameraLinks ? 'contained' : 'outlined'}
            color="inherit"
            onClick={() => setShowCameraLinks(v => !v)}
            sx={{ fontSize: 11 }}
          >
            {showCameraLinks ? 'Hide Sightlines' : 'Show Sightlines'}
          </Button>
        </div>
      </div>

      {/* Main Grid: Leaflet Map & Movement Timeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.1fr) minmax(280px,1fr)', gap: 16 }}>
        <Paper variant="outlined" sx={{ overflow: 'hidden', position: 'relative' }}>
          <div ref={mapEl} style={{ height: 560, width: '100%' }} />
          <div style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            background: 'var(--card, #fff)',
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            fontSize: 11,
            zIndex: 1000,
            display: 'flex',
            gap: 16,
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>📷</span> <span>Fixed Camera Mount</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 14, height: 4, background: activeObj.color, borderRadius: 2 }} />
              <span>Actual Object Path</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2px dashed ${activeObj.color}` }} />
              <span>Camera Sightline</span>
            </div>
          </div>
        </Paper>

        {/* Right Sidebar: Timeline & Camera Manager */}
        <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 560, overflowY: 'auto' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Object Movement Timeline</h3>
              <Chip label={activeObj.type} size="small" sx={{ height: 18, fontSize: 9 }} />
            </div>
            <p className="subtitle" style={{ fontSize: 11, margin: '0 0 12px' }}>
              Chronological track of observed object positions:
            </p>

            {sightings.map((s, i) => {
              const c = cameras.find(cam => cam.id === s.camId);
              const isShown = i <= step;
              const pos = s.objectPos || c?.pos || [0, 0];

              return (
                <div
                  key={s.id || i}
                  onClick={() => setStep(i)}
                  style={{
                    cursor: 'pointer',
                    opacity: isShown ? 1 : 0.35,
                    borderLeft: `4px solid ${activeObj.color}`,
                    padding: '8px 12px',
                    marginBottom: 8,
                    borderRadius: '0 6px 6px 0',
                    background: isShown ? 'var(--muted)' : 'transparent',
                    border: '1px solid var(--border)',
                    borderLeftWidth: 4,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 12 }}>
                      {i + 1}. {s.time}
                    </strong>
                    <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700 }}>
                      {s.conf}% conf
                    </span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', marginTop: 2 }}>
                    Captured by {s.camId} ({c?.name || 'Perimeter Camera'})
                  </div>
                  <div className="subtitle" style={{ fontSize: 10, marginTop: 2 }}>
                    Ground Coord: {pos[0].toFixed(5)}, {pos[1].toFixed(5)}
                  </div>
                  {s.note && (
                    <div style={{ fontSize: 10.5, fontStyle: 'italic', marginTop: 3, color: 'var(--muted-foreground)' }}>
                      "{s.note}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Connected Cameras list */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Mapped Cameras ({cameras.length})</h3>
              <Button size="small" onClick={() => setAddCamOpen(true)} sx={{ fontSize: 11, p: 0 }}>
                + Add Cam
              </Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cameras.map(c => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 4,
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    fontSize: 11
                  }}
                >
                  <div>
                    <strong>{c.id}</strong> · <span>{c.name}</span>
                    <div style={{ fontSize: 9.5, color: 'var(--muted-foreground)' }}>
                      {c.pos[0].toFixed(4)}, {c.pos[1].toFixed(4)} ({c.coverageRadius || 45}m radius)
                    </div>
                  </div>
                  <Tooltip title="Delete camera from map">
                    <IconButton size="small" color="error" onClick={() => deleteCamera(c.id)}>
                      <DeleteOutlined sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                </div>
              ))}
            </div>
          </div>
        </Paper>
      </div>

      {/* Dialog: Add Camera to Map */}
      <Dialog open={addCamOpen} onClose={() => setAddCamOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleAddCameraSubmit}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VideocamOutlined color="primary" /> Add Camera to Map
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <p className="subtitle" style={{ fontSize: 12, margin: 0 }}>
              Specify the physical mount coordinates of this surveillance camera. You can click on the map anytime to populate coordinates.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TextField
                required
                label="Camera ID"
                size="small"
                value={newCam.id}
                onChange={e => setNewCam({ ...newCam, id: e.target.value })}
                placeholder="CAM-07"
              />
              <TextField
                required
                label="Camera Name"
                size="small"
                value={newCam.name}
                onChange={e => setNewCam({ ...newCam, name: e.target.value })}
                placeholder="South Gate"
              />
            </div>
            <TextField
              required
              label="Zone / Sector"
              size="small"
              value={newCam.zone}
              onChange={e => setNewCam({ ...newCam, zone: e.target.value })}
              placeholder="Perimeter Sector B"
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TextField
                required
                label="Latitude"
                size="small"
                type="number"
                slotProps={{ htmlInput: { step: '0.00001' } }}
                value={newCam.lat}
                onChange={e => setNewCam({ ...newCam, lat: e.target.value })}
              />
              <TextField
                required
                label="Longitude"
                size="small"
                type="number"
                slotProps={{ htmlInput: { step: '0.00001' } }}
                value={newCam.lng}
                onChange={e => setNewCam({ ...newCam, lng: e.target.value })}
              />
            </div>
            <TextField
              label="Coverage Radius (meters)"
              size="small"
              type="number"
              value={newCam.coverageRadius}
              onChange={e => setNewCam({ ...newCam, coverageRadius: e.target.value })}
              helperText="Field of view radius shown on map"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddCamOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Pin Camera to Map</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Dialog: Add Object Sighting */}
      <Dialog open={addSightingOpen} onClose={() => setAddSightingOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleAddSightingSubmit}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RouteOutlined color="primary" /> Add Object Sighting Coordinate
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <p className="subtitle" style={{ fontSize: 12, margin: 0 }}>
              Plot a new ground coordinate where <strong>{activeObj.label}</strong> was detected by a camera sensor.
            </p>
            <TextField
              select
              required
              label="Observing Camera"
              size="small"
              value={newSighting.camId}
              onChange={e => setNewSighting({ ...newSighting, camId: e.target.value })}
            >
              {cameras.map(c => (
                <MenuItem key={c.id} value={c.id}>
                  {c.id} — {c.name} ({c.zone})
                </MenuItem>
              ))}
            </TextField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TextField
                required
                label="Timestamp"
                size="small"
                value={newSighting.time}
                onChange={e => setNewSighting({ ...newSighting, time: e.target.value })}
                placeholder="08:12:30"
              />
              <TextField
                required
                label="Confidence %"
                size="small"
                type="number"
                value={newSighting.conf}
                onChange={e => setNewSighting({ ...newSighting, conf: e.target.value })}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TextField
                required
                label="Object Ground Lat"
                size="small"
                type="number"
                slotProps={{ htmlInput: { step: '0.00001' } }}
                value={newSighting.lat}
                onChange={e => setNewSighting({ ...newSighting, lat: e.target.value })}
              />
              <TextField
                required
                label="Object Ground Lng"
                size="small"
                type="number"
                slotProps={{ htmlInput: { step: '0.00001' } }}
                value={newSighting.lng}
                onChange={e => setNewSighting({ ...newSighting, lng: e.target.value })}
              />
            </div>
            <TextField
              label="Detection Details / Note"
              size="small"
              value={newSighting.note}
              onChange={e => setNewSighting({ ...newSighting, note: e.target.value })}
              placeholder="e.g. Walking along path heading East"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddSightingOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Add to Trajectory</Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
