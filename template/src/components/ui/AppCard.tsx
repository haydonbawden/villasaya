import type { PropsWithChildren, ReactNode } from 'react';

import { Text, View } from 'react-native';

import useTheme from '@/theme/hooks/useTheme';

export type AppCardProperties = PropsWithChildren<{
  readonly footer?: ReactNode;
  readonly subtitle?: string;
  readonly title: string;
}>;

function AppCard({
  children = undefined,
  footer = undefined,
  subtitle = undefined,
  title,
}: AppCardProperties) {
  const { backgrounds, borders, fonts, gutters, layout } = useTheme();

  return (
    <View
      style={{
        ...backgrounds.gray50,
        ...borders.rounded_16,
        gap: gutters.gap_12.gap,
        padding: gutters.padding_16.padding,
      }}
    >
      <View style={[layout.row, layout.justifyBetween, layout.itemsCenter]}>
        <View style={{ flex: 1 }}>
          <Text style={[fonts.size_16, fonts.gray800, fonts.bold]}>{title}</Text>
          {subtitle ? <Text style={[fonts.size_12, fonts.gray400]}>{subtitle}</Text> : undefined}
        </View>
        {footer}
      </View>
      <View style={{ gap: gutters.gap_12.gap }}>{children}</View>
    </View>
  );
}

export default AppCard;
