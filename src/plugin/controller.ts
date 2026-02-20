// Figmaプラグインのメインコントローラー
import { handleImportFromNotion } from './handlers/syncHandler';
import { scanBrokenReferences, remapVariables } from './handlers/remapHandler';
import { MessageType, ExportSettings, RemapMapping, ScanResult } from '../shared/types';
import { logger } from '../shared/logger';
import { obfuscateApiKey, deobfuscateApiKey } from '../shared/security';
import { exportToDesignTokens } from './utils/exportUtils';

// 最新のスキャン結果を保持（remap 時に参照）
let latestScanResult: ScanResult | null = null;

// UIを表示
figma.showUI(__html__, {
  width: 500,
  height: 600,
  title: "Sync Design Tokens with Notion"
});

// ストレージキーの定義
const STORAGE_KEYS = {
  API_KEY: 'notion_api_key',
  DATABASE_ID: 'notion_database_id',
  COLLECTION_NAME: 'collection_name',
  COLLECTION_MODE: 'collection_mode',
  OVERWRITE: 'overwrite_existing',
  DELETE_REMOVED: 'delete_removed_variables',
  PROXY_URL: 'notion_proxy_url',
  PROXY_TOKEN: 'notion_proxy_token',
  COLLECTION_ID: 'collection_id',
  INCLUDE_DESC: 'include_description',
  PRESERVE_HIERARCHY: 'preserve_hierarchy',
  COLLECTION_DB_PAIRS: 'collection_db_pairs',  // JSONで保存
  FIELD_MAPPINGS: 'field_mappings'  // JSONで保存
};

// 保存関数
async function saveValue(key: string, value: any): Promise<void> {
  try {
    // 値の型と内容をチェック
    if (value === undefined || value === null) {
      logger.log(`⏭️  Skip save ${key}: undefined or null`);
      return;
    }
    
    // 空文字列もスキップ（既存の値を上書きしない）
    const stringValue = String(value).trim();
    if (stringValue === '') {
      logger.log(`⏭️  Skip save ${key}: empty string`);
      return;
    }
    
    // 機密情報は難読化して保存
    let valueToSave = stringValue;
    const sensitiveKeys = [STORAGE_KEYS.API_KEY, STORAGE_KEYS.PROXY_TOKEN];
    if (sensitiveKeys.includes(key)) {
      try {
        valueToSave = obfuscateApiKey(stringValue);
        logger.log(`💾 Saving ${key}: [obfuscated]`);
      } catch (obfuscateError) {
        logger.error(`❌ Obfuscation failed for ${key}:`, obfuscateError);
        throw obfuscateError;
      }
    } else {
      logger.log(`💾 Saving ${key}: ${stringValue.substring(0, 20)}...`);
    }
    
    await figma.clientStorage.setAsync(key, valueToSave);
    logger.log(`✅ Saved ${key}`);
    
  } catch (error) {
    logger.error(`❌ Failed to save ${key}:`, error);
    // エラーの詳細をログに出力
    if (error instanceof Error) {
      logger.error(`   Error message: ${error.message}`);
      logger.error(`   Error stack: ${error.stack}`);
    }
  }
}

// 読み込み関数
async function loadValue(key: string): Promise<string | null> {
  try {
    const value = await figma.clientStorage.getAsync(key);
    
    if (value !== undefined && value !== null) {
      let stringValue = String(value);
      
      // 空文字列は無効な値として扱う
      if (stringValue.trim() === '') {
        logger.log(`📖 Load ${key}: empty (ignored)`);
        return null;
      }
      
      // 機密情報は復号化
      const sensitiveKeys = [STORAGE_KEYS.API_KEY, STORAGE_KEYS.PROXY_TOKEN];
      if (sensitiveKeys.includes(key)) {
        stringValue = deobfuscateApiKey(stringValue);
        logger.log(`📖 Load ${key}: [found & decrypted]`);
      } else {
        logger.log(`📖 Load ${key}: ${stringValue.substring(0, 20)}...`);
      }
      
      return stringValue;
    }
    
    logger.log(`📖 Load ${key}: not found`);
    return null;
  } catch (error) {
    logger.error(`❌ Failed to load ${key}:`, error);
    return null;
  }
}

