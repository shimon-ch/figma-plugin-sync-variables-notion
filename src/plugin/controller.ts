// Figmaプラグインのメインコントローラー
import { handleImportFromNotion } from './handlers/syncHandler';
import { MessageType } from '../shared/types';
import { logger } from '../shared/logger';
import { obfuscateApiKey, deobfuscateApiKey } from '../shared/security';

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
  PROXY_URL: 'notion_proxy_url',
  PROXY_TOKEN: 'notion_proxy_token',
  COLLECTION_ID: 'collection_id',
  INCLUDE_DESC: 'include_description',
  PRESERVE_HIERARCHY: 'preserve_hierarchy'
};

// 保存関数（確実に動作するシンプルな実装）
async function saveValue(key: string, value: any): Promise<void> {
  try {
    logger.log(`💾 Attempting to save ${key}`);
    
    // 値の型と内容をチェック
    if (value === undefined || value === null) {
      logger.log(`⚠️ Skipping save for ${key}: value is undefined or null`);
      return;
    }
    
    // 機密情報は難読化して保存
    let stringValue = String(value);
    const sensitiveKeys = [STORAGE_KEYS.API_KEY, STORAGE_KEYS.PROXY_TOKEN];
    if (sensitiveKeys.includes(key) && stringValue) {
      stringValue = obfuscateApiKey(stringValue);
      logger.log(`🔒 Obfuscated sensitive data for ${key}`);
    }
    
    await figma.clientStorage.setAsync(key, stringValue);
    logger.log(`✅ Saved ${key}`);
    
  } catch (error) {
    logger.error(`❌ Failed to save ${key}:`, error);
  }
}

// 読み込み関数（確実に動作するシンプルな実装）
async function loadValue(key: string): Promise<string | null> {
  try {
    logger.log(`📖 Attempting to load ${key}`);
    const value = await figma.clientStorage.getAsync(key);
    
    if (value !== undefined && value !== null) {
      let stringValue = String(value);
      
      // 機密情報は復号化
      const sensitiveKeys = [STORAGE_KEYS.API_KEY, STORAGE_KEYS.PROXY_TOKEN];
      if (sensitiveKeys.includes(key) && stringValue) {
        stringValue = deobfuscateApiKey(stringValue);
        logger.log(`🔓 Deobfuscated sensitive data for ${key}`);
      }
      
      logger.log(`✅ Loaded ${key}`);
      return stringValue;
    } else {
      logger.log(`⚠️ No value found for ${key}`);
      return null;
    }
  } catch (error) {
    logger.error(`❌ Failed to load ${key}:`, error);
    return null;
  }
}

// すべての保存データを読み込む
async function loadAllData(): Promise<any> {
  logger.log('📂 Loading all saved data...');
  const data: any = {};
  
  // 各値を個別に読み込み（順番に、awaitを確実に待つ）
  const apiKey = await loadValue(STORAGE_KEYS.API_KEY);
  if (apiKey) {
    data.notion_api_key = apiKey;
    logger.log('✓ Added notion_api_key to data');
  }
  
  const databaseId = await loadValue(STORAGE_KEYS.DATABASE_ID);
  if (databaseId) {
    data.notion_database_id = databaseId;
    logger.log('✓ Added notion_database_id to data');
  }
  
  const collectionName = await loadValue(STORAGE_KEYS.COLLECTION_NAME);
  if (collectionName) {
    data.collection_name = collectionName;
    logger.log('✓ Added collection_name to data');
  }
  
  const collectionMode = await loadValue(STORAGE_KEYS.COLLECTION_MODE);
  if (collectionMode) {
    data.collection_mode = collectionMode;
    logger.log('✓ Added collection_mode to data');
  }
  
  const overwrite = await loadValue(STORAGE_KEYS.OVERWRITE);
  if (overwrite !== null) {
    data.overwrite_existing = overwrite === 'true';
    logger.log('✓ Added overwrite_existing to data');
  }
  
  const collectionId = await loadValue(STORAGE_KEYS.COLLECTION_ID);
  if (collectionId) {
    data.collection_id = collectionId;
    logger.log('✓ Added collection_id to data');
  }
  
  const includeDesc = await loadValue(STORAGE_KEYS.INCLUDE_DESC);
  if (includeDesc !== null) {
    data.include_description = includeDesc === 'true';
    logger.log('✓ Added include_description to data');
  }
  const proxyUrl = await loadValue(STORAGE_KEYS.PROXY_URL);
  if (proxyUrl) {
    data.notion_proxy_url = proxyUrl;
    logger.log('✓ Added notion_proxy_url to data');
  }
  const proxyToken = await loadValue(STORAGE_KEYS.PROXY_TOKEN);
  if (proxyToken) {
    data.notion_proxy_token = proxyToken;
    logger.log('✓ Added notion_proxy_token to data');
  }
  
  const preserveHierarchy = await loadValue(STORAGE_KEYS.PRESERVE_HIERARCHY);
  if (preserveHierarchy !== null) {
    data.preserve_hierarchy = preserveHierarchy === 'true';
    logger.log('✓ Added preserve_hierarchy to data');
  }
  
  logger.log('📂 Final loaded data:', JSON.stringify(data, null, 2));
  return data;
}

