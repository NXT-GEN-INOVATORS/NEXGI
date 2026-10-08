import { createFileRoute } from '@tanstack/react-router';
import { Home } from '@/components/visiontrace/PublicPages';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/')({head:()=>metadata('Home','VisionTrace AI — search CCTV footage, trace matching moments, and verify grounded evidence.'),component:Home});
