import type { PropsWithChildren } from 'react';

import { Text, View } from 'react-native';

import useTheme from '@/theme/hooks/useTheme';

export type StatusBadgeProperties = PropsWithChildren<{ readonly tone?: 'danger' | 'info' | 'success' | 'warning' }>;

function StatusBadge({ children = undefined, tone = 'info' }: StatusBadgeProperties) {
  const { backgrounds, borders, colors, fonts, gutters } = useTheme();

  const toneBackgrounds: Record<NonNullable<StatusBadgeProperties['tone']>, object> = {
    danger: backgrounds.red500,
    info: backgrounds.purple100,
    success: backgrounds.gray50,
    warning: backgrounds.gray100,
  };

  const toneColors: Record<NonNullable<StatusBadgeProperties['tone']>, string> = {
    danger: colors.gray50,
    info: colors.purple500,
    success: colors.gray800,
    warning: colors.purple500,
  };

  return (
    <View
      style={{
        ...toneBackgrounds[tone],
        ...borders.rounded_4,
        paddingHorizontal: gutters.padding_12.padding,
        paddingVertical: gutters.padding_12.padding / 2,
      }}
    >
      <Text style={[fonts.size_12, { color: toneColors[tone] }]}>{children}</Text>
    </View>
  );
}

export default StatusBadge;
