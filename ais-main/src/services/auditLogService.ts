import { Prisma } from '@prisma/client';
import prisma from '../utils/prismaClient';

const SENSITIVE_KEY_PATTERN = /(password|token|secret|api.?key|authorization|cookie|smtp|database_url|jwt|two_gis|telegram_bot)/i;

type AuditDetails = Record<string, unknown> | null | undefined;

interface AuditActionInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  details?: AuditDetails;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        continue;
      }

      result[key] = sanitizeValue(nestedValue);
    }

    return result;
  }

  return value;
}

export function sanitizeAuditDetails(details: AuditDetails) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return {};
  }

  return sanitizeValue(details) as Record<string, unknown>;
}

export function toAuditJson(details: AuditDetails): Prisma.InputJsonValue {
  return sanitizeAuditDetails(details) as Prisma.InputJsonValue;
}

export function getChangedFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: string[]
) {
  return fields.filter((field) => {
    const beforeValue = before[field];
    const afterValue = after[field];
    return JSON.stringify(beforeValue ?? null) !== JSON.stringify(afterValue ?? null);
  });
}

export async function logAuditAction(input: AuditActionInput) {
  if (!input.action || !input.entity) return;

  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId === undefined || input.entityId === null ? null : String(input.entityId),
        details: toAuditJson(input.details),
      },
    });
  } catch (error) {
    console.error('[AuditLog] Ошибка записи аудита:', error);
  }
}
