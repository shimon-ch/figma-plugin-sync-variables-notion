# Sync Design Tokens with Notion

FigmaのVariablesとNotionデータベースを同期するプラグインです（インポート専用）。

## 🚀 主な機能

### ✨ 2025年版の改善点

1. **適切な型変換**: VariablesがすべてString型になる問題を解決
   - Color、Number、String、Booleanを自動判定
   - 値に基づいて適切な型を設定

2. **階層構造のサポート**: スラッシュ（`/`）を使った階層的なVariable管理
   - 例: `Color/Primary/Blue`、`Spacing/Large`
   - Notionのグループフィールドで階層を管理

3. **Variable Alias（参照）のサポート**:
   - `{変数名}` 形式でVariable間の参照を設定
   - フォールバック値付き参照 `{変数名}||#fallback` にも対応
   - 型安全なフォールバック処理

4. **セキュリティ強化**:
   - APIキー・トークンの難読化保存
   - ログ出力での機密情報マスキング
   - Cloudflare Workers経由の安全な通信

5. **モダンな技術スタック**:
   - React 19 + TypeScript 5.9
   - Vite 7による高速ビルド
   - 最新のベストプラクティスに準拠

> **注意**: 現在、Figma → Notionへのエクスポート機能は実装されていません。インポート機能のみ利用可能です。

## 📦 セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定（オプション）

CORS問題を回避するため、Cloudflare Workerを使用することを推奨します：

```bash
cp env.example .env
```

`.env`ファイルを編集して、Cloudflare WorkerのURLを設定：

```env
VITE_NOTION_PROXY_URL=https://your-worker-name.your-subdomain.workers.dev
```

#### Cloudflare Workerのセットアップ（セキュアなプロキシ）

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)にログイン
2. Workers & Pages → Create application → Create Worker
3. `cloudflare-worker-template.js`の内容をコピー＆ペースト
4. WorkerのSettings→Variablesで`PROXY_TOKEN`を追加（十分に長いランダム文字列）
5. Deployを実行
6. 生成されたURLをプラグインUIの「プロキシURL」に入力し、同じ`PROXY_TOKEN`を「プロキシトークン」に入力

補足:

- Workerは`X-Proxy-Token`ヘッダーが一致しないリクエストを401で拒否します。
- 既定のCORSは`*`です。必要に応じてWorkerコードで`Access-Control-Allow-Origin`を適切なオリジンに絞ってください。

### 3. ビルド

```bash
npm run build
```

### 4. Figmaでの実行

1. Figmaデスクトップアプリを開く
2. Plugins → Development → Import plugin from manifest...
3. `manifest.json`ファイルを選択

## 📊 Notionデータベースの構造

以下のプロパティを持つNotionデータベースを作成してください：

| プロパティ名 | タイプ | 説明 | 必須 |
|------------|-------|------|------|
| Name | Title | Variable名 | ✓ |
| Value | Text | Variableの値 | ✓ |
| Type | Select | COLOR, NUMBER, STRING, BOOLEAN | ✓ |
| Description | Text | Variableの説明 | |
| Group | Text | 階層パス（例: Color/Primary） | |
| Collection | Select | コレクション名 | |

### Type（Select）の選択肢

- `COLOR` - カラー値（HEX、RGB、RGBA）
- `NUMBER` - 数値
- `STRING` - 文字列
- `BOOLEAN` - 真偽値

## 🎯 使い方

### NotionからFigmaへインポート

1. **Cloudflare Workerをデプロイ**
   - `cloudflare-worker-template.js` をWorkerとしてデプロイ
   - 環境変数 `PROXY_TOKEN` に任意の共有シークレットを設定

