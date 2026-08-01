'use client';
import { useEffect,useState } from 'react';
import { api,formatDate } from '../../../lib/api';
import { Card,Empty,ErrorState,Loading,PageHeader } from '../../../components/ui';
interface Audit{id:string;action:string;entity_type:string;entity_id?:string;user_name?:string;user_email?:string;correlation_id?:string;created_at:string;before_data?:unknown;after_data?:unknown}
export default function AuditPage(){const[items,setItems]=useState<Audit[]>([]);const[error,setError]=useState('');const[loading,setLoading]=useState(true);useEffect(()=>{api<Audit[]>('/api/v1/audit').then(setItems).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
return <><PageHeader eyebrow="GOVERNANÇA" title="Trilha de auditoria" description="Registro imutável das ações críticas realizadas no workspace." />{error&&<ErrorState message={error}/>}
{loading?<Loading/>:<Card>{items.length===0?<Empty title="Sem eventos" description="As alterações administrativas aparecerão aqui."/>:<div className="audit-list">{items.map(i=><details key={i.id}><summary><div><strong>{i.action}</strong><span>{i.entity_type} · {i.user_name??'Sistema'}</span></div><div><code>{i.correlation_id??'sem correlação'}</code><span>{formatDate(i.created_at)}</span></div></summary><pre className="json">{JSON.stringify({before:i.before_data,after:i.after_data,entityId:i.entity_id},null,2)}</pre></details>)}</div>}</Card>}</>;}
