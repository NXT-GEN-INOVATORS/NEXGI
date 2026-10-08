import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Chip, Alert, TextField, Switch, FormControlLabel, Paper, TableContainer, Table, TableHead, TableBody, TableRow, TableCell, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, IconButton, Tooltip, Tabs, Tab, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { VideocamOutlined, Search, ArrowForward, Refresh, HubOutlined, NotificationsNone, CheckCircleOutlined, FolderOutlined, Download, StorageOutlined, DnsOutlined, InfoOutlined, TuneOutlined, WifiOutlined, LocationOnOutlined, SpeedOutlined, FlashOnOutlined, MemoryOutlined, SettingsInputComponentOutlined, AddCircleOutlined, ContentCopyOutlined, UploadFile, PlayArrow, DeleteOutlined } from '@mui/icons-material';
import { Link } from '@tanstack/react-router';
import gate from '@/assets/gate-camera.jpg';
import { PageHeading, SectionHeading, RecentTable, CameraPreview, Status } from './Common';
import { cameraNames, backendUrl, ai, recent, sampleEvidence, type Evidence } from '@/lib/visiontrace/data';
import { useSession } from './Session';
import { supabase } from '@/integrations/supabase/client';
export function Investigations(){const {user}=useSession();const [selected,setSelected]=useState<{query:string;evidence:unknown}|null>(null);const investigations=useQuery({queryKey:['investigations',user?.id],queryFn:async()=>{const {data,error}=await supabase.from('investigations').select('*').order('created_at',{ascending:false});if(error)throw error;return data;},enabled:!!user});return <><PageHeading title="Investigations" subtitle="Organize your searches and verify grounded evidence." action={<Button component={Link} to="/ai-search" variant="contained" startIcon={<Search/>}>New Investigation</Button>}/>{!user?<><SectionHeading title="Recent Investigations" action={<Chip label="Sample activity" variant="outlined"/>}/><RecentTable all/></>:investigations.isLoading?<CircularProgress size={24}/>:investigations.isError?<Alert severity="error">{investigations.error.message}</Alert>:<TableContainer component={Paper} variant="outlined"><Table><TableHead><TableRow>{['Query','Created','Status','Evidence'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{investigations.data?.map((i:any)=><TableRow key={i.id}><TableCell>{i.query}</TableCell><TableCell>{new Date(i.created_at).toLocaleString()}</TableCell><TableCell><Status status={i.status}/></TableCell><TableCell><Button onClick={()=>setSelected(i)}>View Evidence</Button></TableCell></TableRow>)}{!investigations.data?.length&&<TableRow><TableCell colSpan={4} align="center">No investigations yet. Save a search to start one.</TableCell></TableRow>}</TableBody></Table></TableContainer>}<Dialog open={!!selected} onClose={()=>setSelected(null)} fullWidth maxWidth="md"><DialogTitle>{selected?.query}</DialogTitle><DialogContent>{Array.isArray(selected?.evidence)?(selected.evidence as Evidence[]).map(e=><div key={e.id} style={{marginBottom:20}}><CameraPreview evidence={e} boxes/><p className="subtitle">{e.camera_id} · {e.timestamp} · Confidence {e.confidence}% · {e.objects.join(', ')}</p></div>):'No evidence'}</DialogContent><DialogActions><Button onClick={()=>setSelected(null)}>Close</Button></DialogActions></Dialog></>}
export function Cameras(){
  const [filter,setFilter]=useState('');
  const [selected,setSelected]=useState<number|null>(null);
  const [activeTab,setActiveTab]=useState<'grid'|'integration'|'add'>('grid');
  const [copied,setCopied]=useState('');
  
  // Custom camera registration supporting HTTP and upload
  const [sourceType,setSourceType]=useState<'http'|'upload'|'rtsp'>('http');
  const [newCam,setNewCam]=useState({name:'',id:'',streamUrl:'',zone:'',protocol:'HTTP Live Stream (HLS)',resolution:'1080p'});
  const [uploadedVideoFile,setUploadedVideoFile]=useState<File|null>(null);
  const [uploadedVideoUrl,setUploadedVideoUrl]=useState<string>('');
  const [newCamSuccess,setNewCamSuccess]=useState(false);
  const [playingVideo,setPlayingVideo]=useState<{name:string;id:string;url:string}|null>(null);
  const [deletingCam,setDeletingCam]=useState<{id:string;name:string}|null>(null);

  // Active verified cameras list
  const [camerasList,setCamerasList]=useState([
    {
      id:'CAM-01',name:'Front Entrance',zone:'North Wing · Gate 1',res:'4K',fps:'30fps',
      protocol:'RTSP / H.264',uptime:'99.9%',detections:['Person','Face Blur','Vehicle'],
      ip:'192.168.1.101',storage:'128GB',aiModel:'YOLOv8 Real-Time',thumb:gate,videoUrl:'',
      status:'Online'
    },
    {
      id:'CAM-02',name:'Loading Bay East',zone:'Warehouse Logistics',res:'1080p',fps:'25fps',
      protocol:'ONVIF Profile S',uptime:'98.8%',detections:['Forklift','Pallet','Vehicle'],
      ip:'192.168.1.102',storage:'64GB',aiModel:'YOLOv8 Real-Time',thumb:gate,videoUrl:'',
      status:'Online'
    },
    {
      id:'CAM-03',name:'Main Security Gate',zone:'Perimeter Access Point',res:'4K',fps:'30fps',
      protocol:'HTTP Live Stream (HLS)',uptime:'99.9%',detections:['Car','Truck','LPR Plate Recognition'],
      ip:'192.168.1.103',storage:'256GB',aiModel:'YOLOv8 Real-Time',thumb:gate,videoUrl:'',
      status:'Online'
    },
    {
      id:'CAM-04',name:'Visitor Parking',zone:'Exterior South Lot',res:'2K',fps:'30fps',
      protocol:'HTTP / WebRTC',uptime:'97.5%',detections:['Person','Vehicle'],
      ip:'192.168.1.104',storage:'128GB',aiModel:'YOLOv5 Edge',thumb:gate,videoUrl:'',
      status:'Online'
    },
    {
      id:'CAM-05',name:'Building B Walkway',zone:'Pedestrian Transit Corridor',res:'1080p',fps:'30fps',
      protocol:'RTSP / H.265',uptime:'99.4%',detections:['Person','Backpack','Loitering'],
      ip:'192.168.1.105',storage:'64GB',aiModel:'YOLOv8 Real-Time',thumb:gate,videoUrl:'',
      status:'Online'
    },
    {
      id:'CAM-06',name:'Server Room Corridor',zone:'Restricted Access Zone 3',res:'4K',fps:'60fps',
      protocol:'HTTPS / Secure WebRTC',uptime:'99.99%',detections:['Person','Access Card Verification'],
      ip:'192.168.1.106',storage:'512GB',aiModel:'YOLOv8 Real-Time',thumb:gate,videoUrl:'',
      status:'Online'
    }
  ]);

  const filtered=camerasList.filter(c=>(c.name+c.zone+c.id).toLowerCase().includes(filter.toLowerCase()));
  const sel=selected!==null?camerasList[selected]:null;

  function copyText(txt:string,key:string){
    void navigator.clipboard.writeText(txt);
    setCopied(key);
    setTimeout(()=>setCopied(''),2000);
  }

  function handleFileUpload(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];
    if(file){
      setUploadedVideoFile(file);
      const url=URL.createObjectURL(file);
      setUploadedVideoUrl(url);
    }
  }

  function handleAddCamera(e:React.FormEvent){
    e.preventDefault();
    const finalUrl=sourceType==='upload'?uploadedVideoUrl:newCam.streamUrl;
    const addedCamera={
      id:newCam.id||`CAM-0${camerasList.length+1}`,
      name:newCam.name,
      zone:newCam.zone||'Configured Zone',
      res:newCam.resolution,
      fps:'30fps',
      protocol:sourceType==='http'?'HTTP / HLS Stream':sourceType==='upload'?'Local Uploaded Stream':'RTSP Stream',
      uptime:'100%',
      detections:['AI Live Vision','Object Tracking'],
      ip:newCam.streamUrl||'192.168.1.'+(100+camerasList.length+1),
      storage:'128GB',
      aiModel:'YOLOv8',
      thumb:gate,
      videoUrl:finalUrl,
      status:'Online'
    };
    setCamerasList([addedCamera,...camerasList]);
    setNewCamSuccess(true);
    setTimeout(()=>{
      setNewCamSuccess(false);
      setNewCam({name:'',id:'',streamUrl:'',zone:'',protocol:'HTTP Live Stream (HLS)',resolution:'1080p'});
      setUploadedVideoFile(null);
      setUploadedVideoUrl('');
      setActiveTab('grid');
    },1200);
  }

  return <><PageHeading title="Cameras & Video Feeds" subtitle="Live video feeds with AI detection, HTTP stream ingestion, and video recording playback." action={<Button variant="contained" startIcon={<AddCircleOutlined/>} onClick={()=>setActiveTab('add')}>Connect Camera / Video</Button>}/>
    
    <Tabs value={activeTab} onChange={(_e,v)=>setActiveTab(v)} sx={{borderBottom:1,borderColor:'divider',mb:3}}>
      <Tab label={`Active Cameras (${filtered.length})`} value="grid" icon={<VideocamOutlined/>} iconPosition="start"/>
      <Tab label="Add Camera Feed (HTTP / Upload)" value="add" icon={<AddCircleOutlined/>} iconPosition="start"/>
      <Tab label="Stream & API Integration" value="integration" icon={<SettingsInputComponentOutlined/>} iconPosition="start"/>
    </Tabs>

    {activeTab==='grid'&&(
      <>
        <div style={{display:'flex',gap:16,alignItems:'center',marginBottom:24,flexWrap:'wrap'}}>
          <TextField placeholder="Search by camera name, ID, or zone…" size="small" value={filter} onChange={e=>setFilter(e.target.value)} sx={{width:320}} slotProps={{input:{startAdornment:<Search sx={{fontSize:16,mr:1,color:'var(--muted-foreground)'}}/>}}}/>
          <div style={{display:'flex',gap:10,marginLeft:'auto'}}>
            {[{label:'All Online',color:'var(--success)'},{label:'AI Tracking',color:'var(--primary)'},{label:'Recording',color:'var(--info)'}].map(b=><Chip key={b.label} label={<span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:6,height:6,borderRadius:'50%',background:b.color,display:'inline-block'}}/>{b.label}</span>} variant="outlined" size="small"/>)}
          </div>
        </div>
        <div className="cam-rich-grid">
          {filtered.map((cam,i)=>{
            return <article key={cam.id+i} className="cam-rich-card" onClick={()=>setSelected(i===selected?null:i)}>
              <div className="cam-rich-header">
                <div className="cam-id-badge"><VideocamOutlined sx={{fontSize:12}}/> {cam.id}</div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <span className="cam-live-dot"/>
                  <span style={{fontSize:9,color:'var(--danger)',fontWeight:700}}>LIVE</span>
                  <Chip label={cam.res} size="small" sx={{height:17,fontSize:9,ml:1}}/>
                </div>
              </div>
              <div className="cam-rich-preview">
                <img src={cam.thumb} alt={cam.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                <div className="cam-scan-line"/>
                <div className="cam-corner cam-corner-tl"/><div className="cam-corner cam-corner-tr"/><div className="cam-corner cam-corner-bl"/><div className="cam-corner cam-corner-br"/>
                <div className="cam-ai-badge"><FlashOnOutlined sx={{fontSize:10}}/> AI ACTIVE · {cam.aiModel}</div>
                <div className="cam-ts-badge">▶ LIVE</div>
              </div>
              <div className="cam-rich-body">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                  <div>
                    <strong style={{fontSize:13,display:'block'}}>{cam.name}</strong>
                    <span style={{fontSize:10,color:'var(--muted-foreground)',display:'flex',alignItems:'center',gap:4,marginTop:3}}><LocationOnOutlined sx={{fontSize:11}}/>{cam.zone}</span>
                  </div>
                  <Tooltip title={`Uptime: ${cam.uptime}`}><Chip label={cam.uptime} size="small" color="success" sx={{height:20,fontSize:9}}/></Tooltip>
                </div>
                <div className="cam-specs-row">
                  <div className="cam-spec"><SpeedOutlined sx={{fontSize:11}}/>{cam.fps}</div>
                  <div className="cam-spec"><WifiOutlined sx={{fontSize:11}}/>{cam.protocol.split('/')[0]}</div>
                  <div className="cam-spec"><StorageOutlined sx={{fontSize:11}}/>{cam.storage}</div>
                  <div className="cam-spec"><MemoryOutlined sx={{fontSize:11}}/>{cam.aiModel.split(' ')[0]}</div>
                </div>
                <div className="cam-detect-tags">
                  {cam.detections.map(t=><span key={t} className="cam-detect-tag">{t}</span>)}
                </div>
                <div style={{fontSize:9,color:'var(--muted-foreground)',fontFamily:'monospace',marginTop:8,borderTop:'1px solid var(--border)',paddingTop:8,display:'flex',justifyContent:'space-between'}}>
                  <span>IP: {cam.ip}</span><span>{cam.id}</span>
                </div>
                <div style={{display:'flex',gap:8,marginTop:12}}>
                  {cam.videoUrl?(
                    <Button fullWidth variant="contained" size="small" startIcon={<PlayArrow/>} onClick={e=>{e.stopPropagation();setPlayingVideo({name:cam.name,id:cam.id,url:cam.videoUrl});}}>Play Video Feed</Button>
                  ):(
                    <Button component={Link} to="/video-intelligence" fullWidth variant="outlined" startIcon={<VideocamOutlined/>} size="small" onClick={e=>e.stopPropagation()}>View Recordings</Button>
                  )}
                  <Tooltip title="Delete camera feed">
                    <IconButton size="small" color="error" onClick={e=>{e.stopPropagation();setDeletingCam({id:cam.id,name:cam.name});}} sx={{border:'1px solid var(--border)'}}>
                      <DeleteOutlined sx={{fontSize:16}}/>
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
            </article>;
          })}
        </div>
      </>
    )}

    {activeTab==='add'&&(
      <Paper variant="outlined" sx={{p:4,maxWidth:740,margin:'auto'}}>
        <h3 style={{marginTop:0,marginBottom:6,fontSize:18}}>Add Camera or Video Stream</h3>
        <p className="subtitle" style={{marginBottom:24}}>Choose whether to stream a live HTTP/HTTPS endpoint or upload an MP4/WebM video file for AI surveillance analysis.</p>

        {newCamSuccess&&<Alert severity="success" sx={{mb:3}}>Camera stream successfully connected and added to your active monitoring grid!</Alert>}

        <div style={{marginBottom:24}}>
          <ToggleButtonGroup exclusive fullWidth value={sourceType} onChange={(_e,v)=>{if(v)setSourceType(v);}}>
            <ToggleButton value="http"><WifiOutlined sx={{mr:1}}/> HTTP / HTTPS Live Stream</ToggleButton>
            <ToggleButton value="upload"><UploadFile sx={{mr:1}}/> Upload Video File</ToggleButton>
            <ToggleButton value="rtsp"><VideocamOutlined sx={{mr:1}}/> RTSP / ONVIF IP Cam</ToggleButton>
          </ToggleButtonGroup>
        </div>

        <form onSubmit={handleAddCamera}>
          <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:16,marginBottom:16}}>
            <TextField label="Camera Name" required placeholder="e.g. South Corridor Entrance" value={newCam.name} onChange={e=>setNewCam({...newCam,name:e.target.value})}/>
            <TextField label="Camera ID" required placeholder="e.g. CAM-07" value={newCam.id} onChange={e=>setNewCam({...newCam,id:e.target.value})}/>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            <TextField label="Location / Zone" required placeholder="e.g. Level 2 Security Checkpoint" value={newCam.zone} onChange={e=>setNewCam({...newCam,zone:e.target.value})}/>
            <TextField label="Resolution" select slotProps={{select:{native:true}}} value={newCam.resolution} onChange={e=>setNewCam({...newCam,resolution:e.target.value})}>
              <option value="4K">4K UHD (3840×2160)</option>
              <option value="2K">2K QHD (2560×1440)</option>
              <option value="1080p">1080p Full HD (1920×1080)</option>
              <option value="720p">720p HD (1280×720)</option>
            </TextField>
          </div>

          {sourceType==='http'&&(
            <div style={{marginBottom:20}}>
              <TextField fullWidth required label="HTTP / HTTPS Stream URL" placeholder="https://stream.your-network.com/live/feed.m3u8 or http://192.168.1.109:8080/video" helperText="Direct HTTP, HLS (.m3u8), or MJPEG stream url reachable by your browser." value={newCam.streamUrl} onChange={e=>setNewCam({...newCam,streamUrl:e.target.value})}/>
            </div>
          )}

          {sourceType==='upload'&&(
            <div style={{border:'2px dashed var(--border)',padding:24,borderRadius:8,textAlign:'center',marginBottom:20,background:'var(--muted)'}}>
              <UploadFile sx={{fontSize:38,color:'var(--primary)',mb:1}}/>
              <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>Select Local Video File (MP4, WebM, MOV)</div>
              <p className="subtitle" style={{marginBottom:16,fontSize:12}}>Video will be loaded directly into your browser camera feed.</p>
              <Button variant="outlined" component="label" startIcon={<UploadFile/>}>
                {uploadedVideoFile?uploadedVideoFile.name:'Choose Video File'}
                <input type="file" accept="video/*" hidden onChange={handleFileUpload}/>
              </Button>
              {uploadedVideoFile&&<span style={{display:'block',marginTop:8,fontSize:12,color:'var(--success)',fontWeight:600}}>File selected: {uploadedVideoFile.name} ({(uploadedVideoFile.size/1024/1024).toFixed(1)} MB)</span>}
            </div>
          )}

          {sourceType==='rtsp'&&(
            <div style={{marginBottom:20}}>
              <TextField fullWidth required label="RTSP / ONVIF Network URI" placeholder="rtsp://operator:1234@192.168.1.109:554/live/stream1" helperText="RTSP network stream converted via WebRTC or media gateway." value={newCam.streamUrl} onChange={e=>setNewCam({...newCam,streamUrl:e.target.value})}/>
            </div>
          )}

          <div style={{display:'flex',gap:12,marginTop:24}}>
            <Button variant="contained" type="submit" startIcon={<AddCircleOutlined/>} disabled={sourceType==='upload'&&!uploadedVideoFile}>Connect & Add Feed</Button>
            <Button variant="outlined" onClick={()=>setActiveTab('grid')}>Cancel</Button>
          </div>
        </form>
      </Paper>
    )}

    {activeTab==='integration'&&(
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))',gap:24}}>
        <Paper variant="outlined" sx={{p:3}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
            <WifiOutlined color="primary"/>
            <h3 style={{margin:0,fontSize:16}}>HTTP / HLS Live Stream</h3>
          </div>
          <p className="subtitle" style={{marginBottom:16}}>Web-friendly HTTP Live Streaming (HLS) or MJPEG feeds for native browser rendering:</p>
          <div style={{background:'var(--muted)',padding:'12px 14px',borderRadius:6,fontFamily:'monospace',fontSize:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <code>http://192.168.1.100:8080/hls/live.m3u8</code>
            <IconButton size="small" onClick={()=>copyText('http://192.168.1.100:8080/hls/live.m3u8','http')}><ContentCopyOutlined sx={{fontSize:16}}/></IconButton>
          </div>
          {copied==='http'&&<span style={{fontSize:10,color:'var(--success)',display:'block',marginTop:6}}>Copied HTTP endpoint!</span>}
        </Paper>

        <Paper variant="outlined" sx={{p:3}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
            <VideocamOutlined color="primary"/>
            <h3 style={{margin:0,fontSize:16}}>RTSP Stream Endpoint</h3>
          </div>
          <p className="subtitle" style={{marginBottom:16}}>Low-latency H.264/H.265 RTSP streaming url format for NVR and IP camera encoders:</p>
          <div style={{background:'var(--muted)',padding:'12px 14px',borderRadius:6,fontFamily:'monospace',fontSize:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <code>rtsp://operator:1234@192.168.1.100:554/live/stream1</code>
            <IconButton size="small" onClick={()=>copyText('rtsp://operator:1234@192.168.1.100:554/live/stream1','rtsp')}><ContentCopyOutlined sx={{fontSize:16}}/></IconButton>
          </div>
          {copied==='rtsp'&&<span style={{fontSize:10,color:'var(--success)',display:'block',marginTop:6}}>Copied RTSP URL!</span>}
        </Paper>

        <Paper variant="outlined" sx={{p:3}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
            <HubOutlined color="primary"/>
            <h3 style={{margin:0,fontSize:16}}>ONVIF Profile S/T Discovery</h3>
          </div>
          <p className="subtitle" style={{marginBottom:16}}>Automated camera discovery via ONVIF protocol for PTZ and sensor control:</p>
          <div style={{background:'var(--muted)',padding:'12px 14px',borderRadius:6,fontFamily:'monospace',fontSize:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <code>http://192.168.1.100:80/onvif/device_service</code>
            <IconButton size="small" onClick={()=>copyText('http://192.168.1.100:80/onvif/device_service','onvif')}><ContentCopyOutlined sx={{fontSize:16}}/></IconButton>
          </div>
          {copied==='onvif'&&<span style={{fontSize:10,color:'var(--success)',display:'block',marginTop:6}}>Copied ONVIF endpoint!</span>}
        </Paper>
      </div>
    )}

    {/* Video Player Dialog for custom video feeds */}
    <Dialog open={!!playingVideo} onClose={()=>setPlayingVideo(null)} maxWidth="md" fullWidth>
      <DialogTitle sx={{display:'flex',alignItems:'center',gap:1.5}}>
        <VideocamOutlined color="primary"/> {playingVideo?.id} · {playingVideo?.name}
      </DialogTitle>
      <DialogContent>
        {playingVideo?.url&&(
          <video src={playingVideo.url} controls autoPlay style={{width:'100%',borderRadius:6,background:'#000',maxHeight:'70vh'}}/>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>setPlayingVideo(null)}>Close Player</Button>
      </DialogActions>
    </Dialog>

    {/* Camera Specs Dialog */}
    <Dialog open={!!sel} onClose={()=>setSelected(null)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{display:'flex',alignItems:'center',gap:1.5}}>
        <VideocamOutlined color="primary"/> {sel?.id} · {sel?.name}
      </DialogTitle>
      <DialogContent>
        {sel&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,fontSize:12}}>
          {[['Camera ID',sel.id],['Location',sel.zone],['IP Address',sel.ip],['Resolution',sel.res],['Frame Rate',sel.fps],['Protocol',sel.protocol],['Storage',sel.storage],['AI Model',sel.aiModel],['Uptime',sel.uptime],['Detections',sel.detections.join(', ')]].map(([l,v])=><div key={l}><div style={{color:'var(--muted-foreground)',fontSize:10,marginBottom:3}}>{l}</div><strong>{v}</strong></div>)}
        </div>}
      </DialogContent>
      <DialogActions>
        <Button component={Link} to="/video-intelligence" variant="contained" startIcon={<VideocamOutlined/>} onClick={()=>setSelected(null)}>View Footage</Button>
        <Button onClick={()=>setSelected(null)}>Close</Button>
      </DialogActions>
    </Dialog>

    {/* Delete Camera Dialog */}
    <Dialog open={!!deletingCam} onClose={()=>setDeletingCam(null)}>
      <DialogTitle>Remove Camera / Video Feed?</DialogTitle>
      <DialogContent>
        Are you sure you want to remove <strong>{deletingCam?.name} ({deletingCam?.id})</strong>? This camera feed and any associated local stream playback will be disconnected from the active grid.
      </DialogContent>
      <DialogActions>
        <Button onClick={()=>setDeletingCam(null)}>Cancel</Button>
        <Button color="error" variant="contained" onClick={()=>{
          if(deletingCam){
            setCamerasList(prev=>prev.filter(c=>c.id!==deletingCam.id));
            setDeletingCam(null);
          }
        }}>Delete Feed</Button>
      </DialogActions>
    </Dialog>
  </>;
}
export function SpatialMemory(){return <><PageHeading title="Spatial Memory" subtitle="Trace objects and events across connected camera locations."/><Alert severity="info" sx={{mb:3}}>Cross-camera traces will appear when your AWS service returns spatial memory data.</Alert><SectionHeading title="Camera locations" action={<Chip label="Sample topology" variant="outlined"/>}/><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:18}}>{['North Entrance','Building B','Warehouse','Parking Lot'].map((location,i)=><Paper variant="outlined" key={location} sx={{p:3}}><HubOutlined color="primary"/><h3 style={{fontSize:14}}>{location}</h3><p className="subtitle">CAM-0{i*2+1} ↔ CAM-0{i*2+2}</p><Button component={Link} to="/ai-search" endIcon={<ArrowForward/>} sx={{mt:2}}>Search this area</Button></Paper>)}</div></>}
export function EventLibrary(){const [filter,setFilter]=useState('');return <><PageHeading title="Event Library" subtitle="Browse indexed events and their supporting camera evidence." action={<Chip label="Sample events" variant="outlined"/>}/><TextField size="small" placeholder="Filter events…" value={filter} onChange={e=>setFilter(e.target.value)} sx={{mb:3,width:280}}/><TableContainer component={Paper} variant="outlined"><Table sx={{minWidth:550}}><TableHead><TableRow>{['Event','Camera','Timestamp','Confidence','Evidence'].map(x=><TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead><TableBody>{recent.filter(r=>r.query.includes(filter.toLowerCase())).map(r=><TableRow key={r.query}><TableCell>{r.query}</TableCell><TableCell>{r.camera}</TableCell><TableCell>{r.time}</TableCell><TableCell>{r.confidence}%</TableCell><TableCell><Button component={Link} to="/ai-search" size="small">Search footage</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer></>}
export function Alerts(){const [acknowledged,setAcknowledged]=useState<string[]>([]);return <><PageHeading title="Alerts" subtitle="Review activity that needs your attention." action={<Chip label="Sample notifications" variant="outlined"/>}/>{[{id:'1',title:'Person near restricted entrance',camera:'CAM-05',time:'07:56:41',severity:'warning' as const},{id:'2',title:'Video waiting to be indexed',camera:'CAM-02',time:'08:24:32',severity:'info' as const},{id:'3',title:'AWS service is not configured',camera:'System',time:'Configuration',severity:'warning' as const}].map(a=><Alert key={a.id} severity={acknowledged.includes(a.id)?'success':a.severity} icon={<NotificationsNone/>} sx={{mb:2,py:2}} action={<Button size="small" disabled={acknowledged.includes(a.id)} onClick={()=>setAcknowledged([...acknowledged,a.id])}>{acknowledged.includes(a.id)?'Acknowledged':'Acknowledge'}</Button>}><strong>{a.title}</strong><p className="subtitle" style={{fontSize:11,marginTop:5}}>{a.camera} · {a.time} · Sample alert</p></Alert>)}</>}
export function Analytics(){function exportData(){const blob=new Blob(['Metric,Value\nTotal Cameras,8\nIndexed Events,12482\nAI Searches Today,46\nVerified Matches,93%'],{type:'text/csv'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='visiontrace-sample-analytics.csv';a.click();URL.revokeObjectURL(url);}return <><PageHeading title="Analytics" subtitle="A snapshot of your video intelligence performance." action={<Button variant="outlined" startIcon={<Download/>} onClick={exportData}>Export Report</Button>}/><Alert severity="info" sx={{mb:3}}>Sample analytics. Live metrics require an analytics response from your AWS service.</Alert><div className="stats-grid">{[{label:'Indexed Events',value:'12,482'},{label:'AI Searches Today',value:'46'},{label:'Verified Matches',value:'93%'},{label:'Cameras',value:'8'}].map(m=><div className="stat-card" key={m.label}><div className="stat-top">{m.label}</div><div className="stat-value">{m.value}</div><div className="stat-note">Sample metric</div></div>)}</div><SectionHeading title="Verification by Camera"/><TableContainer component={Paper} variant="outlined"><Table><TableHead><TableRow><TableCell>Camera</TableCell><TableCell>Location</TableCell><TableCell>Verified match rate</TableCell></TableRow></TableHead><TableBody>{cameraNames.map((c,i)=><TableRow key={c}><TableCell>CAM-0{i+1}</TableCell><TableCell>{c}</TableCell><TableCell><div style={{display:'flex',alignItems:'center',gap:12}}><div style={{width:150,background:'var(--muted)',height:6,borderRadius:4}}><div style={{width:`${[91,82,94,95,91,89,96,96][i]}%`,background:'var(--primary)',height:6,borderRadius:4}}/></div>{[91,82,94,95,91,89,96,96][i]}%</div></TableCell></TableRow>)}</TableBody></Table></TableContainer></>}
export function Settings(){const {user,signIn,signOut,dbOnline}=useSession(),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);async function test(){setBusy(true);if(!backendUrl){setStatus('AWS URL is not configured. Set VITE_AI_BACKEND_URL to your AWS endpoint.');setBusy(false);return;}try{await ai.get('/health');setStatus('AWS service connected successfully.');}catch{setStatus('Unable to reach AWS. Check the URL, /health endpoint, and CORS permissions.');}setBusy(false);}return <><PageHeading title="Settings" subtitle="Manage your workspace connections and operator account."/><section className="settings-section"><h2>AI Backend</h2><TextField label="AWS backend URL" fullWidth value={backendUrl||'Not configured'} slotProps={{input:{readOnly:true}}}/><p className="subtitle" style={{margin:'12px 0'}}>Configured through VITE_AI_BACKEND_URL. Your AWS service handles all computer vision processing.</p><Button startIcon={<Refresh/>} variant="outlined" disabled={busy} onClick={test}>{busy?'Checking…':'Test Connection'}</Button>{status&&<Alert severity="info" sx={{mt:2}}>{status}</Alert>}</section><section className="settings-section"><h2>Database & Storage</h2><div style={{display:'flex',gap:12,alignItems:'center'}}><StorageOutlined color="primary"/><div><strong style={{fontSize:13}}>NEXGI Cloud</strong><p className="subtitle">Private video storage and user-scoped investigation records.</p></div><Chip label={dbOnline?'Connected':'Offline'} color={dbOnline?'success':'warning'} sx={{ml:'auto'}}/></div></section><section className="settings-section"><h2>Operator Account</h2><p className="subtitle" style={{marginBottom:18}}>{user?user.email:'You are viewing a sample workspace. Sign in to save videos and investigations.'}</p><Button variant="contained" onClick={()=>{if(user)void signOut();else signIn();}}>{user?'Sign out':'Sign in'}</Button></section><section className="settings-section"><h2>Integration Contract</h2><p className="subtitle">Health: GET /health<br/>Search: POST /api/search<br/>Process: POST /api/videos/process</p><p className="subtitle" style={{marginTop:12}}>Search responses contain a results array with camera ID, timestamp, confidence, objects, optional thumbnail and clip URLs, and normalized bounding boxes. Video processing is delegated to AWS; completion status synchronization is not configured.</p></section></>}
