import { PrismaClient } from '@prisma/client';
import { validateAppointmentCreation, BOOKING_LEAD_HOURS } from '../appointmentService';
import { addHours, addDays } from 'date-fns';

jest.mock('@prisma/client', () => {
  const mockPrisma = {
    client: { findUnique: jest.fn() },
    service: { findUnique: jest.fn() },
    master: { findUnique: jest.fn() },
    appointment: { findFirst: jest.fn(), findMany: jest.fn() }
  };
  return { 
    PrismaClient: jest.fn(() => mockPrisma) 
  };
});

const mPrismaClient = new PrismaClient() as any;

describe('appointmentService Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validClientId = 'client_1';
  const validMasterId = 'master_1';
  const validServiceId = 'service_1';

  // Вспомогательная функция для генерации валидного времени (завтра)
  const getValidStartTime = () => {
    const time = addDays(new Date(), 1);
    time.setHours(12, 0, 0, 0);
    return time;
  };

  it('должен возвращать ошибку, если клиент заблокирован (I8)', async () => {
    mPrismaClient.client.findUnique.mockResolvedValue({ isBlocked: true });
    
    const result = await validateAppointmentCreation(
      validClientId, validMasterId, validServiceId, getValidStartTime()
    );
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('заблокирован');
  });

  it('должен возвращать ошибку, если мастер в отпуске (I2)', async () => {
    mPrismaClient.client.findUnique.mockResolvedValue({ isBlocked: false });
    mPrismaClient.service.findUnique.mockResolvedValue({ id: validServiceId, isActive: true, durationMinutes: 60 });
    
    const startTime = getValidStartTime();
    const vacStart = addDays(startTime, -1);
    const vacEnd = addDays(startTime, 1);

    mPrismaClient.master.findUnique.mockResolvedValue({ 
      id: validMasterId, 
      isActive: true, 
      vacationFrom: vacStart,
      vacationTo: vacEnd,
      services: [{ id: validServiceId }]
    });

    const result = await validateAppointmentCreation(
      validClientId, validMasterId, validServiceId, startTime
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('отпуске');
  });

  it('должен возвращать ошибку при записи раньше минимального времени (I5)', async () => {
    mPrismaClient.client.findUnique.mockResolvedValue({ isBlocked: false });
    mPrismaClient.service.findUnique.mockResolvedValue({ id: validServiceId, isActive: true, durationMinutes: 60 });
    mPrismaClient.master.findUnique.mockResolvedValue({ 
      id: validMasterId, 
      isActive: true, 
      services: [{ id: validServiceId }]
    });

    // Запись через 1 час от текущего момента
    const startTime = addHours(new Date(), 1);

    const result = await validateAppointmentCreation(
      validClientId, validMasterId, validServiceId, startTime
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toContain(`минимум за ${BOOKING_LEAD_HOURS} часа`);
  });

  it('должен возвращать ошибку, если время занято (I1)', async () => {
    mPrismaClient.client.findUnique.mockResolvedValue({ isBlocked: false });
    mPrismaClient.service.findUnique.mockResolvedValue({ id: validServiceId, isActive: true, durationMinutes: 60, priceRub: 1000 });
    
    // Мастер работает каждый день с 10:00 до 20:00
    const workingHours = {
      '1': { from: '10:00', to: '20:00' },
      '2': { from: '10:00', to: '20:00' },
      '3': { from: '10:00', to: '20:00' },
      '4': { from: '10:00', to: '20:00' },
      '5': { from: '10:00', to: '20:00' },
      '6': { from: '10:00', to: '20:00' },
      '7': { from: '10:00', to: '20:00' },
    };

    mPrismaClient.master.findUnique.mockResolvedValue({ 
      id: validMasterId, 
      isActive: true, 
      workingHours: JSON.stringify(workingHours),
      services: [{ id: validServiceId }]
    });

    // Мокаем, что уже есть overlapping appointment
    mPrismaClient.appointment.findFirst.mockResolvedValue({ id: 'app_1' });

    const startTime = getValidStartTime();
    const result = await validateAppointmentCreation(
      validClientId, validMasterId, validServiceId, startTime
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('уже занято');
  });

  it('должен проходить валидацию при соблюдении всех условий', async () => {
    mPrismaClient.client.findUnique.mockResolvedValue({ isBlocked: false });
    mPrismaClient.service.findUnique.mockResolvedValue({ id: validServiceId, isActive: true, durationMinutes: 60, priceRub: 1000 });
    
    // Мастер работает каждый день с 10:00 до 20:00
    const workingHours = {
      '1': { from: '10:00', to: '20:00' },
      '2': { from: '10:00', to: '20:00' },
      '3': { from: '10:00', to: '20:00' },
      '4': { from: '10:00', to: '20:00' },
      '5': { from: '10:00', to: '20:00' },
      '6': { from: '10:00', to: '20:00' },
      '7': { from: '10:00', to: '20:00' },
    };

    mPrismaClient.master.findUnique.mockResolvedValue({ 
      id: validMasterId, 
      isActive: true, 
      workingHours: JSON.stringify(workingHours),
      services: [{ id: validServiceId }]
    });

    // Мокаем, что overlapping appointment нет
    mPrismaClient.appointment.findFirst.mockResolvedValue(null);

    const startTime = getValidStartTime();
    const result = await validateAppointmentCreation(
      validClientId, validMasterId, validServiceId, startTime
    );

    expect(result.valid).toBe(true);
    expect(result.priceRubSnapshot).toBe(1000);
  });
});
