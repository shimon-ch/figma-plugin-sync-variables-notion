// 共通の型定義

export const MessageType = {
  // Notion関連
  IMPORT_FROM_NOTION: 'IMPORT_FROM_NOTION',
  
  // Figma Variables関連
  GET_COLLECTIONS: 'GET_COLLECTIONS',
  COLLECTIONS_DATA: 'COLLECTIONS_DATA',
  
  // UI関連
  RESIZE_UI: 'RESIZE_UI',
  CLOSE_PLUGIN: 'CLOSE_PLUGIN',
  
  // エラー・成功・進捗
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS',
  LOADING: 'LOADING',
<<<<<<< Current (Your changes)
  
  // 進捗通知
  PROGRESS: 'PROGRESS',
  
  // 操作ステータス（統合用）
  OPERATION_STATUS: 'OPERATION_STATUS'
=======
  PROGRESS: 'PROGRESS'
>>>>>>> Incoming (Background Agent changes)
} as const;

export type MessageType = typeof MessageType[keyof typeof MessageType];

// 旧enum定義（後方互換性のため一時的に残す）
export enum MessageTypeEnum {
  // Notion関連
  IMPORT_FROM_NOTION = 'IMPORT_FROM_NOTION',
  
  // Figma Variables関連
  GET_COLLECTIONS = 'GET_COLLECTIONS',
  COLLECTIONS_DATA = 'COLLECTIONS_DATA',
  
  // UI関連
  RESIZE_UI = 'RESIZE_UI',
  CLOSE_PLUGIN = 'CLOSE_PLUGIN',
  
  // エラー・成功
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
  LOADING = 'LOADING',
  PROGRESS = 'PROGRESS',
  OPERATION_STATUS = 'OPERATION_STATUS'
}

// 進捗情報の型定義
export interface ProgressData {
  current: number;
  total: number;
  phase: 'fetching' | 'importing' | 'deleting';
  message: string;
}

// 保存データの型定義
export interface SavedFormData {
  notion_api_key?: string;
  notion_database_id?: string;
  collection_name?: string;
  collection_mode?: 'new' | 'existing';
  overwrite_existing?: boolean;
  delete_removed_variables?: boolean;
  notion_proxy_url?: string;
  notion_proxy_token?: string;
}

export interface PluginMessage {
  type: MessageType;
  data?: unknown;
}

// Variable型の定義
export const VariableType = {
  COLOR: 'COLOR',
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  BOOLEAN: 'BOOLEAN'
} as const;

export type VariableType = typeof VariableType[keyof typeof VariableType];

// 旧enum定義（後方互換性のため一時的に残す）
export enum VariableTypeEnum {
  COLOR = 'COLOR',
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  BOOLEAN = 'BOOLEAN'
}

// Notionから取得するデータの型
export interface NotionVariable {
  id: string;
  name: string;
  value: string | number | boolean | { r: number; g: number; b: number; a: number };
  type: VariableType;
  description?: string;
  group?: string; // 階層構造のグループ名
  collection?: string; // コレクション名
}

// 階層構造を表現する型
export interface VariableHierarchy {
  path: string[]; // 例: ["Color", "Primary", "Blue"]
  name: string;
  value: unknown;
  type: VariableType;
  description?: string;
}

// インポート設定
export interface ImportSettings {
  apiKey: string;  // UIとの整合性のため変更
  databaseId: string;
  collectionName?: string;
  createNewCollection: boolean;
  overwriteExisting: boolean;
  deleteRemovedVariables?: boolean; // Notionから削除された変数をFigmaからも削除するか
  mappings: FieldMapping[];
  notionApiKey?: string; // 互換性のため残す
}

// フィールドマッピング
export interface FieldMapping {
  notionField: string;
  variableProperty: 'name' | 'value' | 'type' | 'description' | 'group';
}

// 進捗情報の型定義
export interface ProgressData {
  current: number;
  total: number;
  phase: 'fetching' | 'importing' | 'deleting';
  message: string;
}

// 保存データの型を定義
export interface SavedFormData {
  notion_api_key?: string;
  notion_database_id?: string;
  collection_name?: string;
  collection_mode?: 'new' | 'existing';
  overwrite_existing?: boolean;
  delete_removed_variables?: boolean;
  notion_proxy_url?: string;
  notion_proxy_token?: string;
  collection_id?: string;
  include_description?: boolean;
  preserve_hierarchy?: boolean;
}
