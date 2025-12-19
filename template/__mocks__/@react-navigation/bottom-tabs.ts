import type React from 'react';

export const createBottomTabNavigator = () => {
  const Navigator = ({ children }: { readonly children: React.ReactNode }) => children;
  const Screen = ({ children }: { readonly children: React.ReactNode }) => children;
  return { Navigator, Screen };
};
