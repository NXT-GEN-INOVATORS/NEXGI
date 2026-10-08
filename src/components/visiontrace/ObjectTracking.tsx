import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Paper,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Tooltip,
  MenuItem,
  Tabs,
  Tab,
  CircularProgress,
  InputAdornment,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  AddCircleOutlined,
  VideocamOutlined,
  Refresh,
  PlayArrow,
  MyLocationOutlined,
  RouteOutlined,
  DeleteOutlined,
  InfoOutlined,
  Search,
  AutoAwesomeOutlined,
  CloudDownloadOutlined,
  StorageOutlined,
  CheckCircleOutlined,
  TimerOutlined,
  PinDropOutlined,
  SaveOutlined,
  FlagOutlined,
  MemoryOutlined,
  ChatOutlined,
} from '@mui/icons-material';
import { PageHeading } from './Common';
import { VoiceInput } from './VoiceInput';
import { SpeechPlayer } from './SpeechPlayer';
import { backendUrl, resolveMediaUrl } from '@/lib/visiontrace/data';

export type CameraPoint = {
  id: string;
  name: string;
  zone: string;
  pos: [number, number]; // [lat, lng] camera fixed mounting location
  coverageRadius?: number; // visual coverage radius in meters
  stream_url?: string;
  status?: string;
  db_source?: string;
};

export type ObjectDetectionPoint = {
  id: string;
  camId: string;
  time: string;
  conf: number;
  objectPos?: [number, number];
  note?: string;
};

export type MapMarking = {
  id: string;
  label: string;
  category: 'poi' | 'checkpoint' | 'incident' | 'evidence';
  pos: [number, number];
  color: string;
  note?: string;
  time: string;
};

// Initial empty default objects (zero fake Bangalore coordinates)
const DEFAULT_TRACKED_OBJECTS: Record<string, {
  label: string;
  type: string;
  color: string;
  sightings: ObjectDetectionPoint[];
}> = {
  'person-red': {
    label: 'Person · Red Jacket (ID: #842)',
    type: 'Person',
    color: '#ef4444',
    sightings: [],
  },
  'vehicle-white': {
    label: 'Vehicle · White Van (Plate: KA-01-E-4920)',
    type: 'Vehicle',
    color: '#3b82f6',
    sightings: [],
  },
  'forklift': {
    label: 'Industrial Forklift · FL-12',
    type: 'Equipment',
    color: '#f59e0b',
    sightings: [],
  },
};

// Initial default registered cameras (empty by default)
const INITIAL_CAMERAS: CameraPoint[] = [];

