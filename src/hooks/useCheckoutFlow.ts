import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { PaymentOption } from '../components/PaymentMethodCard';
import { BASE_TICKET_PRICE, FEE_PER_TICKET, MAX_TICKETS, MIN_TICKETS } from '../constants/checkout';
import {
  detectCardType,
  formatCardNumber,
  formatExpiry,
  validateCardNumber,
  validateCvc,
  validateExpiry,
} from '../utils/cardValidation';
import {
  createPaymentRequest,
  loadPendingRequest,
  PaymentMethod,
  PaymentRecord,
  PaymentSettings,
  syncPaymentStatus,
  writeActiveRequest,
} from '../utils/paymentApi';

export type PaymentPhase = 'idle' | 'validating' | 'processing' | 'failed' | 'succeeded';

export function createDefaultSettings(): PaymentSettings {
  return {
    forcePlatform: 'auto',
    appleWalletProvisioned: Platform.OS === 'ios',
    googleWalletConfigured: Platform.OS === 'android',
    simulateCardDecline: false,
    cancelApplePay: false,
    cancelGooglePay: false,
  };
}

export function useCheckoutFlow() {
  const [ticketCount, setTicketCount] = useState(2);
  const [settings, setSettings] = useState<PaymentSettings>(createDefaultSettings());
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [cardExpiry, setCardExpiry] = useState('08/29');
  const [cardCvc, setCardCvc] = useState('123');
  const [showSettings, setShowSettings] = useState(false);
  const [phase, setPhase] = useState<PaymentPhase>('idle');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | 'card' | null>(null);
  const [statusMessage, setStatusMessage] = useState('Choose a payment method to continue.');
  const [cardTouched, setCardTouched] = useState(false);
  const [paymentRequestId, setPaymentRequestId] = useState<string | null>(null);
  const currentRequestRef = useRef<string | null>(null);

  const effectivePlatform = settings.forcePlatform === 'auto' ? Platform.OS : settings.forcePlatform;

  const orderBreakdown = useMemo(() => {
    const subtotal = Number((ticketCount * BASE_TICKET_PRICE).toFixed(2));
    const fees = Number((ticketCount * FEE_PER_TICKET).toFixed(2));
    const total = Number((subtotal + fees).toFixed(2));
    return { subtotal, fees, total };
  }, [ticketCount]);

  const cardBrand = useMemo(() => detectCardType(cardNumber), [cardNumber]);

  const cardValidation = useMemo(() => {
    const card = validateCardNumber(cardNumber);
    const expiry = validateExpiry(cardExpiry);
    const cvcValid = validateCvc(cardCvc, card.type);

    return {
      card,
      expiry,
      cvcValid,
      isValid: card.isValid && expiry.isValid && cvcValid,
    };
  }, [cardCvc, cardExpiry, cardNumber]);

  const appleEligible = effectivePlatform === 'ios' && settings.appleWalletProvisioned;
  const googleEligible = effectivePlatform === 'android' && settings.googleWalletConfigured;
  const affirmEligible = orderBreakdown.total > 100;

  const paymentOptions = useMemo<PaymentOption[]>(() => [
    {
      key: 'apple',
      label: 'Apple Pay',
      description: 'Wallet + Face ID',
      eligible: appleEligible,
    },
    {
      key: 'google',
      label: 'Google Pay',
      description: 'Tap to pay',
      eligible: googleEligible,
    },
    {
      key: 'affirm',
      label: 'Affirm',
      description: 'Split your total over time',
      eligible: affirmEligible,
    },
  ], [affirmEligible, appleEligible, googleEligible]);

  const clearActivePayment = useCallback(() => {
    currentRequestRef.current = null;
    setPaymentRequestId(null);
    writeActiveRequest(null).catch(() => undefined);
  }, []);

  const handlePaymentResult = useCallback((record: PaymentRecord) => {
    const finished = record.status === 'succeeded';
    const failed = record.status === 'declined' || record.status === 'cancelled' || record.status === 'unknown';

    if (finished) {
      setPhase('succeeded');
      setStatusMessage(record.message);
      clearActivePayment();
      return;
    }

    setPhase('failed');
    setStatusMessage(record.message);
    clearActivePayment();
    if (selectedMethod === 'card') {
      setCardTouched(true);
    }

    if (failed && selectedMethod === 'card') {
      setSelectedMethod('card');
    }
  }, [clearActivePayment, selectedMethod]);

  const resumePaymentFlow = useCallback(async () => {
    const pendingRecord = await loadPendingRequest(settings);
    if (!pendingRecord) {
      return;
    }

    if (pendingRecord.status === 'pending') {
      setPhase('processing');
      setStatusMessage('We are checking the payment status after your app resumed.');
      const resolved = await syncPaymentStatus(pendingRecord.requestId, settings);
      handlePaymentResult(resolved);
      return;
    }

    handlePaymentResult(pendingRecord);
  }, [handlePaymentResult, settings]);

  useEffect(() => {
    const handler = async (nextState: string) => {
      if (nextState === 'background' && currentRequestRef.current) {
        await writeActiveRequest(currentRequestRef.current);
      }

      if (nextState === 'active' && (currentRequestRef.current || paymentRequestId)) {
        await resumePaymentFlow();
      }
    };

    const subscription = AppState.addEventListener('change', handler);
    return () => subscription.remove();
  }, [paymentRequestId, resumePaymentFlow]);

  useEffect(() => {
    const initialize = async () => {
      const pending = await loadPendingRequest(settings);
      if (!pending) {
        return;
      }

      if (pending.status === 'pending') {
        setPaymentRequestId(pending.requestId);
        currentRequestRef.current = pending.requestId;
        setPhase('processing');
        setStatusMessage('We are checking a payment that was interrupted.');
        const resumed = await syncPaymentStatus(pending.requestId, settings);
        handlePaymentResult(resumed);
        return;
      }

      handlePaymentResult(pending);
    };

    void initialize();
  }, [handlePaymentResult, settings]);

  const processExpressPayment = useCallback(async (method: PaymentMethod) => {
    if (method === 'apple' && !appleEligible) return;
    if (method === 'google' && !googleEligible) return;
    if (method === 'affirm' && !affirmEligible) return;

    setSelectedMethod(method);
    setPhase('processing');
    setStatusMessage(`Preparing ${method === 'apple' ? 'Apple Pay' : method === 'google' ? 'Google Pay' : 'Affirm'}...`);

    const request = await createPaymentRequest(method, orderBreakdown.total, settings);
    currentRequestRef.current = request.requestId;
    setPaymentRequestId(request.requestId);

    if (request.status !== 'pending') {
      handlePaymentResult(request);
      return;
    }

    const resolved = await syncPaymentStatus(request.requestId, settings);
    handlePaymentResult(resolved);
  }, [affirmEligible, appleEligible, googleEligible, handlePaymentResult, orderBreakdown.total, settings]);

  const submitCardPayment = useCallback(async () => {
    if (!cardValidation.isValid) {
      setCardTouched(true);
      setPhase('failed');
      setStatusMessage('Complete the card form before submitting.');
      return;
    }

    setSelectedMethod('card');
    setPhase('processing');
    setStatusMessage('Verifying card details and authorizing the purchase...');

    const request = await createPaymentRequest('card', orderBreakdown.total, settings);
    currentRequestRef.current = request.requestId;
    setPaymentRequestId(request.requestId);

    if (request.status !== 'pending') {
      handlePaymentResult(request);
      return;
    }

    const resolved = await syncPaymentStatus(request.requestId, settings);
    handlePaymentResult(resolved);
  }, [cardValidation.isValid, handlePaymentResult, orderBreakdown.total, settings]);

  const adjustTicketCount = useCallback((direction: 'decrement' | 'increment') => {
    setTicketCount((current) => {
      const next = direction === 'decrement' ? current - 1 : current + 1;
      return Math.min(MAX_TICKETS, Math.max(MIN_TICKETS, next));
    });
  }, []);

  const handleCardNumberChange = useCallback((value: string) => {
    setCardTouched(true);
    setCardNumber(formatCardNumber(value));
  }, []);

  const handleCardExpiryChange = useCallback((value: string) => {
    setCardTouched(true);
    setCardExpiry(formatExpiry(value));
  }, []);

  const handleCardCvcChange = useCallback((value: string) => {
    setCardTouched(true);
    const digits = value.replace(/\D/g, '').slice(0, cardBrand === 'amex' ? 4 : 3);
    setCardCvc(digits);
  }, [cardBrand]);

  return {
    ticketCount,
    settings,
    setSettings,
    cardNumber,
    cardExpiry,
    cardCvc,
    showSettings,
    setShowSettings,
    phase,
    selectedMethod,
    statusMessage,
    cardTouched,
    paymentRequestId,
    cardBrand,
    cardValidation,
    paymentOptions,
    orderBreakdown,
    cardError: cardTouched && !cardValidation.isValid,
    processExpressPayment,
    submitCardPayment,
    adjustTicketCount,
    handleCardNumberChange,
    handleCardExpiryChange,
    handleCardCvcChange,
    setCardTouched,
  };
}
