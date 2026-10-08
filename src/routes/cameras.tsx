import { createFileRoute } from '@tanstack/react-router';
import { Cameras } from '@/components/visiontrace/Pages';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/cameras')({head:()=>metadata('Cameras','Inspect the VisionTrace camera network.'),component:Cameras});