export function ObjectTracking() {
  const [cameras, setCameras] = useState<CameraPoint[]>(() => {
    try {
      const saved = localStorage.getItem('nexgi_tracking_cameras');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // If the cached list has the legacy default cameras (CAM-01 to CAM-06 with Front Entrance etc), purge them
          const isLegacyDefaults = parsed.some(
            (c) => c.id === 'CAM-01' && c.name === 'Front Entrance'
          );
          if (isLegacyDefaults) {
            localStorage.removeItem('nexgi_tracking_cameras');
            return [];
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Storage read failed', e);
    }
    return INITIAL_CAMERAS;
  });

  // Selected Camera for Live Feed and AI Search (null when no cameras registered)
  const [selectedCam, setSelectedCam] = useState<CameraPoint | null>(() => {
    return cameras.length > 0 ? cameras[0] : null;
  });

  // Keep selectedCam in sync with cameras list
  useEffect(() => {
    if (!selectedCam && cameras.length > 0) {
      setSelectedCam(cameras[0]);
    } else if (selectedCam && !cameras.some((c) => c.id === selectedCam.id)) {
      setSelectedCam(cameras[0] || null);
    }
  }, [cameras, selectedCam]);

  // Database URL configuration
  const [dbUrl, setDbUrl] = useState<string>(`${backendUrl}/api/cameras`);
  const [dbStatus, setDbStatus] = useState<string>('Connected to Local AI DB');
  const [dbLoading, setDbLoading] = useState(false);

  // Live Location State
  const [userLivePos, setUserLivePos] = useState<[number, number] | null>(null);
  const [liveLocationLoaded, setLiveLocationLoaded] = useState(false);

  // Right-hand Panel Tabs: 'ai-search' | 'timeline' | 'markings'
  const [rightTab, setRightTab] = useState<'ai-search' | 'timeline' | 'markings'>('ai-search');

  // Map click interaction mode: 'off' (prompt chooser) | 'camera' | 'sighting' | 'marking'
  const [assignMode, setAssignMode] = useState<'off' | 'camera' | 'sighting' | 'marking'>('off');
  const assignModeRef = useRef(assignMode);
  useEffect(() => {
    assignModeRef.current = assignMode;
  }, [assignMode]);

  // Camera AI Search State
  const [camSearchQuery, setCamSearchQuery] = useState<string>('person in dark jacket');
  const [camSearching, setCamSearching] = useState<boolean>(false);
  const [camSearchResult, setCamSearchResult] = useState<any>(null);
  const [camStreamingText, setCamStreamingText] = useState<string>('');
  const [camIsStreaming, setCamIsStreaming] = useState<boolean>(false);
  const [camStreamElapsedSec, setCamStreamElapsedSec] = useState<number>(0);
  const [camStreamChunksCount, setCamStreamChunksCount] = useState<number>(0);
  const [camStreamMetrics, setCamStreamMetrics] = useState<any>(null);

  // Live Feed Clock Simulator
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(now.toLocaleTimeString() + ' · ' + now.toLocaleDateString());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Multi-Object Movement Tracks (Saved Locally, Zero Fake Bangalore Data)
  const [objects, setObjects] = useState<Record<string, {
    label: string;
    type: string;
    color: string;
    sightings: ObjectDetectionPoint[];
  }>>(() => {
    try {
      const saved = localStorage.getItem('nexgi_tracking_objects');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          // Purge any legacy fake Bangalore data (around lat 12.97 or Bangalore turnstile notes)
          const hasFakeBangalore = Object.values(parsed).some((obj: any) =>
            Array.isArray(obj?.sightings) &&
            obj.sightings.some((s: any) =>
              (s?.objectPos && Math.abs(s.objectPos[0] - 12.97) < 0.05) ||
              (typeof s?.note === 'string' && s.note.toLowerCase().includes('turnstile'))
            )
          );
          if (hasFakeBangalore) {
            localStorage.removeItem('nexgi_tracking_objects');
            return DEFAULT_TRACKED_OBJECTS;
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Storage read for objects failed', e);
    }
    return DEFAULT_TRACKED_OBJECTS;
  });

  // Custom Map Markings / Ground Pins (Saved Locally)
  const [markings, setMarkings] = useState<MapMarking[]>(() => {
    try {
      const saved = localStorage.getItem('nexgi_tracking_markings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Purge any legacy fake Bangalore markings
          const hasFakeBangalore = parsed.some(
            (m: any) => m?.pos && Math.abs(m.pos[0] - 12.97) < 0.05
          );
          if (hasFakeBangalore) {
            localStorage.removeItem('nexgi_tracking_markings');
            return [];
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Storage read for markings failed', e);
    }
    return [];
  });

  // Persist objects (sightings / trajectory markings) locally
  useEffect(() => {
    try {
      localStorage.setItem('nexgi_tracking_objects', JSON.stringify(objects));
    } catch (e) {
      console.warn('Storage write for objects failed', e);
    }
  }, [objects]);

  // Persist custom map markings locally
  useEffect(() => {
    try {
      localStorage.setItem('nexgi_tracking_markings', JSON.stringify(markings));
    } catch (e) {
      console.warn('Storage write for markings failed', e);
    }
  }, [markings]);

  const [objKey, setObjKey] = useState('person-red');
  const [step, setStep] = useState(0);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showCameraLinks, setShowCameraLinks] = useState(true);
  const [qdrantStatus, setQdrantStatus] = useState<any>(null);

  useEffect(() => {
    fetch(`${backendUrl}/api/qdrant/status`)
      .then((r) => r.json())
      .then((d) => setQdrantStatus(d))
      .catch(() => {});
  }, []);

  // Add Camera Modal State
  const [addCamOpen, setAddCamOpen] = useState(false);
  const [newCam, setNewCam] = useState({
    id: cameras.length > 0 ? `CAM-0${cameras.length + 1}` : 'CAM-01',
    name: '',
    zone: '',
    lat: '',
    lng: '',
    coverageRadius: '50',
    stream_url: '',
  });

  // Add Object Sighting Modal State
  const [addSightingOpen, setAddSightingOpen] = useState(false);
  const [newSighting, setNewSighting] = useState({
    camId: cameras[0]?.id || '',
    time: new Date().toLocaleTimeString('en-GB'),
    conf: '90',
    lat: '',
    lng: '',
    note: 'Marked ground position',
  });

  // Add Map Marking / Pin Modal State
  const [addMarkingOpen, setAddMarkingOpen] = useState(false);
  const [newMarking, setNewMarking] = useState({
    label: '',
    category: 'poi' as 'incident' | 'checkpoint' | 'evidence' | 'poi',
    lat: '',
    lng: '',
    color: '#8b5cf6',
    note: '',
  });

  // Map Click Action Chooser Modal
  const [mapClickPromptOpen, setMapClickPromptOpen] = useState(false);
  const [clickedPos, setClickedPos] = useState<[number, number] | null>(null);

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

  // Request Live Geolocation on Load
  const fetchLiveLocation = () => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const live: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserLivePos(live);
          setLiveLocationLoaded(true);
          if (mapRef.current) {
            mapRef.current.setView(live, 17);
          }
          // Pre-populate coordinate states with live position
          setNewCam((prev) => ({
            ...prev,
            lat: prev.lat || live[0].toFixed(5),
            lng: prev.lng || live[1].toFixed(5),
          }));
          setNewSighting((prev) => ({
            ...prev,
            lat: prev.lat || live[0].toFixed(5),
            lng: prev.lng || live[1].toFixed(5),
          }));
          setNewMarking((prev) => ({
            ...prev,
            lat: prev.lat || live[0].toFixed(5),
            lng: prev.lng || live[1].toFixed(5),
          }));
        },
        (err) => {
          console.warn('Live location permission or access unavailable:', err);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  };

  useEffect(() => {
    fetchLiveLocation();
  }, []);

  // Fetch Camera inputs from DB URL
  async function handleFetchDBInputs(urlToFetch?: string) {
    const target = (urlToFetch || dbUrl).trim();
    if (!target) return;
    setDbLoading(true);
    try {
      const res = await fetch(target);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to reach DB endpoint`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.cameras || data.data;
      if (Array.isArray(list)) {
        setCameras(list);
        setSelectedCam(list.length > 0 ? list[0] : null);
        setDbStatus(
          list.length > 0
            ? `DB Connected: Loaded ${list.length} cameras`
            : 'DB Connected: 0 cameras registered'
        );
      } else {
        setDbStatus('DB responded, but found no cameras array');
      }
    } catch (err: any) {
      setDbStatus(`DB Connection note: ${err.message}`);
    } finally {
      setDbLoading(false);
    }
  }

  // Seed Cameras around Live Geolocation
  async function handleSeedAroundLiveLocation() {
    if (!userLivePos) {
      fetchLiveLocation();
      return;
    }
    try {
      const form = new FormData();
      form.append('lat', String(userLivePos[0]));
      form.append('lng', String(userLivePos[1]));
      const res = await fetch(`${backendUrl}/api/cameras/seed-location`, {
        method: 'POST',
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.cameras) {
          setCameras(data.cameras);
          if (mapRef.current) mapRef.current.setView(userLivePos, 17);
          setDbStatus(`Mapped ${data.cameras.length} cameras around live location`);
        }
      }
    } catch {
      // Local offset fallback
      const offsets = [
        [0.0002, -0.0004],
        [0.0008, 0.0008],
        [-0.0006, -0.001],
        [-0.0012, 0.0003],
        [-0.0002, 0.0014],
        [0.001, -0.0003],
      ];
      setCameras((prev) =>
        prev.map((c, idx) => ({
          ...c,
          pos: [
            roundCoord(userLivePos[0] + (offsets[idx]?.[0] ?? 0.0005)),
            roundCoord(userLivePos[1] + (offsets[idx]?.[1] ?? 0.0005)),
          ],
        }))
      );
    }
  }

  function roundCoord(num: number) {
    return Number(num.toFixed(5));
  }

  // Init Leaflet Map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !mapEl.current || mapRef.current) return;
      LRef.current = L;

      // Leaflet icon bundle fix
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const initialCenter: [number, number] = userLivePos || [20.5937, 78.9629];
      const initialZoom = userLivePos ? 17 : 5;
      const map = L.map(mapEl.current).setView(initialCenter, initialZoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors | NEXGI Vision Intelligence',
        maxZoom: 19,
      }).addTo(map);

      // Clicking map: handles placement based on active mode
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        const latStr = lat.toFixed(5);
        const lngStr = lng.toFixed(5);
        setClickedPos([lat, lng]);
        setNewCam((c) => ({ ...c, lat: latStr, lng: lngStr }));
        setNewSighting((s) => ({ ...s, lat: latStr, lng: lngStr }));
        setNewMarking((m) => ({ ...m, lat: latStr, lng: lngStr }));

        const currentMode = assignModeRef.current;
        if (currentMode === 'camera') {
          setAddCamOpen(true);
        } else if (currentMode === 'sighting') {
          setAddSightingOpen(true);
        } else if (currentMode === 'marking') {
          setAddMarkingOpen(true);
        } else {
          setMapClickPromptOpen(true);
        }
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

  // Center map on Live Location when position is discovered
  useEffect(() => {
    if (ready && mapRef.current && userLivePos) {
      mapRef.current.setView(userLivePos, 17);
    }
  }, [userLivePos, ready]);

  // Render on map: Live Location + Cameras + Trajectories
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();

    // 0. Render Live User Location Marker
    if (userLivePos) {
      const liveUserIcon = L.divIcon({
        className: '',
        html: `
          <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
            <div style="
              position: absolute; width: 28px; height: 28px; border-radius: 50%;
              background: rgba(14, 165, 233, 0.35); animation: pulse 1.8s infinite;
            "></div>
            <div style="
              width: 14px; height: 14px; border-radius: 50%;
              background: #0284c7; border: 2.5px solid #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            "></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker(userLivePos, { icon: liveUserIcon })
        .bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px;">
            <strong style="color: #0284c7;">📍 Your Live Location</strong>
            <div style="color: #64748b; font-size: 11px; margin-top: 3px;">
              Lat: ${userLivePos[0].toFixed(5)}, Lng: ${userLivePos[1].toFixed(5)}
            </div>
            <div style="margin-top: 4px; font-size: 10px; color: #16a34a; font-weight: 600;">
              ● GPS Real-Time Fix
            </div>
          </div>
        `)
        .addTo(layer);
    }

    // 1. Plot all Fixed Physical Cameras
    const activeCameraIds = new Set(visibleSightings.map((s) => s.camId));

    cameras.forEach((c) => {
      const isWitness = activeCameraIds.has(c.id);
      const isSelected = selectedCam?.id === c.id;

      // Coverage radius circle
      if (showCoverage) {
        L.circle(c.pos, {
          radius: c.coverageRadius || 45,
          color: isSelected ? '#10b981' : isWitness ? activeObj.color : '#64748b',
          weight: isSelected ? 2 : 1,
          opacity: 0.6,
          fillColor: isSelected ? '#10b981' : isWitness ? activeObj.color : '#94a3b8',
          fillOpacity: isSelected ? 0.16 : isWitness ? 0.12 : 0.04,
          dashArray: '3 3',
        }).addTo(layer);
      }

      // Camera Marker Icon
      const cctvIcon = L.divIcon({
        className: '',
        html: `
          <div style="
            background: ${isSelected ? '#10b981' : isWitness ? 'var(--card, #1e293b)' : '#334155'};
            color: ${isSelected ? '#ffffff' : isWitness ? activeObj.color : '#94a3b8'};
            border: ${isSelected ? '2px solid #ffffff' : isWitness ? `2px solid ${activeObj.color}` : '2px solid #64748b'};
            border-radius: 6px;
            padding: 3px 6px;
            font-size: 10px;
            font-weight: 700;
            font-family: monospace;
            display: flex;
            align-items: center;
            gap: 4px;
            box-shadow: ${isSelected ? '0 0 10px rgba(16, 185, 129, 0.8)' : '0 2px 6px rgba(0,0,0,0.3)'};
            cursor: pointer;
            white-space: nowrap;
          ">
            <span>📹</span>
            <span>${c.id}</span>
          </div>
        `,
        iconSize: [60, 24],
        iconAnchor: [30, 12],
      });

      const marker = L.marker(c.pos, { icon: cctvIcon });

      // Click camera marker -> select camera, switch top feed, and open AI Search on right!
      marker.on('click', () => {
        setSelectedCam(c);
        setRightTab('ai-search');
      });

      marker
        .bindPopup(`
          <div style="font-family: sans-serif; font-size: 12px; min-width: 190px;">
            <strong style="font-size: 13px; color: #0284c7;">📹 ${c.id} · ${c.name}</strong>
            <div style="color: #64748b; font-size: 11px; margin: 4px 0;">Zone: ${c.zone}</div>
            <div style="margin-top: 6px; padding: 4px 6px; background: #f1f5f9; border-radius: 4px; font-size: 10.5px;">
              <div>Mount GPS: <code>${c.pos[0].toFixed(5)}, ${c.pos[1].toFixed(5)}</code></div>
              <div>Coverage: ${c.coverageRadius || 45}m radius</div>
              <div>Stream: <code>${c.stream_url || 'RTSP/HLS Default'}</code></div>
            </div>
            <button id="cam-search-btn-${c.id}" style="
              margin-top: 8px; width: 100%; padding: 5px 8px; background: #0284c7; color: #fff;
              border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;
            ">
              🔍 Open AI Search for ${c.id}
            </button>
          </div>
        `)
        .addTo(layer);
    });

    // 2. Object Actual Trajectory Points
    const objectPositions: [number, number][] = [];

    visibleSightings.forEach((s, idx) => {
      const associatedCam = cameras.find((cam) => cam.id === s.camId);
      const objPos: [number, number] = s.objectPos
        ? s.objectPos
        : associatedCam
        ? [associatedCam.pos[0] + 0.0003, associatedCam.pos[1] + 0.0003]
        : userLivePos
        ? [userLivePos[0] + 0.0002, userLivePos[1] + 0.0002]
        : [20.5937, 78.9629];

      objectPositions.push(objPos);

      // Camera sightline connection
      if (showCameraLinks && associatedCam) {
        L.polyline([associatedCam.pos, objPos], {
          color: activeObj.color,
          weight: 1.5,
          opacity: 0.5,
          dashArray: '3 4',
        })
          .bindTooltip(`Sightline: ${associatedCam.id} observing object`)
          .addTo(layer);
      }

      // Object Sighting Marker
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
        iconAnchor: [13, 13],
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

    // 3. Draw Actual Object Movement Polyline
    if (objectPositions.length > 1) {
      L.polyline(objectPositions, {
        color: activeObj.color,
        weight: 4,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layer);

      L.polyline(objectPositions, {
        color: '#ffffff',
        weight: 1.5,
        opacity: 0.7,
        dashArray: '6 8',
      }).addTo(layer);
    }

    // 4. Render Custom Map Markings / Ground Pins (Locally Saved)
    markings.forEach((m) => {
      const categoryIcons: Record<string, string> = {
        poi: '📍',
        checkpoint: '🚩',
        incident: '⚠️',
        evidence: '🔍',
      };
      const iconGlyph = categoryIcons[m.category] || '📍';
      const pinIcon = L.divIcon({
        className: '',
        html: `
          <div style="
            background: ${m.color || '#8b5cf6'};
            color: #ffffff;
            border-radius: 6px;
            padding: 2px 7px;
            font-size: 11px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 4px;
            border: 2px solid #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            cursor: pointer;
            white-space: nowrap;
          ">
            <span>${iconGlyph}</span>
            <span>${m.label}</span>
          </div>
        `,
        iconSize: [60, 24],
        iconAnchor: [30, 12],
      });

      const mark = L.marker(m.pos, { icon: pinIcon });
      mark.bindPopup(`
        <div style="font-family: sans-serif; font-size: 12px; min-width: 170px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <strong style="color: ${m.color}; font-size: 13px;">${iconGlyph} ${m.label}</strong>
            <span style="font-size: 10px; background: #e2e8f0; padding: 2px 5px; border-radius: 4px; text-transform: uppercase;">${m.category}</span>
          </div>
          <div style="color: #64748b; font-size: 11px;">
            Position: <code>${m.pos[0].toFixed(5)}, ${m.pos[1].toFixed(5)}</code>
          </div>
          <div style="color: #64748b; font-size: 10.5px; margin-top: 2px;">
            Logged at: ${m.time}
          </div>
          ${m.note ? `<div style="margin-top: 5px; padding: 4px 6px; background: #f8fafc; border-radius: 4px; font-style: italic; font-size: 11px;">"${m.note}"</div>` : ''}
          <div style="margin-top: 6px; font-size: 10px; color: #16a34a; font-weight: 600;">
            💾 Saved Locally in Browser
          </div>
        </div>
      `);
      mark.addTo(layer);
    });
  }, [ready, cameras, visibleSightings, activeObj, showCoverage, showCameraLinks, selectedCam, userLivePos, markings]);

  // Handle Add / Assign Camera Submit
  function handleAddCameraSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lat = parseFloat(newCam.lat);
    const lng = parseFloat(newCam.lng);
    const radius = parseFloat(newCam.coverageRadius) || 45;

    if (isNaN(lat) || isNaN(lng)) return;

    const added: CameraPoint = {
      id: newCam.id.trim() || `CAM-0${cameras.length + 1}`,
      name: newCam.name.trim() || 'Perimeter Camera',
      zone: newCam.zone.trim() || 'Assigned Sector',
      pos: [lat, lng],
      coverageRadius: radius,
      stream_url: newCam.stream_url.trim() || `/data/videos/stream_${newCam.id.toLowerCase()}.mp4`,
      status: 'online',
    };

    setCameras((prev) => [...prev, added]);
    setSelectedCam(added);
    setAddCamOpen(false);

    // Also persist to DB endpoint if available
    try {
      fetch(`${backendUrl}/api/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(added),
      }).catch(() => {});
    } catch {}

    setNewCam({
      id: `CAM-0${cameras.length + 2}`,
      name: '',
      zone: '',
      lat: userLivePos ? userLivePos[0].toFixed(5) : '',
      lng: userLivePos ? userLivePos[1].toFixed(5) : '',
      coverageRadius: '50',
      stream_url: '',
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
      note: newSighting.note,
    };

    setObjects((prev) => {
      const current = prev[objKey];
      if (!current) return prev;
      return {
        ...prev,
        [objKey]: {
          ...current,
          sightings: [...current.sightings, newPoint],
        },
      };
    });

    setAddSightingOpen(false);
    setNewSighting({
      camId: cameras[0]?.id || '',
      time: new Date().toLocaleTimeString('en-GB'),
      conf: '90',
      lat: userLivePos ? userLivePos[0].toFixed(5) : '',
      lng: userLivePos ? userLivePos[1].toFixed(5) : '',
      note: 'Marked ground position',
    });
  }

  function deleteSighting(sightingId: string) {
    setObjects((prev) => {
      const current = prev[objKey];
      if (!current) return prev;
      return {
        ...prev,
        [objKey]: {
          ...current,
          sightings: current.sightings.filter((s) => s.id !== sightingId),
        },
      };
    });
  }

  function clearSightingsForActiveObject() {
    setObjects((prev) => {
      const current = prev[objKey];
      if (!current) return prev;
      return {
        ...prev,
        [objKey]: {
          ...current,
          sightings: [],
        },
      };
    });
    setStep(0);
  }

  // Handle Add Custom Map Marking / Pin
  function handleAddMarkingSubmit(e: React.FormEvent) {
    e.preventDefault();
    const lat = parseFloat(newMarking.lat);
    const lng = parseFloat(newMarking.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    const created: MapMarking = {
      id: `MARK-${Date.now()}`,
      label: newMarking.label.trim() || `Pin #${markings.length + 1}`,
      category: newMarking.category,
      pos: [lat, lng],
      color: newMarking.color,
      note: newMarking.note.trim() || undefined,
      time: new Date().toLocaleTimeString('en-GB') + ' ' + new Date().toLocaleDateString(),
    };

    setMarkings((prev) => [...prev, created]);
    setAddMarkingOpen(false);
    setNewMarking({
      label: '',
      category: 'poi',
      lat: userLivePos ? userLivePos[0].toFixed(5) : '',
      lng: userLivePos ? userLivePos[1].toFixed(5) : '',
      color: '#8b5cf6',
      note: '',
    });
  }

  function deleteMarking(id: string) {
    setMarkings((prev) => prev.filter((m) => m.id !== id));
  }

  function clearAllMarkings() {
    setMarkings([]);
    localStorage.removeItem('nexgi_tracking_markings');
  }

  function deleteCamera(camId: string) {
    const remaining = cameras.filter((c) => c.id !== camId);
    setCameras(remaining);
    if (selectedCam?.id === camId) {
      setSelectedCam(remaining.length > 0 ? remaining[0] : null);
    }
    try {
      fetch(`${backendUrl}/api/cameras/${encodeURIComponent(camId)}`, {
        method: 'DELETE',
      }).catch(() => {});
    } catch {}
  }

  function clearAllCameras() {
    setCameras([]);
    setSelectedCam(null);
    localStorage.removeItem('nexgi_tracking_cameras');
    try {
      fetch(`${backendUrl}/api/cameras`, {
        method: 'DELETE',
      }).catch(() => {});
    } catch {}
  }

  // Real-time AI Search for the Selected Camera
  async function streamCameraExplanation(
    framePath: string,
    queryText: string,
    frameNumber?: number,
    timestampStr?: string
  ) {
    setCamIsStreaming(true);
    setCamStreamingText('');
    setCamStreamChunksCount(0);
    setCamStreamElapsedSec(0);
    setCamStreamMetrics(null);

    const startTime = performance.now();
    const timerInterval = setInterval(() => {
      setCamStreamElapsedSec(Number(((performance.now() - startTime) / 1000).toFixed(1)));
    }, 100);

    try {
      const formData = new FormData();
      formData.append('frame_path', framePath);
      formData.append('query', queryText);
      if (frameNumber !== undefined) formData.append('frame_number', String(frameNumber));
      if (timestampStr) formData.append('timestamp_str', timestampStr);

      const res = await fetch(`${backendUrl}/api/video/explain/stream`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No body stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const event = JSON.parse(trimmed.slice(6));
              if (event.type === 'chunk') {
                accumulated = event.accumulated;
                setCamStreamingText(accumulated);
                setCamStreamChunksCount(event.chunk_index);
                if (event.elapsed_generation_seconds !== undefined) {
                  setCamStreamElapsedSec(event.elapsed_generation_seconds);
                }
              } else if (event.type === 'done') {
                clearInterval(timerInterval);
                setCamStreamingText(event.explanation || accumulated);
                setCamStreamMetrics(event);
                setCamIsStreaming(false);
              } else if (event.type === 'error') {
                clearInterval(timerInterval);
                setCamIsStreaming(false);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      clearInterval(timerInterval);
      setCamIsStreaming(false);
    } finally {
      clearInterval(timerInterval);
    }
  }

  async function handleCamAISearch() {
    if (!selectedCam) return;
    const q = camSearchQuery.trim();
    if (!q) return;

    setCamSearching(true);
    setCamSearchResult(null);
    setCamStreamingText('');
    setCamStreamMetrics(null);

    try {
      const formData = new FormData();
      formData.append('query', q);
      formData.append('camera_name', `${selectedCam.id} ${selectedCam.name}`);
      formData.append('max_frames', '16');
      formData.append('sample_fps', '1.0');
      formData.append('call_xai', 'false');

      const res = await fetch(`${backendUrl}/api/video/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Camera AI analysis failed`);
      }

      const data = await res.json();
      setCamSearchResult(data);
      setCamSearching(false);

      if (data.best_matching_frame) {
        void streamCameraExplanation(
          data.best_matching_frame.path,
          q,
          data.best_matching_frame.frame_number,
          data.best_matching_frame.timestamp_str
        );
      }
    } catch (err: any) {
      setCamSearching(false);
    }
  }

  return (
    <>
      <PageHeading
        title="Object Tracking & Live Camera Network"
        subtitle="Live map tracking, physical camera assignment, real-time video feed, and camera-level AI search."
        action={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<AddCircleOutlined />}
              onClick={() => setAddCamOpen(true)}
            >
              Add Camera to Map
            </Button>
            <Button
              variant={userLivePos ? 'contained' : 'outlined'}
              color="info"
              startIcon={<MyLocationOutlined />}
              onClick={fetchLiveLocation}
            >
              {liveLocationLoaded ? 'Center Live Location' : 'Detect My Location'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<RouteOutlined />}
              onClick={() => setAddSightingOpen(true)}
            >
              Add Sighting Coordinate
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<PinDropOutlined />}
              onClick={() => setAddMarkingOpen(true)}
            >
              Add Map Marking
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------------------- */}
      {/* SECTION 1: TOP LIVE SURVEILLANCE FEED & DB URL BAR            */}
      {/* ------------------------------------------------------------- */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 2.5,
          borderRadius: 2,
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.04), rgba(2, 132, 199, 0.04))',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(260px, 1fr)', gap: 16 }}>
          {/* Live CCTV Video Monitor */}
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: '#090d16', color: '#fff' }}>
            <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  display: 'inline-block',
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: selectedCam ? '#ef4444' : '#64748b',
                  animation: selectedCam ? 'pulse 1.5s infinite' : 'none',
                }} />
                <strong style={{ fontSize: 13, letterSpacing: 0.5 }}>
                  {selectedCam ? `LIVE CCTV · ${selectedCam.id}` : 'LIVE CCTV · Standby'}
                </strong>
                {selectedCam ? (
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>({selectedCam.name})</span>
                ) : (
                  <span style={{ fontSize: 11, color: '#64748b' }}>(No Camera Assigned)</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: 'monospace' }}>
                <span style={{ color: selectedCam ? '#22c55e' : '#94a3b8' }}>{selectedCam ? '24 FPS' : '0 FPS'}</span>
                <span>{selectedCam ? '1080p' : 'OFFLINE'}</span>
                <span>{currentTimeStr || '2026-10-08 17:30:00'}</span>
              </div>
            </div>

            {/* Video Viewport / Canvas */}
            <div style={{ position: 'relative', height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
              {selectedCam ? (
                <>
                  <div style={{
                    position: 'absolute', inset: 0, opacity: 0.15,
                    backgroundImage: 'repeating-linear-gradient(0deg, #38bdf8 0px, #38bdf8 1px, transparent 1px, transparent 4px)',
                    pointerEvents: 'none',
                  }} />

                  <div style={{ textAlign: 'center', zIndex: 1 }}>
                    <div style={{ fontSize: 36, marginBottom: 4 }}>📹</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                      {selectedCam.name} — {selectedCam.zone}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' }}>
                      GPS: {selectedCam.pos[0].toFixed(5)}, {selectedCam.pos[1].toFixed(5)} · Latency: 32ms
                    </div>
                  </div>

                  <div style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 2 }}>
                    <Button
                      size="small"
                      variant="contained"
                      color="primary"
                      startIcon={<Search />}
                      onClick={() => setRightTab('ai-search')}
                      sx={{ fontSize: 11, py: 0.5, px: 1.5 }}
                    >
                      AI Search This Camera
                    </Button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', zIndex: 1, padding: '16px 20px' }}>
                  <div style={{ fontSize: 32, marginBottom: 4, opacity: 0.6 }}>📹</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>
                    No Surveillance Cameras Assigned
                  </div>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 10px', maxWidth: 360 }}>
                    Click on the map or click <strong>&quot;Add Camera to Map&quot;</strong> to assign cameras, or fetch from your DB URL.
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<AddCircleOutlined />}
                      onClick={() => setAddCamOpen(true)}
                      sx={{ fontSize: 11 }}
                    >
                      + Add Camera
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      startIcon={<CloudDownloadOutlined />}
                      onClick={() => void handleFetchDBInputs()}
                      sx={{ fontSize: 11 }}
                    >
                      Fetch from DB
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Camera Selectors bar */}
            <div style={{ padding: '8px 12px', background: '#070b14', display: 'flex', gap: 8, overflowX: 'auto', alignItems: 'center' }}>
              {cameras.length === 0 ? (
                <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                  No cameras registered. Click &quot;+ Add Camera&quot; or click anywhere on the map to pin a camera.
                </span>
              ) : (
                cameras.map((c) => (
                  <Chip
                    key={c.id}
                    size="small"
                    clickable
                    label={`${c.id} ${c.name}`}
                    onClick={() => {
                      setSelectedCam(c);
                      setRightTab('ai-search');
                    }}
                    color={selectedCam?.id === c.id ? 'primary' : 'default'}
                    variant={selectedCam?.id === c.id ? 'filled' : 'outlined'}
                    sx={{ fontSize: 11, color: selectedCam?.id === c.id ? '#fff' : '#cbd5e1' }}
                  />
                ))
              )}
            </div>
          </div>

          {/* Database Input URL & Location Sync Card */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 12, background: 'var(--card)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <StorageOutlined color="primary" sx={{ fontSize: 18 }} />
                <strong style={{ fontSize: 13 }}>Camera Database & Stream Input URL</strong>
              </div>
              <p className="subtitle" style={{ fontSize: 11, margin: '0 0 10px' }}>
                Fetch physical cameras and RTSP/HTTP video input feeds from your database endpoint:
              </p>

              <TextField
                fullWidth
                size="small"
                label="Camera Database Endpoint URL"
                value={dbUrl}
                onChange={(e) => setDbUrl(e.target.value)}
                placeholder="http://127.0.0.1:8000/api/cameras or Supabase REST"
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          disabled={dbLoading}
                          onClick={() => handleFetchDBInputs()}
                          title="Fetch cameras from DB"
                        >
                          {dbLoading ? <CircularProgress size={16} /> : <CloudDownloadOutlined fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={dbLoading}
                  startIcon={<CloudDownloadOutlined />}
                  onClick={() => handleFetchDBInputs()}
                >
                  {dbLoading ? 'Fetching...' : 'Fetch Inputs from DB'}
                </Button>
                {userLivePos && (
                  <Button
                    size="small"
                    variant="text"
                    color="secondary"
                    onClick={handleSeedAroundLiveLocation}
                  >
                    Sync Near My Location
                  </Button>
                )}
              </div>
            </div>

            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, flexWrap: 'wrap', gap: 6 }}>
              <span style={{ color: 'var(--muted-foreground)' }}>Status:</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Chip
                  size="small"
                  label={dbStatus}
                  color={dbStatus.includes('Error') ? 'error' : 'success'}
                  variant="outlined"
                  sx={{ height: 20, fontSize: 10 }}
                />
                {qdrantStatus?.connected && (
                  <Chip
                    size="small"
                    icon={<MemoryOutlined sx={{ fontSize: 12 }} />}
                    label={`Qdrant: ${qdrantStatus.total_vectors ?? 0} vectors (768-D)`}
                    color="success"
                    variant="outlined"
                    sx={{ height: 20, fontSize: 10, fontWeight: 600 }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </Paper>

      {/* Control Strip & Map Controls */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
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
          size="small"
        />

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Button size="small" variant="outlined" onClick={() => setStep(0)}>
            Replay
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={step >= sightings.length - 1}
            onClick={() => setStep((s) => Math.min(sightings.length - 1, s + 1))}
          >
            Next Sighting
          </Button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)' }}>
            Map Click Mode:
          </span>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={assignMode}
            onChange={(_e, val) => {
              if (val !== null) setAssignMode(val);
            }}
            sx={{ height: 28 }}
          >
            <ToggleButton value="off" sx={{ fontSize: 10.5, px: 1, py: 0.2 }}>
              Ask on Click
            </ToggleButton>
            <ToggleButton value="camera" sx={{ fontSize: 10.5, px: 1, py: 0.2 }}>
              📹 Pin Cam
            </ToggleButton>
            <ToggleButton value="sighting" sx={{ fontSize: 10.5, px: 1, py: 0.2 }}>
              👣 Sighting
            </ToggleButton>
            <ToggleButton value="marking" sx={{ fontSize: 10.5, px: 1, py: 0.2 }}>
              📍 Ground Pin
            </ToggleButton>
          </ToggleButtonGroup>
        </div>

        <Chip
          icon={<SaveOutlined sx={{ fontSize: 13 }} />}
          label={`Markings Saved Locally (${markings.length} pins · ${sightings.length} sightings · ${cameras.length} cams)`}
          size="small"
          color="success"
          variant="outlined"
          sx={{ fontSize: 10.5, height: 26 }}
        />

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <Button
            size="small"
            variant={showCoverage ? 'contained' : 'outlined'}
            color="inherit"
            onClick={() => setShowCoverage((v) => !v)}
            sx={{ fontSize: 11 }}
          >
            {showCoverage ? 'Hide Coverage' : 'Show Coverage'}
          </Button>
          <Button
            size="small"
            variant={showCameraLinks ? 'contained' : 'outlined'}
            color="inherit"
            onClick={() => setShowCameraLinks((v) => !v)}
            sx={{ fontSize: 11 }}
          >
            {showCameraLinks ? 'Hide Sightlines' : 'Show Sightlines'}
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 2: SPLIT SCREEN: LEAFLET MAP & RIGHT-HAND AI SEARCH   */}
      {/* ------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(320px, 1.2fr)', gap: 16 }}>
        {/* Left Column: Leaflet Map */}
        <Paper variant="outlined" sx={{ overflow: 'hidden', position: 'relative' }}>
          <div ref={mapEl} style={{ height: 600, width: '100%' }} />

          {/* Map Legend Overlay */}
          <div
            style={{
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
              gap: 14,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>📍</span> <span>Live Location</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>📹</span> <span>Cameras ({cameras.length})</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ display: 'inline-block', width: 14, height: 4, background: activeObj.color, borderRadius: 2 }} />
              <span>{activeObj.label} Path</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>🚩</span> <span>Ground Pins ({markings.length})</span>
            </div>
          </div>
        </Paper>

        {/* Right Column: Camera AI Search, Trajectory Timeline & Local Markings */}
        <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', maxHeight: 600, overflowY: 'auto' }}>
          <Tabs
            value={rightTab}
            onChange={(_e, v) => setRightTab(v)}
            sx={{ mb: 2, borderBottom: '1px solid var(--border)', minHeight: 38 }}
          >
            <Tab
              value="ai-search"
              label={selectedCam ? `AI Search: ${selectedCam.id}` : 'AI Search'}
              icon={<Search sx={{ fontSize: 16 }} />}
              iconPosition="start"
              sx={{ fontSize: 11.5, minHeight: 38, py: 0 }}
            />
            <Tab
              value="timeline"
              label={`Sightings (${sightings.length})`}
              icon={<RouteOutlined sx={{ fontSize: 16 }} />}
              iconPosition="start"
              sx={{ fontSize: 11.5, minHeight: 38, py: 0 }}
            />
            <Tab
              value="markings"
              label={`Markings (${markings.length})`}
              icon={<PinDropOutlined sx={{ fontSize: 16 }} />}
              iconPosition="start"
              sx={{ fontSize: 11.5, minHeight: 38, py: 0 }}
            />
          </Tabs>

          {/* --------------------------------------------------------- */}
          {/* TAB 1: AI SEARCH FOR SELECTED CAMERA                      */}
          {/* --------------------------------------------------------- */}
          {rightTab === 'ai-search' && (
            !selectedCam ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted-foreground)' }}>
                <VideocamOutlined sx={{ fontSize: 44, opacity: 0.4, mb: 1 }} />
                <h4 style={{ margin: '0 0 6px', fontSize: 14, color: 'var(--foreground)' }}>
                  No Camera Selected
                </h4>
                <p style={{ fontSize: 12, margin: '0 0 16px', lineHeight: 1.5, color: 'var(--muted-foreground)' }}>
                  Assign a camera on the map or fetch feeds from DB to run AI visual searches on footage.
                </p>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddCircleOutlined />}
                  onClick={() => setAddCamOpen(true)}
                >
                  Assign New Camera
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <VideocamOutlined color="primary" /> {selectedCam.id} · {selectedCam.name}
                    </h3>
                    <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                      Zone: {selectedCam.zone} · Coverage {selectedCam.coverageRadius || 45}m
                    </span>
                  </div>
                  <Chip size="small" color="success" label="Feed Active" sx={{ height: 20, fontSize: 10 }} />
                </div>

                {/* Natural Language Query Input with Voice Input (STT) */}
                <TextField
                  fullWidth
                  size="small"
                  label="Search CCTV with Natural Language"
                  placeholder="e.g. Person with red jacket, Black car speeding, Backpack left near gate"
                  value={camSearchQuery}
                  onChange={(e) => setCamSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !camSearching) {
                      void handleCamAISearch();
                    }
                  }}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <VoiceInput
                            onText={(txt) => setCamSearchQuery(txt)}
                            onBusy={() => {}}
                          />
                        </InputAdornment>
                      ),
                    },
                  }}
                />

                {/* Quick Query Pills */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['Person in red jacket', 'White van loading', 'Suspicious bag left', 'Forklift moving'].map((q) => (
                    <Chip
                      key={q}
                      size="small"
                      label={q}
                      variant="outlined"
                      onClick={() => setCamSearchQuery(q)}
                      sx={{ fontSize: 10, cursor: 'pointer' }}
                    />
                  ))}
                </div>

                {/* Action Button */}
                <Button
                  variant="contained"
                  color="primary"
                  disabled={camSearching || !camSearchQuery.trim()}
                  onClick={() => void handleCamAISearch()}
                  startIcon={camSearching ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeOutlined />}
                >
                  {camSearching ? 'Searching Video Footage...' : `Run AI Search on ${selectedCam.id}`}
                </Button>

                {/* AI Search Results Card */}
                {camSearchResult && (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <CheckCircleOutlined color="success" sx={{ fontSize: 16 }} /> Best Match Frame
                      </strong>
                      <Chip
                        size="small"
                        color="success"
                        label={`${camSearchResult.best_matching_frame.match_score.toFixed(1)}% match`}
                        sx={{ fontWeight: 700 }}
                      />
                    </div>

                    {/* Frame preview */}
                    <div style={{ borderRadius: 6, overflow: 'hidden', position: 'relative', background: '#000' }}>
                      <img
                        src={resolveMediaUrl(camSearchResult.best_matching_frame.path)}
                        alt="Top matching frame"
                        style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                      />
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        padding: '4px 8px', background: 'rgba(0,0,0,0.7)',
                        color: '#fff', fontSize: 10.5, display: 'flex', justifyContent: 'space-between'
                      }}>
                        <span>Frame #{camSearchResult.best_matching_frame.frame_number}</span>
                        <span>Timestamp: {camSearchResult.best_matching_frame.timestamp_str}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span>Raw SigLIP 2 Cosine: <strong>{camSearchResult.best_matching_frame.raw_cosine.toFixed(4)}</strong></span>
                      <span>Inference Time: <strong>{camSearchResult.processing_time.total_seconds}s</strong></span>
                    </div>

                    {/* Real-time Streaming Explainable AI Card */}
                    <div style={{
                      padding: 10,
                      borderRadius: 6,
                      background: 'rgba(33, 150, 243, 0.08)',
                      border: '1px solid rgba(33, 150, 243, 0.25)',
                      fontSize: 12,
                      lineHeight: 1.5
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 11 }}>
                          Explainable AI Vision Evidence
                        </span>
                        {camIsStreaming ? (
                          <span style={{ fontSize: 10.5, color: 'var(--warning)', fontWeight: 600 }}>
                            Streaming ({camStreamElapsedSec.toFixed(1)}s)...
                          </span>
                        ) : camStreamMetrics?.total_generation_seconds ? (
                          <span style={{ fontSize: 10.5, color: 'var(--success)', fontWeight: 600 }}>
                            ⏱️ Gen Time: {camStreamMetrics.total_generation_seconds.toFixed(2)}s
                          </span>
                        ) : null}
                      </div>

                      <div style={{ whiteSpace: 'pre-wrap', color: 'var(--card-foreground)' }}>
                        {camStreamingText || 'Initializing multimodal evidence reasoning...'}
                        {camIsStreaming && (
                          <span style={{
                            display: 'inline-block', width: 6, height: 13,
                            backgroundColor: 'var(--primary)', marginLeft: 3, verticalAlign: 'text-bottom'
                          }} />
                        )}
                      </div>

                      {!camIsStreaming && camStreamingText && (
                        <div style={{ marginTop: 8 }}>
                          <SpeechPlayer text={camStreamingText} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {/* --------------------------------------------------------- */}
          {/* TAB 2: OBJECT MOVEMENT TIMELINE                           */}
          {/* --------------------------------------------------------- */}
          {rightTab === 'timeline' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{activeObj.label}</h3>
                  <Chip label={activeObj.type} size="small" sx={{ height: 18, fontSize: 9, mt: 0.5 }} />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {sightings.length > 0 && (
                    <Button
                      size="small"
                      color="error"
                      onClick={clearSightingsForActiveObject}
                      sx={{ fontSize: 10, p: 0 }}
                    >
                      Clear Sightings
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => setAddSightingOpen(true)}
                    sx={{ fontSize: 10.5, py: 0.3, px: 1 }}
                  >
                    + Add Sighting
                  </Button>
                </div>
              </div>
              <p className="subtitle" style={{ fontSize: 11, margin: '0 0 12px' }}>
                Chronological track of observed object positions (saved locally in browser):
              </p>

              {sightings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--muted-foreground)' }}>
                  <RouteOutlined sx={{ fontSize: 36, opacity: 0.4, mb: 1 }} />
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' }}>
                    No Sightings Logged
                  </div>
                  <p style={{ fontSize: 11, margin: '4px 0 12px', lineHeight: 1.4 }}>
                    Add sightings by clicking the map or clicking &quot;+ Add Sighting&quot; above.
                  </p>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RouteOutlined />}
                    onClick={() => setAddSightingOpen(true)}
                    sx={{ fontSize: 11 }}
                  >
                    + Add Sighting Coordinate
                  </Button>
                </div>
              ) : (
                sightings.map((s, i) => {
                  const c = cameras.find((cam) => cam.id === s.camId);
                  const isShown = i <= step;
                  const pos = s.objectPos || c?.pos || [0, 0];

                  return (
                    <div
                      key={s.id || i}
                      onClick={() => {
                        setStep(i);
                        if (c) setSelectedCam(c);
                      }}
                      style={{
                        cursor: 'pointer',
                        opacity: isShown ? 1 : 0.35,
                        borderLeft: `4px solid ${activeObj.color}`,
                        padding: '8px 10px',
                        marginBottom: 8,
                        borderRadius: '0 6px 6px 0',
                        background: isShown ? 'var(--muted)' : 'transparent',
                        border: '1px solid var(--border)',
                        borderLeftWidth: 4,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 11.5 }}>
                          {i + 1}. {s.time}
                        </strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700 }}>
                            {s.conf}% conf
                          </span>
                          <Tooltip title="Delete sighting">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSighting(s.id);
                              }}
                              sx={{ p: 0.2 }}
                            >
                              <DeleteOutlined sx={{ fontSize: 13 }} />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', marginTop: 2 }}>
                        Captured by {s.camId} ({c?.name || 'Camera'})
                      </div>
                      <div className="subtitle" style={{ fontSize: 10, marginTop: 2 }}>
                        Ground Coord: {pos[0].toFixed(5)}, {pos[1].toFixed(5)}
                      </div>
                      {s.note && (
                        <div style={{ fontSize: 10.5, fontStyle: 'italic', marginTop: 3, color: 'var(--muted-foreground)' }}>
                          &quot;{s.note}&quot;
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Connected Cameras list */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={{ margin: 0, fontSize: 12.5, fontWeight: 700 }}>Assigned Cameras ({cameras.length})</h3>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {cameras.length > 0 && (
                      <Button
                        size="small"
                        color="error"
                        onClick={clearAllCameras}
                        sx={{ fontSize: 10, p: 0 }}
                      >
                        Clear All
                      </Button>
                    )}
                    <Button size="small" onClick={() => setAddCamOpen(true)} sx={{ fontSize: 10.5, p: 0 }}>
                      + Add Cam
                    </Button>
                  </div>
                </div>

                {cameras.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontStyle: 'italic', padding: '8px 0' }}>
                    No cameras assigned yet. Click on the map or click &quot;+ Add Cam&quot; to assign a camera.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {cameras.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCam(c);
                          setRightTab('ai-search');
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          borderRadius: 4,
                          background: selectedCam?.id === c.id ? 'var(--muted)' : 'var(--card)',
                          border: selectedCam?.id === c.id ? '1px solid var(--primary)' : '1px solid var(--border)',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        <div>
                          <strong>{c.id}</strong> · <span>{c.name}</span>
                          <div style={{ fontSize: 9.5, color: 'var(--muted-foreground)' }}>
                            {c.pos[0].toFixed(4)}, {c.pos[1].toFixed(4)} ({c.coverageRadius || 45}m)
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Tooltip title="Delete camera from map">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteCamera(c.id);
                              }}
                            >
                              <DeleteOutlined sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --------------------------------------------------------- */}
          {/* TAB 3: CUSTOM MAP MARKINGS & GROUND PINS (SAVED LOCALLY)  */}
          {/* --------------------------------------------------------- */}
          {rightTab === 'markings' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <PinDropOutlined color="primary" sx={{ fontSize: 18 }} /> Map Ground Markings ({markings.length})
                  </h3>
                  <span style={{ fontSize: 10.5, color: '#16a34a', fontWeight: 600 }}>
                    ● Auto-saved to Local Storage
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {markings.length > 0 && (
                    <Button
                      size="small"
                      color="error"
                      onClick={clearAllMarkings}
                      sx={{ fontSize: 10, p: 0 }}
                    >
                      Clear All
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => setAddMarkingOpen(true)}
                    sx={{ fontSize: 10.5, py: 0.3, px: 1 }}
                  >
                    + Add Pin
                  </Button>
                </div>
              </div>

              <p className="subtitle" style={{ fontSize: 11, margin: '0 0 12px' }}>
                Custom field pins, points of interest, checkpoints, and incident markers saved in browser memory:
              </p>

              {markings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--muted-foreground)' }}>
                  <PinDropOutlined sx={{ fontSize: 36, opacity: 0.4, mb: 1 }} />
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--foreground)' }}>
                    No Ground Markings Yet
                  </div>
                  <p style={{ fontSize: 11, margin: '4px 0 12px', lineHeight: 1.4 }}>
                    Pin custom POIs, evidence markers, or checkpoints by clicking the map or using &quot;+ Add Pin&quot;.
                  </p>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<PinDropOutlined />}
                    onClick={() => setAddMarkingOpen(true)}
                    sx={{ fontSize: 11 }}
                  >
                    + Place Ground Pin
                  </Button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {markings.map((m) => {
                    const categoryColors: Record<string, string> = {
                      poi: '#8b5cf6',
                      checkpoint: '#0284c7',
                      incident: '#ef4444',
                      evidence: '#f59e0b',
                    };
                    return (
                      <div
                        key={m.id}
                        onClick={() => {
                          if (mapRef.current) {
                            mapRef.current.setView(m.pos, 18);
                          }
                        }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 6,
                          background: 'var(--card)',
                          border: `1px solid var(--border)`,
                          borderLeft: `4px solid ${m.color || categoryColors[m.category] || '#8b5cf6'}`,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: m.color || categoryColors[m.category],
                            }} />
                            {m.label}
                          </strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Chip
                              size="small"
                              label={m.category.toUpperCase()}
                              sx={{
                                height: 18,
                                fontSize: 9,
                                fontWeight: 700,
                                background: `${m.color || categoryColors[m.category]}18`,
                                color: m.color || categoryColors[m.category],
                              }}
                            />
                            <Tooltip title="Delete this marking">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteMarking(m.id);
                                }}
                                sx={{ p: 0.2 }}
                              >
                                <DeleteOutlined sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </div>
                        </div>

                        <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)', marginTop: 3 }}>
                          GPS: <code>{m.pos[0].toFixed(5)}, {m.pos[1].toFixed(5)}</code> · Logged: {m.time}
                        </div>

                        {m.note && (
                          <div style={{ fontSize: 10.5, fontStyle: 'italic', marginTop: 3, color: 'var(--card-foreground)' }}>
                            &quot;{m.note}&quot;
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Paper>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* DIALOG 1: ADD / ASSIGN CAMERA TO MAP                          */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={addCamOpen} onClose={() => setAddCamOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleAddCameraSubmit}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VideocamOutlined color="primary" /> Assign Camera on Map
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <p className="subtitle" style={{ fontSize: 12, margin: 0 }}>
              Specify mounting coordinates and DB video stream for this surveillance camera. (Coordinates are pre-filled from your map click or live GPS).
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TextField
                required
                label="Camera ID"
                size="small"
                value={newCam.id}
                onChange={(e) => setNewCam({ ...newCam, id: e.target.value })}
                placeholder="CAM-07"
              />
              <TextField
                required
                label="Camera Name"
                size="small"
                value={newCam.name}
                onChange={(e) => setNewCam({ ...newCam, name: e.target.value })}
                placeholder="Lobby Entrance"
              />
            </div>
            <TextField
              required
              label="Zone / Sector"
              size="small"
              value={newCam.zone}
              onChange={(e) => setNewCam({ ...newCam, zone: e.target.value })}
              placeholder="Building C South Corridor"
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TextField
                required
                label="Latitude"
                size="small"
                type="number"
                slotProps={{ htmlInput: { step: '0.00001' } }}
                value={newCam.lat}
                onChange={(e) => setNewCam({ ...newCam, lat: e.target.value })}
              />
              <TextField
                required
                label="Longitude"
                size="small"
                type="number"
                slotProps={{ htmlInput: { step: '0.00001' } }}
                value={newCam.lng}
                onChange={(e) => setNewCam({ ...newCam, lng: e.target.value })}
              />
            </div>
            <TextField
              label="Coverage Radius (meters)"
              size="small"
              type="number"
              value={newCam.coverageRadius}
              onChange={(e) => setNewCam({ ...newCam, coverageRadius: e.target.value })}
              helperText="Field of view radius shown on map"
            />
            <TextField
              label="Stream / DB Input URL"
              size="small"
              value={newCam.stream_url}
              onChange={(e) => setNewCam({ ...newCam, stream_url: e.target.value })}
              placeholder="rtsp://... or /data/videos/stream_cam07.mp4"
              helperText="Live video input source"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddCamOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">
              Pin & Assign Camera
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* DIALOG 2: ADD OBJECT SIGHTING                                 */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={addSightingOpen} onClose={() => setAddSightingOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleAddSightingSubmit}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RouteOutlined color="primary" /> Add Object Sighting Coordinate
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <p className="subtitle" style={{ fontSize: 12, margin: 0 }}>
              Plot a new ground coordinate where <strong>{activeObj.label}</strong> was detected.
            </p>
            <TextField
              select
              required
              label="Observing Camera"
              size="small"
              value={newSighting.camId}
              onChange={(e) => setNewSighting({ ...newSighting, camId: e.target.value })}
              disabled={cameras.length === 0}
              helperText={cameras.length === 0 ? 'No cameras available. Please assign a camera first.' : undefined}
            >
              {cameras.map((c) => (
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
                onChange={(e) => setNewSighting({ ...newSighting, time: e.target.value })}
                placeholder="08:12:30"
              />
              <TextField
                required
                label="Confidence %"
                size="small"
                type="number"
                value={newSighting.conf}
                onChange={(e) => setNewSighting({ ...newSighting, conf: e.target.value })}
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
                onChange={(e) => setNewSighting({ ...newSighting, lat: e.target.value })}
              />
              <TextField
                required
                label="Object Ground Lng"
                size="small"
                type="number"
                slotProps={{ htmlInput: { step: '0.00001' } }}
                value={newSighting.lng}
                onChange={(e) => setNewSighting({ ...newSighting, lng: e.target.value })}
              />
            </div>
            <TextField
              label="Detection Details / Note"
              size="small"
              value={newSighting.note}
              onChange={(e) => setNewSighting({ ...newSighting, note: e.target.value })}
              placeholder="e.g. Walking along path heading East"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddSightingOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">
              Add to Trajectory
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* DIALOG 3: ADD CUSTOM MAP MARKING / GROUND PIN (SAVED LOCALLY) */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={addMarkingOpen} onClose={() => setAddMarkingOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={handleAddMarkingSubmit}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PinDropOutlined color="secondary" /> Place Ground Pin / Marking
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <p className="subtitle" style={{ fontSize: 12, margin: 0 }}>
              Plot a persistent ground marker or POI on the map. This is saved locally in your browser.
            </p>
            <TextField
              required
              label="Pin Label / Identifier"
              size="small"
              value={newMarking.label}
              onChange={(e) => setNewMarking({ ...newMarking, label: e.target.value })}
              placeholder="e.g. South Gate Checkpoint, Vehicle Sighting, Bag Found"
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TextField
                select
                required
                label="Category"
                size="small"
                value={newMarking.category}
                onChange={(e) => setNewMarking({ ...newMarking, category: e.target.value as any })}
              >
                <MenuItem value="poi">📍 Point of Interest</MenuItem>
                <MenuItem value="checkpoint">🚩 Checkpoint</MenuItem>
                <MenuItem value="incident">⚠️ Incident</MenuItem>
                <MenuItem value="evidence">🔍 Evidence</MenuItem>
              </TextField>
              <TextField
                select
                label="Color Pin"
                size="small"
                value={newMarking.color}
                onChange={(e) => setNewMarking({ ...newMarking, color: e.target.value })}
              >
                <MenuItem value="#8b5cf6">🟣 Purple</MenuItem>
                <MenuItem value="#0284c7">🔵 Blue</MenuItem>
                <MenuItem value="#16a34a">🟢 Green</MenuItem>
                <MenuItem value="#ef4444">🔴 Red</MenuItem>
                <MenuItem value="#f59e0b">🟡 Amber</MenuItem>
              </TextField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <TextField
                required
                label="Latitude"
                size="small"
                type="number"
                slotProps={{ htmlInput: { step: '0.00001' } }}
                value={newMarking.lat}
                onChange={(e) => setNewMarking({ ...newMarking, lat: e.target.value })}
              />
              <TextField
                required
                label="Longitude"
                size="small"
                type="number"
                slotProps={{ htmlInput: { step: '0.00001' } }}
                value={newMarking.lng}
                onChange={(e) => setNewMarking({ ...newMarking, lng: e.target.value })}
              />
            </div>
            <TextField
              label="Field Note / Description"
              size="small"
              value={newMarking.note}
              onChange={(e) => setNewMarking({ ...newMarking, note: e.target.value })}
              placeholder="e.g. Officer observed footprint heading towards woods"
              multiline
              rows={2}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddMarkingOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" color="secondary">
              Save Pin Locally
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* DIALOG 4: MAP CLICK ACTION CHOOSER                             */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        open={mapClickPromptOpen}
        onClose={() => setMapClickPromptOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 15 }}>
          <PinDropOutlined color="primary" /> Map Coordinate Selected
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
          <p className="subtitle" style={{ fontSize: 12, margin: 0 }}>
            {clickedPos ? (
              <span>Coordinates: <code>{clickedPos[0].toFixed(5)}, {clickedPos[1].toFixed(5)}</code></span>
            ) : (
              'Choose what you would like to place at this location:'
            )}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <Button
              variant="outlined"
              startIcon={<VideocamOutlined />}
              onClick={() => {
                setMapClickPromptOpen(false);
                setAddCamOpen(true);
              }}
              sx={{ justifyContent: 'flex-start', py: 1 }}
            >
              📹 Assign Surveillance Camera Here
            </Button>
            <Button
              variant="outlined"
              startIcon={<RouteOutlined />}
              onClick={() => {
                setMapClickPromptOpen(false);
                setAddSightingOpen(true);
              }}
              sx={{ justifyContent: 'flex-start', py: 1 }}
            >
              👣 Add Sighting for {activeObj.label}
            </Button>
            <Button
              variant="contained"
              color="secondary"
              startIcon={<PinDropOutlined />}
              onClick={() => {
                setMapClickPromptOpen(false);
                setAddMarkingOpen(true);
              }}
              sx={{ justifyContent: 'flex-start', py: 1 }}
            >
              📍 Place Ground Pin / Marking (Local Save)
            </Button>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMapClickPromptOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
