import React from 'react';

// 広告 SDK はネイティブ専用。スクリーンショット用の Web 書き出しでは何も描かない。
export function initAds(): void {}
export function AdBanner() {
  return <React.Fragment />;
}
