import type { ReactNode } from 'react';

import { Text, View } from 'react-native';

import useTheme from '@/theme/hooks/useTheme';

import AppCard from './AppCard';
import AppListItem from './AppListItem';
import StatusBadge from './StatusBadge';

export type PlaceholderItem = {
  readonly status?: string;
  readonly subtitle?: string;
  readonly title: string;
};

export type PlaceholderSectionProperties = {
  readonly action?: ReactNode;
  readonly description?: string;
  readonly items?: readonly PlaceholderItem[];
  readonly title: string;
};

const emptyItems: PlaceholderItem[] = [];

function PlaceholderSection({
  action = undefined,
  description = undefined,
  items = emptyItems,
  title,
}: PlaceholderSectionProperties) {
  const { fonts, gutters } = useTheme();

  return (
    <AppCard footer={action} subtitle={description} title={title}>
      {items.length === 0 ? (
        <Text style={[fonts.size_12, fonts.gray400]}>No records yet.</Text>
      ) : (
        <View style={{ gap: gutters.gap_12.gap }}>
          {items.map((item) => (
            <AppListItem
              key={`${item.title}-${item.subtitle ?? ''}`}
              meta={item.status ? <StatusBadge tone="info">{item.status}</StatusBadge> : undefined}
              subtitle={item.subtitle}
              title={item.title}
            />
          ))}
        </View>
      )}
    </AppCard>
  );
}

export default PlaceholderSection;
