/**
 * Builds on top of app.json.
 * Applies dynamic values which differ based on the type of build - 'development' | 'preview' | 'production'
 *
 * The type of build is deteremined by the env var APP_VARIANT, defined in eas.json
 */

import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT || 'production';

  // Define unique identifiers for each environment
  const uniqueIdMap: Record<string, string> = {
    development: 'com.barryph.loco.dev',
    preview: 'com.barryph.loco.preview',
    production: 'com.barryph.loco',
  };

  // Define unique names for each environment
  const nameMap: Record<string, string> = {
    development: 'Loco (Dev)',
    preview: 'Loco (Preview)',
    production: 'Loco',
  };

  // const appIcon: Record<string, string> = {
  //   development: './src/assets/icons/apple-app-icon-dev.png',
  //   preview: './src/assets/icons/apple-app-icon-dev.png',
  //   production: './src/assets/icons/apple-touch-icon.png',
  // };

  return {
    ...config,
    name: nameMap[variant],
    slug: config.slug!,
    ios: {
      ...config.ios,
      // icon: appIcon[variant],
      bundleIdentifier: uniqueIdMap[variant],
    },
    android: {
      ...config.android,
      // icon: appIcon[variant],
      package: uniqueIdMap[variant],
    },
  };
};
