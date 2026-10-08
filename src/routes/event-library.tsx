import { createFileRoute } from '@tanstack/react-router';
import { EventLibrary } from '@/components/visiontrace/Pages';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/event-library')({head:()=>metadata('Event Library','Browse CCTV events and confidence scores.'),component:EventLibrary});
