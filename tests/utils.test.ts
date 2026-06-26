import { validateWorkingHours } from '../src/services/masterService';
import { validatePhone } from '../src/services/clientService';

describe('Utility Functions', () => {
  describe('validateWorkingHours', () => {
    it('should return true for valid working hours', () => {
      const validSchedule = {
        '1': { from: '09:00', to: '18:00' },
        '2': { from: '10:00', to: '19:00' },
        '3': null,
      };
      expect(validateWorkingHours(validSchedule)).toBe(true);
    });

    it('should return false for invalid time formats', () => {
      const invalidSchedule = {
        '1': { from: '09:0', to: '18:00' },
      };
      expect(validateWorkingHours(invalidSchedule)).toBe(false);
    });

    it('should return false if "from" is greater than "to"', () => {
      const invalidSchedule = {
        '1': { from: '19:00', to: '18:00' },
      };
      expect(validateWorkingHours(invalidSchedule)).toBe(false);
    });

    it('should return false for completely invalid input', () => {
      expect(validateWorkingHours(null)).toBe(false);
      expect(validateWorkingHours('string')).toBe(false);
      expect(validateWorkingHours([])).toBe(false); // [] is object, but doesn't have required string keys '1'-'7' with objects
    });
  });

  describe('validatePhone', () => {
    it('should return true for valid russian phone numbers', () => {
      expect(validatePhone('+79991234567')).toBe(true);
    });

    it('should return false for invalid phone numbers', () => {
      expect(validatePhone('79991234567')).toBe(false);
      expect(validatePhone('+7999123456')).toBe(false);
      expect(validatePhone('+89991234567')).toBe(false);
      expect(validatePhone('phone')).toBe(false);
    });
  });
});
