import { createFileRoute } from '@tanstack/react-router';
import { AISearch } from '@/components/visiontrace/AISearch';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/ai-search')({head:()=>metadata('AI Search','Search recorded CCTV with natural language and verify evidence.'),component:AISearch});
