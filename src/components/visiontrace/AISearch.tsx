import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  FormControlLabel,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Search,
  ArrowForward,
  AutoAwesomeOutlined,
  VideocamOutlined,
  BookmarkBorder,
  Download,
  Close,
  UploadFile,
  PlayArrow,
  TimerOutlined,
  HubOutlined,
  CheckCircleOutlined,
  ExpandMore,
  Refresh,
} from '@mui/icons-material';
import { ai, backendUrl, resolveMediaUrl, sampleEvidence, type Evidence } from '@/lib/visiontrace/data';
import { PageHeading, SectionHeading, CameraPreview } from './Common';
import { useSession } from './Session';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { SpeechPlayer } from './SpeechPlayer';
import { VoiceInput } from './VoiceInput';

const exampleQueries = [
  'Red sports car moving',
  'Person with a backpack',
  'White van near loading area',
  'Green forest with trees',
  'Blue ocean and sailboat',
];

interface ProcessingBreakdown {
  frame_extraction_ms?: number;
  image_embedding_ms?: number;
  text_embedding_ms?: number;
  similarity_calc_ms?: number;
  ranking_ms?: number;
  explainable_ai_api_ms?: number;
  total_ms?: number;
}

interface VectorStats {
  shape?: number[];
  dimension?: number;
  norm?: number;
  min?: number;
  max?: number;
  mean?: number;
  std?: number;
  first_10_values?: number[];
  preview_values?: number[];
}

interface RankedFrame {
  rank: number;
  frame_number: number;
  sample_index: number;
  timestamp_sec: number;
  timestamp_str: string;
  path: string;
  local_path?: string;
  raw_cosine: number;
  match_score: number;
  match_percentage_str: string;
}

interface AnalysisResponse {
  query: string;
  camera_name?: string;
  video_filename: string;
  video_url?: string;
  frames_analyzed: number;
  processing_time: {
    total_seconds: number;
    total_ms: number;
    breakdown: ProcessingBreakdown;
  };
  overall_video?: {
    pooled_video_raw_cosine: number;
    peak_frame_raw_cosine: number;
    peak_frame_match_score: number;
    peak_frame_match_percentage_str: string;
    video_embedding?: VectorStats;
    query_embedding?: VectorStats;
  };
  best_matching_frame: {
    frame_number: number;
    sample_index: number;
    timestamp_sec: number;
    timestamp_str: string;
    match_score: number;
    match_percentage_str: string;
    raw_cosine: number;
    path: string;
    embedding_stats?: VectorStats;
  };
  explainable_ai?: {
    success: boolean;
    explanation?: string;
    error?: string;
    latency_ms?: number;
    image_url?: string;
  };
  embeddings?: {
    query?: VectorStats;
    best_frame?: VectorStats;
    video_pooled?: VectorStats;
  };
  ranked_frames: RankedFrame[];
}

