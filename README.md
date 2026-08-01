# LedgerGuard

Plataforma SaaS multiempresa para **ledger de dupla entrada, conciliação financeira e investigação antifraude**. O produto recebe transações, garante idempotência, gera lançamentos contábeis balanceados, calcula risco explicável, abre casos, concilia fontes externas e consolida fechamentos diários.

## Fluxo principal

```text
API / arquivo
    ↓
Transação RECEIVED
    ↓
Ingestion Worker
    ├─ valida idempotência
    ├─ cria débito e crédito
    └─ publica avaliação
          ↓
      Fraud Worker
      ├─ executa regras versionadas
      ├─ calcula score
      └─ abre caso quando necessário
          ↓
Reconciliation Worker ── Settlement Worker
```

## Capacidades

- Multiempresa com PostgreSQL RLS.
- Autenticação Argon2id, JWT e refresh token HttpOnly.
- Papéis OWNER, ADMIN, ANALYST, OPERATOR e VIEWER.
- Ingestão idempotente por API autenticada, webhook e CSV.
- Token do cartão armazenado somente como hash.
- Ledger imutável de dupla entrada.
- Reembolso com lançamentos compensatórios.
- Chargeback e evidências.
- Regras antifraude versionadas.
- Duplicidade, velocidade, valor, TSN e geolocalização.
- Score explicável de 0 a 100.
- Casos investigativos com timeline e decisão.
- Lotes de conciliação e divergências.
- Fechamento diário bruto, reembolso, chargeback e líquido.
- Upload versionado em MinIO com checksum SHA-256.
- Auditoria e correlation ID.
- BullMQ, retry exponencial e workers independentes.
- Prometheus, Grafana, Loki e Promtail.
- Docker Compose, Codespaces e GitHub Actions.

## Stack

- Node.js 24 e TypeScript.
- Fastify.
- Next.js 16 e React 19.
- PostgreSQL 17.
- Redis 8 e BullMQ.
- MinIO.
- Prometheus, Grafana e Loki.
- pnpm e Turborepo.

## Estrutura

```text
ledgerguard/
├── apps/
│   ├── api/
│   ├── web/
│   ├── ingestion-worker/
│   ├── fraud-worker/
│   ├── reconciliation-worker/
│   └── settlement-worker/
├── packages/
│   ├── contracts/
│   ├── ledger-core/
│   ├── fraud-engine/
│   └── observability/
├── infra/
├── scripts/
├── docs/
└── docker-compose.yml
```

## Rodar com Docker

O arquivo ZIP deve estar diretamente em `~` no macOS:

```bash
cd ~

unzip ~/ledgerguard-full.zip -d ~

cd ~/ledgerguard

cp .env.example .env

docker compose up -d --build
```

Acompanhe:

```bash
docker compose ps
docker compose logs -f api ingestion-worker fraud-worker reconciliation-worker settlement-worker web nginx
```

## Acessos

| Serviço | Endereço |
|---|---|
| Aplicação | `http://localhost:8080` |
| Frontend direto | `http://localhost:3000` |
| API | `http://localhost:3333` |
| Swagger | `http://localhost:3333/docs` |
| Mailpit | `http://localhost:8025` |
| MinIO | `http://localhost:9001` |
| Grafana | `http://localhost:3001` |
| Prometheus | `http://localhost:9090` |

### Login local

```text
E-mail: admin@ledgerguard.local
Senha:  Admin@123456
```

## Teste ponta a ponta

Depois que os containers estiverem saudáveis:

```bash
node scripts/smoke-test.mjs
```

O teste valida:

1. healthcheck;
2. autenticação;
3. ingestão;
4. ledger balanceado;
5. antifraude;
6. conciliação;
7. fechamento;
8. upload, checksum e exclusão no MinIO;
9. dashboard.

## Comandos úteis

```bash
make up
make ps
make logs
make smoke
make down
```

Rebuild completo:

```bash
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d
```

Resetando também os dados:

```bash
docker compose down -v
docker compose up -d --build
```

> O parâmetro `-v` apaga banco, filas e arquivos locais.

## GitHub

```bash
cd ~/ledgerguard

git init
git branch -M main
git add .

git commit \
  -m "feat: 🚀 implementar plataforma financeira LedgerGuard" \
  -m "Adiciona ledger de dupla entrada, ingestão idempotente, antifraude explicável, investigação, conciliação, fechamento diário, MinIO, observabilidade, Docker e CI/CD."

gh repo create Tito174BR/ledgerguard \
  --public \
  --source=. \
  --remote=origin \
  --description "Plataforma SaaS de ledger, conciliação financeira e antifraude explicável." \
  --push
```

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Domínio financeiro](docs/DOMAIN.md)
- [API](docs/API.md)
- [Ingestão](docs/INGESTION.md)
- [Segurança](docs/SECURITY.md)
- [Operação](docs/OPERATIONS.md)
- [Validação](docs/VALIDATION.md)

## Produção

Antes de disponibilizar publicamente:

- substitua todas as credenciais do `.env`;
- use TLS e domínio próprio;
- mantenha PostgreSQL, Redis e MinIO em rede privada;
- use um gerenciador de segredos;
- configure backup e recuperação;
- troque o seed local por onboarding administrativo;
- configure e-mail corporativo;
- revise retenção e proteção de dados financeiros.

## Licença

MIT.
