import { createFileRoute } from '@tanstack/react-router';
import { ObjectTracking } from '@/components/visiontrace/ObjectTracking';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/object-tracking')({head:()=>metadata('Object Tracking','Track objects across camera locations on a map.'),component:ObjectTracking});
