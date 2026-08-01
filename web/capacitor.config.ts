import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell for the DRIVER app. The rider app stays PWA-first (zero
 * install friction); the driver app goes native because background
 * location and store presence matter for a working shift.
 *
 * Build: VITE_API_BASE=https://<operator> VITE_WS_URL=wss://<operator>/ws \
 *          npm run native:driver:prepare && npx cap sync android
 */
const config: CapacitorConfig = {
  appId: 'app.donkeyride.driver',
  appName: 'DonkeyRide Driver',
  webDir: 'dist-native-driver',
  android: {
    allowMixedContent: false,
  },
};

export default config;
