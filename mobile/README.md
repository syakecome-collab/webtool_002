# 配達ノート

配達員が「その日の数字」を記録して、経費を引いた**実質時給**を自分の記録で確かめるための iOS / Android アプリ。
Expo（React Native）製。サーバーなし・アカウントなし・オフライン動作。

## なぜこの形なのか

- **毎日開く理由があるアプリにした。** 1 回で用が済む計算機は、広告収益と相性が悪い（表示機会が生まれない）。
- **サーバーも外部 API も持たない。** 運用費ゼロ、障害対応ゼロ、制度改正の追従も不要。
- **1 本に集中した。** App Store は類似アプリの量産を [4.3 Spam](https://developer.apple.com/app-store/review/guidelines/#spam) で禁じているため、Web の「小さなツールを大量に」という戦略は使えない。

## 機能

- 稼働の記録（サービス／時間／休憩／件数／報酬／チップ／経費／距離／天気／メモ）
- 実質時給・1 件単価・1 時間あたり件数の自動計算（日をまたぐ深夜稼働にも対応）
- 日／週／月／年／全期間の集計、月間目標に対する進捗
- **曜日別・天気別・サービス別の実質時給ランキング**（いつ出れば稼げるかを自分の記録で判断する）
- 直近 14 日の手取り推移グラフ
- 年間の申告用サマリと CSV 書き出し（共有シート経由）
- ダークモード対応

## 開発

```sh
npm install
npm test          # 型チェック + ロジック 20 件 + UI 5 件
npm start         # Expo 開発サーバー
npm run icons     # assets/ のアイコン類を SVG から再生成
npm run screenshots  # Web 書き出し → Chromium で App Store 用 1290x2796 を撮影
```

| コマンド | 中身 |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:logic` | 計算・CSV・入力解釈の単体テスト（node:test） |
| `npm run test:ui` | 画面が実際に描画され、記録が反映されるかの検証（jest-expo + Testing Library） |

## 構成

```
App.tsx                  タブと状態の管理
src/types.ts             データの形
src/lib/calc.ts          実質時給・集計・曜日別/天気別の分析
src/lib/csv.ts           CSV 書き出しと申告用サマリ
src/lib/parse.ts         「0930」「12,000円」のような雑な入力の解釈
src/lib/storage.ts       端末内保存（壊れた保存データを弾く）
src/lib/ads.ts           広告ユニット ID（未設定ならテスト ID）
src/components/          共通 UI・棒グラフ・広告バナー（.web.tsx はスクショ用のダミー）
src/screens/             記録 / 分析 / 設定
scripts/make-icons.mjs   アイコン生成
scripts/screenshots.mjs  ストア用スクリーンショット生成
docs/store-listing.md    ストア掲載文・キーワード・プライバシー申告の内容
```

## リリースまでの手順

### Claude 側で済んでいること

- [x] アプリの実装とテスト（型チェック・ロジック・UI）
- [x] アイコン一式（1024×1024、透過なし）
- [x] スクリーンショット 3 枚（6.7 インチ / 1290×2796）
- [x] ストア掲載文・キーワード・審査への説明文（`docs/store-listing.md`）
- [x] プライバシーポリシー（`../docs/privacy/haitatsu-note.html`）
- [x] `app.json` / `eas.json`

### 人がやる必要があること

Mac は不要。[EAS Build は iOS もクラウドでビルドし、EAS Submit は Linux / Windows から提出できる](https://docs.expo.dev/submit/ios/)。

1. **Apple Developer Program に登録**（年 99 ドル ≒ 15,000 円。個人なら Apple ID のみ、承認は 1〜2 日）
2. **AdMob アカウントを作成**し、アプリと**バナー広告ユニット**を登録
   - 取得した ID を 2 箇所に入れる
     - `app.json` の `react-native-google-mobile-ads` プラグイン → `iosAppId` / `androidAppId`
     - `src/lib/ads.ts` の `PRODUCTION_BANNER_IOS` / `PRODUCTION_BANNER_ANDROID`
   - ATT を実装していないので、AdMob 側で**非パーソナライズ広告のみ**に設定しておく
3. **`app.json` の `bundleIdentifier` / `package`** を自分のものに変更（`com.example.` のままは不可）
4. **プライバシーポリシーを公開**（GitHub Pages で `docs/privacy/` を配信し、その URL を控える）
5. **ビルドと提出**

```sh
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile production
eas submit --platform ios --latest
```

6. **App Store Connect** で `docs/store-listing.md` の内容を貼り、スクリーンショットを上げ、
   **App プライバシーを同ドキュメントの表のとおりに申告**して審査に出す

## 注意

- `app.json` と `src/lib/ads.ts` の広告 ID は Google 公式の**テスト ID** が入っている。
  自分の ID に差し替えるまで収益は発生しないが、**差し替え前に実広告をタップするとポリシー違反**になるため、この状態が安全。
- 記録は端末内にのみ保存される。アプリを削除すると消えるので、CSV 書き出しでの退避を案内している。
