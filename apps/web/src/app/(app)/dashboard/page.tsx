'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CircleDollarSign,
  RefreshCw,
  ShieldAlert,
  WalletCards
} from 'lucide-react';
import { api, formatDate, formatMoney } from '../../../lib/api';
import {
  Badge,
  Card,
  ErrorState,
  Loading,
  Metric,
  PageHeader
} from '../../../components/ui';

interface DashboardSummary {
  volume_24h: number;
  amount_24h: string;
  flagged_24h: number;
  reconciled_24h: number;
  failed_24h: number;
}

interface DashboardSeriesItem {
  bucket_at: string;
  volume: number;
  amount: string;
}

interface RiskDistributionItem {
  risk_level: string;
  total: number;
}

interface CaseDistributionItem {
  status: string;
  total: number;
}

interface ReconciliationItem {
  status: string;
  total: number;
  difference: string;
}

interface RecentTransaction {
  id: string;
  external_id: string;
  status: string;
  amount_cents: string;
  currency: string;
  risk_score: number;
  risk_level: string;
  occurred_at: string;
  created_at: string;
}

interface Dashboard {
  summary: DashboardSummary;
  series: DashboardSeriesItem[];
  riskDistribution: RiskDistributionItem[];
  caseDistribution: CaseDistributionItem[];
  reconciliation: ReconciliationItem[];
  recentTransactions: RecentTransaction[];
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function load(): Promise<void> {
    setRefreshing(true);
    setError('');

    try {
      setData(await api<Dashboard>('/api/v1/dashboard'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar a visão geral.');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const max = useMemo(
    () => Math.max(1, ...(data?.series.map((item) => Number(item.amount)) ?? [1])),
    [data]
  );

  return (
    <>
      <PageHeader
        eyebrow="CENTRO DE COMANDO"
        title="Visão geral"
        description="Saúde financeira e risco operacional nas últimas 24 horas."
        actions={
          <button className="secondary" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'spin' : undefined} />
            {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
        }
      />

      {error && <ErrorState message={error} />}

      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="metrics-grid five">
            <Metric
              label="Volume processado"
              value={data.summary.volume_24h}
              hint="transações em 24h"
            />
            <Metric
              label="Valor movimentado"
              value={formatMoney(data.summary.amount_24h)}
              hint="volume bruto"
              tone="good"
            />
            <Metric
              label="Sinalizadas"
              value={data.summary.flagged_24h}
              hint="aguardando análise"
              tone="warn"
            />
            <Metric
              label="Conciliadas"
              value={data.summary.reconciled_24h}
              hint="match financeiro"
              tone="good"
            />
            <Metric
              label="Falhas"
              value={data.summary.failed_24h}
              hint="processamento"
              tone={data.summary.failed_24h ? 'bad' : 'default'}
            />
          </div>

          <div className="dashboard-grid">
            <Card className="span-2">
              <div className="card-head">
                <div>
                  <span className="eyebrow">MOVIMENTO</span>
                  <h2>Volume financeiro por hora</h2>
                </div>
                <CircleDollarSign />
              </div>

              <div className="bar-chart">
                {data.series.map((item) => (
                  <div
                    key={item.bucket_at}
                    className="bar-column"
                    title={`${formatDate(item.bucket_at)} — ${formatMoney(item.amount)}`}
                  >
                    <div className="bar-value">
                      {Number(item.amount)
                        ? formatMoney(item.amount).replace(/\s/g, '')
                        : ''}
                    </div>
                    <div
                      className="bar"
                      style={{
                        height: `${Math.max(4, (Number(item.amount) / max) * 170)}px`
                      }}
                    />
                    <span>{new Date(item.bucket_at).getHours()}h</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="card-head">
                <div>
                  <span className="eyebrow">RISCO</span>
                  <h2>Distribuição</h2>
                </div>
                <ShieldAlert />
              </div>

              <div className="donut-wrap">
                <div className="donut">
                  <strong>{data.summary.flagged_24h}</strong>
                  <span>alertas</span>
                </div>
                <div className="legend">
                  {data.riskDistribution.map((item) => (
                    <div key={item.risk_level}>
                      <Badge tone={item.risk_level.toLowerCase()}>
                        {item.risk_level}
                      </Badge>
                      <strong>{item.total}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <div className="card-head">
                <div>
                  <span className="eyebrow">INVESTIGAÇÃO</span>
                  <h2>Fila de casos</h2>
                </div>
                <AlertTriangle />
              </div>
              <div className="stack-list">
                {data.caseDistribution.map((item) => (
                  <div key={item.status}>
                    <span>{item.status}</span>
                    <strong>{item.total}</strong>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="card-head">
                <div>
                  <span className="eyebrow">CONCILIAÇÃO</span>
                  <h2>Resultados</h2>
                </div>
                <WalletCards />
              </div>
              <div className="stack-list">
                {data.reconciliation.map((item) => (
                  <div key={item.status}>
                    <span>{item.status}</span>
                    <strong>{item.total}</strong>
                    <small>{formatMoney(item.difference)}</small>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="span-2">
              <div className="card-head">
                <div>
                  <span className="eyebrow">TRANSAÇÕES</span>
                  <h2>Atividade recente</h2>
                </div>
                <ArrowUpRight />
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID externo</th>
                      <th>Status</th>
                      <th>Valor</th>
                      <th>Risco</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentTransactions.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.external_id}</strong>
                        </td>
                        <td>
                          <Badge tone={item.status.toLowerCase()}>{item.status}</Badge>
                        </td>
                        <td>{formatMoney(item.amount_cents, item.currency)}</td>
                        <td>
                          <Badge tone={item.risk_level.toLowerCase()}>
                            {item.risk_level} · {item.risk_score}
                          </Badge>
                        </td>
                        <td>{formatDate(item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
