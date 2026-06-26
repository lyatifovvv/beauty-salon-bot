import { PrismaClient, Master } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Валидация структуры рабочих часов мастера (I11)
 */
export function validateWorkingHours(workingHours: any): boolean {
  if (typeof workingHours !== 'object' || workingHours === null || Array.isArray(workingHours)) {
    return false;
  }

  // Проверяем дни с 1 (Понедельник) по 7 (Воскресенье)
  for (let day = 1; day <= 7; day++) {
    const dayStr = day.toString();
    const schedule = workingHours[dayStr];
    if (schedule !== undefined) {
      if (schedule === null) {
        continue; // Выходной
      }
      if (typeof schedule !== 'object' || typeof schedule.from !== 'string' || typeof schedule.to !== 'string') {
        return false;
      }
      // Проверка формата HH:MM
      const timeRegex = /^([0-1]\d|2[0-3]):[0-5]\d$/;
      if (!timeRegex.test(schedule.from) || !timeRegex.test(schedule.to)) {
        return false;
      }
      if (schedule.from >= schedule.to) {
        return false; // Время начала должно быть раньше окончания
      }
    }
  }
  return true;
}

/**
 * Создание мастера
 */
export async function createMaster(
  name: string,
  workingHours: any,
  serviceIds: string[] = [],
  photoUrl?: string | null
): Promise<Master> {
  if (!name || name.trim().length === 0) {
    throw new Error('Имя мастера не может быть пустым');
  }

  if (!validateWorkingHours(workingHours)) {
    throw new Error('Некорректный формат рабочих часов (I11)');
  }

  return prisma.master.create({
    data: {
      name,
      workingHours: JSON.stringify(workingHours), // Сохраняем как JSON-строку
      photoUrl: photoUrl || null,
      services: {
        connect: serviceIds.map(id => ({ id }))
      }
    }
  });
}

/**
 * Редактирование мастера (I11)
 */
export async function updateMaster(
  id: string,
  data: {
    name?: string;
    workingHours?: any;
    serviceIds?: string[];
    photoUrl?: string | null;
    isActive?: boolean;
    vacationFrom?: Date | null;
    vacationTo?: Date | null;
  }
): Promise<Master> {
  const master = await prisma.master.findUnique({
    where: { id }
  });
  if (!master) {
    throw new Error('Мастер не найден');
  }

  const updateData: any = {};

  if (data.name !== undefined) {
    if (data.name.trim().length === 0) {
      throw new Error('Имя мастера не может быть пустым');
    }
    updateData.name = data.name;
  }

  if (data.workingHours !== undefined) {
    if (!validateWorkingHours(data.workingHours)) {
      throw new Error('Некорректный формат рабочих часов (I11)');
    }
    updateData.workingHours = JSON.stringify(data.workingHours); // Сохраняем как JSON-строку
  }

  if (data.photoUrl !== undefined) {
    updateData.photoUrl = data.photoUrl;
  }

  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive;
  }

  if (data.vacationFrom !== undefined) {
    updateData.vacationFrom = data.vacationFrom;
  }
  if (data.vacationTo !== undefined) {
    updateData.vacationTo = data.vacationTo;
  }

  if (data.serviceIds !== undefined) {
    updateData.services = {
      set: data.serviceIds.map(id => ({ id }))
    };
  }

  return prisma.master.update({
    where: { id },
    data: updateData
  });
}

/**
 * Получить список мастеров
 */
export async function listMasters(onlyActive = true): Promise<Master[]> {
  return prisma.master.findMany({
    where: onlyActive ? { isActive: true } : {},
    include: { services: true },
    orderBy: { name: 'asc' }
  });
}

/**
 * Получить мастера по ID
 */
export async function getMasterById(id: string) {
  return prisma.master.findUnique({
    where: { id },
    include: { services: true }
  });
}
