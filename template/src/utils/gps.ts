export type GpsPoint = { readonly capturedAt: string; readonly latitude: number; readonly longitude: number; };

export function captureGps(): Promise<GpsPoint> {
  return Promise.resolve({ capturedAt: new Date().toISOString(), latitude: -8.409_518, longitude: 115.188_919 });
}
