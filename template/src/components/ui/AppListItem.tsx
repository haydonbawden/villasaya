import type { ReactNode } from 'react';

import { Text, View } from 'react-native';

import useTheme from '@/theme/hooks/useTheme';

export type AppListItemProperties = {
  readonly meta?: ReactNode;
  readonly subtitle?: string;
  readonly title: string;
};

function AppListItem({ meta = undefined, subtitle = undefined, title }: AppListItemProperties) {
  const { borders, fonts, gutters, layout } = useTheme();

  return (
    <View
      style={{
        ...layout.row,
        ...layout.justifyBetween,
        ...layout.itemsCenter,
        paddingVertical: gutters.padding_12.padding,
        ...borders.wBottom_1,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[fonts.size_16, fonts.gray800]}>{title}</Text>
        {subtitle ? <Text style={[fonts.size_12, fonts.gray400]}>{subtitle}</Text> : undefined}
      </View>
      {meta}
    </View>
  );
}

export default AppListItem;
