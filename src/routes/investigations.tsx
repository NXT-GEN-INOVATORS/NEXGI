import { createFileRoute } from '@tanstack/react-router';
import { Investigations } from '@/components/visiontrace/Pages';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/investigations')({head:()=>metadata('Investigations','Review saved searches and grounded camera evidence.'),component:Investigations});
