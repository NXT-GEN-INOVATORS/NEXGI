import { createFileRoute } from '@tanstack/react-router';
import { SpatialMemory } from '@/components/visiontrace/Pages';
import { metadata } from '@/lib/visiontrace/data';
export const Route=createFileRoute('/spatial-memory')({head:()=>metadata('Spatial Memory','Review connected camera locations and spatial traces.'),component:SpatialMemory});