2. **Notion APIキーを取得**
   - [Notion Integrations](https://www.notion.so/my-integrations)でインテグレーションを作成
   - APIキーをコピー
   - データベースにIntegrationを追加（データベースページの「...」→「Connections」）

3. **データベースIDを取得**
   - NotionデータベースのURLから取得
   - 例: `https://notion.so/workspace/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

4. **プラグインでインポート**
   - Notion APIキーとデータベースIDを入力
   - プロキシURL（Cloudflare WorkerのURL）を入力
   - プロキシトークン（環境変数 `PROXY_TOKEN` と同じ値）を入力
   - フィールドマッピングを設定（デフォルトで適切に設定済み）
   - 「Notionからインポート」をクリック

> **注意**: エクスポート機能は現在実装されていません。将来のバージョンで追加予定です。

## 🔍 型の自動判定ルール

| 値の例 | 判定される型 |
|--------|------------|
| `#FF5733` | COLOR |
| `rgb(255, 87, 51)` | COLOR |
| `rgba(255, 87, 51, 0.8)` | COLOR |
| `42`, `3.14` | NUMBER |
| `true`, `false` | BOOLEAN |
| その他の文字列 | STRING |

## 📁 階層構造の例

Notionデータベース:

```text
Name: Blue
Value: #0066CC
Type: COLOR
Group: Color/Primary
```

↓

Figma Variable:

```text
Collection: Design Tokens
Variable: Color/Primary/Blue (#0066CC)
```

## 🛠 開発

### 開発モードで実行

```bash
npm run dev
```

これによりファイル変更を監視してビルドが自動実行されます。

### リント

```bash
npm run lint
```

### リントの自動修正

```bash
npm run lint:fix
```

### 型チェック

```bash
npm run type-check
```

## 🏗 プロジェクト構造

```text
sync-design-token-notion/
├── src/
│   ├── plugin/           # Figmaプラグインのコア機能
│   │   ├── controller.ts # メインコントローラー
│   │   ├── handlers/     # 同期処理ハンドラー
│   │   ├── services/     # Notion APIサービス
│   │   └── utils/        # Variable操作ユーティリティ
│   ├── ui/              # React UI
│   │   ├── components/   # UIコンポーネント
│   │   └── styles/       # スタイルシート
│   └── shared/          # 共通型定義
├── dist/                # ビルド出力
├── manifest.json        # Figmaプラグイン設定
├── package.json         # 依存関係
├── vite.config.ts       # Vite設定
└── tsconfig.json        # TypeScript設定
```

## 🔐 セキュリティ運用

- manifest.jsonの`networkAccess.allowedDomains`に実運用のWorker URLは置かず、`https://<your-worker>.workers.dev`などのプレースホルダーを記載しています。利用者は自分のWorkerを作成し、URLを置換してください。
- Cloudflare Workerは共有シークレット`X-Proxy-Token`を必須としています。ダッシュボードで`PROXY_TOKEN`を設定し、プラグインUIに同じ値を入力してください。
- `dist/` は `.gitignore` 済みです。ビルド成果物に実値が焼き込まれても公開レポジトリにコミットされません。
- ログ出力はセンシティブな値（APIキー・トークン）を含めない方針を維持してください。

## 🐛 トラブルシューティング

### CORSエラーが発生する場合

エラーメッセージ:
```
Access to fetch at 'https://xxxx.workers.dev/' from origin 'null' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present
```

**解決方法:**

1. **Cloudflare Workerのコードを確認**
   - `cloudflare-worker-template.js`の最新版を使用していることを確認
   - Workerのコードが正しくデプロイされているか確認

2. **Workerを再デプロイ**
   ```bash
   # 1. Cloudflare Dashboardにログイン
   # 2. Workers & Pages → あなたのWorkerを選択
   # 3. 「Edit Code」をクリック
   # 4. cloudflare-worker-template.js の内容を全てコピー＆ペースト
   # 5. 「Save and Deploy」をクリック
   ```

3. **環境変数を確認**
   - Cloudflare DashboardでWorkerの Settings → Variables
   - `PROXY_TOKEN` が設定されていることを確認
   - プラグインUIで入力する「プロキシトークン」と一致していることを確認

4. **Workerの動作確認**
   
   ターミナルで以下のコマンドを実行して、Workerが正しく動作しているか確認：
   ```bash
   # OPTIONSリクエスト（プリフライト）のテスト
   curl -X OPTIONS https://your-worker.workers.dev/ -i
   
   # 期待される結果:
   # HTTP/2 204
   # access-control-allow-origin: *
   # access-control-allow-methods: GET, POST, OPTIONS
   # access-control-allow-headers: Content-Type, Authorization, Notion-Version, Accept, X-Proxy-Token
   ```

5. **ブラウザのキャッシュをクリア**
   - Figmaプラグインを一度閉じる
   - Figmaを再起動
   - プラグインを再度開く

### 401 Unauthorizedエラーが発生する場合

**解決方法:**
- Cloudflare Workerの環境変数 `PROXY_TOKEN` とプラグインUIで入力した「プロキシトークン」が一致しているか確認
- トークンの前後にスペースが入っていないか確認

### Notion APIエラーが発生する場合

**解決方法:**
1. Notion APIキーが正しいか確認
2. データベースにIntegrationが追加されているか確認（データベースページの「...」→「Connections」）
3. データベースIDが正しいか確認（URLから32文字のID部分をコピー）

## 💡 技術スタック

- **TypeScript**: 型安全な開発
- **React**: UIコンポーネント
- **Vite**: 高速なビルドツール（UI用）
- **Notion API**: データベース連携
- **Figma Plugin API**: Variables操作

## 📝 ライセンス

MIT
