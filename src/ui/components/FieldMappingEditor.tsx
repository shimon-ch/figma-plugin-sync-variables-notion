import { FieldMapping } from '../../shared/types';

interface FieldMappingEditorProps {
  mappings: FieldMapping[];
  onChange: (mappings: FieldMapping[]) => void;
}

const FieldMappingEditor = ({ mappings, onChange }: FieldMappingEditorProps) => {
  const availableProperties = ['name', 'value', 'type', 'description', 'group'];

  const updateMapping = (index: number, field: keyof FieldMapping, value: string) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], [field]: value };
    onChange(newMappings);
  };

  const addMapping = () => {
    onChange([...mappings, { notionField: '', variableProperty: 'name' }]);
  };

  const removeMapping = (index: number) => {
    onChange(mappings.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-4 items-center">
        <span className="text-xs">Notionフィールド</span>
        <span className="text-xs text-center">→</span>
        <span className="text-xs">Variableプロパティ</span>
        <span className="w-8"></span>
      </div>

      {/* マッピング行 */}
      {mappings.map((mapping, index) => (
        <div key={index} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
          <input
            type="text"
            className="input input-xs"
            value={mapping.notionField}
            onChange={(e) => updateMapping(index, 'notionField', e.target.value)}
            placeholder="Notionフィールド名"
          />
          
          <span className="text-base-content text-center">→</span>
          
          <select
            className="select select-xs"
            value={mapping.variableProperty}
            onChange={(e) => updateMapping(index, 'variableProperty', e.target.value)}
          >
            {availableProperties.map((prop) => (
              <option key={prop} value={prop}>
                {prop}
              </option>
            ))}
          </select>
          
          <button
            type="button"
            className="btn btn-xs btn-error btn-outline"
            onClick={() => removeMapping(index)}
            title="マッピングを削除"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-neutral btn-sm"
        onClick={addMapping}
      >
        + マッピングを追加
      </button>
    </div>
  );
};

export default FieldMappingEditor;
