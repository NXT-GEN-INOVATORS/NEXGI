import { createFileRoute } from '@tanstack/react-router';
import { Overview } from '@/components/visiontrace/Overview';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/dashboard')({head:()=>metadata('Dashboard','Your VisionTrace AI operations, cameras, and investigations at a glance.'),component:Overview});
