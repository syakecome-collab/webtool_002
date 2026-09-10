global.IS_REACT_ACT_ENVIRONMENT = true;

// 広告 SDK はネイティブ実装なので、テストでは表示だけ置き換える
jest.mock('react-native-google-mobile-ads', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => ({ initialize: () => Promise.resolve([]) }),
    BannerAd: (props) => React.createElement(View, { testID: 'banner-ad', ...props }),
    BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' },
    TestIds: { ADAPTIVE_BANNER: 'test-banner' },
  };
});

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: (k) => Promise.resolve(store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, v); return Promise.resolve(); },
      removeItem: (k) => { store.delete(k); return Promise.resolve(); },
    },
  };
});

jest.mock('expo-sharing', () => ({ isAvailableAsync: () => Promise.resolve(false), shareAsync: () => Promise.resolve() }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    constructor() { this.uri = 'file:///cache/test.csv'; this.exists = false; this.written = ''; }
    create() {}
    delete() {}
    write(text) { this.written = text; }
  },
}));

// SafeAreaProvider は実端末のレイアウト計測を待つため、テストでは公式モックに差し替える
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
