# Operação

## Subir

```bash
cp .env.example .env
docker compose up -d --build
```

## Diagnóstico

```bash
docker compose ps
docker compose logs -f api ingestion-worker fraud-worker reconciliation-worker settlement-worker web nginx
```

## Teste ponta a ponta

```bash
node scripts/smoke-test.mjs
```

## Reset local

```bash
docker compose down -v
docker compose up -d --build
```

O comando com `-v` apaga banco, filas e arquivos locais.

## Métricas

- API: `/metrics`
- workers: porta interna `3334/metrics`
- Prometheus: `9090`
- Grafana: `3001`
