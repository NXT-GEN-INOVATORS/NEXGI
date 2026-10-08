import { createFileRoute } from '@tanstack/react-router';
import { Alerts } from '@/components/visiontrace/Pages';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/alerts')({head:()=>metadata('Alerts','Review surveillance and system notifications.'),component:Alerts});