export function AISearch() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
  const [cameraName, setCameraName] = useState('CAM-01 Main Gate');
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedFrame, setSelectedFrame] = useState<RankedFrame | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [boxes, setBoxes] = useState(true);

  const videoPlayerRef = useRef<HTMLVideoElement | null>(null);
  const voiceBase = useRef('');
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState('');

  const { user, signIn } = useSession();
  const qc = useQueryClient();

  // Video Selection Handler - plays video immediately
  function handleVideoSelect(file: File) {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    const nextUrl = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoPreviewUrl(nextUrl);
    setNotice(`Loaded video: "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB). Ready for AI search.`);
  }

  // Seek video player to exact timestamp
  function seekVideo(seconds: number) {
    if (videoPlayerRef.current) {
      videoPlayerRef.current.currentTime = seconds;
      videoPlayerRef.current.play().catch(() => {});
      videoPlayerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Deep Multimodal Analysis Mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!videoFile) {
        throw new Error('Please select or upload a video file first.');
      }
      if (!query.trim()) {
        throw new Error('Enter a question or description to search in the video.');
      }

      setSearched(query.trim());
      setNotice('');

      const formData = new FormData();
      formData.append('video_file', videoFile);
      formData.append('query', query.trim());
      formData.append('camera_name', cameraName.trim() || 'CAM-01');
      formData.append('max_frames', '32');
      formData.append('sample_fps', '1.0');

      const { data } = await ai.post<AnalysisResponse>('/api/video/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });

      return data;
    },
    onError: (err: any) => {
      setNotice(`Analysis failed: ${err.response?.data?.detail || err.message}`);
    },
  });

  const analysis = analyzeMutation.data;

  // Save investigation to Supabase
  async function saveInvestigation() {
    if (!user) {
      signIn();
      return;
    }
    if (!analysis) return;

    const payload = {
      user_id: user.id,
      query: searched,
      camera_name: cameraName,
      evidence: analysis as unknown as Json,
    };

    const { error } = await supabase.from('investigations').insert(payload as any);
    setNotice(error ? error.message : 'Investigation successfully saved to your workspace.');
    void qc.invalidateQueries({ queryKey: ['investigations'] });
  }

  function downloadReport() {
    if (!analysis) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(analysis, null, 2)], { type: 'application/json' }));
    a.download = `nexgi-ai-analysis-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <PageHeading
        title="AI CCTV Video Search"
        subtitle="Upload a video, watch playback in real-time, and align text queries with exact frame timestamps."
        action={
          <Chip
            icon={<AutoAwesomeOutlined sx={{ fontSize: '14px!important' }} />}
            label="SigLIP 2 Multimodal"
            variant="outlined"
            color="primary"
          />
        }
      />

      {notice && (
        <Alert
          severity={notice.includes('failed') || notice.includes('Error') ? 'error' : 'info'}
          sx={{ mb: 3 }}
          onClose={() => setNotice('')}
        >
          {notice}
        </Alert>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SECTION 1: VIDEO INGESTION & DIRECT IN-PAGE VIDEO PLAYER       */}
      {/* ------------------------------------------------------------- */}
      <section className="search-panel" style={{ marginBottom: 24, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="health-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
              <VideocamOutlined />
            </span>
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 650 }}>Video Source</h2>
              <p className="subtitle">
                {videoFile ? `Playing: ${videoFile.name}` : 'Select any surveillance or test recording (.mp4, .mov, .avi)'}
              </p>
            </div>
          </div>

          <Button
            component="label"
            variant={videoFile ? 'outlined' : 'contained'}
            startIcon={<UploadFile />}
            size="small"
          >
            {videoFile ? 'Change Video' : 'Choose Video File'}
            <input
              type="file"
              hidden
              accept="video/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleVideoSelect(file);
              }}
            />
          </Button>
        </div>

        {/* Video Player (Plays video immediately once given) */}
        {videoPreviewUrl ? (
          <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000', marginBottom: 20 }}>
            <video
              ref={videoPlayerRef}
              src={videoPreviewUrl}
              controls
              autoPlay
              playsInline
              style={{ width: '100%', maxHeight: 480, display: 'block', objectFit: 'contain' }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 14px',
                background: 'rgba(0,0,0,0.85)',
                color: '#fff',
                fontSize: 12,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="dot" /> {cameraName || 'CCTV Channel'} · {videoFile?.name}
              </span>
              <span>{(videoFile ? videoFile.size / (1024 * 1024) : 0).toFixed(1)} MB</span>
            </div>
          </div>
        ) : (
          <div
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 10,
              padding: '36px 20px',
              textAlign: 'center',
              background: 'var(--card)',
              marginBottom: 20,
            }}
          >
            <VideocamOutlined sx={{ fontSize: 44, color: 'var(--muted-foreground)', mb: 1 }} />
            <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>No video selected yet</h3>
            <p className="subtitle" style={{ maxWidth: 450, margin: '0 auto 16px' }}>
              Choose a surveillance video file from your computer to play it directly and run natural language frame alignment.
            </p>
            <Button component="label" variant="contained" startIcon={<UploadFile />}>
              Select Video to Play & Search
              <input
                type="file"
                hidden
                accept="video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleVideoSelect(file);
                }}
              />
            </Button>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* SECTION 2: AI SEARCH FORM (CAMERA NAME & NATURAL LANGUAGE)    */}
        {/* ------------------------------------------------------------- */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 2fr', gap: 16, marginBottom: 16 }}>
          <TextField
            label="Camera Name / ID"
            value={cameraName}
            onChange={(e) => setCameraName(e.target.value)}
            placeholder="e.g. Main Gate CAM-01"
            size="small"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <VideocamOutlined sx={{ fontSize: 20, color: 'var(--muted-foreground)' }} />
                  </InputAdornment>
                ),
              },
            }}
          />

          <TextField
            fullWidth
            placeholder="Search query (e.g. 'Red sports car moving', 'Person in dark jacket')..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !analyzeMutation.isPending && videoFile && query.trim()) {
                e.preventDefault();
                analyzeMutation.mutate();
              }
            }}
            size="small"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ fontSize: 20, color: 'var(--muted-foreground)' }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <VoiceInput
                      onStart={() => {
                        voiceBase.current = query;
                      }}
                      onText={(text) => setQuery([voiceBase.current, text].filter(Boolean).join(' '))}
                      onBusy={setVoiceBusy}
                      onError={setVoiceError}
                    />
                  </InputAdornment>
                ),
              },
            }}
          />
        </div>

        {voiceError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setVoiceError('')}>
            {voiceError}
          </Alert>
        )}

        {/* Quick Example Suggestions */}
        <div className="search-examples" style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginRight: 6 }}>Try query:</span>
          {exampleQueries.map((q) => (
            <Chip key={q} label={q} variant="outlined" size="small" onClick={() => setQuery(q)} />
          ))}
        </div>

        {/* Analyze Action Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
            Uses Google SigLIP 2 Multimodal Embeddings + Explainable AI vision analysis
          </span>

          <Button
            variant="contained"
            color="primary"
            disabled={!videoFile || !query.trim() || analyzeMutation.isPending}
            onClick={() => analyzeMutation.mutate()}
            startIcon={analyzeMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeOutlined />}
            sx={{ minWidth: 200 }}
          >
            {analyzeMutation.isPending ? 'Analyzing Video...' : 'Analyze Video & Search'}
          </Button>
        </div>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 3: ANALYSIS RESULTS (TIMING, SIMILARITY, VECTORS)     */}
      {/* ------------------------------------------------------------- */}
      {analysis && (
        <>
          <SectionHeading
            title={`Analysis Results for "${searched}"`}
            action={
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="outlined" size="small" startIcon={<Download />} onClick={downloadReport}>
                  Export JSON
                </Button>
                <Button variant="contained" size="small" startIcon={<BookmarkBorder />} onClick={saveInvestigation}>
                  Save Investigation
                </Button>
              </div>
            }
          />

          {/* 1. Processing Time Breakdown */}
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              mb: 3,
              borderRadius: 2,
              background: 'linear-gradient(135deg, rgba(33, 150, 243, 0.05), rgba(76, 175, 80, 0.05))',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TimerOutlined color="primary" />
                <strong style={{ fontSize: 14 }}>Total Processing Time:</strong>
                <Chip
                  label={`${analysis.processing_time.total_seconds} s (${analysis.processing_time.total_ms} ms)`}
                  color="success"
                  size="small"
                  sx={{ fontWeight: 650 }}
                />
                <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginLeft: 8 }}>
                  Analyzed {analysis.frames_analyzed} sampled frames
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {analysis.processing_time.breakdown && (
                <>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Frame Extraction: ${analysis.processing_time.breakdown.frame_extraction_ms ?? 0} ms`}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`SigLIP 2 Image Embed: ${analysis.processing_time.breakdown.image_embedding_ms ?? 0} ms`}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Query Text Embed: ${analysis.processing_time.breakdown.text_embedding_ms ?? 0} ms`}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Similarity Matrix: ${analysis.processing_time.breakdown.similarity_calc_ms ?? 0} ms`}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Frame Ranking: ${analysis.processing_time.breakdown.ranking_ms ?? 0} ms`}
                  />
                  {analysis.processing_time.breakdown.explainable_ai_api_ms !== undefined && (
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      label={`Explainable AI Vision API: ${analysis.processing_time.breakdown.explainable_ai_api_ms} ms`}
                    />
                  )}
                </>
              )}
            </div>
          </Paper>

          {/* 2. Top-1 Best Matching Frame & Similarity */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>
            {/* Best Match Frame Card */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 650, fontSize: 14 }}>
                  <CheckCircleOutlined color="success" /> Best Matching Frame (#1)
                </span>
                <Chip
                  label={`${analysis.best_matching_frame.match_score.toFixed(1)}% match`}
                  color="success"
                  size="small"
                  sx={{ fontWeight: 700 }}
                />
              </div>

              <div style={{ borderRadius: 8, overflow: 'hidden', position: 'relative', background: '#000', marginBottom: 12 }}>
                <img
                  src={resolveMediaUrl(analysis.best_matching_frame.path)}
                  alt={`Peak Frame at ${analysis.best_matching_frame.timestamp_str}`}
                  style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '6px 12px',
                    background: 'rgba(0,0,0,0.75)',
                    color: '#fff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                  }}
                >
                  <span>Frame #{analysis.best_matching_frame.frame_number}</span>
                  <strong>Timestamp: {analysis.best_matching_frame.timestamp_str}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Raw SigLIP 2 Cosine</div>
                  <strong style={{ fontSize: 15 }}>{analysis.best_matching_frame.raw_cosine.toFixed(4)}</strong>
                </div>
                {analysis.overall_video?.pooled_video_raw_cosine !== undefined && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Overall Video Cosine</div>
                    <strong style={{ fontSize: 15 }}>{analysis.overall_video.pooled_video_raw_cosine.toFixed(4)}</strong>
                  </div>
                )}
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PlayArrow />}
                  onClick={() => seekVideo(analysis.best_matching_frame.timestamp_sec)}
                >
                  Play at {analysis.best_matching_frame.timestamp_str}
                </Button>
              </div>
            </Paper>

            {/* Explainable AI Visual Analysis */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <AutoAwesomeOutlined color="primary" />
                <strong style={{ fontSize: 14 }}>Explainable AI Visual Analysis</strong>
              </div>

              {analysis.explainable_ai?.explanation ? (
                <>
                  <div
                    style={{
                      background: 'rgba(33, 150, 243, 0.08)',
                      border: '1px solid rgba(33, 150, 243, 0.25)',
                      borderRadius: 8,
                      padding: 14,
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      marginBottom: 14,
                      color: 'var(--card-foreground)',
                    }}
                  >
                    {analysis.explainable_ai.explanation}
                  </div>

                  <SpeechPlayer
                    text={`Top matching frame for query ${searched} at timestamp ${analysis.best_matching_frame.timestamp_str}. Match confidence ${analysis.best_matching_frame.match_score} percent. Visual evidence: ${analysis.explainable_ai.explanation}`}
                  />

                  {analysis.explainable_ai.image_url && (
                    <div style={{ marginTop: 10, fontSize: 11 }}>
                      <a
                        href={analysis.explainable_ai.image_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--primary)', textDecoration: 'underline' }}
                      >
                        View Public S3 Grounding Image
                      </a>
                    </div>
                  )}
                </>
              ) : (
                <Alert severity="info">
                  {analysis.explainable_ai?.error ||
                    `Visual match confirmed with raw cosine similarity ${analysis.best_matching_frame.raw_cosine.toFixed(4)} at ${analysis.best_matching_frame.timestamp_str}.`}
                </Alert>
              )}
            </Paper>
          </div>

          {/* 3. Both Vector Embeddings (Query & Image Frame) */}
          <Accordion variant="outlined" sx={{ mb: 3, borderRadius: '8px!important' }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HubOutlined color="primary" />
                <strong style={{ fontSize: 13 }}>Multimodal Vector Embeddings (768-D Dense Embeddings)</strong>
                <Chip label="SigLIP 2 L2-Normalized" size="small" variant="outlined" />
              </div>
            </AccordionSummary>
            <AccordionDetails>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                {/* Text Query Vector */}
                {(analysis.embeddings?.query || analysis.overall_video?.query_embedding) && (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--primary)' }}>
                      Query Text Vector Embedding
                    </h4>
                    {(() => {
                      const v = analysis.embeddings?.query || analysis.overall_video?.query_embedding;
                      return (
                        <div style={{ fontSize: 11 }}>
                          <div><strong>Dimension:</strong> {v?.dimension ?? 768}</div>
                          <div><strong>L2 Norm:</strong> {v?.norm}</div>
                          <div><strong>Min / Max:</strong> {v?.min} / {v?.max}</div>
                          <div><strong>Mean / Std:</strong> {v?.mean} / {v?.std}</div>
                          <div style={{ marginTop: 8 }}>
                            <strong style={{ display: 'block', marginBottom: 4 }}>First values preview:</strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 80, overflowY: 'auto' }}>
                              {(v?.preview_values || v?.first_10_values || []).map((val, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    background: 'var(--muted)',
                                    padding: '2px 5px',
                                    borderRadius: 3,
                                    fontSize: 10,
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {val}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </Paper>
                )}

                {/* Best Matching Frame Vector */}
                {(analysis.embeddings?.best_frame || analysis.best_matching_frame.embedding_stats) && (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--success)' }}>
                      Peak Frame Image Vector Embedding
                    </h4>
                    {(() => {
                      const v = analysis.embeddings?.best_frame || analysis.best_matching_frame.embedding_stats;
                      return (
                        <div style={{ fontSize: 11 }}>
                          <div><strong>Dimension:</strong> {v?.dimension ?? 768}</div>
                          <div><strong>L2 Norm:</strong> {v?.norm}</div>
                          <div><strong>Min / Max:</strong> {v?.min} / {v?.max}</div>
                          <div><strong>Mean / Std:</strong> {v?.mean} / {v?.std}</div>
                          <div style={{ marginTop: 8 }}>
                            <strong style={{ display: 'block', marginBottom: 4 }}>First values preview:</strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 80, overflowY: 'auto' }}>
                              {(v?.preview_values || v?.first_10_values || []).map((val, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    background: 'var(--muted)',
                                    padding: '2px 5px',
                                    borderRadius: 3,
                                    fontSize: 10,
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {val}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </Paper>
                )}
              </div>
            </AccordionDetails>
          </Accordion>

          {/* 4. Similar Images / Ranked Frame Gallery */}
          <SectionHeading
            title={`Similar Matching Frames (${analysis.ranked_frames.length})`}
            action={<Chip label="Ranked by SigLIP 2 Cosine Similarity" size="small" variant="outlined" />}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
              marginBottom: 32,
            }}
          >
            {analysis.ranked_frames.map((frame) => (
              <Paper
                key={frame.rank}
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  overflow: 'hidden',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                  '&:hover': { transform: 'translateY(-2px)', borderColor: 'var(--primary)' },
                }}
              >
                <div style={{ position: 'relative', height: 130, background: '#000' }}>
                  <img
                    src={resolveMediaUrl(frame.path)}
                    alt={`Frame at ${frame.timestamp_str}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      background: frame.rank === 1 ? 'var(--primary)' : 'rgba(0,0,0,0.75)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    #{frame.rank}
                  </span>
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 6,
                      right: 6,
                      background: 'rgba(0,0,0,0.8)',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {frame.timestamp_str}
                  </span>
                </div>

                <div style={{ padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ fontSize: 12 }}>{frame.match_percentage_str}</strong>
                    <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                      cos: {frame.raw_cosine.toFixed(4)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button
                      fullWidth
                      variant="outlined"
                      size="small"
                      startIcon={<PlayArrow sx={{ fontSize: 14 }} />}
                      onClick={() => seekVideo(frame.timestamp_sec)}
                      sx={{ fontSize: 10.5 }}
                    >
                      Seek {frame.timestamp_str}
                    </Button>
                    <Tooltip title="Inspect Frame">
                      <IconButton
                        size="small"
                        onClick={() => setSelectedFrame(frame)}
                        sx={{ border: '1px solid var(--border)' }}
                      >
                        <Search sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </div>
                </div>
              </Paper>
            ))}
          </div>
        </>
      )}

      {/* Frame Inspection Dialog */}
      <Dialog open={!!selectedFrame} onClose={() => setSelectedFrame(null)} maxWidth="md" fullWidth>
        <DialogTitle style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Frame #{selectedFrame?.frame_number} at {selectedFrame?.timestamp_str}
          <IconButton onClick={() => setSelectedFrame(null)} aria-label="Close">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {selectedFrame && (
            <>
              <div style={{ borderRadius: 8, overflow: 'hidden', background: '#000', marginBottom: 14 }}>
                <img
                  src={resolveMediaUrl(selectedFrame.path)}
                  alt={`Frame at ${selectedFrame.timestamp_str}`}
                  style={{ width: '100%', maxHeight: 440, objectFit: 'contain', display: 'block' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Match Score</div>
                  <strong style={{ fontSize: 16 }}>{selectedFrame.match_percentage_str}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Raw SigLIP 2 Cosine</div>
                  <strong style={{ fontSize: 16 }}>{selectedFrame.raw_cosine.toFixed(4)}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Timestamp</div>
                  <strong style={{ fontSize: 16 }}>{selectedFrame.timestamp_str} ({selectedFrame.timestamp_sec}s)</strong>
                </div>
              </div>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            startIcon={<PlayArrow />}
            onClick={() => {
              if (selectedFrame) {
                seekVideo(selectedFrame.timestamp_sec);
                setSelectedFrame(null);
              }
            }}
          >
            Play Video at This Frame
          </Button>
          <Button onClick={() => setSelectedFrame(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
