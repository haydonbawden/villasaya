import type { PropsWithChildren, ReactNode } from 'react';

import { ScrollView, Text, View } from 'react-native';

import useTheme from '@/theme/hooks/useTheme';

export type AppScreenProperties = PropsWithChildren<{
  readonly actions?: ReactNode;
  readonly padded?: boolean;
  readonly subtitle?: string;
  readonly title: string;
}>;

export function AppScreen({
  actions = undefined,
  children = undefined,
  padded = true,
  subtitle = undefined,
  title,
}: AppScreenProperties) {
  const { backgrounds, borders, colors, fonts, gutters, layout } = useTheme();

  return (
    <View style={[layout.flex_1, backgrounds.gray50]}>
      <ScrollView
        contentContainerStyle={{
          ...(padded ? gutters.padding_16 : {}),
          gap: gutters.gap_16.gap,
        }}
      >
        <View style={[layout.row, layout.itemsCenter, layout.justifyBetween]}>
          <View>
            <Text style={[fonts.size_32, fonts.gray800, fonts.bold]}>{title}</Text>
            {subtitle ? (
              <Text style={[fonts.size_16, fonts.gray400, gutters.marginTop_12]}>{subtitle}</Text>
            ) : undefined}
          </View>
          {actions}
        </View>
        <View
          style={{
            ...backgrounds.gray100,
            ...borders.rounded_16,
            ...borders.w_1,
            borderColor: colors.gray100,
            gap: gutters.gap_16.gap,
            padding: gutters.padding_16.padding,
          }}
        >
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

export default AppScreen;
