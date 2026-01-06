# CLAUDE.md v0.0.1

このファイルはClaude AI向けの開発ガイドラインです。

## バージョン管理ルール

### バージョン表記について

- このファイルのタイトルにはバージョン番号（`v0.0.X`）を表記します
- ブランチ内で修正があるたびにパッチバージョン（3桁目）を更新してください
- 例: `v0.0.1` → `v0.0.2` → `v0.0.3`

### バージョン更新のタイミング

1. **パッチバージョン更新**: ブランチ内での修正・変更時
2. **マイナーバージョン更新**: 新機能追加時
3. **メジャーバージョン更新**: 破壊的変更時

## プロジェクト概要

このプロジェクトは、FigmaのVariablesとNotionデータベースを同期するFigmaプラグインです。

### 主な機能

- NotionデータベースからFigma Variablesへのインポート
- 型の自動判定（COLOR, NUMBER, STRING, BOOLEAN）
- 階層構造のサポート（スラッシュ区切り）
- Variable Alias（参照）のサポート

## コンテキスト

### 重要なファイル

| ファイル | 役割 |
|---------|------|
| `src/plugin/controller.ts` | Figmaプラグインのメインコントローラー |
| `src/plugin/handlers/syncHandler.ts` | 同期処理のハンドラー |
| `src/ui/App.tsx` | React UIのメインコンポーネント |
| `src/shared/types.ts` | 共通の型定義 |

### 依存関係

- React 19
- TypeScript 5.9
- Vite 7
- Figma Plugin API
- Notion API

## 開発時の注意点

### Figmaプラグイン固有の制約

1. **サンドボックス環境**: UIとプラグインコードは分離されている
2. **メッセージング**: `figma.ui.postMessage()`と`parent.postMessage()`で通信
3. **API制限**: 一部のWeb APIは使用不可

### セキュリティ要件

- APIキーはログに出力しない
- トークンは難読化して保存
- CORS対策としてCloudflare Workerを使用

### コーディングスタイル

```typescript
// Good: 型を明示
const fetchData = async (id: string): Promise<NotionPage[]> => {
  // ...
};

// Bad: any型を使用
const fetchData = async (id: any): Promise<any> => {
  // ...
};
```

## よく使うコマンド

```bash
# 開発サーバー起動（ホットリロード）
npm run dev

# プロダクションビルド
npm run build

# リント実行
npm run lint

# リント自動修正
npm run lint:fix

# 型チェック
npm run type-check
```

## トラブルシューティング

### CORSエラー

Cloudflare Workerが正しく設定されているか確認してください。

### 型エラー

`npm run type-check`で詳細を確認し、`src/shared/types.ts`の型定義を参照してください。

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|----------|
| v0.0.1 | 2026-01-06 | 初版作成 |
