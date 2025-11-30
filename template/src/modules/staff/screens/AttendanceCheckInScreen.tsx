import { useCallback } from 'react';

import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

import { captureGps } from '@/utils/gps';

function AttendanceCheckInScreen() {
  const startCheckIn = useCallback(() => {
    void captureGps();
  }, []);

  return (
    <AppScreen subtitle="GPS-enabled time tracking" title="Attendance">
      <PlaceholderSection
        action={<AppButton onPress={startCheckIn}>Check in</AppButton>}
        description="Capture geolocation when staff start and end shifts"
        items={[{ subtitle: 'Shift 08:00 - 16:00', title: 'Today' }]}
        title="Check-in"
      />
    </AppScreen>
  );
}

export default AttendanceCheckInScreen;
