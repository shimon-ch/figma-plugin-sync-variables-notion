// NotionとFigmaの同期処理ハンドラー
import { 
  ImportSettings, 
  NotionVariable, 
  MessageType,
  VariableType 
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
    
    logger.log('Import settings:', {
      variablesCount: variables.length,
      mappings: settings.mappings
    });
    
    // コレクションを作成または取得
    const collectionName = settings.collectionName || 'Design Tokens';
    const collection = await createVariableCollection(
      collectionName,
      settings.createNewCollection
    );
    
    // 既存のVariablesを取得
    const existingVariables = await getExistingVariables(collection.id);
    const existingVariableMap = new Map(
      existingVariables.map(v => [`${v.group}/${v.name}`, v])
    );
    
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    const importErrors: { name: string; reason: string }[] = [];
    const ordered = variables; // 受け取った順（DB順）を保持

    // 1パス目: 値を設定（参照が未解決ならフォールバック）
    for (const variable of ordered) {
      try {
        const fullName = variable.group 
          ? `${variable.group}/${variable.name}`
          : variable.name;
        
        // 既存のVariableがある場合
        if (existingVariableMap.has(fullName)) {
          if (!settings.overwriteExisting) {
            skippedCount++;
            continue;
          }
        }
        
        // 型の自動判定（必要な場合）
        if (!variable.type) {
          variable.type = detectVariableType(variable.value);
        }
        
        // 参照 + フォールバック形式の暫定対応
        const isAliasWithFallback = typeof variable.value === 'string' && String(variable.value).includes('||');
        if (isAliasWithFallback) {
          const [ref, fb] = String(variable.value).split('||');
          const targetName = ref.replace(/^\{|\}$/g, '');
          const refVar = await findVariableByName(targetName);
          if (!refVar && fb) {
            // まずフォールバックで作成
            const backup = { ...variable, value: fb };
            await updateVariable(collection, backup);
            importedCount++;
            continue;
          }
        }

        await updateVariable(collection, variable);
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
        await updateVariable(collection, variable);
      } catch (error) {
        logger.warn(`Alias re-resolve failed for ${variable.name}:`, error);
      }
    }
    
    // 結果を通知（日本語・詳細）
    figma.ui.postMessage({
      type: MessageType.SUCCESS,
      data: {
        message: `インポート完了: 取り込み ${importedCount} 件 / スキップ ${skippedCount} 件 / エラー ${errorCount} 件 (合計 ${variables.length} 件)`,
        details: {
          imported: importedCount,
          skipped: skippedCount,
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
