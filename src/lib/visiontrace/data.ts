import axios from 'axios';
import gate from '@/assets/gate-camera.jpg';
export const backendUrl = (import.meta.env['VITE_AI_BACKEND_URL'] as string | undefined)?.replace(/\/+$/, '') ?? '';
export const ai = axios.create({baseURL:backendUrl,timeout:30000});
export type Evidence = { id:string; camera_id:string; camera_name:string; location:string; timestamp:string; confidence:number; objects:string[]; thumbnail_url?:string; clip_url?:string; bounding_box?:{x:number;y:number;width:number;height:number}; sample?:boolean };
export const sampleEvidence:Evidence[] = [
 {id:'sample-1',camera_id:'CAM-03',camera_name:'Main Gate',location:'North entrance',timestamp:'10:42:17',confidence:94,objects:['Car','Red'],thumbnail_url:gate,sample:true},
 {id:'sample-2',camera_id:'CAM-06',camera_name:'East Walkway',location:'Building B',timestamp:'09:31:08',confidence:89,objects:['Person','Backpack'],sample:true},
 {id:'sample-3',camera_id:'CAM-02',camera_name:'Loading Area',location:'Warehouse',timestamp:'08:24:32',confidence:82,objects:['Van','White'],sample:true}
];
export const recent = [
 {query:'red car entering main gate',camera:'CAM-03',time:'10:42:17',confidence:94,status:'Verified'},
 {query:'person carrying large backpack',camera:'CAM-06',time:'09:31:08',confidence:89,status:'Verified'},
 {query:'white van near loading area',camera:'CAM-02',time:'08:24:32',confidence:82,status:'Possible'},
 {query:'person near restricted entrance',camera:'CAM-05',time:'07:56:41',confidence:91,status:'Verified'},
 {query:'delivery truck at service gate',camera:'CAM-08',time:'07:18:22',confidence:96,status:'Verified'}
];
export const cameraNames=['Front Entrance','Loading Area','Main Gate','Parking Lot','Restricted Entrance','East Walkway','Warehouse Interior','Service Gate'];
export function metadata(title:string,description:string){return {meta:[{title:`${title} — VisionTrace AI`},{name:'description',content:description},{property:'og:title',content:`${title} — VisionTrace AI`},{property:'og:description',content:description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]};}
