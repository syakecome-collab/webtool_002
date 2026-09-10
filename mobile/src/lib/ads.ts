import { TestIds } from 'react-native-google-mobile-ads';

/**
 * 本番の広告ユニット ID。AdMob で作成したら差し替える。
 * 差し替えるまでは Google 公式のテスト ID を使う（実広告を踏むとポリシー違反になるため）。
 */
const PRODUCTION_BANNER_IOS = '';
const PRODUCTION_BANNER_ANDROID = '';

export function bannerUnitId(platform: 'ios' | 'android'): string {
  const production = platform === 'ios' ? PRODUCTION_BANNER_IOS : PRODUCTION_BANNER_ANDROID;
  return __DEV__ || !production ? TestIds.ADAPTIVE_BANNER : production;
}
