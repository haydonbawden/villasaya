import type { PropsWithChildren } from 'react';

import { Text, View } from 'react-native';

import useTheme from '@/theme/hooks/useTheme';

export type FormFieldProperties = PropsWithChildren<{
  readonly helperText?: string;
  readonly label: string;
}>;

function FormField({ children = undefined, helperText = undefined, label }: FormFieldProperties) {
  const { fonts, gutters } = useTheme();

  return (
    <View style={{ gap: gutters.gap_12.gap }}>
      <Text style={[fonts.size_12, fonts.gray400]}>{label}</Text>
      {children}
      {helperText ? <Text style={[fonts.size_12, fonts.gray400]}>{helperText}</Text> : undefined}
    </View>
  );
}

export default FormField;
