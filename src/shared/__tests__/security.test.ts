import { describe, it, expect } from 'vitest';
import {
  obfuscateApiKey,
  deobfuscateApiKey,
  validateApiKey,
  validateDatabaseId,
  generateSecureKey,
} from '../security';

describe('security', () => {
  describe('obfuscateApiKey / deobfuscateApiKey', () => {
    it('should obfuscate and deobfuscate API key correctly', () => {
      const originalKey = 'ntn_1234567890abcdefghijklmnopqrstuvwxyz1234567';
      const obfuscated = obfuscateApiKey(originalKey);
      const deobfuscated = deobfuscateApiKey(obfuscated);

      expect(obfuscated).not.toBe(originalKey);
      expect(deobfuscated).toBe(originalKey);
    });

    it('should return empty string for empty input (obfuscate)', () => {
      expect(obfuscateApiKey('')).toBe('');
    });

    it('should return empty string for empty input (deobfuscate)', () => {
      expect(deobfuscateApiKey('')).toBe('');
    });

    it('should handle various key formats', () => {
      const keys = [
        'short',
        'a-very-long-api-key-with-special-characters-!@#$%',
        '12345678901234567890',
        'ntn_abcdefghijklmnopqrstuvwxyz1234567890ABCDE',
      ];

      for (const key of keys) {
        const obfuscated = obfuscateApiKey(key);
        const deobfuscated = deobfuscateApiKey(obfuscated);
        expect(deobfuscated).toBe(key);
      }
    });

    it('should produce hex string output', () => {
      const key = 'test-key';
      const obfuscated = obfuscateApiKey(key);
      
      // Should only contain hex characters
      expect(obfuscated).toMatch(/^[0-9a-f]+$/);
      // Each character becomes 2 hex digits
      expect(obfuscated.length).toBe(key.length * 2);
    });
  });

  describe('validateApiKey', () => {
    it('should return true for valid Notion API key format', () => {
      // ntn_ followed by exactly 43 alphanumeric characters (total 47 chars)
      const validKey1 = 'ntn_' + 'a'.repeat(43);
      // Ensure exactly 43 characters after ntn_ (10+10+10+10+3 = 43)
      const validKey2 = 'ntn_' + '1234567890' + 'abcdefghij' + 'ABCDEFGHIJ' + '1234567890' + 'xyz';
      expect(validKey1.length).toBe(47); // verify length
      expect(validKey2.length).toBe(47); // verify length
      expect(validateApiKey(validKey1)).toBe(true);
      expect(validateApiKey(validKey2)).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(validateApiKey('')).toBe(false);
    });

    it('should return false for key without ntn_ prefix', () => {
      expect(validateApiKey('1234567890abcdefghijklmnopqrstuvwxyz1234567890')).toBe(false);
    });

    it('should return false for key with wrong length', () => {
      expect(validateApiKey('ntn_tooshort')).toBe(false);
      expect(validateApiKey('ntn_1234567890abcdefghijklmnopqrstuvwxyz123456789toolong')).toBe(false);
    });

    it('should return false for key with special characters', () => {
      expect(validateApiKey('ntn_123456789!@#$%^&*()_+=-[]{}|;:,./<>?')).toBe(false);
    });
  });

  describe('validateDatabaseId', () => {
    it('should return true for valid UUID format with hyphens', () => {
      expect(validateDatabaseId('12345678-1234-1234-1234-123456789012')).toBe(true);
      expect(validateDatabaseId('abcdef12-3456-7890-abcd-ef1234567890')).toBe(true);
      expect(validateDatabaseId('ABCDEF12-3456-7890-ABCD-EF1234567890')).toBe(true);
    });

    it('should return true for valid 32-character hex format without hyphens', () => {
      expect(validateDatabaseId('12345678123412341234123456789012')).toBe(true);
      expect(validateDatabaseId('abcdef123456789012345678901234ab')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(validateDatabaseId('')).toBe(false);
    });

    it('should return false for invalid format', () => {
      expect(validateDatabaseId('not-a-valid-id')).toBe(false);
      expect(validateDatabaseId('12345678-1234-1234-1234-12345678901')).toBe(false); // too short
      expect(validateDatabaseId('12345678-1234-1234-1234-1234567890123')).toBe(false); // too long
      expect(validateDatabaseId('1234567812341234123412345678901')).toBe(false); // 31 chars
      expect(validateDatabaseId('123456781234123412341234567890123')).toBe(false); // 33 chars
    });

    it('should return false for non-hex characters', () => {
      expect(validateDatabaseId('ghijklmn-opqr-stuv-wxyz-123456789012')).toBe(false);
    });
  });

  describe('generateSecureKey', () => {
    it('should generate key with given prefix', () => {
      const key = generateSecureKey('test');
      expect(key.startsWith('test_')).toBe(true);
    });

    it('should generate unique keys', () => {
      const key1 = generateSecureKey('test');
      const key2 = generateSecureKey('test');
      expect(key1).not.toBe(key2);
    });

    it('should include timestamp-like component', () => {
      const key = generateSecureKey('prefix');
      const parts = key.split('_');
      expect(parts.length).toBe(3);
      // Second part should be a number (timestamp)
      expect(Number(parts[1])).toBeGreaterThan(0);
    });
  });
});
