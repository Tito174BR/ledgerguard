import argon2 from 'argon2';
import { migratorPool } from '../db/pool.js';

const passwordHash = await argon2.hash('Admin@123456');
const client = await migratorPool.connect();

try {
  await client.query('BEGIN');

  const user = (
    await client.query(
      `INSERT INTO users(id, name, email, password_hash, status)
       VALUES(
         '0198f320-4f16-7f11-a160-23c70aac7701',
         'Marcus Vinicius',
         'admin@ledgerguard.local',
         $1,
         'ACTIVE'
       )
       ON CONFLICT(email)
       DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [passwordHash]
    )
  ).rows[0];

  const tenant = (
    await client.query(
      `INSERT INTO tenants(
         id, name, slug, timezone, currency, status
       )
       VALUES(
         '0198f320-4f16-7f11-a160-23c70aac7702',
         'LedgerGuard Workspace',
         'ledgerguard-main',
         'America/Sao_Paulo',
         'BRL',
         'ACTIVE'
       )
       ON CONFLICT(slug)
       DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    )
  ).rows[0];

  await client.query(
    `INSERT INTO memberships(tenant_id, user_id, role, status)
     VALUES($1, $2, 'OWNER', 'ACTIVE')
     ON CONFLICT(tenant_id, user_id)
     DO UPDATE SET role = 'OWNER', status = 'ACTIVE'`,
    [tenant.id, user.id]
  );

  const accounts = [
    ['PAYMENTS_RECEIVABLE', 'Contas a receber', 'ASSET'],
    ['TRANSACTION_REVENUE', 'Receita de transações', 'REVENUE'],
    ['REFUND_EXPENSE', 'Despesa de reembolso', 'EXPENSE'],
    ['CHARGEBACK_EXPENSE', 'Despesa de chargeback', 'EXPENSE'],
    ['SETTLEMENT_CLEARING', 'Liquidação a compensar', 'ASSET']
  ];

  for (const account of accounts) {
    await client.query(
      `INSERT INTO ledger_accounts(tenant_id, code, name, account_type)
       VALUES($1, $2, $3, $4)
       ON CONFLICT(tenant_id, code) DO NOTHING`,
      [tenant.id, ...account]
    );
  }

  const rules = [
    [
      'Duplicidade no mesmo cartão',
      'Mesmo cartão e horário mais de uma vez',
      'DUPLICATE',
      'HIGH',
      60,
      { threshold: 2 }
    ],
    [
      'Velocidade de uso',
      'Múltiplos usos em janela curta',
      'VELOCITY',
      'HIGH',
      45,
      { windowMinutes: 5, maxCount: 3 }
    ],
    [
      'Valor atípico',
      'Valor acima do teto operacional',
      'AMOUNT',
      'MEDIUM',
      30,
      { maxAmount: 1000 }
    ],
    [
      'Sequência TSN inconsistente',
      'TSN regressivo ou salto inesperado',
      'TSN',
      'HIGH',
      55,
      { maxDelta: 10 }
    ]
  ] as const;

  for (const [name, description, kind, severity, score, config] of rules) {
    const rule = (
      await client.query(
        `INSERT INTO fraud_rules(
           tenant_id, name, description, kind, enabled, created_by
         )
         VALUES($1, $2, $3, $4, true, $5)
         ON CONFLICT(tenant_id, name)
         DO UPDATE SET description = EXCLUDED.description
         RETURNING id, active_version_id`,
        [tenant.id, name, description, kind, user.id]
      )
    ).rows[0];

    if (!rule.active_version_id) {
      const version = (
        await client.query(
          `INSERT INTO fraud_rule_versions(
             tenant_id, rule_id, version, config, score, severity, created_by
           )
           VALUES($1, $2, 1, $3, $4, $5, $6)
           RETURNING id`,
          [tenant.id, rule.id, JSON.stringify(config), score, severity, user.id]
        )
      ).rows[0];

      await client.query(
        'UPDATE fraud_rules SET active_version_id = $2 WHERE id = $1',
        [rule.id, version.id]
      );
    }
  }

  await client.query('COMMIT');
  console.log('Seed completed');
  console.log('Login: admin@ledgerguard.local');
  console.log('Password: Admin@123456');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await migratorPool.end();
}
