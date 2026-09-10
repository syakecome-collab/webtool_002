import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import mobileAds, { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { bannerUnitId } from '../lib/ads';

/** 広告の初期化。失敗してもアプリ本体は動かし続ける。 */
export function initAds(): void {
  mobileAds().initialize().catch(() => undefined);
}

export function AdBanner() {
  return (
    <View style={styles.banner}>
      <BannerAd
        unitId={bannerUnitId(Platform.OS === 'ios' ? 'ios' : 'android')}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      />
    </View>
  );
}

const styles = StyleSheet.create({ banner: { alignItems: 'center' } });
