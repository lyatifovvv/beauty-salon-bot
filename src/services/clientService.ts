import { PrismaClient, Client } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Валидация номера телефона (I6: +7XXXXXXXXXX)
 */
export function validatePhone(phone: string): boolean {
  return /^\+7\d{10}$/.test(phone);
}

/**
 * Регистрация или обновление клиента
 */
export async function registerClient(
  telegramId: number | bigint,
  name: string,
  phone: string
): Promise<Client> {
  if (!name || name.trim().length === 0) {
    throw new Error('Имя не может быть пустым');
  }

  if (!validatePhone(phone)) {
    throw new Error('Неверный формат телефона. Требуется формат: +7XXXXXXXXXX (I6)');
  }

  const tgIdBig = BigInt(telegramId);

  // Ищем клиента по telegramId (I8)
  const existingClient = await prisma.client.findUnique({
    where: { telegramId: tgIdBig }
  });

  if (existingClient) {
    if (existingClient.isBlocked) {
      throw new Error('Ваш аккаунт заблокирован');
    }
    // Если клиент существует, обновляем имя и телефон
    return prisma.client.update({
      where: { telegramId: tgIdBig },
      data: { name, phone }
    });
  }

  // Создаем нового клиента
  return prisma.client.create({
    data: {
      telegramId: tgIdBig,
      name,
      phone
    }
  });
}

/**
 * Получение клиента по Telegram ID
 */
export async function getClientByTelegramId(telegramId: number | bigint): Promise<Client | null> {
  return prisma.client.findUnique({
    where: { telegramId: BigInt(telegramId) }
  });
}

/**
 * Редактирование клиента администратором (I11)
 */
export async function updateClientByAdmin(
  id: string,
  data: {
    name?: string;
    phone?: string;
    isBlocked?: boolean;
  }
): Promise<Client> {
  const client = await prisma.client.findUnique({
    where: { id }
  });
  if (!client) {
    throw new Error('Клиент не найден');
  }

  const updateData: any = {};

  if (data.name !== undefined) {
    if (data.name.trim().length === 0) {
      throw new Error('Имя клиента не может быть пустым');
    }
    updateData.name = data.name;
  }

  if (data.phone !== undefined) {
    if (!validatePhone(data.phone)) {
      throw new Error('Неверный формат телефона. Требуется формат: +7XXXXXXXXXX (I6)');
    }
    updateData.phone = data.phone;
  }

  if (data.isBlocked !== undefined) {
    updateData.isBlocked = data.isBlocked;
  }

  return prisma.client.update({
    where: { id },
    data: updateData
  });
}

/**
 * Получить список всех клиентов
 */
export async function listClients(): Promise<Client[]> {
  return prisma.client.findMany({
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Обновление профиля клиента по Telegram ID
 */
export async function updateClientProfile(
  telegramId: number | bigint,
  data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
  }
): Promise<Client> {
  const tgIdBig = BigInt(telegramId);
  const client = await prisma.client.findUnique({
    where: { telegramId: tgIdBig }
  });
  if (!client) {
    throw new Error('Клиент не найден');
  }

  const updateData: any = {};

  if (data.firstName !== undefined || data.lastName !== undefined) {
    // Разбиваем текущее имя по пробелам
    const parts = client.name.trim().split(/\s+/);
    const currentFirstName = parts[0] || '';
    const currentLastName = parts.slice(1).join(' ') || '';

    const newFirstName = data.firstName !== undefined ? data.firstName.trim() : currentFirstName;
    const newLastName = data.lastName !== undefined ? data.lastName.trim() : currentLastName;

    if (newFirstName.length === 0) {
      throw new Error('Имя не может быть пустым');
    }

    updateData.name = `${newFirstName} ${newLastName}`.trim();
  }

  if (data.phone !== undefined) {
    if (!validatePhone(data.phone)) {
      throw new Error('Неверный формат телефона. Требуется формат: +7XXXXXXXXXX (I6)');
    }
    updateData.phone = data.phone;
  }

  return prisma.client.update({
    where: { telegramId: tgIdBig },
    data: updateData
  });
}
