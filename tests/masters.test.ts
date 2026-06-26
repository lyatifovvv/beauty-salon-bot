import { createMaster, updateMaster } from '../src/services/masterService';
import { PrismaClient } from '@prisma/client';

jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    master: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

const prisma = new PrismaClient() as any;

describe('masterService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createMaster', () => {
    it('should create a new master with valid data', async () => {
      const validSchedule = { '1': { from: '09:00', to: '18:00' } };
      const mockMaster = { id: '1', name: 'Анна', workingHours: JSON.stringify(validSchedule) };
      prisma.master.create.mockResolvedValue(mockMaster);

      const result = await createMaster('Анна', validSchedule, ['s1']);

      expect(prisma.master.create).toHaveBeenCalledWith({
        data: {
          name: 'Анна',
          workingHours: JSON.stringify(validSchedule),
          photoUrl: null,
          services: {
            connect: [{ id: 's1' }]
          }
        }
      });
      expect(result).toEqual(mockMaster);
    });

    it('should throw an error if name is empty', async () => {
      const validSchedule = { '1': { from: '09:00', to: '18:00' } };
      await expect(createMaster('', validSchedule)).rejects.toThrow('Имя мастера не может быть пустым');
    });

    it('should throw an error if working hours are invalid', async () => {
      const invalidSchedule = { '1': { from: '09:0', to: '18:00' } };
      await expect(createMaster('Анна', invalidSchedule)).rejects.toThrow('Некорректный формат рабочих часов (I11)');
    });
  });

  describe('updateMaster', () => {
    it('should throw an error if master is not found', async () => {
      prisma.master.findUnique.mockResolvedValue(null);
      await expect(updateMaster('invalid-id', { name: 'Новое имя' })).rejects.toThrow('Мастер не найден');
    });

    it('should update master name', async () => {
      const mockMaster = { id: '1', name: 'Анна' };
      prisma.master.findUnique.mockResolvedValue(mockMaster);
      prisma.master.update.mockResolvedValue({ ...mockMaster, name: 'Ольга' });

      await updateMaster('1', { name: 'Ольга' });

      expect(prisma.master.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { name: 'Ольга' }
      });
    });

    it('should update serviceIds', async () => {
      const mockMaster = { id: '1', name: 'Анна' };
      prisma.master.findUnique.mockResolvedValue(mockMaster);
      prisma.master.update.mockResolvedValue(mockMaster);

      await updateMaster('1', { serviceIds: ['s1', 's2'] });

      expect(prisma.master.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          services: {
            set: [{ id: 's1' }, { id: 's2' }]
          }
        }
      });
    });
  });
});
