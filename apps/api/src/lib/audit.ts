import { prisma } from '@ghostpepe/db';
import { getConfig } from '@ghostpepe/config';
import { hashToken } from '@ghostpepe/shared';

export interface AuditInput {
  actorType: 'user' | 'admin' | 'system' | 'worker';
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/** Write an audit log entry (docs 04 §12). All admin actions must call this. */
export async function audit(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: (input.before ?? null) as never,
      afterJson: (input.after ?? null) as never,
      ipHash: input.ip ? hashToken(input.ip, getConfig().TOKEN_HASH_SECRET) : null,
    },
  });
}
