import { PrismaClient, PortfolioItem } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Добавление новой работы в портфолио
 */
export async function addPortfolioItem(
  fileId: string,
  mediaType: 'photo' | 'video',
  description?: string,
  masterId?: string,
  groupId?: string
): Promise<PortfolioItem> {
  if (!fileId) {
    throw new Error('ID файла не может быть пустым');
  }
  if (mediaType !== 'photo' && mediaType !== 'video') {
    throw new Error('Некорректный тип медиа. Допускается только photo или video');
  }

  return prisma.portfolioItem.create({
    data: {
      fileId,
      mediaType,
      description: description || null,
      masterId: masterId || null,
      groupId: groupId || null
    }
  });
}

/**
 * Удаление работы (или группы работ) из портфолио
 */
export async function deletePortfolioItem(idOrGroupId: string): Promise<void> {
  const item = await prisma.portfolioItem.findFirst({
    where: {
      OR: [
        { id: idOrGroupId },
        { groupId: idOrGroupId }
      ]
    }
  });

  if (!item) {
    throw new Error('Работа не найдена');
  }

  if (item.groupId) {
    await prisma.portfolioItem.deleteMany({ where: { groupId: item.groupId } });
  } else {
    await prisma.portfolioItem.delete({ where: { id: item.id } });
  }
}

export interface PortfolioGroup {
  id: string; // groupId или id первого элемента
  description: string | null;
  masterId: string | null;
  master: { name: string } | null;
  createdAt: Date;
  media: { id: string; fileId: string; mediaType: string }[];
}

/**
 * Получение списка последних работ (сгруппированных)
 * Если передан masterId, фильтрует по мастеру
 */
export async function listPortfolioItems(masterId?: string): Promise<PortfolioGroup[]> {
  const where: any = {};
  if (masterId) {
    where.masterId = masterId;
  }

  const items = await prisma.portfolioItem.findMany({
    where,
    include: {
      master: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 100 // Увеличено для получения большего количества записей
  });

  const groupsMap = new Map<string, PortfolioGroup>();
  const result: PortfolioGroup[] = [];
  const legacyKeyToId = new Map<string, string>();

  for (const item of items) {
    let key = item.groupId;
    if (!key) {
      const timeKey = Math.floor(item.createdAt.getTime() / 10000);
      const legacyKey = `legacy_${item.masterId || 'none'}_${item.description || 'none'}_${timeKey}`;
      
      if (!legacyKeyToId.has(legacyKey)) {
        legacyKeyToId.set(legacyKey, item.id);
      }
      key = legacyKeyToId.get(legacyKey)!;
    }

    if (!groupsMap.has(key)) {
      const group: PortfolioGroup = {
        id: key,
        description: item.description,
        masterId: item.masterId,
        master: (item as any).master,
        createdAt: item.createdAt,
        media: []
      };
      groupsMap.set(key, group);
      result.push(group);
    }
    groupsMap.get(key)!.media.push({
      id: item.id,
      fileId: item.fileId,
      mediaType: item.mediaType
    });
  }

  // Ограничиваем количество возвращаемых ГРУПП (например, 15)
  return result.slice(0, 15);
}

/**
 * Проверка лимита на количество работ в портфолио (макс. 50)
 * Возвращает объект с данными о лимите
 */
export async function checkPortfolioLimit(masterId?: string, batchSize: number = 1): Promise<{ canAdd: boolean, count: number, limit: number }> {
  const where: any = {
    masterId: masterId || null
  };

  const count = await prisma.portfolioItem.count({ where });
  const limit = 50;
  return {
    canAdd: (count + batchSize) <= limit,
    count,
    limit
  };
}
