import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { PaymentMethodCard } from './src/components/PaymentMethodCard';
import { useCheckoutFlow } from './src/hooks/useCheckoutFlow';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function App() {
  const checkout = useCheckoutFlow();

  const {
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
    cardBrand,
    cardValidation,
    paymentOptions,
    orderBreakdown,
    cardError,
    processExpressPayment,
    submitCardPayment,
    adjustTicketCount,
    handleCardNumberChange,
    handleCardExpiryChange,
    handleCardCvcChange,
  } = checkout;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.eyebrow}>Gametime Checkout</Text>
              <Text style={styles.title}>Secure payment</Text>
            </View>
            <Pressable onPress={() => setShowSettings(true)} style={styles.settingsButton}>
              <Text style={styles.settingsButtonText}>Env</Text>
            </Pressable>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Order summary</Text>
            <View style={styles.summaryRow}>
              <Text>Seats</Text>
              <Text>{ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text>Fees</Text>
              <Text>{formatCurrency(orderBreakdown.fees)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(orderBreakdown.total)}</Text>
            </View>

            <View style={styles.totalAdjuster}>
              <Pressable style={styles.stepperButton} onPress={() => adjustTicketCount('decrement')}>
                <Text>-</Text>
              </Pressable>
              <Text style={styles.adjusterText}>Adjust total</Text>
              <Pressable style={styles.stepperButton} onPress={() => adjustTicketCount('increment')}>
                <Text>+</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.modeCard}>
            <Text style={styles.sectionTitle}>Choose a payment method</Text>
            {paymentOptions.map((option) => (
              <PaymentMethodCard
                key={option.key}
                option={option}
                selected={selectedMethod === option.key}
                disabled={phase === 'processing'}
                onPress={() => processExpressPayment(option.key)}
              />
            ))}
          </View>

          <View style={styles.cardForm}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Credit card</Text>
              <Text style={styles.cardBrandText}>{cardBrand.toUpperCase()}</Text>
            </View>

            <Text style={styles.label}>Card number</Text>
            <TextInput
              value={cardNumber}
              onChangeText={handleCardNumberChange}
              onBlur={() => checkout.setCardTouched(true)}
              keyboardType="number-pad"
              textContentType="creditCardNumber"
              autoComplete="cc-number"
              maxLength={19}
              placeholder="4242 4242 4242 4242"
              style={[styles.input, cardError && styles.inputError]}
            />

            <View style={styles.inlineFields}>
              <View style={styles.fieldColumn}>
                <Text style={styles.label}>Expiry</Text>
                <TextInput
                  value={cardExpiry}
                  onChangeText={handleCardExpiryChange}
                  onBlur={() => checkout.setCardTouched(true)}
                  keyboardType="number-pad"
                  textContentType="creditCardExpiration"
                  autoComplete="cc-exp"
                  maxLength={5}
                  placeholder="MM/YY"
                  style={[styles.input, checkout.cardTouched && !cardValidation.expiry.isValid && styles.inputError]}
                />
              </View>

              <View style={styles.fieldColumn}>
                <Text style={styles.label}>CVC</Text>
                <TextInput
                  value={cardCvc}
                  onChangeText={handleCardCvcChange}
                  onBlur={() => checkout.setCardTouched(true)}
                  keyboardType="number-pad"
                  textContentType="creditCardSecurityCode"
                  autoComplete="cc-csc"
                  maxLength={cardBrand === 'amex' ? 4 : 3}
                  placeholder="123"
                  style={[styles.input, checkout.cardTouched && !cardValidation.cvcValid && styles.inputError]}
                />
              </View>
            </View>

            {checkout.cardTouched && !cardValidation.isValid && (
              <Text style={styles.validationText}>Use a valid card number, a future expiry date, and a matching CVC.</Text>
            )}

            <Pressable
              onPress={submitCardPayment}
              disabled={phase === 'processing' || !cardValidation.isValid}
              style={[
                styles.payButton,
                (!cardValidation.isValid || phase === 'processing') && styles.payButtonDisabled,
              ]}
            >
              {phase === 'processing' && selectedMethod === 'card' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.payButtonText}>Pay {formatCurrency(orderBreakdown.total)}</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.statusCard}>
            <Text style={[styles.statusTitle, phase === 'failed' && styles.failedText, phase === 'succeeded' && styles.successText]}>
              {phase === 'processing' ? 'Checking payment' : phase === 'succeeded' ? 'Payment confirmed' : phase === 'failed' ? 'Payment issue' : 'Ready'}
            </Text>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        </ScrollView>

        <Modal visible={showSettings} transparent animationType="slide">
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Environment simulator</Text>
                <Pressable onPress={() => setShowSettings(false)}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>

              <Text style={styles.modalSectionTitle}>Platform</Text>
              <View style={styles.radioRow}>
                {['auto', 'ios', 'android'].map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setSettings((current) => ({ ...current, forcePlatform: option as 'auto' | 'ios' | 'android' }))}
                    style={[
                      styles.radioOption,
                      settings.forcePlatform === option && styles.radioOptionSelected,
                    ]}
                  >
                    <Text style={settings.forcePlatform === option ? styles.radioTextSelected : styles.radioText}>{option}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.modalSectionTitle}>Wallet capability</Text>
              <View style={styles.toggleRow}>
                <Text>Apple Pay wallet provisioned</Text>
                <Pressable
                  onPress={() => setSettings((current) => ({ ...current, appleWalletProvisioned: !current.appleWalletProvisioned }))}
                  style={[styles.toggle, settings.appleWalletProvisioned && styles.toggleOn]}
                >
                  <View style={[styles.toggleThumb, settings.appleWalletProvisioned && styles.toggleThumbOn]} />
                </Pressable>
              </View>
              <View style={styles.toggleRow}>
                <Text>Google Pay configured</Text>
                <Pressable
                  onPress={() => setSettings((current) => ({ ...current, googleWalletConfigured: !current.googleWalletConfigured }))}
                  style={[styles.toggle, settings.googleWalletConfigured && styles.toggleOn]}
                >
                  <View style={[styles.toggleThumb, settings.googleWalletConfigured && styles.toggleThumbOn]} />
                </Pressable>
              </View>

              <Text style={styles.modalSectionTitle}>Failure simulation</Text>
              <View style={styles.toggleRow}>
                <Text>Decline card</Text>
                <Pressable
                  onPress={() => setSettings((current) => ({ ...current, simulateCardDecline: !current.simulateCardDecline }))}
                  style={[styles.toggle, settings.simulateCardDecline && styles.toggleOn]}
                >
                  <View style={[styles.toggleThumb, settings.simulateCardDecline && styles.toggleThumbOn]} />
                </Pressable>
              </View>
              <View style={styles.toggleRow}>
                <Text>Cancel Apple Pay sheet</Text>
                <Pressable
                  onPress={() => setSettings((current) => ({ ...current, cancelApplePay: !current.cancelApplePay }))}
                  style={[styles.toggle, settings.cancelApplePay && styles.toggleOn]}
                >
                  <View style={[styles.toggleThumb, settings.cancelApplePay && styles.toggleThumbOn]} />
                </Pressable>
              </View>
              <View style={styles.toggleRow}>
                <Text>Cancel Google Pay sheet</Text>
                <Pressable
                  onPress={() => setSettings((current) => ({ ...current, cancelGooglePay: !current.cancelGooglePay }))}
                  style={[styles.toggle, settings.cancelGooglePay && styles.toggleOn]}
                >
                  <View style={[styles.toggleThumb, settings.cancelGooglePay && styles.toggleThumbOn]} />
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  container: {
    padding: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    color: '#546579',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '700',
    color: '#101828',
  },
  settingsButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e7eefb',
  },
  settingsButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#001f3f',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  summaryLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#6b7280',
    marginBottom: 12,
    letterSpacing: 1.1,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  totalLabel: {
    fontWeight: '700',
    color: '#0f172a',
  },
  totalValue: {
    fontWeight: '700',
    color: '#0f172a',
    fontSize: 18,
  },
  totalAdjuster: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adjusterText: {
    color: '#475569',
    fontWeight: '600',
  },
  modeCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  methodCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe3f0',
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#f8fafc',
  },
  methodSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  methodUnavailable: {
    opacity: 0.45,
    backgroundColor: '#f1f5f9',
  },
  methodDisabled: {
    opacity: 0.6,
  },
  methodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  methodName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  methodDescription: {
    color: '#475569',
    marginTop: 4,
  },
  eligibleTag: {
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: '#166534',
    fontSize: 11,
    fontWeight: '700',
  },
  unavailableTag: {
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  cardForm: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardBrandText: {
    fontSize: 11,
    textTransform: 'uppercase',
    color: '#64748b',
    letterSpacing: 1,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 8,
    marginTop: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#dbe3f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    fontSize: 16,
    color: '#0f172a',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  inlineFields: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldColumn: {
    flex: 1,
  },
  validationText: {
    color: '#b91c1c',
    marginTop: 12,
    fontSize: 12,
  },
  payButton: {
    marginTop: 18,
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  payButtonDisabled: {
    backgroundColor: '#a8b2c4',
  },
  payButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  statusText: {
    marginTop: 6,
    color: '#475569',
    lineHeight: 21,
  },
  failedText: {
    color: '#b91c1c',
  },
  successText: {
    color: '#166534',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeText: {
    fontWeight: '700',
    color: '#2563eb',
  },
  modalSectionTitle: {
    marginTop: 18,
    marginBottom: 10,
    fontWeight: '700',
    color: '#111827',
  },
  radioRow: {
    flexDirection: 'row',
    gap: 8,
  },
  radioOption: {
    flex: 1,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  radioOptionSelected: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  radioText: {
    color: '#334155',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  radioTextSelected: {
    color: '#1d4ed8',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  toggle: {
    width: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#dfe7f5',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  toggleOn: {
    backgroundColor: '#22c55e',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    marginLeft: 0,
  },
  toggleThumbOn: {
    marginLeft: 24,
  },
});

export default App;
