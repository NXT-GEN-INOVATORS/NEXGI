import { createFileRoute } from '@tanstack/react-router';
import { Analytics } from '@/components/visiontrace/Pages';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/analytics')({head:()=>metadata('Analytics','Review video intelligence performance metrics.'),component:Analytics});
