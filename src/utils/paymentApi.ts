import AsyncStorage from '@react-native-async-storage/async-storage';

export type PaymentMethod = 'apple' | 'google' | 'affirm' | 'card';
export type PaymentStatus = 'pending' | 'succeeded' | 'declined' | 'cancelled' | 'unknown';

export interface PaymentSettings {
  simulateCardDecline: boolean;
  cancelApplePay: boolean;
  cancelGooglePay: boolean;
  forcePlatform: 'auto' | 'ios' | 'android';
  appleWalletProvisioned: boolean;
  googleWalletConfigured: boolean;
}

export interface PaymentRequestPayload {
  method: PaymentMethod;
  total: number;
  currency: 'USD';
}

export interface PaymentRecord {
  requestId: string;
  idempotencyKey: string;
  method: PaymentMethod;
  total: number;
  status: PaymentStatus;
  message: string;
  createdAt: number;
  updatedAt: number;
  failureReason?: string;
  payloadHash?: string;
}

const STORAGE_KEY = 'gametime-checkout:payment-records';
const ACTIVE_KEY = 'gametime-checkout:active-request';
const IDEMPOTENCY_KEY = 'gametime-checkout:idempotency';
const requestLocks = new Map<string, Promise<unknown>>();

const defaultSettings: PaymentSettings = {
  simulateCardDecline: false,
  cancelApplePay: false,
  cancelGooglePay: false,
  forcePlatform: 'auto',
  appleWalletProvisioned: false,
  googleWalletConfigured: false,
};

function hashPayload(payload: PaymentRequestPayload): string {
  return `${payload.method}:${payload.total}:${payload.currency}`;
}

async function readMap<T>(storageKey: string): Promise<Record<string, T>> {
  try {
    const value = await AsyncStorage.getItem(storageKey);
    return value ? (JSON.parse(value) as Record<string, T>) : {};
  } catch {
    return {};
  }
}

async function writeMap<T>(storageKey: string, records: Record<string, T>): Promise<void> {
  await AsyncStorage.setItem(storageKey, JSON.stringify(records));
}

async function readIdempotencyMap(): Promise<Record<string, { payloadHash: string; requestId: string }>> {
  return readMap(IDEMPOTENCY_KEY);
}

async function writeIdempotencyMap(records: Record<string, { payloadHash: string; requestId: string }>): Promise<void> {
  await writeMap(IDEMPOTENCY_KEY, records);
}

async function withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const existing = requestLocks.get(key);
  if (existing) {
    return (await existing) as T;
  }

  const next = operation().finally(() => {
    requestLocks.delete(key);
  });

  requestLocks.set(key, next as Promise<unknown>);
  return next;
}

export async function writeActiveRequest(requestId: string | null): Promise<void> {
  if (!requestId) {
    await AsyncStorage.removeItem(ACTIVE_KEY);
    return;
  }

  await AsyncStorage.setItem(ACTIVE_KEY, requestId);
}

export async function readActiveRequest(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_KEY);
}

function buildStatusMessage(method: PaymentMethod, status: PaymentStatus): string {
  if (status === 'succeeded') {
    return 'Payment confirmed. Your order is complete.';
  }

  if (status === 'declined') {
    return 'Card declined. Please try another card or a different payment method.';
  }

  if (status === 'cancelled') {
    return `${method === 'apple' ? 'Apple Pay' : method === 'google' ? 'Google Pay' : 'Affirm'} was cancelled. You can try again anytime.`;
  }

  if (status === 'pending') {
    return 'Payment in progress — we are waiting on authorization.';
  }

  return 'We could not confirm the payment yet. Please check your payment status.';
}