// すべての保存データを読み込む
async function loadAllData(): Promise<any> {
  const data: any = {};
  
  const apiKey = await loadValue(STORAGE_KEYS.API_KEY);
  if (apiKey) data.notion_api_key = apiKey;
  
  const databaseId = await loadValue(STORAGE_KEYS.DATABASE_ID);
  if (databaseId) data.notion_database_id = databaseId;
  
  const collectionName = await loadValue(STORAGE_KEYS.COLLECTION_NAME);
  if (collectionName) data.collection_name = collectionName;
  
  const collectionMode = await loadValue(STORAGE_KEYS.COLLECTION_MODE);
  if (collectionMode) data.collection_mode = collectionMode;
  
  const overwrite = await loadValue(STORAGE_KEYS.OVERWRITE);
  if (overwrite !== null) data.overwrite_existing = overwrite === 'true';
  
  const deleteRemoved = await loadValue(STORAGE_KEYS.DELETE_REMOVED);
  if (deleteRemoved !== null) data.delete_removed_variables = deleteRemoved === 'true';
  
  const collectionId = await loadValue(STORAGE_KEYS.COLLECTION_ID);
  if (collectionId) data.collection_id = collectionId;
  
  const includeDesc = await loadValue(STORAGE_KEYS.INCLUDE_DESC);
  if (includeDesc !== null) data.include_description = includeDesc === 'true';
  
  const proxyUrl = await loadValue(STORAGE_KEYS.PROXY_URL);
  if (proxyUrl) data.notion_proxy_url = proxyUrl;
  
  const proxyToken = await loadValue(STORAGE_KEYS.PROXY_TOKEN);
  if (proxyToken) data.notion_proxy_token = proxyToken;
  
  const preserveHierarchy = await loadValue(STORAGE_KEYS.PRESERVE_HIERARCHY);
  if (preserveHierarchy !== null) data.preserve_hierarchy = preserveHierarchy === 'true';
  
  // コレクション+DBIDペアの読み込み（JSON形式）
  const collectionDbPairs = await loadValue(STORAGE_KEYS.COLLECTION_DB_PAIRS);
  if (collectionDbPairs) {
    try {
      data.collection_db_pairs = JSON.parse(collectionDbPairs);
      logger.log(`📖 Loaded ${data.collection_db_pairs.length} collection-db pairs`);
    } catch (parseError) {
      logger.error('❌ Failed to parse collection_db_pairs:', parseError);
      data.collection_db_pairs = [];
    }
  }
  
  // フィールドマッピングの読み込み（JSON形式）
  const fieldMappings = await loadValue(STORAGE_KEYS.FIELD_MAPPINGS);
  if (fieldMappings) {
    try {
      data.field_mappings = JSON.parse(fieldMappings);
      logger.log(`📖 Loaded ${data.field_mappings.length} field mappings`);
    } catch (parseError) {
      logger.error('❌ Failed to parse field_mappings:', parseError);
      // パース失敗時はundefinedのまま（UIのデフォルト値を使用）
    }
  }
  
  return data;
}

// データを保存する
async function saveAllData(data: any): Promise<void> {
  if (data.notion_api_key !== undefined) await saveValue(STORAGE_KEYS.API_KEY, data.notion_api_key);
  if (data.notion_database_id !== undefined) await saveValue(STORAGE_KEYS.DATABASE_ID, data.notion_database_id);
  if (data.collection_name !== undefined) await saveValue(STORAGE_KEYS.COLLECTION_NAME, data.collection_name);
  if (data.collection_mode !== undefined) await saveValue(STORAGE_KEYS.COLLECTION_MODE, data.collection_mode);
  if (data.overwrite_existing !== undefined) await saveValue(STORAGE_KEYS.OVERWRITE, data.overwrite_existing);
  if (data.delete_removed_variables !== undefined) await saveValue(STORAGE_KEYS.DELETE_REMOVED, data.delete_removed_variables);
  if (data.notion_proxy_url !== undefined) await saveValue(STORAGE_KEYS.PROXY_URL, data.notion_proxy_url);
  if (data.notion_proxy_token !== undefined) await saveValue(STORAGE_KEYS.PROXY_TOKEN, data.notion_proxy_token);
  if (data.collection_id !== undefined) await saveValue(STORAGE_KEYS.COLLECTION_ID, data.collection_id);
  if (data.include_description !== undefined) await saveValue(STORAGE_KEYS.INCLUDE_DESC, data.include_description);
  if (data.preserve_hierarchy !== undefined) await saveValue(STORAGE_KEYS.PRESERVE_HIERARCHY, data.preserve_hierarchy);
  
  // コレクション+DBIDペアの保存（JSON形式）
  if (data.collection_db_pairs !== undefined) {
    try {
      const pairsJson = JSON.stringify(data.collection_db_pairs);
      await figma.clientStorage.setAsync(STORAGE_KEYS.COLLECTION_DB_PAIRS, pairsJson);
      logger.log(`💾 Saved ${data.collection_db_pairs.length} collection-db pairs`);
    } catch (saveError) {
      logger.error('❌ Failed to save collection_db_pairs:', saveError);
    }
  }
  
  // フィールドマッピングの保存（JSON形式）
  if (data.field_mappings !== undefined) {
    try {
      const mappingsJson = JSON.stringify(data.field_mappings);
      await figma.clientStorage.setAsync(STORAGE_KEYS.FIELD_MAPPINGS, mappingsJson);
      logger.log(`💾 Saved ${data.field_mappings.length} field mappings`);
    } catch (saveError) {
      logger.error('❌ Failed to save field_mappings:', saveError);
    }
  }
}

