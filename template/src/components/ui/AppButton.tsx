import type { PropsWithChildren } from 'react';

import { Pressable, Text } from 'react-native';

import useTheme from '@/theme/hooks/useTheme';

export type AppButtonProperties = PropsWithChildren<{
  readonly onPress?: () => void;
  readonly variant?: 'primary' | 'secondary';
}>;

function AppButton({ children = undefined, onPress = undefined, variant = 'primary' }: AppButtonProperties) {
  const { backgrounds, borders, colors, fonts, gutters, layout } = useTheme();

  const background = variant === 'primary' ? backgrounds.purple500 : backgrounds.gray100;
  const color = variant === 'primary' ? colors.gray50 : colors.gray800;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        ...background,
        ...borders.rounded_16,
        paddingHorizontal: gutters.padding_16.padding,
        paddingVertical: gutters.padding_12.padding,
        ...layout.itemsCenter,
      }}
    >
      <Text style={[fonts.size_16, { color }]}>{children}</Text>
    </Pressable>
  );
}

export default AppButton;
