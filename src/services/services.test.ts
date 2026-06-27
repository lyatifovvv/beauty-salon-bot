import { validatePhone, updateClientProfile } from './clientService';
import { addPortfolioItem, deletePortfolioItem, listPortfolioItems, checkPortfolioLimit } from './portfolioService';
import { validateWorkingHours } from './masterService';
import { validateAppointmentCreation } from './appointmentService';
import { intersectHours, getSalonConfig, updateSalonConfig } from './salonService';
import { PrismaClient } from '@prisma/client';

// Мокаем весь модуль @prisma/client
jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    client: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    service: {
      findUnique: jest.fn(),
    },
    master: {
      findUnique: jest.fn(),
    },
    appointment: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    portfolioItem: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mPrismaClient)
  };
});

const prisma = new PrismaClient() as any;

describe('Валидация телефона (I6)', () => {
  test('должна возвращать true для корректных номеров', () => {
    expect(validatePhone('+79991234567')).toBe(true);
    expect(validatePhone('+79000000000')).toBe(true);
  });

  test('должна возвращать false для некорректных номеров', () => {
    expect(validatePhone('89991234567')).toBe(false);
    expect(validatePhone('+7999123456')).toBe(false); // мало цифр
    expect(validatePhone('+799912345678')).toBe(false); // много цифр
    expect(validatePhone('phone')).toBe(false);
  });
});

describe('Валидация рабочих часов мастера (I11)', () => {
  test('должна подтверждать корректный формат рабочих часов', () => {
    const validSchedule = {
      "1": { "from": "10:00", "to": "19:00" },
      "2": { "from": "10:00", "to": "19:00" },
      "6": null,
      "7": null
    };
    expect(validateWorkingHours(validSchedule)).toBe(true);
  });

  test('должна отклонять некорректные форматы', () => {
    // Неверное время начала/окончания
    expect(validateWorkingHours({ "1": { "from": "20:00", "to": "19:00" } })).toBe(false);
    // Неверный формат времени
    expect(validateWorkingHours({ "1": { "from": "9:00", "to": "19:00" } })).toBe(false);
    // Не объект
    expect(validateWorkingHours("schedule")).toBe(false);
  });
});

describe('Валидация создания записи (I1, I2, I3, I5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('должна отклонять запись к заблокированному клиенту (I8)', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'client-1', isBlocked: true });
    
    const result = await validateAppointmentCreation('client-1', 'master-1', 'service-1', new Date());
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('заблокирован');
  });

  test('должна отклонять запись на неактивную услугу (I2)', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'client-1', isBlocked: false });
    prisma.service.findUnique.mockResolvedValue({ id: 'service-1', isActive: false });

    const result = await validateAppointmentCreation('client-1', 'master-1', 'service-1', new Date());
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('неактивна');
  });

  test('должна отклонять запись к мастеру, находящемуся в отпуске (I2)', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'client-1', isBlocked: false });
    prisma.service.findUnique.mockResolvedValue({ id: 'service-1', isActive: true, priceRub: 1500, durationMinutes: 60 });
    
    // Мастер в отпуске с 20 по 25 число
    prisma.master.findUnique.mockResolvedValue({
      id: 'master-1',
      isActive: true,
      services: [{ id: 'service-1' }],
      vacationFrom: new Date('2026-06-20T00:00:00Z'),
      vacationTo: new Date('2026-06-25T23:59:59Z'),
      workingHours: JSON.stringify({
        "1": { "from": "10:00", "to": "19:00" },
        "6": null,
        "7": null
      })
    });

    const checkDate = new Date('2026-06-22T12:00:00+03:00'); // Понедельник во время отпуска
    const result = await validateAppointmentCreation('client-1', 'master-1', 'service-1', checkDate);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('в отпуске');
  });

  test('должна разрешать запись на свободный слот в рабочие часы', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'client-1', isBlocked: false });
    prisma.service.findUnique.mockResolvedValue({ id: 'service-1', isActive: true, priceRub: 1500, durationMinutes: 60 });
    
    prisma.master.findUnique.mockResolvedValue({
      id: 'master-1',
      isActive: true,
      services: [{ id: 'service-1' }],
      vacationFrom: null,
      vacationTo: null,
      workingHours: JSON.stringify({
        "1": { "from": "10:00", "to": "19:00" },
        "6": null,
        "7": null
      })
    });

    prisma.appointment.findFirst.mockResolvedValue(null); // нет наложений

    const checkDate = new Date();
    // Находим следующий понедельник (1)
    const currentDay = checkDate.getDay();
    const distance = (1 - currentDay + 7) % 7;
    const daysToAdd = distance === 0 ? 7 : distance;
    checkDate.setDate(checkDate.getDate() + daysToAdd);
    checkDate.setHours(12, 0, 0, 0);

    const result = await validateAppointmentCreation('client-1', 'master-1', 'service-1', checkDate);
    
    expect(result.valid).toBe(true);
    expect(result.priceRubSnapshot).toBe(1500);
  });
});

