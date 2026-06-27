export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  TRIAL: 'trial',
  EXPIRED: 'expired',
  TRAFFIC_LIMITED: 'traffic_limited',
  PAYMENT_PENDING: 'payment_pending',
  BLOCKED: 'blocked',
  REFUNDED: 'refunded',
} as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

/** Statuses for which backend MUST NOT hand out working credentials. (docs 01 §10) */
export const NON_SERVING_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SUBSCRIPTION_STATUS.EXPIRED,
  SUBSCRIPTION_STATUS.TRAFFIC_LIMITED,
  SUBSCRIPTION_STATUS.PAYMENT_PENDING,
  SUBSCRIPTION_STATUS.BLOCKED,
  SUBSCRIPTION_STATUS.REFUNDED,
];

export const DEVICE_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
  REVOKED: 'revoked',
} as const;
export type DeviceStatus = (typeof DEVICE_STATUS)[keyof typeof DEVICE_STATUS];

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PRE_CHECKOUT_APPROVED: 'pre_checkout_approved',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELED: 'canceled',
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

export const NODE_ROLE = {
  CONTROL: 'control',
  EXIT: 'exit',
  WHITELIST_INGRESS: 'whitelist_ingress',
  CONTROL_EXIT: 'control_exit',
  MIXED: 'mixed',
} as const;

export const DEFAULT_DEVICE_LIMIT = 5;

export const ERROR_CODES = {
  DEVICE_LIMIT_REACHED: 'DEVICE_LIMIT_REACHED',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_INACTIVE: 'SUBSCRIPTION_INACTIVE',
  USER_BLOCKED: 'USER_BLOCKED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  PLATFORM_UNSUPPORTED: 'PLATFORM_UNSUPPORTED',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_FOUND: 'NOT_FOUND',
} as const;