// 起動時の初期化
async function initialize() {
  try {
    console.log('🚀 Plugin starting...');
    const savedData = await loadAllData();
    console.log('📦 Loaded data:', savedData);
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collectionsData = collections.map(c => ({
      id: c.id,
      name: c.name,
      modes: c.modes,
      variableIds: c.variableIds
    }));
    
    figma.ui.postMessage({
      type: 'INIT_DATA',
      savedData: savedData,
      collections: collectionsData
    });
    
    figma.ui.postMessage({
      type: MessageType.COLLECTIONS_DATA,
      data: { collections: collectionsData }
    });
  } catch (error) {
    logger.error('❌ Initialization error:', error);
  }
}

// メッセージハンドラー
figma.ui.onmessage = async (msg: any) => {
  try {
    switch (msg.type) {
      case 'SAVE_DATA':
        await saveAllData(msg.data);
        figma.ui.postMessage({
          type: 'SAVE_COMPLETE',
          success: true
        });
        break;
        
      case 'LOAD_DATA':
        const loadedData = await loadAllData();
        figma.ui.postMessage({
          type: 'LOAD_DATA_RESPONSE',
          data: loadedData
        });
        break;
        
      case MessageType.IMPORT_FROM_NOTION:
        if (msg.formData) {
          await saveAllData(msg.formData);
        }
        await handleImportFromNotion(msg.data);
        break;
        
      case MessageType.GET_COLLECTIONS:
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        const collectionsData = collections.map(c => ({
          id: c.id,
          name: c.name,
          modes: c.modes,
          variableIds: c.variableIds
        }));
        figma.ui.postMessage({
          type: MessageType.COLLECTIONS_DATA,
          data: { collections: collectionsData }
        });
        break;
      
      case MessageType.EXPORT_VARIABLES:
        try {
          const exportSettings = msg.data as ExportSettings;
          logger.log(`📤 Exporting variables for ${exportSettings.collectionIds.length} collections`);
          
          const result = await exportToDesignTokens(exportSettings.collectionIds);
          
          figma.ui.postMessage({
            type: MessageType.EXPORT_RESULT,
            data: {
              success: true,
              json: result.json,
              tokenCount: result.tokenCount
            }
          });
          
          logger.log(`✅ Export completed: ${result.tokenCount} tokens`);
        } catch (exportError) {
          logger.error('❌ Export error:', exportError);
          figma.ui.postMessage({
            type: MessageType.EXPORT_RESULT,
            data: {
              success: false,
              error: exportError instanceof Error ? exportError.message : 'エクスポートに失敗しました'
            }
          });
        }
        break;
        
      case MessageType.SCAN_BROKEN_REFS:
        try {
          logger.log('🔍 Scanning for broken variable references...');
          const scanResult = await scanBrokenReferences();
          latestScanResult = scanResult;
          
          figma.ui.postMessage({
            type: MessageType.BROKEN_REFS_RESULT,
            data: scanResult
          });
          
          logger.log(`✅ Scan complete: ${scanResult.brokenGroups.length} broken variable IDs found`);
        } catch (scanError) {
          logger.error('❌ Scan error:', scanError);
          figma.ui.postMessage({
            type: MessageType.ERROR,
            data: {
              message: scanError instanceof Error ? scanError.message : 'スキャンに失敗しました'
            }
          });
        }
        break;

      case MessageType.REMAP_VARIABLES:
        try {
          const mappings = msg.data as RemapMapping[];
          
          if (!latestScanResult) {
            throw new Error('スキャン結果がありません。先にスキャンを実行してください。');
          }
          
          logger.log(`🔄 Remapping ${mappings.length} variable mapping(s)...`);
          const remapResult = await remapVariables(mappings, latestScanResult);
          
          figma.ui.postMessage({
            type: MessageType.REMAP_RESULT,
            data: remapResult
          });
          
          // 成功時のみスキャン結果をクリア（失敗時はリトライできるよう保持）
          if (remapResult.success) {
            latestScanResult = null;
          }
          
          logger.log(`✅ Remap complete: ${remapResult.totalRemapped} references updated`);
        } catch (remapError) {
          logger.error('❌ Remap error:', remapError);
          figma.ui.postMessage({
            type: MessageType.ERROR,
            data: {
              message: remapError instanceof Error ? remapError.message : 'リマップに失敗しました'
            }
          });
        }
        break;

      case MessageType.CLOSE_PLUGIN:
        figma.closePlugin();
        break;
    }
  } catch (error) {
    logger.error('❌ Message handler error:', error);
    figma.ui.postMessage({
      type: MessageType.ERROR,
      data: {
        message: error instanceof Error ? error.message : 'エラーが発生しました'
      }
    });
  }
};

// 初期化実行
initialize();
