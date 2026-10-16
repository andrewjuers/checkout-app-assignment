import { Pressable, StyleSheet, Text, View } from 'react-native';

export type PaymentOption = {
  key: 'apple' | 'google' | 'affirm';
  label: string;
  description: string;
  eligible: boolean;
};

export function PaymentMethodCard({
  option,
  selected,
  disabled,
  onPress,
}: {
  option: PaymentOption;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      key={option.key}
      style={[
        styles.methodCard,
        selected && styles.methodSelected,
        !option.eligible && styles.methodUnavailable,
        disabled && styles.methodDisabled,
      ]}
      disabled={!option.eligible || disabled}
      onPress={onPress}
    >
      <View style={styles.methodHeader}>
        <Text style={styles.methodName}>{option.label}</Text>
        {option.eligible ? <Text style={styles.eligibleTag}>Available</Text> : <Text style={styles.unavailableTag}>Unavailable</Text>}
      </View>
      <Text style={styles.methodDescription}>{option.description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
});
