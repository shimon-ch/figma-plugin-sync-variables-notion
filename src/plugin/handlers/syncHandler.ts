// NotionとFigmaの同期処理ハンドラー
import { 
  ImportSettings, 
  NotionVariable, 
  MessageType
} from '../../shared/types';
import { logger } from '../../shared/logger';
import { 
  createVariableCollection, 
  updateVariable, 
  getExistingVariables,
  detectVariableType,
  findVariableByName
} from '../utils/variableUtils';

// Notionからインポート
export async function handleImportFromNotion(settings: ImportSettings & { variables?: NotionVariable[] }) {
  try {
    // UIスレッドから送られてきたパース済みデータを使用
    const variables = settings.variables;
    
    if (!variables || variables.length === 0) {
      throw new Error('インポートするデータが見つかりませんでした。');
    }
    
    // ローディング状態を通知
    figma.ui.postMessage({
      type: MessageType.LOADING,
      data: { message: 'Figma Variablesを作成中...' }
    });
    
    logger.log('\n📋 Import settings:');
    logger.log('  - Variables count:', variables.length);
    logger.log('  - Collection name:', settings.collectionName);
    logger.log('  - Create new collection:', settings.createNewCollection);
    logger.log('  - Overwrite existing:', settings.overwriteExisting);
    logger.log('  - Delete removed variables:', settings.deleteRemovedVariables || false);
    logger.log('  - Mappings:', settings.mappings?.length || 0);
    
    // コレクションを作成または取得
    const collectionName = settings.collectionName || 'Design Tokens';
    logger.log(`\n📦 Collection settings:`);
    logger.log(`  - Name: "${collectionName}"`);
    logger.log(`  - Create new: ${settings.createNewCollection}`);
    
    const collection = await createVariableCollection(
      collectionName,
      settings.createNewCollection
    );
    
    logger.log(`  - Using collection: "${collection.name}" (ID: ${collection.id})`);
    logger.log(`  - Collection has ${collection.variableIds.length} variables`);
    
    // 既存のVariablesを取得（NotionVariable形式）
    const existingVariables = await getExistingVariables(collection.id);
    logger.log(`Found ${existingVariables.length} existing variables in collection`);
    
    // Figma Variable形式のリストも一括取得（updateVariableに渡すため）
    // これにより、updateVariable内で毎回getLocalVariablesAsync()を呼ばなくて済む
    const allFigmaVariables = await figma.variables.getLocalVariablesAsync();
    logger.log(`Total Figma variables loaded: ${allFigmaVariables.length}`);
    
    const existingVariableMap = new Map(
      existingVariables.map(v => {
        const key = v.group ? `${v.group}/${v.name}` : v.name;
        logger.log(`  - Existing: "${key}" (type: ${v.type}, value: ${JSON.stringify(v.value)})`);
        return [key, v];
      })
    );
    
    logger.log(`\nStarting import with overwriteExisting: ${settings.overwriteExisting}`);
    
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    const importErrors: { name: string; reason: string }[] = [];
    const ordered = variables; // 受け取った順（DB順）を保持

    // 1パス目: 値を設定（参照が未解決ならフォールバック）
    for (let i = 0; i < ordered.length; i++) {
      const variable = ordered[i];
      
      // 10件ごとに進捗を通知（タイムアウト防止）
      if (i % 10 === 0) {
        figma.ui.postMessage({
          type: MessageType.PROGRESS,
          data: {
            current: i,
            total: ordered.length,
            phase: 'importing',
            message: `インポート中: ${i + 1}/${ordered.length} 件を処理中...`
          }
        });
      }
      
      try {
        const fullName = variable.group 
          ? `${variable.group}/${variable.name}`
          : variable.name;
        
        logger.log(`\n[Processing] ${fullName}`);
        logger.log(`  - Notion value: ${JSON.stringify(variable.value)}`);
        logger.log(`  - Notion type: ${variable.type || 'undefined (will auto-detect)'}`);
        
        // 既存のVariableがある場合
        const existingVar = existingVariableMap.get(fullName);
        if (existingVar) {
          logger.log(`  - Found in existingVariableMap`);
          logger.log(`    - Existing value: ${JSON.stringify(existingVar.value)}`);
          logger.log(`    - Existing type: ${existingVar.type}`);
          
          if (!settings.overwriteExisting) {
            logger.log(`  ⏭️  Skipping (overwrite disabled)`);
            skippedCount++;
            continue;
          }
          logger.log(`  ✏️  Will overwrite`);
        } else {
          logger.log(`  - Not found in existingVariableMap, will create new`);
        }
        
        // 型の自動判定（必要な場合）
        if (!variable.type) {
          const detectedType = detectVariableType(variable.value);
          variable.type = detectedType;
          logger.log(`  - Auto-detected type: ${detectedType}`);
        }
        
        // 参照 + フォールバック形式の暫定対応
        const isAliasWithFallback = typeof variable.value === 'string' && String(variable.value).includes('||');
        if (isAliasWithFallback) {
          const [ref, fb] = String(variable.value).split('||');
          const targetName = ref.replace(/^\{|\}$/g, '');
          const refVar = await findVariableByName(targetName, allFigmaVariables);
          if (!refVar && fb) {
            // まずフォールバックで作成
            logger.log(`  - Using fallback value: ${fb}`);
            const backup = { ...variable, value: fb };
            const newVar = await updateVariable(collection, backup, allFigmaVariables);
            // 新規作成した変数をリストに追加（後続の参照解決で使用可能にする）
            allFigmaVariables.push(newVar);
            importedCount++;
            continue;
          }
        }

        logger.log(`  - Calling updateVariable with:`, {
          name: variable.name,
          group: variable.group,
          type: variable.type,
          value: variable.value
        });
        
        const newVar = await updateVariable(collection, variable, allFigmaVariables);
        // 新規作成した変数をリストに追加（後続の参照解決で使用可能にする）
        if (!allFigmaVariables.some(v => v.id === newVar.id)) {
          allFigmaVariables.push(newVar);
        }
        logger.log(`  ✅ updateVariable completed for ${fullName}`);
        importedCount++;
        
      } catch (error) {
        logger.error(`Error importing variable ${variable.name}:`, error);
        errorCount++;
        importErrors.push({ name: variable.name, reason: error instanceof Error ? error.message : String(error) });
      }
    }

    // 2パス目: 参照を再解決（フォールバックで入ったものも再設定）
    for (const variable of ordered) {
      try {
        const isAlias = typeof variable.value === 'string' && String(variable.value).startsWith('{');
        if (!isAlias) continue;
        await updateVariable(collection, variable, allFigmaVariables);
      } catch (error) {
        logger.warn(`Alias re-resolve failed for ${variable.name}:`, error);
      }
    }
    
    // 3パス目: Notionから削除された変数をFigmaからも削除（オプション）
    let deletedCount = 0;
    if (settings.deleteRemovedVariables) {
      logger.log(`\n🗑️  Checking for variables to delete (deleteRemovedVariables: ${settings.deleteRemovedVariables})`);
      
      // Notionから取得した変数のフルネームセットを作成
      const notionVariableNames = new Set(
        variables.map(v => {
          const fullName = v.group ? `${v.group}/${v.name}` : v.name;
          return fullName;
        })
      );
      
      logger.log(`  - Notion variables count: ${notionVariableNames.size}`);
      logger.log(`  - Notion variable names:`, Array.from(notionVariableNames).slice(0, 5).join(', ') + (notionVariableNames.size > 5 ? '...' : ''));
      logger.log(`  - Existing variables in collection: ${existingVariables.length}`);
      
      // 既に取得済みのallFigmaVariablesを再利用（再取得不要）
      const collectionVars = allFigmaVariables.filter(v => v.variableCollectionId === collection.id);
      logger.log(`  - Total Figma variables in this collection: ${collectionVars.length}`);
      
      // 既存変数の中で、Notionに存在しないものを削除
      const varsToDelete = collectionVars.filter(v => !notionVariableNames.has(v.name));
      
      for (let i = 0; i < varsToDelete.length; i++) {
        const figmaVar = varsToDelete[i];
        const varName = figmaVar.name;
        
        // 10件ごとに進捗を通知（タイムアウト防止）
        if (i % 10 === 0) {
          figma.ui.postMessage({
            type: MessageType.PROGRESS,
            data: {
              current: i,
              total: varsToDelete.length,
              phase: 'deleting',
              message: `削除中: ${i + 1}/${varsToDelete.length} 件を処理中...`
            }
          });
        }
        
        try {
          logger.log(`  🗑️  Variable not in Notion: "${varName}"`);
          logger.warn(`    ⚠️  Warning: Deleting this variable will break any references to it in your design`);
          
          figmaVar.remove();
          deletedCount++;
          logger.log(`    ✅ Deleted: "${varName}"`);
        } catch (error) {
          logger.error(`    ❌ Failed to delete "${varName}":`, error);
        }
      }
      
      if (deletedCount > 0) {
        logger.log(`\n✅ Deleted ${deletedCount} variables not in Notion`);
      } else {
        logger.log(`\n✅ No variables to delete (all Figma variables exist in Notion)`);
      }
    } else {
      logger.log(`\n⏭️  Skipping variable deletion (deleteRemovedVariables: ${settings.deleteRemovedVariables || false})`);
    }
    
    // 結果を通知（日本語・詳細）
    const resultMessage = settings.deleteRemovedVariables
      ? `インポート完了: 取り込み ${importedCount} 件 / スキップ ${skippedCount} 件 / 削除 ${deletedCount} 件 / エラー ${errorCount} 件 (合計 ${variables.length} 件)`
      : `インポート完了: 取り込み ${importedCount} 件 / スキップ ${skippedCount} 件 / エラー ${errorCount} 件 (合計 ${variables.length} 件)`;
    
    figma.ui.postMessage({
      type: MessageType.SUCCESS,
      data: {
        message: resultMessage,
        details: {
          imported: importedCount,
          skipped: skippedCount,
          deleted: deletedCount,
          errors: errorCount,
          total: variables.length,
          importErrors
        }
      }
    });
    
  } catch (error) {
    logger.error('Import error:', error);
    
    let errorMessage = 'インポートに失敗しました。';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    // より詳細なエラー情報を提供
    figma.ui.postMessage({
      type: MessageType.ERROR,
      data: {
        message: errorMessage,
        details: {
          error: error instanceof Error ? error.toString() : String(error),
          suggestion: getErrorSuggestion(errorMessage)
        }
      }
    });
  }
}

// エラーに基づく提案を生成
function getErrorSuggestion(errorMessage: string): string {
  if (errorMessage.includes('認証エラー')) {
    return 'Notion Integrationページで新しいAPIキーを生成してください。';
  } else if (errorMessage.includes('データベースが見つかりません')) {
    return 'データベースにIntegrationを追加しましたか？データベースページの「...」メニューから「Connections」を確認してください。';
  } else if (errorMessage.includes('データベースIDの形式')) {
    return 'NotionのデータベースURLから正しいIDをコピーしてください。例: https://notion.so/xxxxx の xxxxx 部分';
  } else if (errorMessage.includes('ネットワークエラー')) {
    return 'インターネット接続とFigmaのネットワーク設定を確認してください。';
  }
  return '';
}