describe('Сервис салона (SalonService)', () => {
  test('intersectHours корректно пересекает часы мастера и салона', () => {
    // Сохраняем исходный конфиг
    const originalConfig = { ...getSalonConfig() };
    
    try {
      // Устанавливаем тестовый конфиг
      updateSalonConfig({
        workingHours: {
          "1": { "from": "10:00", "to": "21:00" },
          "2": null,
          "3": { "from": "10:00", "to": "21:00" },
          "4": { "from": "10:00", "to": "21:00" },
          "5": { "from": "10:00", "to": "21:00" },
          "6": { "from": "10:00", "to": "21:00" },
          "7": { "from": "10:00", "to": "21:00" }
        }
      });
      
      // Пн (1) - салон 10:00-21:00. Мастер 09:00-18:00. Пересечение: 10:00-18:00
      expect(intersectHours({ from: '09:00', to: '18:00' }, '1')).toEqual({ from: '10:00', to: '18:00' });
      
      // Пн (1) - салон 10:00-21:00. Мастер 12:00-22:00. Пересечение: 12:00-21:00
      expect(intersectHours({ from: '12:00', to: '22:00' }, '1')).toEqual({ from: '12:00', to: '21:00' });
      
      // Вт (2) - салон выходной. Мастер 10:00-18:00. Пересечение: null
      expect(intersectHours({ from: '10:00', to: '18:00' }, '2')).toBeNull();
      
      // Пн (1) - салон 10:00-21:00. Мастер выходной (null). Пересечение: null
      expect(intersectHours(null, '1')).toBeNull();
    } finally {
      // Восстанавливаем исходный конфиг
      updateSalonConfig(originalConfig);
    }
  });
});

describe('Редактирование профиля клиента (updateClientProfile)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('должна корректно обновлять имя и сохранять существующую фамилию', async () => {
    prisma.client.findUnique.mockResolvedValue({
      id: 'client-1',
      telegramId: BigInt(12345),
      name: 'Иван Иванов',
      phone: '+79991112233'
    });

    prisma.client.update.mockResolvedValue({
      id: 'client-1',
      telegramId: BigInt(12345),
      name: 'Петр Иванов',
      phone: '+79991112233'
    });

    const result = await updateClientProfile(12345, { firstName: 'Петр' });
    
    expect(prisma.client.findUnique).toHaveBeenCalledWith({
      where: { telegramId: BigInt(12345) }
    });
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { telegramId: BigInt(12345) },
      data: { name: 'Петр Иванов' }
    });
    expect(result.name).toBe('Петр Иванов');
  });

  test('должна корректно обновлять фамилию и сохранять существующее имя', async () => {
    prisma.client.findUnique.mockResolvedValue({
      id: 'client-1',
      telegramId: BigInt(12345),
      name: 'Иван Иванов',
      phone: '+79991112233'
    });

    prisma.client.update.mockResolvedValue({
      id: 'client-1',
      telegramId: BigInt(12345),
      name: 'Иван Сергеев',
      phone: '+79991112233'
    });

    const result = await updateClientProfile(12345, { lastName: 'Сергеев' });
    
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { telegramId: BigInt(12345) },
      data: { name: 'Иван Сергеев' }
    });
    expect(result.name).toBe('Иван Сергеев');
  });

  test('должна выбрасывать ошибку, если имя становится пустым', async () => {
    prisma.client.findUnique.mockResolvedValue({
      id: 'client-1',
      telegramId: BigInt(12345),
      name: 'Иван',
      phone: '+79991112233'
    });

    await expect(updateClientProfile(12345, { firstName: '' })).rejects.toThrow('Имя не может быть пустым');
  });

  test('должна обновлять и валидировать номер телефона', async () => {
    prisma.client.findUnique.mockResolvedValue({
      id: 'client-1',
      telegramId: BigInt(12345),
      name: 'Иван Иванов',
      phone: '+79991112233'
    });

    prisma.client.update.mockResolvedValue({
      id: 'client-1',
      telegramId: BigInt(12345),
      name: 'Иван Иванов',
      phone: '+79999999999'
    });

    const result = await updateClientProfile(12345, { phone: '+79999999999' });
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { telegramId: BigInt(12345) },
      data: { phone: '+79999999999' }
    });
    expect(result.phone).toBe('+79999999999');

    // Неверный формат
    await expect(updateClientProfile(12345, { phone: '12345' })).rejects.toThrow('Неверный формат телефона');
  });
});

