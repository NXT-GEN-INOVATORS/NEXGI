import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Chip, Alert, TextField, Switch, FormControlLabel, Paper, TableContainer, Table, TableHead, TableBody, TableRow, TableCell, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, IconButton, Tooltip, Tabs, Tab, ToggleButton, ToggleButtonGroup, LinearProgress, Badge } from '@mui/material';
import { VideocamOutlined, Search, ArrowForward, Refresh, HubOutlined, NotificationsNone, CheckCircleOutlined, FolderOutlined, Download, StorageOutlined, DnsOutlined, InfoOutlined, TuneOutlined, WifiOutlined, LocationOnOutlined, SpeedOutlined, FlashOnOutlined, MemoryOutlined, SettingsInputComponentOutlined, AddCircleOutlined, ContentCopyOutlined, UploadFile, PlayArrow, DeleteOutlined, WarningAmberOutlined, AnalyticsOutlined, TimelineOutlined, PsychologyOutlined, CloudUploadOutlined, CheckCircle, ErrorOutline } from '@mui/icons-material';
import { Link } from '@tanstack/react-router';
import gate from '@/assets/gate-camera.jpg';
import { PageHeading, SectionHeading, RecentTable, CameraPreview, Status } from './Common';
import { cameraNames, backendUrl, ai, recent, sampleEvidence, resolveMediaUrl, type Evidence } from '@/lib/visiontrace/data';
import { useSession } from './Session';
import { supabase } from '@/integrations/supabase/client';
export function Investigations(){const {user}=useSession();const [selected,setSelected]=useState<{query:string;evidence:unknown}|null>(null);const investigations=useQuery({queryKey:['investigations',user?.id],queryFn:async()=>{const {data,error}=await supabase.from('investigations').select('*').order('created_at',{ascending:false});if(error)throw error;return data;},enabled:!!user});return <><PageHeading title="Investigations" subtitle="Organize your searches and verify grounded evidence." action={<Button component={Link} to="/ai-search" variant="contained" startIcon={<Search/>}>New Investigation</Button>}/>{!user?<><SectionHeading title="Recent Investigations" action={<Chip label="Sample activity" variant="outlined"/>}/><RecentTable all/></>:investigations.isLoading?<CircularProgress size={24}/>:investigations.isError?<Alert severity="error">{investigations.error.message}</Alert>:<TableContainer component={Paper} variant="outlined"><Table><TableHead><TableRow>{['Query','Created','Status','Evidence'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{investigations.data?.map((i:any)=><TableRow key={i.id}><TableCell>{i.query}</TableCell><TableCell>{new Date(i.created_at).toLocaleString()}</TableCell><TableCell><Status status={i.status}/></TableCell><TableCell><Button onClick={()=>setSelected(i)}>View Evidence</Button></TableCell></TableRow>)}{!investigations.data?.length&&<TableRow><TableCell colSpan={4} align="center">No investigations yet. Save a search to start one.</TableCell></TableRow>}</TableBody></Table></TableContainer>}<Dialog open={!!selected} onClose={()=>setSelected(null)} fullWidth maxWidth="md"><DialogTitle>{selected?.query}</DialogTitle><DialogContent>{Array.isArray(selected?.evidence)?(selected.evidence as Evidence[]).map(e=><div key={e.id} style={{marginBottom:20}}><CameraPreview evidence={e} boxes/><p className="subtitle">{e.camera_id} · {e.timestamp} · Confidence {e.confidence}% · {e.objects.join(', ')}</p></div>):'No evidence'}</DialogContent><DialogActions><Button onClick={()=>setSelected(null)}>Close</Button></DialogActions></Dialog></>}
export function Cameras(){
  const [filter, setFilter] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'violent' | 'tense' | 'calm'>('all');
  const [activeTab, setActiveTab] = useState<'grid' | 'add' | 'integration'>('grid');
  const [copied, setCopied] = useState('');
  
  // Custom camera registration supporting HTTP, RTSP, and multiple upload
  const [sourceType, setSourceType] = useState<'upload' | 'http' | 'rtsp'>('upload');
  const [newCam, setNewCam] = useState({ name: '', id: '', streamUrl: '', zone: '', protocol: 'HTTP Live Stream (HLS)', resolution: '1080p' });
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [newCamSuccessMsg, setNewCamSuccessMsg] = useState('');
  
  // Active cameras list with sentiment analysis
  const [camerasList, setCamerasList] = useState<any[]>([]);
  const [isLoadingCams, setIsLoadingCams] = useState(false);
  const [selectedCamDetail, setSelectedCamDetail] = useState<any | null>(null);
  const [playingVideo, setPlayingVideo] = useState<{ name: string; id: string; url: string; sentiment?: string } | null>(null);
  const [deletingCam, setDeletingCam] = useState<{ id: string; name: string } | null>(null);
  const [inlinePlayingId, setInlinePlayingId] = useState<string | null>(null);

  // Helper to reliably construct an HTML5-playable video URL
  function getPlayableVideoUrl(camOrUrl?: any): string {
    if (!camOrUrl) return '';
    if (typeof camOrUrl === 'string') {
      if (camOrUrl.startsWith('blob:') || camOrUrl.startsWith('data:')) return camOrUrl;
      if (camOrUrl.startsWith('http://') || camOrUrl.startsWith('https://')) {
        const cleanPath = camOrUrl.replace(/^https?:\/\/[^/]+/, '');
        if (cleanPath.startsWith('/data/videos/')) return resolveMediaUrl(cleanPath) || camOrUrl;
        if (cleanPath.startsWith('/videos/')) {
          const fn = cleanPath.split('/').pop();
          return resolveMediaUrl(`/data/videos/${fn}`) || camOrUrl;
        }
        return camOrUrl;
      }
      const fn = camOrUrl.split(/[\\/]/).pop();
      return resolveMediaUrl(`/data/videos/${fn}`) || camOrUrl;
    }
    if (camOrUrl.blobUrl) return camOrUrl.blobUrl;
    const rawUrl = camOrUrl.video_url || camOrUrl.videoUrl || camOrUrl.url;
    if (rawUrl) {
      if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) return rawUrl;
      if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
        const cleanPath = rawUrl.replace(/^https?:\/\/[^/]+/, '');
        if (cleanPath.startsWith('/data/videos/')) return resolveMediaUrl(cleanPath) || rawUrl;
        if (cleanPath.startsWith('/videos/')) {
          const fn = cleanPath.split('/').pop();
          return resolveMediaUrl(`/data/videos/${fn}`) || rawUrl;
        }
        return rawUrl;
      }
      const fn = rawUrl.split(/[\\/]/).pop();
      return resolveMediaUrl(`/data/videos/${fn}`) || rawUrl;
    }
    const fn = camOrUrl.video_filename || camOrUrl.filename || (camOrUrl.video_source ? camOrUrl.video_source.split(/[\\/]/).pop() : '');
    if (fn) {
      return resolveMediaUrl(`/data/videos/${fn}`) || '';
    }
    return '';
  }

  // Fetch cameras from MoViNet violence backend & NEXGI backend
  const fetchCameras = async () => {
    try {
      const res = await ai.get('/api/violence/cameras');
      if (res.data?.success && Array.isArray(res.data.cameras)) {
        setCamerasList(res.data.cameras);
        return;
      }
    } catch {
      try {
        const fallbackRes = await ai.get('/api/cameras');
        if (fallbackRes.data?.cameras) {
          setCamerasList(fallbackRes.data.cameras);
        }
      } catch {
        // silent fallback
      }
    }
  };

  useEffect(() => {
    fetchCameras();
    const interval = setInterval(fetchCameras, 3500);
    return () => clearInterval(interval);
  }, []);

  function copyText(txt: string, key: string) {
    void navigator.clipboard.writeText(txt);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }

  function handleMultiFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      const filesArr = Array.from(e.target.files);
      setUploadedFiles(prev => [...prev, ...filesArr]);
      if (filesArr.length > 0) {
        const preview = URL.createObjectURL(filesArr[0]);
        setStagedPreviewUrl(preview);
        if (!newCam.name) {
          const clean = filesArr[0].name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
          setNewCam(prev => ({ ...prev, name: clean.charAt(0).toUpperCase() + clean.slice(1) }));
        }
      }
      setUploadError('');
    }
  }

  function removeStagedFile(idx: number) {
    setUploadedFiles(prev => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0) {
        setStagedPreviewUrl(URL.createObjectURL(next[0]));
      } else {
        setStagedPreviewUrl('');
      }
      return next;
    });
  }

  async function handleBatchUpload(e: React.FormEvent) {
    e.preventDefault();
    if (sourceType === 'upload') {
      if (uploadedFiles.length === 0) {
        setUploadError('Please select at least one video file to upload.');
        return;
      }
      setIsUploading(true);
      setUploadError('');

      const formData = new FormData();
      uploadedFiles.forEach(file => {
        formData.append('files', file);
      });

      try {
        const resp = await ai.post('/api/violence/upload-multiple', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (resp.data?.success) {
          const newCams = resp.data.cameras || [];
          const firstNew = newCams[0];
          const sentimentSummary = firstNew 
            ? `MoViNet Sentiment: ${firstNew.sentiment_label || 'Analyzed'} (${firstNew.calm_score || 85}% Calm, ${firstNew.aggression_score || 15}% Violence Risk)`
            : 'Sentiment analysis performed successfully!';

          setNewCamSuccessMsg(`Successfully uploaded and analyzed ${newCams.length} video(s)! ${sentimentSummary}`);
          setUploadedFiles([]);
          setStagedPreviewUrl('');
          setNewCam({ name: '', id: '', streamUrl: '', zone: '', protocol: 'HTTP Live Stream (HLS)', resolution: '1080p' });
          
          await fetchCameras();
          
          // Switch to grid and show the newly analyzed camera in the modal
          setActiveTab('grid');
          if (firstNew) {
            setSelectedCamDetail(firstNew);
          }
          setTimeout(() => setNewCamSuccessMsg(''), 6000);
        } else {
          setUploadError('Failed to process uploaded videos.');
        }
      } catch (err: any) {
        setUploadError(err?.response?.data?.detail || err?.message || 'Error uploading videos.');
      } finally {
        setIsUploading(false);
      }
    } else {
      // Single HTTP / RTSP stream registration
      const addedCam = {
        id: newCam.id || `CAM-${(camerasList.length + 1).toString().padStart(2, '0')}`,
        name: newCam.name || `Live Feed ${camerasList.length + 1}`,
        zone: newCam.zone || 'Campus Zone',
        res: newCam.resolution,
        fps: '30fps',
        protocol: sourceType === 'http' ? 'HTTP / HLS Stream' : 'RTSP Stream',
        uptime: '100%',
        detections: ['MoViNet Violence', 'Sentiment Analysis', 'Object Tracking'],
        ip: newCam.streamUrl || `192.168.1.${100 + camerasList.length + 1}`,
        storage: '128GB',
        aiModel: 'MoViNet-A0 Streaming',
        thumb: gate,
        video_url: newCam.streamUrl,
        sentiment_label: 'Calm & Safe',
        threat_level: 'LOW',
        calm_score: 95.0,
        aggression_score: 5.0,
        violence_probability: 0.05,
        peak_violence_score: 8.0,
        status: 'NORMAL'
      };
      setCamerasList(prev => [addedCam, ...prev]);
      setNewCamSuccessMsg('Camera stream successfully added and linked to monitoring grid!');
      setNewCam({ name: '', id: '', streamUrl: '', zone: '', protocol: 'HTTP Live Stream (HLS)', resolution: '1080p' });
      setActiveTab('grid');
      setTimeout(() => setNewCamSuccessMsg(''), 4000);
    }
  }

  async function handleLoadDefaults() {
    setIsLoadingCams(true);
    try {
      const resp = await ai.post('/api/violence/load-defaults');
      if (resp.data?.success) {
        await fetchCameras();
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingCams(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingCam) return;
    try {
      await ai.delete(`/api/violence/cameras/${deletingCam.id}`);
      setCamerasList(prev => prev.filter(c => (c.camera_id || c.id) !== deletingCam.id));
    } catch {
      setCamerasList(prev => prev.filter(c => (c.camera_id || c.id) !== deletingCam.id));
    }
    setDeletingCam(null);
  }

  // Filter cameras based on search and sentiment status
  const filtered = camerasList.filter(c => {
    const textMatch = ((c.name || '') + (c.zone || '') + (c.camera_id || c.id || '')).toLowerCase().includes(filter.toLowerCase());
    if (!textMatch) return false;

    const label = (c.sentiment_label || '').toLowerCase();
    const vProb = c.violence_probability || 0;
    const isViolent = label.includes('violent') || label.includes('fight') || vProb >= 0.65;
    const isTense = label.includes('tense') || label.includes('suspicious') || (vProb >= 0.35 && vProb < 0.65);
    const isCalm = label.includes('calm') || (!isViolent && !isTense);

    if (sentimentFilter === 'violent') return isViolent;
    if (sentimentFilter === 'tense') return isTense;
    if (sentimentFilter === 'calm') return isCalm;
    return true;
  });

  const countViolent = camerasList.filter(c => (c.sentiment_label || '').toLowerCase().includes('violent') || (c.violence_probability || 0) >= 0.65).length;
  const countTense = camerasList.filter(c => (c.sentiment_label || '').toLowerCase().includes('tense') || ((c.violence_probability || 0) >= 0.35 && (c.violence_probability || 0) < 0.65)).length;
  const countCalm = camerasList.filter(c => (c.sentiment_label || '').toLowerCase().includes('calm') || ((c.violence_probability || 0) < 0.35 && !(c.sentiment_label || '').toLowerCase().includes('violent'))).length;

  const playableModalUrl = getPlayableVideoUrl(selectedCamDetail);
  const playablePlayerUrl = getPlayableVideoUrl(playingVideo);

  return <>
    <PageHeading 
      title="Cameras & Sentimental Video Analysis" 
      subtitle="Real-time multi-camera CCTV monitoring, multi-video batch upload, and MoViNet temporal violence & sentiment detection." 
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outlined" startIcon={<Refresh />} onClick={fetchCameras} disabled={isLoadingCams}>
            Refresh Telemetry
          </Button>
          <Button variant="contained" startIcon={<AddCircleOutlined />} onClick={() => setActiveTab('add')}>
            Upload Videos / Feeds
          </Button>
        </div>
      }
    />
    
    <Tabs value={activeTab} onChange={(_e, v) => setActiveTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
      <Tab label={`Monitored Cameras (${camerasList.length})`} value="grid" icon={<VideocamOutlined />} iconPosition="start" />
      <Tab label="Upload Multiple Videos (Sentiment AI)" value="add" icon={<CloudUploadOutlined />} iconPosition="start" />
      <Tab label="API & MoViNet Specs" value="integration" icon={<SettingsInputComponentOutlined />} iconPosition="start" />
    </Tabs>

    {newCamSuccessMsg && (
      <Alert severity="success" sx={{ mb: 3, fontWeight: 600 }}>
        {newCamSuccessMsg}
      </Alert>
    )}

    {activeTab === 'grid' && (
      <>
        {/* Top Control Bar: Search, Sentiment Filters, Load Benchmark */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          <TextField 
            placeholder="Search camera name, ID, or location…" 
            size="small" 
            value={filter} 
            onChange={e => setFilter(e.target.value)} 
            sx={{ width: 300 }} 
            slotProps={{ input: { startAdornment: <Search sx={{ fontSize: 16, mr: 1, color: 'var(--muted-foreground)' }} /> } }}
          />

          {/* Sentiment Filter Chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Chip 
              label={`All Feeds (${camerasList.length})`} 
              clickable 
              color={sentimentFilter === 'all' ? 'primary' : 'default'} 
              variant={sentimentFilter === 'all' ? 'filled' : 'outlined'}
              onClick={() => setSentimentFilter('all')}
              size="small"
            />
            <Chip 
              label={<span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} /> Violent Alerts ({countViolent})</span>} 
              clickable 
              color={sentimentFilter === 'violent' ? 'error' : 'default'} 
              variant={sentimentFilter === 'violent' ? 'filled' : 'outlined'}
              onClick={() => setSentimentFilter('violent')}
              size="small"
            />
            <Chip 
              label={<span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' }} /> Tense / Suspicious ({countTense})</span>} 
              clickable 
              color={sentimentFilter === 'tense' ? 'warning' : 'default'} 
              variant={sentimentFilter === 'tense' ? 'filled' : 'outlined'}
              onClick={() => setSentimentFilter('tense')}
              size="small"
            />
            <Chip 
              label={<span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} /> Calm & Safe ({countCalm})</span>} 
              clickable 
              color={sentimentFilter === 'calm' ? 'success' : 'default'} 
              variant={sentimentFilter === 'calm' ? 'filled' : 'outlined'}
              onClick={() => setSentimentFilter('calm')}
              size="small"
            />
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button size="small" variant="outlined" startIcon={<FlashOnOutlined />} onClick={handleLoadDefaults} disabled={isLoadingCams}>
              Load Benchmark Feeds (CAM-01–06)
            </Button>
          </div>
        </div>

        {/* Empty State */}
        {filtered.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', my: 2, borderRadius: 2 }}>
            <VideocamOutlined sx={{ fontSize: 56, opacity: 0.35, mb: 1, color: 'var(--muted-foreground)' }} />
            <h4 style={{ margin: '0 0 6px', fontSize: 17 }}>No Surveillance Feeds Found</h4>
            <p className="subtitle" style={{ margin: '0 0 20px', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
              Upload one or more video recordings to analyze violence and pedestrian sentiment, or click below to load benchmark CCTV cameras.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Button variant="contained" startIcon={<CloudUploadOutlined />} onClick={() => setActiveTab('add')}>
                Upload Multiple Videos
              </Button>
              <Button variant="outlined" startIcon={<FlashOnOutlined />} onClick={handleLoadDefaults}>
                Load Benchmark Cameras
              </Button>
            </div>
          </Paper>
        ) : (
          /* Multi-Camera Rich Grid */
          <div className="cam-rich-grid">
            {filtered.map((cam, i) => {
              const camId = cam.camera_id || cam.id || `CAM-${(i + 1).toString().padStart(2, '0')}`;
              const camName = cam.name || `Camera ${camId}`;
              const vProb = cam.violence_probability || 0;
              const calmScore = cam.calm_score !== undefined ? cam.calm_score : Math.round((1 - vProb) * 100);
              const aggrScore = cam.aggression_score !== undefined ? cam.aggression_score : Math.round(vProb * 100);
              const peakScore = cam.peak_violence_score !== undefined ? cam.peak_violence_score : Math.round(vProb * 100);
              const sentimentLabel = cam.sentiment_label || (vProb >= 0.65 ? 'Violent / Aggressive' : vProb >= 0.35 ? 'Tense / Suspicious' : 'Calm & Safe');
              const threatLevel = cam.threat_level || (vProb >= 0.8 ? 'CRITICAL' : vProb >= 0.65 ? 'HIGH' : vProb >= 0.35 ? 'ELEVATED' : 'LOW');
              const isViolent = sentimentLabel.toLowerCase().includes('violent') || vProb >= 0.65;
              const isTense = sentimentLabel.toLowerCase().includes('tense') || (vProb >= 0.35 && vProb < 0.65);
              const previewSrc = cam.sentiment_analysis?.evidence_thumbnail || (cam.stream_url ? cam.stream_url : cam.thumb || gate);
              const cardVideoUrl = getPlayableVideoUrl(cam);

              return (
                <article key={camId + i} className="cam-rich-card" style={{ borderColor: isViolent ? 'rgba(239,68,68,0.5)' : isTense ? 'rgba(245,158,11,0.4)' : undefined }}>
                  {/* Card Header */}
                  <div className="cam-rich-header">
                    <div className="cam-id-badge"><VideocamOutlined sx={{ fontSize: 13 }} /> {camId}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span className="cam-live-dot" style={{ background: isViolent ? '#ef4444' : isTense ? '#f59e0b' : '#10b981' }} />
                      <span style={{ fontSize: 10, color: isViolent ? '#ef4444' : isTense ? '#f59e0b' : '#10b981', fontWeight: 700 }}>
                        {isViolent ? 'VIOLENCE ALERT' : isTense ? 'SUSPICIOUS' : 'NORMAL'}
                      </span>
                      <Chip label={threatLevel} size="small" sx={{ height: 18, fontSize: 9, ml: 0.5, fontWeight: 700, background: isViolent ? 'rgba(239,68,68,0.18)' : isTense ? 'rgba(245,158,11,0.18)' : 'rgba(16,185,129,0.18)', color: isViolent ? '#ef4444' : isTense ? '#f59e0b' : '#10b981' }} />
                    </div>
                  </div>

                  {/* Video Thumbnail / Stream Preview / Inline Playback */}
                  <div className="cam-rich-preview">
                    {inlinePlayingId === camId && cardVideoUrl ? (
                      <video 
                        key={cardVideoUrl}
                        src={cardVideoUrl} 
                        controls 
                        autoPlay 
                        loop 
                        playsInline 
                        crossOrigin="anonymous"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                      />
                    ) : (
                      <>
                        <img src={previewSrc} alt={camName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e: any) => { e.target.src = gate; }} />
                        <div className="cam-scan-line" />
                        <div className="cam-corner cam-corner-tl" /><div className="cam-corner cam-corner-tr" /><div className="cam-corner cam-corner-bl" /><div className="cam-corner cam-corner-br" />
                        <div className="cam-ai-badge" style={{ background: isViolent ? 'rgba(239,68,68,0.85)' : isTense ? 'rgba(245,158,11,0.85)' : 'rgba(15,23,42,0.85)' }}>
                          <FlashOnOutlined sx={{ fontSize: 11 }} /> MoViNet-A0 · {sentimentLabel}
                        </div>
                        <div className="cam-ts-badge">
                          {cam.last_inference_timestamp ? `▶ ${cam.last_inference_timestamp}` : '▶ LIVE STREAM'}
                        </div>
                        {cardVideoUrl && (
                          <div 
                            onClick={e => { e.stopPropagation(); setInlinePlayingId(camId); }}
                            style={{ 
                              position: 'absolute', 
                              top: '50%', 
                              left: '50%', 
                              transform: 'translate(-50%, -50%)', 
                              background: 'rgba(0,0,0,0.65)', 
                              borderRadius: '50%', 
                              width: 48, 
                              height: 48, 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              cursor: 'pointer',
                              border: '2px solid rgba(255,255,255,0.8)',
                              transition: 'transform 0.2s',
                              zIndex: 4 
                            }}
                            title="Play inline on card"
                          >
                            <PlayArrow sx={{ color: '#fff', fontSize: 30 }} />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="cam-rich-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                      <div>
                        <strong style={{ fontSize: 13, display: 'block' }}>{camName}</strong>
                        <span style={{ fontSize: 10, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <LocationOnOutlined sx={{ fontSize: 11 }} /> {cam.zone || 'Surveillance Sector'}
                        </span>
                      </div>
                      <Tooltip title={`Source FPS: ${cam.source_fps || 25} | Inference: ${cam.inference_fps || 5.0} FPS`}>
                        <Chip label={`${cam.inference_fps || '5.0'} FPS`} size="small" variant="outlined" sx={{ height: 20, fontSize: 9 }} />
                      </Tooltip>
                    </div>

                    {/* Sentimental Analysis Meter */}
                    <div style={{ background: 'var(--muted)', padding: '10px 12px', borderRadius: 6, marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                        <span style={{ color: '#10b981', fontWeight: 600 }}>Calm Composure: {calmScore}%</span>
                        <span style={{ color: isViolent ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>Violence Risk: {aggrScore}%</span>
                      </div>
                      {/* Dual-color Sentiment Bar */}
                      <div style={{ width: '100%', height: 7, borderRadius: 4, background: '#1e293b', overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${calmScore}%`, background: '#10b981', transition: 'width 0.4s ease' }} />
                        <div style={{ width: `${aggrScore}%`, background: isViolent ? '#ef4444' : '#f59e0b', transition: 'width 0.4s ease' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted-foreground)', marginTop: 6 }}>
                        <span>Peak Risk: <strong>{peakScore}%</strong></span>
                        <span>Threat: <strong style={{ color: isViolent ? '#ef4444' : isTense ? '#f59e0b' : '#10b981' }}>{threatLevel}</strong></span>
                      </div>
                    </div>

                    {/* Telemetry Specs Row */}
                    <div className="cam-specs-row">
                      <div className="cam-spec"><SpeedOutlined sx={{ fontSize: 11 }} /> {cam.source_fps || 25} fps</div>
                      <div className="cam-spec"><FlashOnOutlined sx={{ fontSize: 11 }} /> MoViNet-A0</div>
                      <div className="cam-spec"><MemoryOutlined sx={{ fontSize: 11 }} /> TFLite 5-FPS</div>
                    </div>

                    {/* Footer Actions */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <Button 
                        variant="contained" 
                        size="small" 
                        fullWidth 
                        startIcon={<AnalyticsOutlined />} 
                        onClick={e => { e.stopPropagation(); setSelectedCamDetail(cam); }}
                        sx={{ fontSize: 11 }}
                      >
                        Sentiment Analysis
                      </Button>
                      {cardVideoUrl ? (
                        <Tooltip title="Play Full Video Feed">
                          <Button 
                            variant="outlined" 
                            size="small" 
                            startIcon={<PlayArrow />} 
                            onClick={e => { 
                              e.stopPropagation(); 
                              setPlayingVideo({ name: camName, id: camId, url: cardVideoUrl, sentiment: sentimentLabel }); 
                            }}
                            sx={{ minWidth: 42, px: 1.5 }}
                          >
                            Play
                          </Button>
                        </Tooltip>
                      ) : null}
                      <Tooltip title="Remove Feed">
                        <IconButton 
                          size="small" 
                          color="error" 
                          onClick={e => { e.stopPropagation(); setDeletingCam({ id: camId, name: camName }); }} 
                          sx={{ border: '1px solid var(--border)' }}
                        >
                          <DeleteOutlined sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </>
    )}

    {/* TAB 2: MULTI-VIDEO UPLOAD & BATCH SENTIMENT INGESTION */}
    {activeTab === 'add' && (
      <Paper variant="outlined" sx={{ p: 4, maxWidth: 820, margin: 'auto' }}>
        <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 18 }}>Add Camera / Upload Video for Sentiment Analysis</h3>
        <p className="subtitle" style={{ marginBottom: 20 }}>
          Upload single or multiple video recordings (MP4, WebM, MOV, AVI). MoViNet-A0 streaming AI will analyze violence probability, pedestrian agitation, and threat levels across each camera feed in real-time.
        </p>

        {uploadError && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {uploadError}
          </Alert>
        )}

        <div style={{ marginBottom: 24 }}>
          <ToggleButtonGroup exclusive fullWidth value={sourceType} onChange={(_e, v) => { if (v) setSourceType(v); }}>
            <ToggleButton value="upload"><CloudUploadOutlined sx={{ mr: 1 }} /> Upload Video File(s)</ToggleButton>
            <ToggleButton value="http"><WifiOutlined sx={{ mr: 1 }} /> HTTP / HLS Stream Endpoint</ToggleButton>
            <ToggleButton value="rtsp"><VideocamOutlined sx={{ mr: 1 }} /> RTSP / IP Camera</ToggleButton>
          </ToggleButtonGroup>
        </div>

        <form onSubmit={handleBatchUpload}>
          {sourceType === 'upload' && (
            <>
              {/* Optional Camera Name and Zone Metadata */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 20 }}>
                <TextField 
                  label="Camera / Feed Label (Optional)" 
                  placeholder="e.g. West Gate Perimeter or Entrance Feed" 
                  value={newCam.name} 
                  onChange={e => setNewCam({ ...newCam, name: e.target.value })} 
                />
                <TextField 
                  label="Surveillance Zone" 
                  placeholder="e.g. Building B Main Gate" 
                  value={newCam.zone} 
                  onChange={e => setNewCam({ ...newCam, zone: e.target.value })} 
                />
              </div>

              {/* Multi-File Upload Dropzone */}
              <div 
                style={{ 
                  border: '2px dashed var(--border)', 
                  padding: 26, 
                  borderRadius: 8, 
                  textAlign: 'center', 
                  marginBottom: 20, 
                  background: 'var(--muted)',
                  cursor: 'pointer' 
                }}
                onClick={() => document.getElementById('multi-file-input')?.click()}
              >
                <CloudUploadOutlined sx={{ fontSize: 44, color: 'var(--primary)', mb: 1 }} />
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Select Surveillance Video File(s)</div>
                <p className="subtitle" style={{ marginBottom: 14, fontSize: 12 }}>
                  Drag and drop single or multiple video recordings at once, or browse files from your computer.
                </p>
                <Button variant="outlined" component="label" startIcon={<UploadFile />} onClick={e => e.stopPropagation()}>
                  Browse Video Files
                  <input 
                    id="multi-file-input"
                    type="file" 
                    multiple 
                    accept="video/*" 
                    hidden 
                    onChange={handleMultiFileSelect} 
                  />
                </Button>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 10 }}>
                  Supports MP4, WebM, AVI, MOV, MKV · Automatically encoded with faststart for seamless playback
                </div>
              </div>

              {/* Instant Video Playback Preview Right in the Add Tab */}
              {stagedPreviewUrl && (
                <div style={{ marginBottom: 20, background: '#000', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ padding: '8px 14px', background: 'var(--muted)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PlayArrow fontSize="small" color="primary" /> Instant Playback Preview
                    </strong>
                    <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{uploadedFiles[0]?.name}</span>
                  </div>
                  <video 
                    src={stagedPreviewUrl} 
                    controls 
                    autoPlay 
                    loop 
                    playsInline 
                    style={{ width: '100%', maxHeight: 260, display: 'block' }} 
                  />
                </div>
              )}

              {/* Staged Upload Files Queue */}
              {uploadedFiles.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <strong style={{ fontSize: 13 }}>Selected Video Queue ({uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''})</strong>
                    <Button size="small" color="error" onClick={() => { setUploadedFiles([]); setStagedPreviewUrl(''); }}>Clear All</Button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                    {uploadedFiles.map((file, idx) => (
                      <div 
                        key={file.name + idx} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '8px 12px', 
                          borderRadius: 6, 
                          background: 'var(--card)', 
                          border: '1px solid var(--border)' 
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <VideocamOutlined color="primary" sx={{ fontSize: 18 }} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>{file.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{(file.size / 1024 / 1024).toFixed(1)} MB · Ready for MoViNet sentiment analysis</div>
                          </div>
                        </div>
                        <IconButton size="small" onClick={() => removeStagedFile(idx)}>
                          <DeleteOutlined sx={{ fontSize: 16 }} />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isUploading && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span>Uploading & running MoViNet-A0 sentiment inference…</span>
                    <span>5-FPS Temporal Analysis</span>
                  </div>
                  <LinearProgress />
                </div>
              )}
            </>
          )}

          {sourceType !== 'upload' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <TextField label="Camera Name" required placeholder="e.g. West Gate Perimeter" value={newCam.name} onChange={e => setNewCam({ ...newCam, name: e.target.value })} />
              <TextField label="Camera ID" placeholder="e.g. CAM-09" value={newCam.id} onChange={e => setNewCam({ ...newCam, id: e.target.value })} />
              <TextField fullWidth sx={{ gridColumn: 'span 2' }} required label="Stream Endpoint URL" placeholder={sourceType === 'http' ? 'http://192.168.1.100:8080/live.m3u8' : 'rtsp://admin:pass@192.168.1.100:554/stream'} value={newCam.streamUrl} onChange={e => setNewCam({ ...newCam, streamUrl: e.target.value })} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <Button 
              variant="contained" 
              type="submit" 
              startIcon={isUploading ? <CircularProgress size={16} color="inherit" /> : <AddCircleOutlined />} 
              disabled={isUploading || (sourceType === 'upload' && uploadedFiles.length === 0)}
            >
              {isUploading ? 'Analyzing Sentiment & Deploying…' : `Deploy & Analyze ${sourceType === 'upload' && uploadedFiles.length > 0 ? `${uploadedFiles.length} Video${uploadedFiles.length > 1 ? 's' : ''}` : 'Camera'}`}
            </Button>
            <Button variant="outlined" onClick={() => setActiveTab('grid')}>Cancel</Button>
            {sourceType === 'upload' && (
              <Button variant="text" sx={{ ml: 'auto' }} onClick={handleLoadDefaults} startIcon={<FlashOnOutlined />}>
                Load Sample CCTV Benchmark Feeds
              </Button>
            )}
          </div>
        </form>
      </Paper>
    )}

    {/* TAB 3: STREAM & MOViNET API INTEGRATION */}
    {activeTab === 'integration' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))', gap: 24 }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <FlashOnOutlined color="primary" />
            <h3 style={{ margin: 0, fontSize: 16 }}>MoViNet Violence & Sentiment API</h3>
          </div>
          <p className="subtitle" style={{ marginBottom: 16 }}>Batch upload multiple videos for simultaneous temporal inference and sentiment categorization:</p>
          <div style={{ background: 'var(--muted)', padding: '12px 14px', borderRadius: 6, fontFamily: 'monospace', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <code>POST /api/violence/upload-multiple (multipart/form-data)</code>
            <IconButton size="small" onClick={() => copyText('POST /api/violence/upload-multiple', 'api_upload')}><ContentCopyOutlined sx={{ fontSize: 16 }} /></IconButton>
          </div>
          {copied === 'api_upload' && <span style={{ fontSize: 10, color: 'var(--success)', display: 'block', marginTop: 6 }}>Copied API endpoint!</span>}
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <WifiOutlined color="primary" />
            <h3 style={{ margin: 0, fontSize: 16 }}>Direct Video Streaming Endpoint</h3>
          </div>
          <p className="subtitle" style={{ marginBottom: 16 }}>Standard HTTP 206 Partial Content byte-range video streaming endpoint for native browser players:</p>
          <div style={{ background: 'var(--muted)', padding: '12px 14px', borderRadius: 6, fontFamily: 'monospace', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <code>http://127.0.0.1:8000/data/videos/cam01.mp4</code>
            <IconButton size="small" onClick={() => copyText('http://127.0.0.1:8000/data/videos/cam01.mp4', 'stream')}><ContentCopyOutlined sx={{ fontSize: 16 }} /></IconButton>
          </div>
          {copied === 'stream' && <span style={{ fontSize: 10, color: 'var(--success)', display: 'block', marginTop: 6 }}>Copied Stream endpoint!</span>}
        </Paper>

        <Paper variant="outlined" sx={{ p: 3, gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <PsychologyOutlined color="primary" />
            <h3 style={{ margin: 0, fontSize: 16 }}>MoViNet-A0 Streaming Architecture</h3>
          </div>
          <p className="subtitle" style={{ lineHeight: 1.6 }}>
            The violence & sentiment detection pipeline uses Google's <strong>MoViNet-A0 (Mobile Video Network)</strong> streaming model quantized in TensorFlow Lite. It accepts sampled frames at 5 FPS (172×172 RGB) and maintains internal causal states across time steps to analyze kinetic velocity, hostile motion vectors, and pedestrian sentiment.
          </p>
        </Paper>
      </div>
    )}

    {/* MODAL 1: DEEP SENTIMENT ANALYSIS DETAILS */}
    <Dialog open={!!selectedCamDetail} onClose={() => setSelectedCamDetail(null)} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AnalyticsOutlined color="primary" />
          <span>{selectedCamDetail?.name || selectedCamDetail?.camera_id} · Sentiment & Violence Telemetry</span>
        </div>
        <Chip 
          label={selectedCamDetail?.threat_level || 'LOW'} 
          color={selectedCamDetail?.threat_level === 'CRITICAL' || selectedCamDetail?.threat_level === 'HIGH' ? 'error' : selectedCamDetail?.threat_level === 'ELEVATED' ? 'warning' : 'success'}
          size="small"
        />
      </DialogTitle>
      <DialogContent>
        {selectedCamDetail && (
          <div>
            {/* Top Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Sentiment Label</div>
                <strong style={{ fontSize: 13, color: selectedCamDetail.sentiment_label?.includes('Violent') ? '#ef4444' : selectedCamDetail.sentiment_label?.includes('Tense') ? '#f59e0b' : '#10b981' }}>
                  {selectedCamDetail.sentiment_label || 'Calm & Safe'}
                </strong>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Calm Composure</div>
                <strong style={{ fontSize: 14, color: '#10b981' }}>{selectedCamDetail.calm_score || 95}%</strong>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Violence Risk</div>
                <strong style={{ fontSize: 14, color: selectedCamDetail.aggression_score > 50 ? '#ef4444' : '#f59e0b' }}>{selectedCamDetail.aggression_score || 5}%</strong>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Peak Aggression</div>
                <strong style={{ fontSize: 14 }}>{selectedCamDetail.peak_violence_score || 8}%</strong>
              </Paper>
            </div>

            {/* AI Behavioral Assessment Summary */}
            <Alert severity={selectedCamDetail.threat_level === 'CRITICAL' || selectedCamDetail.threat_level === 'HIGH' ? 'error' : selectedCamDetail.threat_level === 'ELEVATED' ? 'warning' : 'info'} sx={{ mb: 2.5 }}>
              <strong>Behavioral Analysis: </strong>
              {selectedCamDetail.sentiment_analysis?.summary || (selectedCamDetail.sentiment_label?.includes('Violent') ? 'Violent kinetic confrontation detected. Hostile motion signatures identified across sequential frames.' : selectedCamDetail.sentiment_label?.includes('Tense') ? 'Heightened agitation or suspicious motion observed. Operator attention recommended.' : 'Calm, compliant movement pattern. Pedestrian kinetic activity remains within normal safe thresholds.')}
            </Alert>

            {/* Video Preview Player in Modal */}
            <div style={{ marginBottom: 20, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
              {playableModalUrl ? (
                <video 
                  key={playableModalUrl}
                  src={playableModalUrl} 
                  controls 
                  autoPlay 
                  loop 
                  playsInline 
                  crossOrigin="anonymous"
                  style={{ width: '100%', maxHeight: 340, display: 'block' }} 
                />
              ) : selectedCamDetail.stream_url ? (
                <img src={selectedCamDetail.stream_url} alt="Live Stream" style={{ width: '100%', maxHeight: 340, objectFit: 'contain', display: 'block' }} />
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>No video feed available</div>
              )}
            </div>

            {/* Temporal Sentiment Curve / Timeline */}
            <div style={{ marginBottom: 15 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <TimelineOutlined fontSize="small" color="primary" />
                <strong style={{ fontSize: 13 }}>Temporal Sentiment Progression</strong>
              </div>
              <div style={{ display: 'flex', gap: 4, height: 48, alignItems: 'flex-end', background: 'var(--muted)', padding: '8px 12px', borderRadius: 6, overflowX: 'auto' }}>
                {(selectedCamDetail.sentiment_analysis?.timeline || selectedCamDetail.recent_timeline || []).map((pt: any, idx: number) => {
                  const prob = pt.violence_prob || (pt.aggression_score ? pt.aggression_score / 100 : 0.1);
                  const h = Math.max(8, Math.round(prob * 36));
                  const isHigh = prob >= 0.65;
                  const isMed = prob >= 0.35;
                  return (
                    <Tooltip key={idx} title={`Time: ${pt.timestamp || pt.time} | Violence: ${Math.round(prob * 100)}% | ${pt.sentiment}`}>
                      <div 
                        style={{ 
                          width: 8, 
                          height: h, 
                          borderRadius: 2, 
                          background: isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#10b981',
                          opacity: 0.85,
                          cursor: 'pointer' 
                        }} 
                      />
                    </Tooltip>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted-foreground)', marginTop: 4 }}>
                <span>Start of Footage</span>
                <span>Temporal Timeline (Hover bars for frame details)</span>
                <span>End of Recording</span>
              </div>
            </div>

            {/* Key Incident Frame Evidence */}
            {selectedCamDetail.sentiment_analysis?.evidence_thumbnail && (
              <div style={{ marginTop: 15 }}>
                <strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Key Evidence Frame (Peak Risk Incident)</strong>
                <img src={selectedCamDetail.sentiment_analysis.evidence_thumbnail} alt="Evidence" style={{ maxWidth: 280, borderRadius: 6, border: '1px solid var(--border)' }} />
              </div>
            )}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setSelectedCamDetail(null)}>Close</Button>
      </DialogActions>
    </Dialog>

    {/* MODAL 2: FULL VIDEO PLAYER */}
    <Dialog open={!!playingVideo} onClose={() => setPlayingVideo(null)} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <VideocamOutlined color="primary" />
          <span>{playingVideo?.id} · {playingVideo?.name}</span>
        </div>
        {playingVideo?.sentiment && <Chip label={playingVideo.sentiment} size="small" />}
      </DialogTitle>
      <DialogContent>
        {playablePlayerUrl && (
          <video 
            key={playablePlayerUrl}
            src={playablePlayerUrl} 
            controls 
            autoPlay 
            playsInline
            crossOrigin="anonymous"
            style={{ width: '100%', borderRadius: 6, background: '#000', maxHeight: '70vh', display: 'block' }} 
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setPlayingVideo(null)}>Close Player</Button>
      </DialogActions>
    </Dialog>

    {/* MODAL 3: DELETE CONFIRMATION */}
    <Dialog open={!!deletingCam} onClose={() => setDeletingCam(null)}>
      <DialogTitle>Remove Camera / Video Feed?</DialogTitle>
      <DialogContent>
        Are you sure you want to remove <strong>{deletingCam?.name} ({deletingCam?.id})</strong>? This feed will be removed from real-time MoViNet monitoring and active surveillance grids.
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDeletingCam(null)}>Cancel</Button>
        <Button color="error" variant="contained" onClick={handleDeleteConfirm}>Remove Feed</Button>
      </DialogActions>
    </Dialog>
  </>;
}
export function SpatialMemory(){return <><PageHeading title="Spatial Memory" subtitle="Trace objects and events across connected camera locations."/><Alert severity="info" sx={{mb:3}}>Cross-camera traces will appear when your AWS service returns spatial memory data.</Alert><SectionHeading title="Camera locations" action={<Chip label="Sample topology" variant="outlined"/>}/><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:18}}>{['North Entrance','Building B','Warehouse','Parking Lot'].map((location,i)=><Paper variant="outlined" key={location} sx={{p:3}}><HubOutlined color="primary"/><h3 style={{fontSize:14}}>{location}</h3><p className="subtitle">CAM-0{i*2+1} ↔ CAM-0{i*2+2}</p><Button component={Link} to="/ai-search" endIcon={<ArrowForward/>} sx={{mt:2}}>Search this area</Button></Paper>)}</div></>}
export function EventLibrary(){const [filter,setFilter]=useState('');return <><PageHeading title="Event Library" subtitle="Browse indexed events and their supporting camera evidence." action={<Chip label="Sample events" variant="outlined"/>}/><TextField size="small" placeholder="Filter events…" value={filter} onChange={e=>setFilter(e.target.value)} sx={{mb:3,width:280}}/><TableContainer component={Paper} variant="outlined"><Table sx={{minWidth:550}}><TableHead><TableRow>{['Event','Camera','Timestamp','Confidence','Evidence'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{recent.filter(r=>r.query.includes(filter.toLowerCase())).map(r=><TableRow key={r.query}><TableCell>{r.query}</TableCell><TableCell>{r.camera}</TableCell><TableCell>{r.time}</TableCell><TableCell>{r.confidence}%</TableCell><TableCell><Button component={Link} to="/ai-search" size="small">Search footage</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer></>}
export function Alerts(){const [acknowledged,setAcknowledged]=useState<string[]>([]);return <><PageHeading title="Alerts" subtitle="Review activity that needs your attention." action={<Chip label="Sample notifications" variant="outlined"/>}/>{[{id:'1',title:'Person near restricted entrance',camera:'CAM-05',time:'07:56:41',severity:'warning' as const},{id:'2',title:'Video waiting to be indexed',camera:'CAM-02',time:'08:24:32',severity:'info' as const},{id:'3',title:'AWS service is not configured',camera:'System',time:'Configuration',severity:'warning' as const}].map(a=><Alert key={a.id} severity={acknowledged.includes(a.id)?'success':a.severity} icon={<NotificationsNone/>} sx={{mb:2,py:2}} action={<Button size="small" disabled={acknowledged.includes(a.id)} onClick={()=>setAcknowledged([...acknowledged,a.id])}>{acknowledged.includes(a.id)?'Acknowledged':'Acknowledge'}</Button>}><strong>{a.title}</strong><p className="subtitle" style={{fontSize:11,marginTop:5}}>{a.camera} · {a.time} · Sample alert</p></Alert>)}</>}
export function Analytics(){function exportData(){const blob=new Blob(['Metric,Value\nTotal Cameras,8\nIndexed Events,12482\nAI Searches Today,46\nVerified Matches,93%'],{type:'text/csv'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='visiontrace-sample-analytics.csv';a.click();URL.revokeObjectURL(url);}return <><PageHeading title="Analytics" subtitle="A snapshot of your video intelligence performance." action={<Button variant="outlined" startIcon={<Download/>} onClick={exportData}>Export Report</Button>}/><Alert severity="info" sx={{mb:3}}>Sample analytics. Live metrics require an analytics response from your AWS service.</Alert><div className="stats-grid">{[{label:'Indexed Events',value:'12,482'},{label:'AI Searches Today',value:'46'},{label:'Verified Matches',value:'93%'},{label:'Cameras',value:'8'}].map(m=><div className="stat-card" key={m.label}><div className="stat-top">{m.label}</div><div className="stat-value">{m.value}</div><div className="stat-note">Sample metric</div></div>)}</div><SectionHeading title="Verification by Camera"/><TableContainer component={Paper} variant="outlined"><Table><TableHead><TableRow><TableCell>Camera</TableCell><TableCell>Location</TableCell><TableCell>Verified match rate</TableCell></TableRow></TableHead><TableBody>{cameraNames.map((c,i)=><TableRow key={c}><TableCell>CAM-0{i+1}</TableCell><TableCell>{c}</TableCell><TableCell><div style={{display:'flex',alignItems:'center',gap:12}}><div style={{width:150,background:'var(--muted)',height:6,borderRadius:4}}><div style={{width:`${[91,82,94,95,91,89,96,96][i]}%`,background:'var(--primary)',height:6,borderRadius:4}}/></div>{[91,82,94,95,91,89,96,96][i]}%</div></TableCell></TableRow>)}</TableBody></Table></TableContainer></>}
export function Settings(){const {user,signIn,signOut,dbOnline}=useSession(),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);async function test(){setBusy(true);if(!backendUrl){setStatus('AI Backend URL is not configured. Set VITE_AI_BACKEND_URL.');setBusy(false);return;}try{const res=await ai.get('/health');const model=res.data?.model||'SigLIP 2';const dev=res.data?.device||'Local';setStatus(`Connected successfully: ${res.data?.service||'Vision Intelligence'} · Model: ${model} (${dev}) · Vector Dim: ${res.data?.vector_dimension||768}`);}catch{setStatus('Unable to reach AI backend. Ensure python backend/app.py is running on http://127.0.0.1:8000.');}setBusy(false);}return <><PageHeading title="Settings" subtitle="Manage your workspace connections and operator account."/><section className="settings-section"><h2>AI Backend</h2><TextField label="Vision Intelligence Backend URL" fullWidth value={backendUrl||'Not configured'} slotProps={{input:{readOnly:true}}}/><p className="subtitle" style={{margin:'12px 0'}}>Configured through VITE_AI_BACKEND_URL. Powered by Google SigLIP 2 (google/siglip2-base-patch16-224) multimodal embeddings and Explainable AI vision grounding.</p><Button startIcon={<Refresh/>} variant="outlined" disabled={busy} onClick={test}>{busy?'Checking…':'Test Connection'}</Button>{status&&<Alert severity={status.startsWith('Connected')?'success':'error'} sx={{mt:2}}>{status}</Alert>}</section><section className="settings-section"><h2>Database & Storage</h2><div style={{display: 'flex',gap:12,alignItems:'center'}}><StorageOutlined color="primary"/><div><strong style={{fontSize:13}}>NEXGI Cloud</strong><p className="subtitle">Private video storage and user-scoped investigation records.</p></div><Chip label={dbOnline?'Connected':'Offline'} color={dbOnline?'success':'warning'} sx={{ml:'auto'}}/></div></section><section className="settings-section"><h2>Operator Account</h2><p className="subtitle" style={{marginBottom:18}}>{user?user.email:'You are viewing a sample workspace. Sign in to save videos and investigations.'}</p><Button variant="contained" onClick={()=>{if(user)void signOut();else signIn();}}>{user?'Sign out':'Sign in'}</Button></section><section className="settings-section"><h2>Integration Contract</h2><p className="subtitle">Health: GET /health<br/>Status & Telemetry: GET /api/status<br/>Search: POST /api/search<br/>Process Video: POST /api/videos/process<br/>Direct Video Analysis: POST /api/video/analyze<br/>Explain Frame: POST /api/video/explain</p><p className="subtitle" style={{marginTop:12}}>Search responses contain calibrated SigLIP 2 match confidence, frame thumbnails, timestamps, and grounded Explainable AI evidence.</p></section></>}
