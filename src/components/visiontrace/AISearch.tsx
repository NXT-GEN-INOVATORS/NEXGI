import { useEffect, useRef, useState } from 'react';
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
  Tabs,
  Tab,
  Badge,
  Divider,
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
  ChatOutlined,
  SendOutlined,
  DeleteOutlined,
  PsychologyOutlined,
  CloudQueueOutlined,
  MemoryOutlined,
  StorageOutlined,
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
  ai_text_generation_ms?: number;
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

interface StreamMetrics {
  total_generation_seconds?: number;
  total_generation_ms?: number;
  total_pipeline_seconds?: number;
  total_pipeline_ms?: number;
  chunks_count?: number;
  words_count?: number;
  words_per_second?: number;
  first_chunk_latency_ms?: number;
}

interface QdrantStatus {
  connected: boolean;
  url?: string;
  error?: string | null;
  total_vectors?: number;
  video_frames_count?: number;
  chat_memory_count?: number;
  collections?: Record<string, { points_count: number; indexed_vectors_count?: number; status: string }>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  epoch?: number;
  camera_name?: string;
  recalled_memories?: Array<{ content: string; score: number; role: string }>;
  generation_seconds?: number;
  words_count?: number;
}

interface AnalysisResponse {
  query: string;
  camera_name?: string;
  video_filename: string;
  video_url?: string;
  frames_analyzed: number;
  qdrant_vectors_synced?: number;
  processing_time: {
    total_seconds: number;
    total_ms: number;
    total_generation_seconds?: number;
    ai_generation_seconds?: number;
    ai_generation_ms?: number;
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
    local_path?: string;
    embedding_stats?: VectorStats;
  };
  explainable_ai?: {
    success: boolean;
    explanation?: string;
    error?: string;
    latency_ms?: number;
    total_generation_ms?: number;
    total_generation_seconds?: number;
    chunks_count?: number;
    words_count?: number;
    words_per_second?: number;
    first_chunk_latency_ms?: number;
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
  const [cameraName, setCameraName] = useState('');
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

  // Streaming state for Explainable AI chunks and generation metrics
  const [isStreamingAI, setIsStreamingAI] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [streamChunksCount, setStreamChunksCount] = useState(0);
  const [streamElapsedSec, setStreamElapsedSec] = useState(0);
  const [streamMetrics, setStreamMetrics] = useState<StreamMetrics | null>(null);
  const [groundingImageUrl, setGroundingImageUrl] = useState<string | null>(null);

  const { user, signIn } = useSession();
  const qc = useQueryClient();

  // Tab mode: 'video' (default Video Alignment & Player) vs 'chat' (Ask your CCTV with Qdrant Memory)
  const [activeTab, setActiveTab] = useState<'video' | 'chat'>('video');
  const [qdrantStatus, setQdrantStatus] = useState<QdrantStatus | null>(null);

  // Stateful Chat Memory State (Qdrant Cloud)
  const [sessionId, setSessionId] = useState<string>('cctv-live-session');
  const [chatInput, setChatInput] = useState('');
  const [chatCamName, setChatCamName] = useState('CAM-01 Gate');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatStreamingText, setChatStreamingText] = useState('');
  const [chatStreamElapsedSec, setChatStreamElapsedSec] = useState(0);
  const [chatRecalledMemories, setChatRecalledMemories] = useState<any[]>([]);
  const [chatMatchedFrames, setChatMatchedFrames] = useState<any[]>([]);
  const [chatNotice, setChatNotice] = useState('');
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch Qdrant Cloud health & collection telemetry
  async function fetchQdrantStatus() {
    try {
      const res = await fetch(`${backendUrl}/api/qdrant/status`);
      if (res.ok) {
        const data = await res.json();
        setQdrantStatus(data);
      }
    } catch (e) {
      console.warn('Qdrant status check:', e);
    }
  }

