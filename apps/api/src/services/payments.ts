import { prisma } from '@ghostpepe/db';
import { PAYMENT_STATUS, SUBSCRIPTION_STATUS } from '@ghostpepe/shared';
import { computeNewExpiry, parseInvoicePayload, STARS_CURRENCY } from '@ghostpepe/billing';
import { audit } from '../lib/audit.js';
import { newPublicPageToken, tokenHash } from '../lib/tokens.js';
import { kvSet } from '../lib/kv.js';

export interface CreateIntentInput {
  userId: string;
  telegramId: bigint;
  planCode: string;
  invoicePayload: string;
}

/** Create a pending payment (invoice intent). (docs 05 §3) */
export async function createPaymentIntent(input: CreateIntentInput) {
  const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
  if (!plan || !plan.isActive) throw new Error('plan not found');

  const payment = await prisma.payment.create({
    data: {
      userId: input.userId,
      planId: plan.id,
      status: PAYMENT_STATUS.PENDING,
      currency: STARS_CURRENCY,
      starsAmount: plan.starsPrice,
      invoicePayload: input.invoicePayload,
    },
  });
  await prisma.paymentEvent.create({
    data: { paymentId: payment.id, telegramId: input.telegramId, eventType: 'invoice_created', payload: { planCode: input.planCode } as never },
  });
  return { payment, plan };
}

/** Validate a pre_checkout_query payload. (docs 06 §13.1) */
export async function approvePreCheckout(invoicePayload: string): Promise<boolean> {
  const payment = await prisma.payment.findUnique({ where: { invoicePayload } });
  if (!payment) return false;
  if (payment.status === PAYMENT_STATUS.PAID) return false; // already paid
  await prisma.payment.update({ where: { id: payment.id }, data: { status: PAYMENT_STATUS.PRE_CHECKOUT_APPROVED } });
  await prisma.paymentEvent.create({
    data: { paymentId: payment.id, eventType: 'pre_checkout', payload: { ok: true } as never },
  });
  return true;
}

export interface SuccessfulPaymentInput {
  telegramId: bigint;
  invoicePayload: string;
  telegramPaymentChargeId: string;
  providerPaymentChargeId?: string | null;
  rawUpdate: unknown;
}

/**
 * Apply a successful Telegram Stars payment (docs 05 §3–5, 06 §13.1).
 * IDEMPOTENT: the same telegram_payment_charge_id / already-paid payment never
 * extends the subscription twice. Access is granted ONLY here.
 * Returns the subscription and the raw public page token for the import link.
 */
export async function applySuccessfulPayment(
  input: SuccessfulPaymentInput,
): Promise<{ subscriptionId: string; pageToken: string; alreadyApplied: boolean }> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { invoicePayload: input.invoicePayload }, include: { plan: true } });
    if (!payment) throw new Error('payment intent not found');

    // Idempotency: if this charge already recorded as paid, return existing.
    if (payment.status === PAYMENT_STATUS.PAID && payment.subscriptionId) {
      const existingToken = await reissueToken(tx, payment.subscriptionId);
      return { subscriptionId: payment.subscriptionId, pageToken: existingToken, alreadyApplied: true };
    }
    // Idempotency by charge id (unique constraint also guards this).
    const dupCharge = await tx.payment.findFirst({
      where: { telegramPaymentChargeId: input.telegramPaymentChargeId, NOT: { id: payment.id } },
    });
    if (dupCharge && dupCharge.subscriptionId) {
      const existingToken = await reissueToken(tx, dupCharge.subscriptionId);
      return { subscriptionId: dupCharge.subscriptionId, pageToken: existingToken, alreadyApplied: true };
    }

    const parsed = parseInvoicePayload(input.invoicePayload);
    if (!parsed) throw new Error('bad invoice payload');

    const plan = payment.plan;
    // Find current subscription to extend, else create.
    let subscription = await tx.subscription.findFirst({
      where: { userId: payment.userId },
      orderBy: { createdAt: 'desc' },
    });

    const newExpiry = computeNewExpiry(subscription?.expiresAt ?? null, plan.durationDays);
    let pageTokenRaw = newPublicPageToken();

    if (!subscription) {
      subscription = await tx.subscription.create({
        data: {
          userId: payment.userId,
          planId: plan.id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          startsAt: new Date(),
          expiresAt: newExpiry,
          trafficLimitBytes: plan.trafficLimitBytes,
          trafficUsedBytes: 0n,
          deviceLimit: plan.deviceLimit,
          publicPageTokenHash: tokenHash(pageTokenRaw),
        },
      });
    } else {
      subscription = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          planId: plan.id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          expiresAt: newExpiry,
          trafficLimitBytes: plan.trafficLimitBytes,
          deviceLimit: plan.deviceLimit,
          // reset usage on renewal of a limited plan
          ...(plan.trafficLimitBytes > 0n ? { trafficUsedBytes: 0n } : {}),
        },
      });
      // keep existing token; rotate cache only
      pageTokenRaw = newPublicPageToken();
      await tx.subscription.update({ where: { id: subscription.id }, data: { publicPageTokenHash: tokenHash(pageTokenRaw) } });
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PAYMENT_STATUS.PAID,
        paidAt: new Date(),
        subscriptionId: subscription.id,
        telegramPaymentChargeId: input.telegramPaymentChargeId,
        providerPaymentChargeId: input.providerPaymentChargeId ?? null,
        rawUpdate: input.rawUpdate as never,
      },
    });
    await tx.paymentEvent.create({
      data: { paymentId: payment.id, telegramId: input.telegramId, eventType: 'successful_payment', payload: { chargeId: input.telegramPaymentChargeId } as never },
    });

    await audit({
      actorType: 'system',
      action: 'payment.successful',
      entityType: 'subscription',
      entityId: subscription.id,
      after: { plan: plan.code, expiresAt: newExpiry.toISOString(), stars: payment.starsAmount },
    });

    await kvSet(`pagetoken:${subscription.id}`, pageTokenRaw, 60 * 60 * 24 * 90);
    return { subscriptionId: subscription.id, pageToken: pageTokenRaw, alreadyApplied: false };
  });
}

async function reissueToken(tx: { subscription: { update: Function } }, subscriptionId: string): Promise<string> {
  const raw = newPublicPageToken();
  await tx.subscription.update({ where: { id: subscriptionId }, data: { publicPageTokenHash: tokenHash(raw) } });
  await kvSet(`pagetoken:${subscriptionId}`, raw, 60 * 60 * 24 * 90);
  return raw;
}
