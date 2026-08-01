'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { api, formatDate, formatMoney } from '../../../../lib/api';
import { Badge, Card, ErrorState, Loading, PageHeader } from '../../../../components/ui';

interface Detail {
  transaction: Record<string, any>;
  ledgerEntries: Array<Record<string, any>>;
  evaluations: Array<Record<string, any>>;
  case: Record<string, any> | null;
}

export default function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data,setData]=useState<Detail|null>(null); const [error,setError]=useState('');
  const load=()=>api<Detail>(`/api/v1/transactions/${id}`).then(setData).catch(e=>setError(e.message));
  useEffect(()=>{void load();},[id]);
  async function refund(){const amount=prompt('Valor do reembolso em reais. Deixe vazio para reembolso integral.'); if(amount===null)return; await api(`/api/v1/transactions/${id}/refund`,{method:'POST',body:JSON.stringify({amount:amount?Number(amount):undefined,reason:'Solicitado pela operação'})}); await load();}
async function chargeback(){const reasonCode=prompt('Código ou motivo do chargeback:','FRAUD')??'';if(!reasonCode)return;await api(`/api/v1/transactions/${id}/chargeback`,{method:'POST',body:JSON.stringify({reasonCode,evidence:{source:'WEB'}})});await load();}
  return <>
    <PageHeader eyebrow="RASTREABILIDADE" title={data?.transaction.external_id??'Detalhe da transação'} description="Visão consolidada do evento, ledger e decisões antifraude." actions={<><Link className="button secondary" href="/transactions"><ArrowLeft size={16}/> Voltar</Link><button className="secondary" onClick={()=>void refund()}><RotateCcw size={16}/> Reembolsar</button><button className="danger" onClick={()=>void chargeback()}>Abrir chargeback</button></>}/>
    {error&&<ErrorState message={error}/>}
    {!data?<Loading/>:<>
      <div className="metrics-grid four"><Card className="metric"><span>Status</span><strong><Badge tone={String(data.transaction.status).toLowerCase()}>{data.transaction.status}</Badge></strong><small>{formatDate(data.transaction.updated_at)}</small></Card><Card className="metric"><span>Valor</span><strong>{formatMoney(data.transaction.amount_cents,data.transaction.currency)}</strong><small>{data.transaction.payment_method}</small></Card><Card className="metric"><span>Risco</span><strong>{data.transaction.risk_score}/100</strong><small>{data.transaction.risk_level}</small></Card><Card className="metric"><span>Cartão</span><strong>{data.transaction.card_last4?`•••• ${data.transaction.card_last4}`:'Não informado'}</strong><small>TSN {data.transaction.card_tsn??'—'}</small></Card></div>
      <div className="dashboard-grid">
        <Card className="span-2"><div className="card-head"><div><span className="eyebrow">CONTABILIDADE</span><h2>Lançamentos de dupla entrada</h2></div></div><div className="table-wrap"><table><thead><tr><th>Conta</th><th>Lado</th><th>Valor</th><th>Referência</th><th>Data</th></tr></thead><tbody>{data.ledgerEntries.map(row=><tr key={row.id}><td><strong>{row.account_code}</strong><small>{row.account_name}</small></td><td><Badge tone={row.side==='DEBIT'?'medium':'low'}>{row.side}</Badge></td><td>{formatMoney(row.amount_cents)}</td><td>{row.reference_type}</td><td>{formatDate(row.created_at)}</td></tr>)}</tbody></table></div></Card>
        <Card><div className="card-head"><div><span className="eyebrow">ANTIFRAUDE</span><h2>Regras avaliadas</h2></div></div><div className="stack-list">{data.evaluations.map(row=><div key={row.id}><span>{row.reason}</span><strong>{row.matched?`+${row.score}`:'OK'}</strong></div>)}</div></Card>
        <Card><div className="card-head"><div><span className="eyebrow">INVESTIGAÇÃO</span><h2>Caso associado</h2></div></div>{data.case?<><Badge tone={String(data.case.status).toLowerCase()}>{data.case.status}</Badge><p>{data.case.summary}</p><Link className="button secondary" href={`/cases/${data.case.id}`}>Abrir investigação</Link></>:<p className="muted">Nenhum caso foi aberto para esta transação.</p>}</Card>
        <Card className="span-2"><div className="card-head"><div><span className="eyebrow">DADOS BRUTOS</span><h2>Metadados</h2></div></div><pre className="json">{JSON.stringify(data.transaction.metadata??{},null,2)}</pre></Card>
      </div>
    </>}
  </>;
}
