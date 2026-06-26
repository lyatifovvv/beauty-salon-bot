import { createAppointment } from '../src/services/appointmentService';
import { PrismaClient } from '@prisma/client';

jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    service: { findUnique: jest.fn() },
    master: { findUnique: jest.fn() },
    appointment: { create: jest.fn(), findFirst: jest.fn() },
    client: { findUnique: jest.fn() },
    notification: { create: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

const prisma = new PrismaClient() as any;

describe('appointmentService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createAppointment', () => {
    it('should create an appointment if no overlap', async () => {
      const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow
      const mockService = { id: 's1', name: 'Маникюр', durationMinutes: 60, priceRub: 1500, isActive: true };
      const mockMaster = { id: 'm1', name: 'Анна', isActive: true, workingHours: JSON.stringify({'1': {from: '00:00', to: '23:59'}, '2': {from: '00:00', to: '23:59'}, '3': {from: '00:00', to: '23:59'}, '4': {from: '00:00', to: '23:59'}, '5': {from: '00:00', to: '23:59'}, '6': {from: '00:00', to: '23:59'}, '7': {from: '00:00', to: '23:59'}}), services: [{ id: 's1' }] };

      prisma.client.findUnique.mockResolvedValue({ id: 'c1', isBlocked: false });
      prisma.service.findUnique.mockResolvedValue(mockService);
      prisma.master.findUnique.mockResolvedValue(mockMaster);
      prisma.appointment.findFirst.mockResolvedValue(null); // No overlap
      
      const mockAppt = { id: 'a1', clientId: 'c1', masterId: 'm1', serviceId: 's1', startsAt };
      prisma.appointment.create.mockResolvedValue(mockAppt);

      const result = await createAppointment('c1', 'm1', 's1', startsAt);

      expect(prisma.appointment.create).toHaveBeenCalled();
      expect(result).toEqual(mockAppt);
    });

    it('should throw an error if service is not found', async () => {
      const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      prisma.client.findUnique.mockResolvedValue({ id: 'c1', isBlocked: false });
      prisma.service.findUnique.mockResolvedValue(null);
      await expect(createAppointment('c1', 'm1', 's1', startsAt)).rejects.toThrow('Услуга не найдена или неактивна');
    });

    it('should throw an error if master does not provide the service', async () => {
      const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      prisma.client.findUnique.mockResolvedValue({ id: 'c1', isBlocked: false });
      const mockService = { id: 's1', isActive: true, durationMinutes: 60, priceRub: 100 };
      const mockMaster = { id: 'm1', isActive: true, workingHours: '{}', services: [{ id: 's2' }] };
      prisma.service.findUnique.mockResolvedValue(mockService);
      prisma.master.findUnique.mockResolvedValue(mockMaster);

      await expect(createAppointment('c1', 'm1', 's1', startsAt)).rejects.toThrow('Мастер не оказывает эту услугу');
    });

    it('should throw an error if there is a scheduling conflict', async () => {
      const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      prisma.client.findUnique.mockResolvedValue({ id: 'c1', isBlocked: false });
      const mockService = { id: 's1', durationMinutes: 60, priceRub: 1500, isActive: true };
      const mockMaster = { id: 'm1', isActive: true, workingHours: JSON.stringify({'1': {from: '00:00', to: '23:59'}, '2': {from: '00:00', to: '23:59'}, '3': {from: '00:00', to: '23:59'}, '4': {from: '00:00', to: '23:59'}, '5': {from: '00:00', to: '23:59'}, '6': {from: '00:00', to: '23:59'}, '7': {from: '00:00', to: '23:59'}}), services: [{ id: 's1' }] };

      prisma.service.findUnique.mockResolvedValue(mockService);
      prisma.master.findUnique.mockResolvedValue(mockMaster);
      prisma.appointment.findFirst.mockResolvedValue({ id: 'a2' }); // Overlap exists

      await expect(createAppointment('c1', 'm1', 's1', startsAt)).rejects.toThrow('Выбранное время уже занято другой записью');
    });
  });
});
