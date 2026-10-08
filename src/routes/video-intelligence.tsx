import { createFileRoute } from '@tanstack/react-router';
import { VideoLibrary } from '@/components/visiontrace/VideoLibrary';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/video-intelligence')({head:()=>metadata('Video Intelligence','Manage private multi-camera CCTV recordings.'),component:VideoLibrary});