export async function createPaymentRequest(
  method: PaymentMethod,
  total: number,
  settings: PaymentSettings = defaultSettings,
  idempotencyKeyOverride?: string,
): Promise<PaymentRecord> {
  return withLock(`request:${method}:${total}`, async () => {
    const payload: PaymentRequestPayload = { method, total, currency: 'USD' };
    const payloadHash = hashPayload(payload);
    const key = idempotencyKeyOverride ?? `${method}:${total}:${Date.now().toString(36)}`;
    const idempotencyMap = await readIdempotencyMap();
    const existingAttempt = idempotencyMap[key];

    if (existingAttempt) {
      if (existingAttempt.payloadHash !== payloadHash) {
        throw new Error('Duplicate idempotency key used with a conflicting payment payload.');
      }

      const records = await readMap<PaymentRecord>(STORAGE_KEY);
      const existingRecord = records[existingAttempt.requestId];
      if (existingRecord) {
        return existingRecord;
      }
    }

    const records = await readMap<PaymentRecord>(STORAGE_KEY);
    const requestId = `req_${Math.random().toString(36).slice(2, 11)}`;
    const record: PaymentRecord = {
      requestId,
      idempotencyKey: key,
      method,
      total,
      status: 'pending',
      message: 'Checking wallet or network. We do not know the result yet.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      payloadHash,
    };

    records[requestId] = record;
    idempotencyMap[key] = { payloadHash, requestId };
    await writeMap(STORAGE_KEY, records);
    await writeIdempotencyMap(idempotencyMap);
    await writeActiveRequest(requestId);

    if (method === 'card' && settings.simulateCardDecline) {
      const declinedRecord: PaymentRecord = {
        ...record,
        status: 'declined',
        message: 'Card declined. Please use a different card or try again.',
        failureReason: 'declined',
        updatedAt: Date.now(),
      };

      records[requestId] = declinedRecord;
      await writeMap(STORAGE_KEY, records);
      await writeActiveRequest(null);
      return declinedRecord;
    }

    if (method === 'apple' && settings.cancelApplePay) {
      const cancelledRecord: PaymentRecord = {
        ...record,
        status: 'cancelled',
        message: 'Apple Pay was cancelled before authorization completed.',
        failureReason: 'cancelled',
        updatedAt: Date.now(),
      };

      records[requestId] = cancelledRecord;
      await writeMap(STORAGE_KEY, records);
      await writeActiveRequest(null);
      return cancelledRecord;
    }

    if (method === 'google' && settings.cancelGooglePay) {
      const cancelledRecord: PaymentRecord = {
        ...record,
        status: 'cancelled',
        message: 'Google Pay was cancelled before authorization completed.',
        failureReason: 'cancelled',
        updatedAt: Date.now(),
      };

      records[requestId] = cancelledRecord;
      await writeMap(STORAGE_KEY, records);
      await writeActiveRequest(null);
      return cancelledRecord;
    }

    return record;
  });
}

export async function syncPaymentStatus(
  requestId: string,
  settings: PaymentSettings = defaultSettings,
): Promise<PaymentRecord> {
  const records = await readMap<PaymentRecord>(STORAGE_KEY);
  const record = records[requestId];

  if (!record) {
    return {
      requestId,
      idempotencyKey: `${requestId}-missing`,
      method: 'card',
      total: 0,
      status: 'unknown',
      message: 'No payment record found. We do not know if it completed.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  if (record.status !== 'pending') {
    await writeActiveRequest(null);
    return record;
  }

  const elapsedMs = Date.now() - record.createdAt;
  const minimumWaitMs = 1800;

  if (elapsedMs < minimumWaitMs) {
    return {
      ...record,
      message: 'We are checking with the gateway. This may take a moment.',
      updatedAt: Date.now(),
    };
  }

  let nextStatus: PaymentStatus = 'succeeded';
  let message = buildStatusMessage(record.method, nextStatus);
  let failureReason: string | undefined;

  if (record.method === 'card' && settings.simulateCardDecline) {
    nextStatus = 'declined';
    message = buildStatusMessage(record.method, nextStatus);
    failureReason = 'card_declined';
  }

  if (record.method === 'apple' && settings.cancelApplePay) {
    nextStatus = 'cancelled';
    message = buildStatusMessage(record.method, nextStatus);
    failureReason = 'apple_pay_cancelled';
  }

  if (record.method === 'google' && settings.cancelGooglePay) {
    nextStatus = 'cancelled';
    message = buildStatusMessage(record.method, nextStatus);
    failureReason = 'google_pay_cancelled';
  }

  const updatedRecord: PaymentRecord = {
    ...record,
    status: nextStatus,
    message,
    failureReason,
    updatedAt: Date.now(),
  };

  records[requestId] = updatedRecord;
  await writeMap(STORAGE_KEY, records);
  await writeActiveRequest(null);
  return updatedRecord;
}

export async function loadPendingRequest(settings: PaymentSettings = defaultSettings): Promise<PaymentRecord | null> {
  const requestId = await readActiveRequest();

  if (!requestId) {
    return null;
  }

  const records = await readMap<PaymentRecord>(STORAGE_KEY);
  const record = records[requestId];

  if (!record) {
    await writeActiveRequest(null);
    return null;
  }

  if (record.status === 'pending') {
    return syncPaymentStatus(requestId, settings);
  }

  return record;
}
