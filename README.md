# おにぎりバトル！

三角おにぎりをつなげて「にぎる」、落ちもの対戦パズルです。
ブラウザでそのまま遊べて、**PWA**（ホーム画面に追加・オフライン対応）と **Android アプリ**（Capacitor）の両方に出力できます。

## 旧版（Flutter 試作）からの主な変更

| 課題 | 改善 |
| --- | --- |
| ぷよぷよの二番煎じ | 三角マスならではのルールに作り直し（3つで消える／**4枚で大三角「にぎり！」**／**ご注文と「のり」**） |
| アイコンが分かりづらい | 具ごとに **色＋表情** を変更（色だけに頼らない）。同じ具どうしは**くっついて見える**ので、つながりがひと目で分かる |
| 動作がもっさり | 60fps の Canvas 描画。移動・落下・ちぎり・消去すべてにアニメーション。ドラッグ／タップ／フリック操作、着地予想（ゴースト）、着地の猶予時間 |
| 盤面がマス目に三角を描いていた | 本物の三角タイル（▲▼が隙間なく敷き詰まる）で描画 |

## ルール

- 2個1組のおにぎりが落ちてきます。着地すると1個ずつバラけて（ちぎれて）下に落ちます。
- 同じ具が **辺で3つ以上** つながると消えます（▲は左右と下、▼は左右と上の3方向）。
- 1つの三角の **3辺すべて** を同じ具でかこむと、4枚で大きな三角＝「**にぎり！**」。大ダメージ＆周りのこげもまとめて消えます。
- 上に出る「**ご注文**」の具を決められた数だけ消すと、「**のり**」が届きます。のりが触れた具は盤面からすべて消えます（そこから連鎖も起きます）。
- 連鎖・にぎり・のりで相手に「**こげ**」（おじゃま）を送ります。こげは、隣で具を消すと一緒に消えます。届く前に自分も消せば相殺できます。
- 出現位置がふさがると負けです。

### モード
- **CPUとたいせん**（やさしい／ふつう／むずかしい）
- **ひとりでエンドレス**（レベルが上がるほど速くなり、ときどきこげが降ってきます。ハイスコアを保存）

### 操作
| | スマホ | キーボード |
| --- | --- | --- |
| 移動 | 左右にドラッグ | ← → |
| 入れかえ | タップ | ↑ / Z / X |
| ゆっくり落とす | 下にドラッグしたまま | ↓ |
| 一気に落とす | 下にサッとはらう | スペース |
| ポーズ | 左上の Ⅱ | Esc / P |

## 開発

必要なもの: Node.js 20 以上

```bash
npm install
npm run dev        # ブラウザで動作確認（スマホからは表示される Network の URL で）
npm test           # ルールのテスト＋CPU 同士の対戦シミュレーション
npm run build      # dist/ に PWA 版を出力
npm run preview    # ビルド結果を確認
```

### PWA

`npm run build` の `dist/` がそのまま PWA です（manifest と Service Worker 入り）。
`main` ブランチに push すると GitHub Actions が **GitHub Pages** に自動公開します。

初回だけ、GitHub のリポジトリで **Settings → Pages → Source** を **「GitHub Actions」** にしてください。
公開 URL（`https://<ユーザー名>.github.io/<リポジトリ名>/`）をスマホで開き、「ホーム画面に追加」でアプリのように使えます。

### Android

**GitHub Actions でビルド（PC に Android Studio 不要）**

`main` に push すると「Android Build」ワークフローがデバッグ版 APK を作ります。
Actions の実行結果ページの **Artifacts → onigiri-battle-debug-apk** からダウンロードして、実機にインストールできます。
`v1.0.0` のようなタグを push すると、GitHub Release に APK が添付されます。

**Google Play 提出用（署名付き AAB）**

リポジトリの **Settings → Secrets and variables → Actions** に以下を登録すると、署名付きのリリース版（`.aab` / `.apk`）も作られます。

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | キーストアファイルを base64 にした文字列 |
| `ANDROID_KEYSTORE_PASSWORD` | キーストアのパスワード |
| `ANDROID_KEY_ALIAS` | キーのエイリアス |
| `ANDROID_KEY_PASSWORD` | キーのパスワード |

キーストアの作り方（一度だけ・大切に保管）:

```bash
keytool -genkey -v -keystore release.keystore -alias onigiri -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore   # Windows の PowerShell: [Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
```

**ローカルでビルド（Android Studio を使う場合）**

```bash
npm run android:sync   # Web をビルドして android/ に反映
npm run android:open   # Android Studio で開く → ▶ で実機/エミュレータ実行
```

アプリ ID は `capacitor.config.ts` の `appId`（現在 `com.onigiribattle.app`）です。ストア公開前にご自身のドメインに合わせて変更してください（変更後は `android/` を作り直すのが確実です）。
アイコン・スプラッシュは `assets/` の画像から `npm run icons` で再生成できます。

## フォルダ構成

```
src/
  game/core.ts        三角グリッドのルール（隣接・重力・消去・にぎり・のり・得点）
  game/board.ts       1人分の盤面の進行（落下・ちぎり・連鎖・注文・こげ）
  game/ai.ts          CPU（盤面を先読みして手を選び、操作として入力）
  render/sprites.ts   おにぎりの絵（色・表情・のり）
  render/boardView.ts 盤面の描画とエフェクト
  gameScreen.ts       対戦画面（レイアウト・HUD・攻撃の演出）
  audio.ts            効果音・BGM（WebAudio で合成。音声ファイル不要）
  main.ts             タイトル・あそびかた・操作・保存
tests/                ルールのテストと CPU 対戦シミュレーション
android/              Capacitor の Android プロジェクト
.github/workflows/    CI・GitHub Pages 公開・Android ビルド
```

## 調整しやすいポイント

- 落下速度: `src/gameScreen.ts` の `interval`（レベルごとの速さ）
- 何個で消えるか: `src/game/core.ts` の `MATCH`
- 得点・攻撃力: `src/game/core.ts` の `scoreClear`
- CPU の強さ: `src/game/ai.ts` の `SETTINGS`
- 具の色・表情: `src/render/sprites.ts` の `FLAVORS` と `face()`