  // Fetch Chat History from Qdrant Cloud
  async function fetchChatHistory(sId: string = sessionId) {
    try {
      const res = await fetch(`${backendUrl}/api/chat/history?session_id=${encodeURIComponent(sId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          setChatMessages(data.messages);
        }
      }
    } catch (e) {
      console.warn('Chat history fetch:', e);
    }
  }

  // Periodic Qdrant sync and initial load
  useEffect(() => {
    void fetchQdrantStatus();
    void fetchChatHistory();
    const interval = setInterval(() => {
      void fetchQdrantStatus();
    }, 15000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Scroll chat messages to bottom
  useEffect(() => {
    if (activeTab === 'chat' && chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatStreamingText, activeTab]);

  // Clear Session Memory in Qdrant Cloud
  async function handleClearChatMemory() {
    try {
      const res = await fetch(`${backendUrl}/api/chat/history?session_id=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setChatMessages([]);
        setChatNotice('Cleared session memory from Qdrant Cloud.');
        void fetchQdrantStatus();
      }
    } catch (err: any) {
      setChatNotice(`Failed to clear memory: ${err.message}`);
    }
  }

  // Send Chat Message with Real-Time Chunk Streaming and Qdrant Memory Recall
  async function handleSendChatMessage(customQuery?: string) {
    const textToSend = (customQuery || chatInput).trim();
    if (!textToSend || isChatSending) return;

    setChatInput('');
    setChatNotice('');
    setIsChatSending(true);
    setChatStreamingText('');
    setChatStreamElapsedSec(0);
    setChatRecalledMemories([]);
    setChatMatchedFrames([]);

    // Optimistically add user turn
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString(),
      camera_name: chatCamName,
    };
    setChatMessages((prev) => [...prev, userMsg]);

    const tStart = performance.now();
    const timer = setInterval(() => {
      setChatStreamElapsedSec(Number(((performance.now() - tStart) / 1000).toFixed(1)));
    }, 100);

