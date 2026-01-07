import { describe, it, expect, vi } from 'vitest';
import {
  normalizeColor,
  extractFromProperty,
  sanitizePath,
  sanitizeName,
  toHex,
  pctToByte,
  hslToRgb,
  transformNotionResponse,
} from '../notionTransform';

describe('notionTransform', () => {
  describe('toHex', () => {
    it('should convert number to 2-digit hex string', () => {
      expect(toHex(0)).toBe('00');
      expect(toHex(255)).toBe('ff');
      expect(toHex(128)).toBe('80');
    });

    it('should clamp values outside 0-255 range', () => {
      expect(toHex(-10)).toBe('00');
      expect(toHex(300)).toBe('ff');
    });

    it('should round floating point numbers', () => {
      expect(toHex(127.5)).toBe('80');
      expect(toHex(127.4)).toBe('7f');
    });
  });

  describe('pctToByte', () => {
    it('should convert percentage to byte value', () => {
      expect(pctToByte('0%')).toBe(0);
      expect(pctToByte('100%')).toBe(255);
      // 50 * 2.55 = 127.49999999999999 (floating point precision)
      // Math.round(127.49999999999999) = 127 (not 128)
      expect(pctToByte('50%')).toBe(127);
    });

    it('should clamp values outside 0-100 range', () => {
      expect(pctToByte('-10%')).toBe(0);
      expect(pctToByte('150%')).toBe(255);
    });
  });

  describe('hslToRgb', () => {
    it('should convert HSL to RGB', () => {
      // Red: h=0, s=1, l=0.5
      const red = hslToRgb(0, 1, 0.5);
      expect(Math.round(red.r)).toBe(255);
      expect(Math.round(red.g)).toBe(0);
      expect(Math.round(red.b)).toBe(0);

      // Green: h=120, s=1, l=0.5
      const green = hslToRgb(120, 1, 0.5);
      expect(Math.round(green.r)).toBe(0);
      expect(Math.round(green.g)).toBe(255);
      expect(Math.round(green.b)).toBe(0);

      // Blue: h=240, s=1, l=0.5
      const blue = hslToRgb(240, 1, 0.5);
      expect(Math.round(blue.r)).toBe(0);
      expect(Math.round(blue.g)).toBe(0);
      expect(Math.round(blue.b)).toBe(255);
    });
  });

  describe('normalizeColor', () => {
    it('should return empty string for null/undefined', () => {
      expect(normalizeColor(null)).toBe('');
      expect(normalizeColor(undefined)).toBe('');
    });

    it('should handle HEX colors with #', () => {
      expect(normalizeColor('#FF0000')).toBe('#FF0000');
      expect(normalizeColor('#ff0000')).toBe('#ff0000');
      expect(normalizeColor('#FF0000FF')).toBe('#FF0000FF');
    });

    it('should add # to HEX colors without it', () => {
      expect(normalizeColor('FF0000')).toBe('#FF0000');
      expect(normalizeColor('ff0000')).toBe('#ff0000');
    });

    it('should expand short HEX colors', () => {
      expect(normalizeColor('#F00')).toBe('#FF0000');
      expect(normalizeColor('#F00F')).toBe('#FF0000FF');
    });

    it('should handle RGB format', () => {
      expect(normalizeColor('rgb(255, 0, 0)')).toBe('#ff0000');
      expect(normalizeColor('rgb(255 0 0)')).toBe('#ff0000');
    });

    it('should handle RGBA format', () => {
      expect(normalizeColor('rgba(255, 0, 0, 0.5)')).toBe('#ff000080');
      expect(normalizeColor('rgba(255 0 0 / 0.5)')).toBe('#ff000080');
    });

    it('should handle RGB with percentage values', () => {
      expect(normalizeColor('rgb(100%, 0%, 0%)')).toBe('#ff0000');
    });

    it('should handle HSL format', () => {
      const result = normalizeColor('hsl(0, 100%, 50%)');
      expect(result).toBe('#ff0000');
    });

    it('should handle comma-separated RGB values', () => {
      expect(normalizeColor('255, 0, 0')).toBe('#ff0000');
      expect(normalizeColor('255, 0, 0, 0.5')).toBe('#ff000080');
    });

    it('should handle RGBA object format', () => {
      const result = normalizeColor({ r: 1, g: 0, b: 0, a: 1 });
      expect(result).toBe('#ff0000');
    });

    it('should return string as-is if not a color format', () => {
      expect(normalizeColor('not-a-color')).toBe('not-a-color');
    });
  });

  describe('extractFromProperty', () => {
    it('should return empty string for null/undefined props', () => {
      expect(extractFromProperty(null, 'key')).toBe('');
      expect(extractFromProperty(undefined, 'key')).toBe('');
      expect(extractFromProperty({}, undefined)).toBe('');
    });

    it('should extract title property', () => {
      const props = {
        Name: {
          type: 'title',
          title: [{ plain_text: 'Test Title' }],
        },
      };
      expect(extractFromProperty(props, 'Name')).toBe('Test Title');
    });

    it('should extract rich_text property', () => {
      const props = {
        Description: {
          type: 'rich_text',
          rich_text: [{ plain_text: 'Test Description' }],
        },
      };
      expect(extractFromProperty(props, 'Description')).toBe('Test Description');
    });

    it('should extract number property', () => {
      const props = {
        Count: {
          type: 'number',
          number: 42,
        },
      };
      expect(extractFromProperty(props, 'Count')).toBe(42);
    });

    it('should extract select property', () => {
      const props = {
        Type: {
          type: 'select',
          select: { name: 'COLOR' },
        },
      };
      expect(extractFromProperty(props, 'Type')).toBe('COLOR');
    });

    it('should extract multi_select property', () => {
      const props = {
        Tags: {
          type: 'multi_select',
          multi_select: [{ name: 'Tag1' }, { name: 'Tag2' }],
        },
      };
      expect(extractFromProperty(props, 'Tags')).toBe('Tag1, Tag2');
    });

    it('should extract formula property (string)', () => {
      const props = {
        Computed: {
          type: 'formula',
          formula: { type: 'string', string: 'computed value' },
        },
      };
      expect(extractFromProperty(props, 'Computed')).toBe('computed value');
    });

    it('should extract formula property (number)', () => {
      const props = {
        Computed: {
          type: 'formula',
          formula: { type: 'number', number: 123 },
        },
      };
      expect(extractFromProperty(props, 'Computed')).toBe(123);
    });

    it('should extract formula property (boolean)', () => {
      const props = {
        Computed: {
          type: 'formula',
          formula: { type: 'boolean', boolean: true },
        },
      };
      expect(extractFromProperty(props, 'Computed')).toBe('true');
    });

    it('should extract rollup property (number)', () => {
      const props = {
        Sum: {
          type: 'rollup',
          rollup: { type: 'number', number: 100 },
        },
      };
      expect(extractFromProperty(props, 'Sum')).toBe(100);
    });

    it('should extract date property', () => {
      const props = {
        Date: {
          type: 'date',
          date: { start: '2024-01-01' },
        },
      };
      expect(extractFromProperty(props, 'Date')).toBe('2024-01-01');
    });
  });

  describe('sanitizePath', () => {
    it('should normalize path separators', () => {
      expect(sanitizePath('Color/Primary/Blue')).toBe('Color/Primary/Blue');
      expect(sanitizePath('Color:Primary:Blue')).toBe('Color/Primary/Blue');
      expect(sanitizePath('Color>Primary>Blue')).toBe('Color/Primary/Blue');
    });

    it('should trim whitespace', () => {
      expect(sanitizePath(' Color / Primary / Blue ')).toBe('Color/Primary/Blue');
    });

    it('should remove empty segments', () => {
      expect(sanitizePath('Color//Primary//Blue')).toBe('Color/Primary/Blue');
    });
  });

  describe('sanitizeName', () => {
    it('should trim whitespace', () => {
      expect(sanitizeName('  Blue  ')).toBe('Blue');
    });
  });

  describe('transformNotionResponse', () => {
    const mockFetchNotionPage = vi.fn();

    beforeEach(() => {
      mockFetchNotionPage.mockReset();
    });

    it('should transform basic notion page to NotionVariable', async () => {
      const raw = [
        {
          id: 'page-1',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'Primary Blue' }] },
            Value: { type: 'rich_text', rich_text: [{ plain_text: '#0000FF' }] },
            Type: { type: 'select', select: { name: 'COLOR' } },
            Group: { type: 'rich_text', rich_text: [{ plain_text: 'Color/Primary' }] },
            Description: { type: 'rich_text', rich_text: [{ plain_text: 'Primary blue color' }] },
          },
        },
      ];

      const result = await transformNotionResponse(
        raw,
        'api-key',
        'https://proxy.test',
        'token',
        mockFetchNotionPage
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'page-1',
        name: 'Primary Blue',
        value: '#0000FF',
        type: 'COLOR',
        group: 'Color/Primary',
        description: 'Primary blue color',
      });
    });

    it('should handle alias value with {name} format', async () => {
      const raw = [
        {
          id: 'page-1',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'Alias Color' }] },
            ValueRollup: { type: 'rich_text', rich_text: [{ plain_text: '{Primary Blue}' }] },
            Value: { type: 'relation', relation: [{ id: 'ref-page-id' }] },
            Type: { type: 'select', select: { name: 'COLOR' } },
          },
        },
      ];

      mockFetchNotionPage.mockResolvedValue({
        id: 'ref-page-id',
        properties: {
          Name: { type: 'title', title: [{ plain_text: 'Primary Blue' }] },
          Group: { type: 'rich_text', rich_text: [{ plain_text: 'Color' }] },
          Value: { type: 'rich_text', rich_text: [{ plain_text: '#0000FF' }] },
        },
      });

      const result = await transformNotionResponse(
        raw,
        'api-key',
        'https://proxy.test',
        'token',
        mockFetchNotionPage
      );

      expect(result).toHaveLength(1);
      // Alias with fallback format: {aliasTarget}||fallbackHex
      expect(result[0].value).toMatch(/^\{Color\/Primary Blue\}\|\|#/);
    });

    it('should handle empty raw array', async () => {
      const result = await transformNotionResponse(
        [],
        'api-key',
        'https://proxy.test',
        'token',
        mockFetchNotionPage
      );

      expect(result).toHaveLength(0);
    });

    it('should use ValueRollup before Value', async () => {
      const raw = [
        {
          id: 'page-1',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'Test' }] },
            ValueRollup: { type: 'rich_text', rich_text: [{ plain_text: '#FF0000' }] },
            Value: { type: 'rich_text', rich_text: [{ plain_text: '#0000FF' }] },
          },
        },
      ];

      const result = await transformNotionResponse(
        raw,
        'api-key',
        'https://proxy.test',
        'token',
        mockFetchNotionPage
      );

      expect(result[0].value).toBe('#FF0000');
    });
  });
});
