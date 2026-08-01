import { z } from 'zod';

export const transactionStatusSchema = z.enum([
  'RECEIVED','PROCESSING','POSTED','FLAGGED','RECONCILED','FAILED','REFUNDED','CHARGEBACK'
]);
export const caseStatusSchema = z.enum([
  'OPEN','IN_REVIEW','APPROVED','REJECTED','BLOCKED','CLOSED'
]);
export const riskLevelSchema = z.enum(['LOW','MEDIUM','HIGH','CRITICAL']);
export const roleSchema = z.enum(['OWNER','ADMIN','ANALYST','OPERATOR','VIEWER']);

export const createTransactionSchema = z.object({
  externalId: z.string().min(1).max(150),
  idempotencyKey: z.string().min(8).max(200),
  occurredAt: z.string().datetime(),
  amount: z.number().positive(),
  currency: z.string().length(3).default('BRL'),
  paymentMethod: z.enum(['CARD','PIX','CASH','TRANSFER','OTHER']),
  cardToken: z.string().max(200).optional(),
  cardLast4: z.string().regex(/^\d{4}$/).optional(),
  cardTsn: z.number().int().nonnegative().optional(),
  terminalId: z.string().max(100).optional(),
  lineId: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const createRuleSchema = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(500).default(''),
  kind: z.enum(['DUPLICATE','VELOCITY','AMOUNT','TSN','GEO','CUSTOM']),
  severity: riskLevelSchema,
  score: z.number().int().min(1).max(100),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown())
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  timezone: z.string().default('America/Sao_Paulo'),
  currency: z.string().length(3).default('BRL')
});

export const reconciliationItemSchema = z.object({
  externalId: z.string().min(1),
  amount: z.number(),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type Role = z.infer<typeof roleSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