describe('Сервис портфолио (portfolioService)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('addPortfolioItem должен корректно сохранять фото или видео в БД', async () => {
    prisma.portfolioItem.create.mockResolvedValue({
      id: 'port-1',
      fileId: 'file-123',
      mediaType: 'photo',
      description: 'Красивая прическа',
      masterId: 'master-123'
    });

    const result = await addPortfolioItem('file-123', 'photo', 'Красивая прическа', 'master-123');

    expect(prisma.portfolioItem.create).toHaveBeenCalledWith({
      data: {
        fileId: 'file-123',
        mediaType: 'photo',
        description: 'Красивая прическа',
        masterId: 'master-123',
        groupId: null
      }
    });
    expect(result.id).toBe('port-1');
    expect(result.mediaType).toBe('photo');
  });

  test('addPortfolioItem должен выбрасывать ошибку при неверном типе медиа', async () => {
    await expect(addPortfolioItem('file-123', 'audio' as any)).rejects.toThrow('Некорректный тип медиа');
  });

  test('deletePortfolioItem должен удалять существующую работу из БД', async () => {
    const mockItem = {
      id: 'port-1',
      fileId: 'file-123',
      mediaType: 'video'
    };

    prisma.portfolioItem.findFirst.mockResolvedValue(mockItem);
    prisma.portfolioItem.delete.mockResolvedValue(mockItem);

    await deletePortfolioItem('port-1');
    expect(prisma.portfolioItem.delete).toHaveBeenCalledWith({
      where: { id: 'port-1' }
    });
  });

  test('deletePortfolioItem должен выбрасывать ошибку, если работа не найдена', async () => {
    prisma.portfolioItem.findFirst.mockResolvedValue(null);
    await expect(deletePortfolioItem('invalid')).rejects.toThrow('Работа не найдена');
  });

  test('listPortfolioItems должен запрашивать список с лимитом 100', async () => {
    prisma.portfolioItem.findMany.mockResolvedValue([
      { id: 'port-1', fileId: 'file-1', mediaType: 'photo', createdAt: new Date() }
    ]);

    const result = await listPortfolioItems();

    expect(prisma.portfolioItem.findMany).toHaveBeenCalledWith({
      where: {},
      include: {
        master: {
          select: {
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    expect(result).toHaveLength(1);
  });

  test('checkPortfolioLimit должен возвращать canAdd=false, если лимит (50) превышен, и canAdd=true в противном случае', async () => {
    prisma.portfolioItem.count.mockResolvedValue(48);
    const resultOver = await checkPortfolioLimit('master-1', 3);
    expect(resultOver.canAdd).toBe(false);
    expect(resultOver.count).toBe(48);
    expect(prisma.portfolioItem.count).toHaveBeenCalledWith({
      where: { masterId: 'master-1' }
    });

    prisma.portfolioItem.count.mockResolvedValue(48);
    const resultOk = await checkPortfolioLimit('master-1', 2);
    expect(resultOk.canAdd).toBe(true);

    prisma.portfolioItem.count.mockResolvedValue(49);
    const resultGeneralOver = await checkPortfolioLimit(undefined, 2);
    expect(resultGeneralOver.canAdd).toBe(false);
    expect(prisma.portfolioItem.count).toHaveBeenCalledWith({
      where: { masterId: null }
    });
  });
});

