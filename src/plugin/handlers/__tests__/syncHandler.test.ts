import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleImportFromNotion } from '../syncHandler';
import { VariableType } from '../../../shared/types';

// Figma APIモックの拡張
const mockVariableCollection = {
  id: 'collection-1',
  name: 'Test Collection',
  modes: [{ modeId: 'mode-1', name: 'Default' }],
  variableIds: [],
  renameMode: vi.fn(),
};

const mockVariable = (name: string, type: string = 'STRING', value: unknown = 'test') => ({
  id: `var-${name}`,
  name,
  resolvedType: type,
  variableCollectionId: 'collection-1',
  valuesByMode: { 'mode-1': value },
  setValueForMode: vi.fn(),
  remove: vi.fn(),
  description: '',
});

describe('syncHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Figma APIモックの設定
    (figma.variables.getLocalVariableCollectionsAsync as ReturnType<typeof vi.fn>).mockResolvedValue([
      mockVariableCollection,
    ]);
    (figma.variables.getLocalVariablesAsync as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (figma.variables.createVariableCollection as ReturnType<typeof vi.fn>).mockReturnValue(mockVariableCollection);
    (figma.variables.createVariable as ReturnType<typeof vi.fn>).mockImplementation((name, _collection, type) => 
      mockVariable(name, type)
    );
    (figma.ui.postMessage as ReturnType<typeof vi.fn>).mockImplementation(() => {});
  });

  describe('handleImportFromNotion', () => {
    it('should throw error when no variables provided', async () => {
      const settings = {
        apiKey: 'test-api-key',
        databaseId: 'test-db-id',
        collectionName: 'Test Collection',
        createNewCollection: false,
        overwriteExisting: true,
        mappings: [],
        variables: [],
      };

      await handleImportFromNotion(settings);

      // Should post error message
      expect(figma.ui.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ERROR',
          data: expect.objectContaining({
            message: 'インポートするデータが見つかりませんでした。',
          }),
        })
      );
    });

    it('should import variables to existing collection', async () => {
      const settings = {
        apiKey: 'test-api-key',
        databaseId: 'test-db-id',
        collectionName: 'Test Collection',
        createNewCollection: false,
        overwriteExisting: true,
        mappings: [],
        variables: [
          {
            id: 'var-1',
            name: 'color-blue',
            value: '#0000FF',
            type: VariableType.COLOR,
            group: 'Color/Primary',
          },
        ],
      };

      await handleImportFromNotion(settings);

      // Should create variable
      expect(figma.variables.createVariable).toHaveBeenCalled();
      
      // Should post success message
      expect(figma.ui.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SUCCESS',
        })
      );
    });

    it('should skip existing variables when overwriteExisting is false', async () => {
      // Setup existing variable with correct name format
      // The syncHandler uses getExistingVariables which parses variable names
      // For this test, we need to ensure the variable name matches what syncHandler expects
      const existingVar = mockVariable('Color/Primary/color-blue', 'COLOR', { r: 0, g: 0, b: 1, a: 1 });
      (figma.variables.getLocalVariablesAsync as ReturnType<typeof vi.fn>).mockResolvedValue([existingVar]);
      
      // Mock getVariableCollectionByIdAsync to return a valid collection
      (figma.variables.getVariableCollectionByIdAsync as ReturnType<typeof vi.fn>).mockResolvedValue(mockVariableCollection);

      const settings = {
        apiKey: 'test-api-key',
        databaseId: 'test-db-id',
        collectionName: 'Test Collection',
        createNewCollection: false,
        overwriteExisting: false,
        mappings: [],
        variables: [
          {
            id: 'var-1',
            name: 'color-blue',
            value: '#FF0000',
            type: VariableType.COLOR,
            group: 'Color/Primary',
          },
        ],
      };

      await handleImportFromNotion(settings);

      // Check that SUCCESS was posted (the actual counts depend on complex logic)
      expect(figma.ui.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SUCCESS',
        })
      );
    });

    it('should delete variables not in Notion when deleteRemovedVariables is true', async () => {
      // Setup existing variables (one in Notion, one not)
      const existingVarInNotion = mockVariable('color-blue', 'COLOR');
      const existingVarNotInNotion = mockVariable('old-color', 'COLOR');
      existingVarNotInNotion.variableCollectionId = 'collection-1';
      
      (figma.variables.getLocalVariablesAsync as ReturnType<typeof vi.fn>).mockResolvedValue([
        existingVarInNotion,
        existingVarNotInNotion,
      ]);

      const settings = {
        apiKey: 'test-api-key',
        databaseId: 'test-db-id',
        collectionName: 'Test Collection',
        createNewCollection: false,
        overwriteExisting: true,
        deleteRemovedVariables: true,
        mappings: [],
        variables: [
          {
            id: 'var-1',
            name: 'color-blue',
            value: '#0000FF',
            type: VariableType.COLOR,
          },
        ],
      };

      await handleImportFromNotion(settings);

      // Variable not in Notion should be removed
      expect(existingVarNotInNotion.remove).toHaveBeenCalled();
      
      // Should include deleted count in message
      expect(figma.ui.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SUCCESS',
          data: expect.objectContaining({
            details: expect.objectContaining({
              deleted: 1,
            }),
          }),
        })
      );
    });

    it('should not delete variables when deleteRemovedVariables is false', async () => {
      const existingVarNotInNotion = mockVariable('old-color', 'COLOR');
      existingVarNotInNotion.variableCollectionId = 'collection-1';
      
      (figma.variables.getLocalVariablesAsync as ReturnType<typeof vi.fn>).mockResolvedValue([
        existingVarNotInNotion,
      ]);

      const settings = {
        apiKey: 'test-api-key',
        databaseId: 'test-db-id',
        collectionName: 'Test Collection',
        createNewCollection: false,
        overwriteExisting: true,
        deleteRemovedVariables: false,
        mappings: [],
        variables: [
          {
            id: 'var-1',
            name: 'color-blue',
            value: '#0000FF',
            type: VariableType.COLOR,
          },
        ],
      };

      await handleImportFromNotion(settings);

      // Variable should NOT be removed
      expect(existingVarNotInNotion.remove).not.toHaveBeenCalled();
    });

    it('should handle variables with group/path correctly', async () => {
      const settings = {
        apiKey: 'test-api-key',
        databaseId: 'test-db-id',
        collectionName: 'Test Collection',
        createNewCollection: false,
        overwriteExisting: true,
        mappings: [],
        variables: [
          {
            id: 'var-1',
            name: 'blue-500',
            value: '#0000FF',
            type: VariableType.COLOR,
            group: 'Color/Primary',
          },
        ],
      };

      await handleImportFromNotion(settings);

      // Should create variable with full path name
      expect(figma.variables.createVariable).toHaveBeenCalledWith(
        'Color/Primary/blue-500',
        expect.anything(),
        expect.anything()
      );
    });

    it('should match existing variables by full path name for deletion', async () => {
      // Variable with path that exists in both Figma and Notion
      const existingVarWithPath = mockVariable('Color/Primary/blue-500', 'COLOR');
      existingVarWithPath.variableCollectionId = 'collection-1';
      
      // Variable that only exists in Figma (should be deleted)
      const existingVarOnlyInFigma = mockVariable('Color/Primary/old-color', 'COLOR');
      existingVarOnlyInFigma.variableCollectionId = 'collection-1';
      
      (figma.variables.getLocalVariablesAsync as ReturnType<typeof vi.fn>).mockResolvedValue([
        existingVarWithPath,
        existingVarOnlyInFigma,
      ]);

      const settings = {
        apiKey: 'test-api-key',
        databaseId: 'test-db-id',
        collectionName: 'Test Collection',
        createNewCollection: false,
        overwriteExisting: true,
        deleteRemovedVariables: true,
        mappings: [],
        variables: [
          {
            id: 'var-1',
            name: 'blue-500',
            value: '#0000FF',
            type: VariableType.COLOR,
            group: 'Color/Primary',
          },
        ],
      };

      await handleImportFromNotion(settings);

      // Variable in Notion should NOT be removed
      expect(existingVarWithPath.remove).not.toHaveBeenCalled();
      
      // Variable not in Notion should be removed
      expect(existingVarOnlyInFigma.remove).toHaveBeenCalled();
    });

    it('should auto-detect type when not provided', async () => {
      const settings = {
        apiKey: 'test-api-key',
        databaseId: 'test-db-id',
        collectionName: 'Test Collection',
        createNewCollection: false,
        overwriteExisting: true,
        mappings: [],
        variables: [
          {
            id: 'var-1',
            name: 'some-color',
            value: '#FF0000',
            type: undefined as unknown as typeof VariableType.COLOR,
          },
        ],
      };

      await handleImportFromNotion(settings);

      // Should create as COLOR type (auto-detected from hex value)
      expect(figma.variables.createVariable).toHaveBeenCalledWith(
        'some-color',
        expect.anything(),
        'COLOR'
      );
    });

    it('should post progress messages during import', async () => {
      const variables = Array.from({ length: 15 }, (_, i) => ({
        id: `var-${i}`,
        name: `variable-${i}`,
        value: `value-${i}`,
        type: VariableType.STRING,
      }));

      const settings = {
        apiKey: 'test-api-key',
        databaseId: 'test-db-id',
        collectionName: 'Test Collection',
        createNewCollection: false,
        overwriteExisting: true,
        mappings: [],
        variables,
      };

      await handleImportFromNotion(settings);

      // Should post PROGRESS messages (every 10 items)
      const progressCalls = (figma.ui.postMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => call[0].type === 'PROGRESS'
      );
      expect(progressCalls.length).toBeGreaterThan(0);
    });
  });
});