    try {
      const form = new FormData();
      form.append('message', textToSend);
      form.append('session_id', sessionId);
      form.append('camera_name', chatCamName);

      const res = await fetch(`${backendUrl}/api/chat/stream`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        // Fallback to non-streaming POST /api/chat/message
        const fallbackRes = await fetch(`${backendUrl}/api/chat/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: textToSend,
            session_id: sessionId,
            camera_name: chatCamName,
          }),
        });
        if (!fallbackRes.ok) throw new Error(`HTTP ${fallbackRes.status}`);
        const fallbackData = await fallbackRes.json();
        clearInterval(timer);
        setIsChatSending(false);

        const asstMsg: ChatMessage = {
          id: fallbackData.assistant_turn_id || `asst-${Date.now()}`,
          role: 'assistant',
          content: fallbackData.reply || fallbackData.message,
          timestamp: new Date().toISOString(),
          camera_name: chatCamName,
          recalled_memories: fallbackData.relevant_memories,
          generation_seconds: fallbackData.total_generation_seconds,
          words_count: fallbackData.words_count,
        };
        setChatMessages((prev) => [...prev, asstMsg]);
        if (fallbackData.qdrant_status) setQdrantStatus(fallbackData.qdrant_status);
        return;
      }

      if (!res.body) throw new Error('No body stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';
      let recalledMems: any[] = [];
      let matchedFrs: any[] = [];
      let finalGenSec = 0;

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
              if (event.type === 'memory_recalled') {
                recalledMems = event.memories || [];
                matchedFrs = event.matched_frames || [];
                setChatRecalledMemories(recalledMems);
                setChatMatchedFrames(matchedFrs);
              } else if (event.type === 'chunk') {
                accumulated = event.accumulated;
                setChatStreamingText(accumulated);
                if (event.elapsed_generation_seconds !== undefined) {
                  setChatStreamElapsedSec(event.elapsed_generation_seconds);
                }
              } else if (event.type === 'done') {
                clearInterval(timer);
                finalGenSec = event.total_generation_seconds || Number(((performance.now() - tStart) / 1000).toFixed(2));
                const finalReply = event.reply || accumulated;
                setChatStreamingText('');
                setIsChatSending(false);

                const asstMsg: ChatMessage = {
                  id: event.assistant_turn_id || `asst-${Date.now()}`,
                  role: 'assistant',
                  content: finalReply,
                  timestamp: new Date().toISOString(),
                  camera_name: chatCamName,
                  recalled_memories: recalledMems,
                  generation_seconds: finalGenSec,
                  words_count: finalReply.split(/\s+/).filter(Boolean).length,
                };
                setChatMessages((prev) => [...prev, asstMsg]);
                if (event.qdrant_status) setQdrantStatus(event.qdrant_status);
              } else if (event.type === 'error') {
                clearInterval(timer);
                setIsChatSending(false);
                setChatNotice(`AI Generation Notice: ${event.error}`);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      clearInterval(timer);
      setIsChatSending(false);
      setChatNotice(`Chat error: ${err.message}`);
    } finally {
      clearInterval(timer);
      void fetchQdrantStatus();
    }
  }

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

  // Real-time chunk stream consumer from Explainable AI endpoint
  async function streamAIExplanation(
    framePath: string,
    queryText: string,
    frameNumber?: number,
    timestampStr?: string,
    existingImageUrl?: string,
  ) {
    setIsStreamingAI(true);
    setStreamedText('');
    setStreamChunksCount(0);
    setStreamElapsedSec(0);
    setStreamMetrics(null);
    if (existingImageUrl) setGroundingImageUrl(existingImageUrl);

    const startTime = performance.now();
    const timerInterval = setInterval(() => {
      setStreamElapsedSec(Number(((performance.now() - startTime) / 1000).toFixed(1)));
    }, 100);

    try {
      const formData = new FormData();
      formData.append('frame_path', framePath);
      formData.append('query', queryText);
      if (frameNumber !== undefined) formData.append('frame_number', String(frameNumber));
      if (timestampStr) formData.append('timestamp_str', timestampStr);
      if (existingImageUrl) formData.append('image_url', existingImageUrl);

      const res = await fetch(`${backendUrl}/api/video/explain/stream`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to connect to AI streaming endpoint`);
      }

      if (!res.body) {
        throw new Error('ReadableStream not supported on this response');
      }

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
              if (event.type === 'image_ready' && event.image_url) {
                setGroundingImageUrl(event.image_url);
              } else if (event.type === 'chunk') {
                accumulated = event.accumulated;
                setStreamedText(accumulated);
                setStreamChunksCount(event.chunk_index);
                if (event.elapsed_generation_seconds !== undefined) {
                  setStreamElapsedSec(event.elapsed_generation_seconds);
                }
              } else if (event.type === 'done') {
                clearInterval(timerInterval);
                const finalExplanation = event.explanation || accumulated;
                setStreamedText(finalExplanation);
                setStreamMetrics({
                  total_generation_seconds: event.total_generation_seconds,
                  total_generation_ms: event.total_generation_ms,
                  total_pipeline_seconds: event.total_pipeline_seconds,
                  total_pipeline_ms: event.total_pipeline_ms,
                  chunks_count: event.chunks_count,
                  words_count: event.words_count,
                  words_per_second: event.words_per_second,
                  first_chunk_latency_ms: event.first_chunk_latency_ms,
                });
                if (event.image_url) setGroundingImageUrl(event.image_url);
                setIsStreamingAI(false);
              } else if (event.type === 'error') {
                clearInterval(timerInterval);
                setIsStreamingAI(false);
                setNotice(`AI generation note: ${event.error}`);
              }
            } catch (err) {
              // ignore parse errors on fragmented lines
            }
          }
        }
      }
    } catch (err: any) {
      clearInterval(timerInterval);
      setIsStreamingAI(false);
      setNotice(`AI stream error: ${err.message}`);
    } finally {
      clearInterval(timerInterval);
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
      setStreamedText('');
      setStreamChunksCount(0);
      setStreamElapsedSec(0);
      setStreamMetrics(null);

      const formData = new FormData();
      formData.append('video_file', videoFile);
      formData.append('query', query.trim());
      formData.append('camera_name', cameraName.trim() || 'Camera Feed');
      formData.append('max_frames', '32');
      formData.append('sample_fps', '1.0');
      formData.append('call_xai', 'false'); // Return instantly (1s), stream AI chunks in real-time!

      const { data } = await ai.post<AnalysisResponse>('/api/video/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });

      return data;
    },
    onSuccess: (data) => {
      if (data.best_matching_frame) {
        void streamAIExplanation(
          data.best_matching_frame.path,
          query.trim(),
          data.best_matching_frame.frame_number,
          data.best_matching_frame.timestamp_str,
        );
      }
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
        title="AI CCTV Video Search & Spatial Memory"
        subtitle="Multimodal SigLIP 2 frame alignment and stateful conversational memory backed by Qdrant Cloud."
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              icon={<MemoryOutlined sx={{ fontSize: '15px!important' }} />}
              label={
                qdrantStatus?.connected
                  ? `Qdrant Cloud: Connected · ${qdrantStatus.total_vectors ?? 0} Vectors (768-D)`
                  : 'Qdrant Cloud: Connecting...'
              }
              color={qdrantStatus?.connected ? 'success' : 'default'}
              variant={qdrantStatus?.connected ? 'outlined' : 'filled'}
              sx={{ fontWeight: 600, height: 28 }}
            />
            <Chip
              icon={<AutoAwesomeOutlined sx={{ fontSize: '14px!important' }} />}
              label="SigLIP 2 Multimodal"
              variant="outlined"
              color="primary"
              sx={{ height: 28 }}
            />
          </div>
        }
      />

      {/* Mode Navigation Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_e, val) => setActiveTab(val)}
        sx={{ mb: 3, borderBottom: '1px solid var(--border)' }}
      >
        <Tab
          value="video"
          label="Video Search & Similar Frames"
          icon={<VideocamOutlined sx={{ fontSize: 18 }} />}
          iconPosition="start"
          sx={{ fontWeight: 600, textTransform: 'none', fontSize: 13 }}
        />
        <Tab
          value="chat"
          label={
            <Badge
              badgeContent={chatMessages.length > 0 ? chatMessages.length : undefined}
              color="primary"
              sx={{ '& .MuiBadge-badge': { fontSize: 10, height: 16, minWidth: 16 } }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Ask your CCTV · Vector Memory Chat
              </span>
            </Badge>
          }
          icon={<ChatOutlined sx={{ fontSize: 18 }} />}
          iconPosition="start"
          sx={{ fontWeight: 600, textTransform: 'none', fontSize: 13 }}
        />
      </Tabs>

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
      {/* TAB 2: ASK YOUR CCTV · CONVERSATIONAL MEMORY CHAT (QDRANT)     */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'chat' && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 4, background: 'var(--card)' }}>
          {/* Top Session & Camera Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ChatOutlined fontSize="small" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Ask your CCTV · Vector Memory Assistant
                  <Chip size="small" color="success" label="Qdrant Stateful" sx={{ height: 18, fontSize: 9, fontWeight: 700 }} />
                </h3>
                <p className="subtitle" style={{ fontSize: 11, margin: 0 }}>
                  Continuous surveillance memory persisted in Qdrant Cloud (768-D SigLIP 2 Cosine Space)
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label="Surveillance Session ID"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                sx={{ width: 190 }}
                slotProps={{ input: { sx: { fontSize: 12, height: 32 } } }}
              />

              <TextField
                size="small"
                label="Active Camera Feed"
                value={chatCamName}
                onChange={(e) => setChatCamName(e.target.value)}
                sx={{ width: 160 }}
                slotProps={{ input: { sx: { fontSize: 12, height: 32 } } }}
              />

              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<DeleteOutlined sx={{ fontSize: 15 }} />}
                onClick={handleClearChatMemory}
                disabled={chatMessages.length === 0}
                sx={{ height: 32, fontSize: 11 }}
              >
                Clear Memory
              </Button>
            </div>
          </div>

          {chatNotice && (
            <Alert severity="info" sx={{ mb: 2 }} onClose={() => setChatNotice('')}>
              {chatNotice}
            </Alert>
          )}

          {/* Chat Messages List */}
          <div
            style={{
              maxHeight: 460,
              minHeight: 280,
              overflowY: 'auto',
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(0, 0, 0, 0.02)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              marginBottom: 16,
            }}
          >
            {chatMessages.length === 0 && !isChatSending && (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--muted-foreground)' }}>
                <PsychologyOutlined sx={{ fontSize: 44, opacity: 0.35, mb: 1, color: 'var(--primary)' }} />
                <h4 style={{ margin: '0 0 6px', fontSize: 15, color: 'var(--foreground)' }}>
                  Stateful CCTV Memory Standby
                </h4>
                <p style={{ fontSize: 12, margin: '0 0 18px', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                  Ask natural language questions about your surveillance cameras, suspects, or past events.
                  Prior turns and video frame observations are recalled automatically from Qdrant Cloud.
                </p>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 640, margin: '0 auto' }}>
                  {[
                    'Report on the latest gate activity and confirm vector memory active.',
                    'Did any red vehicle or suspect pass through earlier?',
                    'Summarize all observed sightings and state confidence.',
                    'What was my previous question about the gate?',
                  ].map((preset) => (
                    <Chip
                      key={preset}
                      label={preset}
                      size="small"
                      variant="outlined"
                      onClick={() => void handleSendChatMessage(preset)}
                      sx={{ fontSize: 11, cursor: 'pointer', '&:hover': { borderColor: 'var(--primary)', color: 'var(--primary)' } }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Rendered Messages */}
            {chatMessages.map((msg, idx) => (
              <div
                key={msg.id || idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 10.5, color: 'var(--muted-foreground)' }}>
                  <strong>{msg.role === 'user' ? 'Security Operator' : 'NEXGI Vision AI (Qwen3)'}</strong>
                  {msg.camera_name && <span>• {msg.camera_name}</span>}
                  {msg.generation_seconds !== undefined && (
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>• ⏱️ {msg.generation_seconds}s</span>
                  )}
                </div>

                <div
                  style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    background:
                      msg.role === 'user'
                        ? 'var(--primary)'
                        : 'var(--card)',
                    color: msg.role === 'user' ? '#ffffff' : 'var(--foreground)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}

                  {/* Recalled Memory Pill if available */}
                  {msg.recalled_memories && msg.recalled_memories.length > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '6px 8px',
                        borderRadius: 6,
                        background: 'rgba(2, 132, 199, 0.08)',
                        border: '1px solid rgba(2, 132, 199, 0.2)',
                        fontSize: 11,
                        color: 'var(--foreground)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, color: '#0284c7', marginBottom: 2 }}>
                        <MemoryOutlined sx={{ fontSize: 13 }} />
                        <span>Recalled from Qdrant Cloud Memory ({msg.recalled_memories.length} turns):</span>
                      </div>
                      {msg.recalled_memories.slice(0, 2).map((rm, rIdx) => (
                        <div key={rIdx} style={{ fontSize: 10.5, color: 'var(--muted-foreground)', marginLeft: 8 }}>
                          • "{rm.content?.slice(0, 80)}..." (Cosine match: {((rm.score || 0) * 100).toFixed(1)}%)
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TTS Speech Player for Assistant turns (No sign in needed!) */}
                  {msg.role === 'assistant' && (
                    <div style={{ marginTop: 8 }}>
                      <SpeechPlayer text={msg.content} />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Live Streaming Assistant Message Bubble */}
            {isChatSending && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '85%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 10.5, color: 'var(--primary)', fontWeight: 600 }}>
                  <CircularProgress size={10} color="inherit" />
                  <span>NEXGI AI Reasoning ({chatStreamElapsedSec.toFixed(1)}s)...</span>
                  {chatRecalledMemories.length > 0 && (
                    <span style={{ color: 'var(--success)' }}>• Recalled {chatRecalledMemories.length} situational memories</span>
                  )}
                </div>

                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    background: 'rgba(2, 132, 199, 0.05)',
                    border: '1px solid rgba(2, 132, 199, 0.3)',
                    color: 'var(--foreground)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {chatStreamingText || 'Consulting Qdrant Cloud vector memory and analyzing surveillance context...'}
                  <span
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 13,
                      backgroundColor: 'var(--primary)',
                      marginLeft: 4,
                      verticalAlign: 'text-bottom',
                      animation: 'pulse 1s infinite',
                    }}
                  />
                </div>
              </div>
            )}

            <div ref={chatMessagesEndRef} />
          </div>

          {/* Chat Input Bar with Voice Input (STT) */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Ask your CCTV assistant... (e.g. 'What was my previous question about the gate?')"
              value={chatInput}
              disabled={isChatSending}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isChatSending && chatInput.trim()) {
                  e.preventDefault();
                  void handleSendChatMessage();
                }
              }}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <VoiceInput
                        onText={(txt) => setChatInput((prev) => [prev, txt].filter(Boolean).join(' '))}
                        onBusy={() => {}}
                      />
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Button
              variant="contained"
              color="primary"
              disabled={isChatSending || !chatInput.trim()}
              onClick={() => void handleSendChatMessage()}
              startIcon={isChatSending ? <CircularProgress size={16} color="inherit" /> : <SendOutlined />}
              sx={{ minWidth: 100, height: 40 }}
            >
              {isChatSending ? 'Thinking...' : 'Send'}
            </Button>
          </div>
        </Paper>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: VIDEO INGESTION & DIRECT IN-PAGE VIDEO PLAYER           */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'video' && (
        <>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <TimerOutlined color="primary" />
                <strong style={{ fontSize: 14 }}>Total Generation & Processing Time:</strong>
                <Chip
                  label={`${(analysis.processing_time.total_seconds + (streamMetrics?.total_generation_seconds || (isStreamingAI ? streamElapsedSec : 0))).toFixed(2)} s`}
                  color="success"
                  size="small"
                  sx={{ fontWeight: 700 }}
                />
                <Chip
                  label={`SigLIP 2 Inference: ${analysis.processing_time.total_seconds} s`}
                  variant="outlined"
                  size="small"
                />
                {(isStreamingAI || streamMetrics?.total_generation_seconds !== undefined || analysis.processing_time.ai_generation_seconds) && (
                  <Chip
                    label={
                      isStreamingAI
                        ? `AI Text Generation: Streaming... ${streamElapsedSec.toFixed(1)} s`
                        : `AI Text Generation: ${(streamMetrics?.total_generation_seconds || analysis.processing_time.ai_generation_seconds || streamElapsedSec).toFixed(2)} s`
                    }
                    color={isStreamingAI ? 'primary' : 'success'}
                    variant={isStreamingAI ? 'filled' : 'outlined'}
                    size="small"
                    sx={{ fontWeight: 650 }}
                  />
                )}
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
                  <Chip
                    size="small"
                    color={isStreamingAI ? 'primary' : 'success'}
                    variant="outlined"
                    label={
                      isStreamingAI
                        ? `AI Vision Generation: Streaming (${streamElapsedSec.toFixed(1)}s, ${streamChunksCount} chunks)`
                        : streamMetrics?.total_generation_seconds !== undefined
                        ? `AI Vision Generation: ${streamMetrics.total_generation_seconds.toFixed(2)}s (${streamMetrics.chunks_count ?? streamChunksCount} chunks | ${streamMetrics.words_per_second ?? '15'} words/s)`
                        : analysis.processing_time.breakdown.ai_text_generation_ms !== undefined
                        ? `AI Vision Generation: ${analysis.processing_time.breakdown.ai_text_generation_ms} ms`
                        : 'AI Vision Generation: Ready'
                    }
                  />
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AutoAwesomeOutlined color="primary" />
                  <strong style={{ fontSize: 14 }}>Explainable AI Visual Analysis</strong>
                </div>

                {isStreamingAI ? (
                  <Chip
                    icon={<CircularProgress size={12} color="inherit" />}
                    label={`Streaming AI Response: ${streamElapsedSec.toFixed(1)}s (${streamChunksCount} chunks)`}
                    color="primary"
                    size="small"
                    sx={{ fontWeight: 650 }}
                  />
                ) : (streamMetrics?.total_generation_seconds !== undefined || analysis.processing_time.ai_generation_seconds) ? (
                  <Chip
                    icon={<CheckCircleOutlined sx={{ fontSize: '14px!important' }} />}
                    label={`Total Generation: ${(streamMetrics?.total_generation_seconds || analysis.processing_time.ai_generation_seconds || streamElapsedSec).toFixed(2)}s`}
                    color="success"
                    size="small"
                    sx={{ fontWeight: 700 }}
                  />
                ) : null}
              </div>

              {/* Real-time Telemetry & Generation Calculation Bar */}
              {(isStreamingAI || streamMetrics || (streamedText && streamElapsedSec > 0)) && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 12,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(33, 150, 243, 0.07)',
                    border: '1px solid rgba(33, 150, 243, 0.15)',
                    fontSize: 11.5,
                  }}
                >
                  <span style={{ fontWeight: 650, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <TimerOutlined sx={{ fontSize: 14 }} /> Generation Time:
                  </span>
                  <strong style={{ fontSize: 13, color: 'var(--foreground)' }}>
                    {(streamMetrics?.total_generation_seconds || streamElapsedSec).toFixed(2)} s
                  </strong>
                  <span style={{ color: 'var(--muted-foreground)' }}>•</span>
                  <span>
                    Chunks Generated: <strong>{streamMetrics?.chunks_count ?? streamChunksCount}</strong>
                  </span>
                  {streamMetrics?.words_per_second !== undefined && (
                    <>
                      <span style={{ color: 'var(--muted-foreground)' }}>•</span>
                      <span>
                        Speed: <strong>{streamMetrics.words_per_second} words/sec</strong>
                      </span>
                    </>
                  )}
                  {streamMetrics?.first_chunk_latency_ms !== undefined && (
                    <>
                      <span style={{ color: 'var(--muted-foreground)' }}>•</span>
                      <span>
                        First Chunk: <strong>{streamMetrics.first_chunk_latency_ms} ms</strong>
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Streaming Content Display */}
              {(streamedText || analysis.explainable_ai?.explanation) ? (
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
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                    }}
                  >
                    {streamedText || analysis.explainable_ai?.explanation}
                    {isStreamingAI && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 15,
                          backgroundColor: 'var(--primary)',
                          marginLeft: 4,
                          verticalAlign: 'text-bottom',
                        }}
                      />
                    )}
                  </div>

                  {!isStreamingAI && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                      <SpeechPlayer
                        text={`Top matching frame for query ${searched} at timestamp ${analysis.best_matching_frame.timestamp_str}. Match confidence ${analysis.best_matching_frame.match_score} percent. Visual evidence: ${streamedText || analysis.explainable_ai?.explanation}`}
                      />

                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<Refresh />}
                        onClick={() =>
                          streamAIExplanation(
                            analysis.best_matching_frame.path,
                            searched,
                            analysis.best_matching_frame.frame_number,
                            analysis.best_matching_frame.timestamp_str,
                            groundingImageUrl || analysis.explainable_ai?.image_url,
                          )
                        }
                      >
                        Re-stream AI Analysis
                      </Button>
                    </div>
                  )}

                  {(groundingImageUrl || analysis.explainable_ai?.image_url) && (
                    <div style={{ marginTop: 10, fontSize: 11 }}>
                      <a
                        href={groundingImageUrl || analysis.explainable_ai?.image_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--primary)', textDecoration: 'underline' }}
                      >
                        View Public S3 Grounding Image
                      </a>
                    </div>
                  )}
                </>
              ) : isStreamingAI ? (
                <div style={{ padding: '20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <CircularProgress size={18} />
                  <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
                    Generating multimodal explanation chunk-by-chunk in real time ({streamElapsedSec.toFixed(1)}s)...
                  </span>
                </div>
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
