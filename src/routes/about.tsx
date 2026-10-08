import { createFileRoute } from '@tanstack/react-router';
import { About } from '@/components/visiontrace/PublicPages';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/about')({head:()=>metadata('About','Learn how VisionTrace AI connects surveillance footage to verifiable evidence.'),component:About});
