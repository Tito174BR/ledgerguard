'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import { api,formatDate,formatMoney } from '../../../lib/api';
import { Badge,Card,Empty,ErrorState,Loading,PageHeader } from '../../../components/ui';
interface CaseItem{id:string;external_id:string;status:string;priority:string;risk_score:number;risk_level:string;summary:string;amount_cents:string;card_last4?:string;opened_at:string}
export default function CasesPage(){const[items,setItems]=useState<CaseItem[]>([]);const[status,setStatus]=useState('');const[error,setError]=useState('');const[loading,setLoading]=useState(true);const load=()=>api<CaseItem[]>(`/api/v1/cases${status?`?status=${status}`:''}`).then(setItems).catch(e=>setError(e.message)).finally(()=>setLoading(false));useEffect(()=>{void load();},[]);
return <><PageHeader eyebrow="FRAUD OPS" title="Casos de investigação" description="Fila priorizada para análise, decisão e documentação de evidências."/>
<Card><div className="filters"><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos os casos</option>{['OPEN','IN_REVIEW','APPROVED','REJECTED','BLOCKED','CLOSED'].map(v=><option key={v}>{v}</option>)}</select><button className="secondary" onClick={load}>Aplicar filtro</button></div></Card>
{error&&<ErrorState message={error}/>}
{loading?<Loading/>:<Card>{items.length===0?<Empty title="Fila limpa" description="Nenhum caso corresponde aos filtros atuais."/>:<div className="case-grid">{items.map(item=><Link href={`/cases/${item.id}`} className="case-card" key={item.id}><div><Badge tone={item.priority.toLowerCase()}>{item.priority}</Badge><Badge tone={item.status.toLowerCase()}>{item.status}</Badge></div><h3>{item.external_id}</h3><p>{item.summary}</p><div className="case-meta"><span>{formatMoney(item.amount_cents)}</span><span>Risco {item.risk_score}</span><span>{formatDate(item.opened_at)}</span></div></Link>)}</div>}</Card>}</>;}
