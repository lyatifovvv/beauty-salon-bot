import { PrismaClient, Service } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Создание новой услуги
 */
export async function createService(
  name: string,
  durationMinutes: number,
  priceRub: number
): Promise<Service> {
  if (!name || name.trim().length === 0) {
    throw new Error('Название услуги не может быть пустым');
  }

  if (durationMinutes <= 0 || durationMinutes % 15 !== 0) {
    throw new Error('Длительность услуги должна быть кратна 15 минутам (I11)');
  }

  if (priceRub < 0) {
    throw new Error('Цена услуги не может быть отрицательной');
  }

  return prisma.service.create({
    data: {
      name,
      durationMinutes,
      priceRub,
      isActive: true
    }
  });
}

/**
 * Обновление услуги (I11)
 */
export async function updateService(
  id: string,
  data: {
    name?: string;
    durationMinutes?: number;
    priceRub?: number;
    isActive?: boolean;
  }
): Promise<Service> {
  const service = await prisma.service.findUnique({
    where: { id }
  });
  if (!service) {
    throw new Error('Услуга не найдена');
  }

  const updateData: any = {};

  if (data.name !== undefined) {
    if (data.name.trim().length === 0) {
      throw new Error('Название услуги не может быть пустым');
    }
    updateData.name = data.name;
  }

  if (data.durationMinutes !== undefined) {
    if (data.durationMinutes <= 0 || data.durationMinutes % 15 !== 0) {
      throw new Error('Длительность услуги должна быть кратна 15 минутам (I11)');
    }
    updateData.durationMinutes = data.durationMinutes;
  }

  if (data.priceRub !== undefined) {
    if (data.priceRub < 0) {
      throw new Error('Цена услуги не может быть отрицательной');
    }
    updateData.priceRub = data.priceRub;
  }

  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive;
  }

  return prisma.service.update({
    where: { id },
    data: updateData
  });
}

/**
 * Получить список всех услуг
 */
export async function listServices(onlyActive = true): Promise<Service[]> {
  return prisma.service.findMany({
    where: onlyActive ? { isActive: true } : {},
    orderBy: { name: 'asc' }
  });
}

/**
 * Получить услугу по ID
 */
export async function getServiceById(id: string): Promise<Service | null> {
  return prisma.service.findUnique({
    where: { id }
  });
}
