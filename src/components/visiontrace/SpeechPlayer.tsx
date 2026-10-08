import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Alert, Button, CircularProgress, MenuItem, TextField } from '@mui/material';
import { VolumeUpOutlined, StopCircleOutlined } from '@mui/icons-material';
import { generateSpeech } from '@/lib/visiontrace/speech.functions';
import { useSession } from './Session';
export function SpeechPlayer({text}:{text:string}){
 const speak=useServerFn(generateSpeech),{user,signIn}=useSession();
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[url,setUrl]=useState(''),[language,setLanguage]=useState<'en-IN'|'hi-IN'>('en-IN'),[speaker,setSpeaker]=useState<'shubh'|'ritu'>('shubh');
 const audio=useRef<HTMLAudioElement|null>(null),request=useRef(0);
 useEffect(()=>{request.current++;setBusy(false);setUrl('');setError('');},[text,language,speaker]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url)},[url]);
 useEffect(()=>()=>{request.current++},[]);
 async function generate(){if(!user){signIn('/ai-search');return;}const id=++request.current;setBusy(true);setError('');setUrl('');try{const result=await speak({data:{text:text.slice(0,2500),language,speaker}});if(id!==request.current)return;if(result.error||!result.audio){setError(result.error??'No audio returned.');return;}const bytes=Uint8Array.from(atob(result.audio),c=>c.charCodeAt(0));setUrl(URL.createObjectURL(new Blob([bytes],{type:'audio/wav'})));}catch{if(id===request.current)setError('Unable to generate speech. Check your sign-in and try again.');}finally{if(id===request.current)setBusy(false);}}
 return <section className="speech-player"><div className="speech-controls"><Button variant="outlined" disabled={busy||!text} startIcon={busy?<CircularProgress size={16}/>:<VolumeUpOutlined/>} onClick={generate}>{busy?'Generating speech…':'Listen to evidence'}</Button><TextField select size="small" label="Speech language" value={language} onChange={e=>setLanguage(e.target.value==='hi-IN'?'hi-IN':'en-IN')}><MenuItem value="en-IN">English</MenuItem><MenuItem value="hi-IN">Hindi / mixed</MenuItem></TextField><TextField select size="small" label="Voice" value={speaker} onChange={e=>setSpeaker(e.target.value==='ritu'?'ritu':'shubh')}><MenuItem value="shubh">Shubh</MenuItem><MenuItem value="ritu">Ritu</MenuItem></TextField></div>{error&&<Alert severity="error" sx={{mt:2}}>{error}</Alert>}{url&&<div className="speech-audio"><audio ref={audio} src={url} controls aria-label="Sarvam evidence narration" onError={()=>setError('This audio could not be played. Please generate it again.')}/><Button startIcon={<StopCircleOutlined/>} onClick={()=>{if(audio.current){audio.current.pause();audio.current.currentTime=0}}}>Stop</Button></div>}</section>
}
