import { createFileRoute } from '@tanstack/react-router';
import { Settings } from '@/components/visiontrace/Pages';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/settings')({head:()=>metadata('Settings','Manage AWS connectivity and operator account settings.'),component:Settings});