// データを保存する
async function saveAllData(data: any): Promise<void> {
  logger.log('💾 Starting to save data:', JSON.stringify(data, null, 2));
  
  // 各値を個別に保存（順番に、awaitを確実に待つ）
  if (data.notion_api_key !== undefined) {
    await saveValue(STORAGE_KEYS.API_KEY, data.notion_api_key);
  }
  if (data.notion_database_id !== undefined) {
    await saveValue(STORAGE_KEYS.DATABASE_ID, data.notion_database_id);
  }
  if (data.collection_name !== undefined) {
    await saveValue(STORAGE_KEYS.COLLECTION_NAME, data.collection_name);
  }
  if (data.collection_mode !== undefined) {
    await saveValue(STORAGE_KEYS.COLLECTION_MODE, data.collection_mode);
  }
  if (data.overwrite_existing !== undefined) {
    await saveValue(STORAGE_KEYS.OVERWRITE, data.overwrite_existing);
  }
  if (data.notion_proxy_url !== undefined) {
    await saveValue(STORAGE_KEYS.PROXY_URL, data.notion_proxy_url);
  }
  if (data.notion_proxy_token !== undefined) {
    await saveValue(STORAGE_KEYS.PROXY_TOKEN, data.notion_proxy_token);
  }
  if (data.collection_id !== undefined) {
    await saveValue(STORAGE_KEYS.COLLECTION_ID, data.collection_id);
  }
  if (data.include_description !== undefined) {
    await saveValue(STORAGE_KEYS.INCLUDE_DESC, data.include_description);
  }
  if (data.preserve_hierarchy !== undefined) {
    await saveValue(STORAGE_KEYS.PRESERVE_HIERARCHY, data.preserve_hierarchy);
  }
  
  logger.log('💾 Save complete - verifying by reloading...');
  
  // 保存後に確認のため再読み込み
  const verifyData = await loadAllData();
  logger.log('🔍 Verification after save:', JSON.stringify(verifyData, null, 2));
}

// 起動時の初期化
async function initialize() {
  try {
    logger.log('🚀 Plugin initialization started');
    logger.log('⏰ Timestamp:', new Date().toISOString());
    
    // まず全てのストレージキーを確認
    logger.log('🔑 Checking all storage keys...');
    for (const [name, key] of Object.entries(STORAGE_KEYS)) {
      const value = await figma.clientStorage.getAsync(key);
      logger.log(`  ${name} (${key}):`, value !== undefined ? `"${value}"` : 'undefined');
    }
    
    // 保存されたデータを読み込み
    const savedData = await loadAllData();
    
    // コレクションを取得
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collectionsData = collections.map(c => ({
      id: c.id,
      name: c.name,
      modes: c.modes,
      variableIds: c.variableIds
    }));
    
    // 初期データをUIに送信
    logger.log('📤 Sending initial data to UI');
    logger.log('📤 Data being sent:', JSON.stringify(savedData, null, 2));
    figma.ui.postMessage({
      type: 'INIT_DATA',
      savedData: savedData,
      collections: collectionsData
    });
    
    // コレクションデータも送信
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
  logger.log('📨 Message received:', msg.type);
  
  try {
    switch (msg.type) {
      case 'SAVE_DATA':
        // UIから送られてきたデータを保存
        logger.log('📝 SAVE_DATA request with data:', JSON.stringify(msg.data, null, 2));
        await saveAllData(msg.data);
        
        // 保存完了を通知
        figma.ui.postMessage({
          type: 'SAVE_COMPLETE',
          success: true
        });
        break;
        
      case 'LOAD_DATA':
        // 保存されたデータを読み込んでUIに送信
        logger.log('📖 LOAD_DATA request');
        const loadedData = await loadAllData();
        logger.log('📖 Sending loaded data to UI:', JSON.stringify(loadedData, null, 2));
        figma.ui.postMessage({
          type: 'LOAD_DATA_RESPONSE',
          data: loadedData
        });
        break;
        
      case MessageType.IMPORT_FROM_NOTION:
        // フォームデータを保存
        if (msg.formData) {
          logger.log('💾 Saving form data before import');
          await saveAllData(msg.formData);
        }
        // インポート処理
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
        
      case MessageType.CLOSE_PLUGIN:
        figma.closePlugin();
        break;
        
      default:
        logger.log('⚠️ Unknown message type:', msg.type);
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
logger.log('🎯 Starting plugin...');
initialize();
