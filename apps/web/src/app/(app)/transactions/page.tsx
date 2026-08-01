'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Search } from 'lucide-react';
import { api, formatDate, formatMoney } from '../../../lib/api';
import { Badge, Card, Empty, ErrorState, Loading, Modal, PageHeader } from '../../../components/ui';

interface Transaction { id:string; external_id:string; status:string; amount_cents:string; currency:string; payment_method:string; card_last4?:string; card_tsn?:number; terminal_id?:string; risk_score:number; risk_level:string; occurred_at:string; }

export default function TransactionsPage() {
  const [items,setItems]=useState<Transaction[]>([]); const [search,setSearch]=useState(''); const [status,setStatus]=useState(''); const [open,setOpen]=useState(false); const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
  const load=()=>{setLoading(true); const q=new URLSearchParams(); if(search)q.set('search',search); if(status)q.set('status',status); return api<Transaction[]>(`/api/v1/transactions?${q}`).then(setItems).catch(e=>setError(e.message)).finally(()=>setLoading(false));};
  useEffect(()=>{void load();},[]);
  async function create(event:FormEvent<HTMLFormElement>){event.preventDefault(); const fd=new FormData(event.currentTarget); await api('/api/v1/transactions',{method:'POST',body:JSON.stringify({
    externalId:fd.get('externalId'), idempotencyKey:`manual-${Date.now()}-${crypto.randomUUID()}`, occurredAt:new Date(String(fd.get('occurredAt'))).toISOString(), amount:Number(fd.get('amount')), currency:'BRL', paymentMethod:fd.get('paymentMethod'), cardToken:fd.get('cardToken')||undefined, cardLast4:fd.get('cardLast4')||undefined, cardTsn:fd.get('cardTsn')?Number(fd.get('cardTsn')):undefined, terminalId:fd.get('terminalId')||undefined, metadata:{source:'WEB'}
  })}); setOpen(false); await load();}
  return <>
    <PageHeader eyebrow="OPERAÇÃO" title="Transações" description="Monitore ingestão, ledger, risco e conciliação em uma única linha do tempo." actions={<button className="primary" onClick={()=>setOpen(true)}><Plus size={17}/> Nova transação</button>}/>
    <Card><div className="filters"><div className="search"><Search size={17}/><input placeholder="ID externo, terminal ou final do cartão" value={search} onChange={e=>setSearch(e.target.value)} /></div><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos os status</option>{['RECEIVED','PROCESSING','POSTED','FLAGGED','RECONCILED','FAILED','REFUNDED'].map(v=><option key={v}>{v}</option>)}</select><button className="secondary" onClick={load}>Filtrar</button></div></Card>
    {error&&<ErrorState message={error}/>}
    {loading?<Loading/>:<Card>{items.length===0?<Empty title="Nenhuma transação" description="Crie uma transação ou ajuste os filtros."/>:<div className="table-wrap"><table><thead><tr><th>Transação</th><th>Status</th><th>Pagamento</th><th>Valor</th><th>Cartão / TSN</th><th>Risco</th><th>Ocorrência</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><Link className="table-link" href={`/transactions/${item.id}`}>{item.external_id}</Link><small>{item.terminal_id||'Sem terminal'}</small></td><td><Badge tone={item.status.toLowerCase()}>{item.status}</Badge></td><td>{item.payment_method}</td><td><strong>{formatMoney(item.amount_cents,item.currency)}</strong></td><td>{item.card_last4?`•••• ${item.card_last4}`:'—'}<small>TSN {item.card_tsn??'—'}</small></td><td><Badge tone={item.risk_level.toLowerCase()}>{item.risk_level} · {item.risk_score}</Badge></td><td>{formatDate(item.occurred_at)}</td></tr>)}</tbody></table></div>}</Card>}
    <Modal open={open} title="Registrar transação" onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={create}>
      <label>ID externo<input name="externalId" required placeholder="TX-2026-0001"/></label><label>Data e hora<input name="occurredAt" type="datetime-local" required defaultValue={new Date().toISOString().slice(0,16)}/></label><label>Valor<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Método<select name="paymentMethod"><option>CARD</option><option>PIX</option><option>CASH</option><option>TRANSFER</option><option>OTHER</option></select></label><label>Token do cartão<input name="cardToken"/></label><label>Final do cartão<input name="cardLast4" maxLength={4}/></label><label>TSN<input name="cardTsn" type="number" min="0"/></label><label>Terminal<input name="terminalId"/></label><div className="form-actions full"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary">Registrar e processar</button></div>
    </form></Modal>
  </>;
}
