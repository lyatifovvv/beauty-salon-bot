import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Запуск сидинга базы данных...');

  // 1. Очистка старых данных (каскадно)
  await prisma.appointment.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.master.deleteMany({});
  await prisma.service.deleteMany({});
  await prisma.adminSession.deleteMany({});

  // 2. Создание тестовой услуги
  const manicure = await prisma.service.create({
    data: {
      name: 'Классический маникюр',
      durationMinutes: 60,
      priceRub: 1500,
      isActive: true,
    },
  });
  console.log(`Создана услуга: ${manicure.name} (ID: ${manicure.id})`);

  const pedicure = await prisma.service.create({
    data: {
      name: 'Аппаратный педикюр',
      durationMinutes: 90,
      priceRub: 2200,
      isActive: true,
    },
  });
  console.log(`Создана услуга: ${pedicure.name} (ID: ${pedicure.id})`);

  // 3. Создание тестового мастера
  // Рабочие часы: Пн-Пт с 10:00 до 19:00 (1-5 дни недели)
  const defaultWorkingHours = {
    "1": { "from": "10:00", "to": "19:00" },
    "2": { "from": "10:00", "to": "19:00" },
    "3": { "from": "10:00", "to": "19:00" },
    "4": { "from": "10:00", "to": "19:00" },
    "5": { "from": "10:00", "to": "19:00" },
    "6": null, // выходной
    "7": null  // выходной
  };

  const testMaster = await prisma.master.create({
    data: {
      name: 'Екатерина (Мастер ногтевого сервиса)',
      isActive: true,
      workingHours: JSON.stringify(defaultWorkingHours),
      services: {
        connect: [
          { id: manicure.id },
          { id: pedicure.id },
        ],
      },
    },
  });
  console.log(`Создан мастер: ${testMaster.name} (ID: ${testMaster.id})`);

  console.log('Сидинг базы данных успешно завершен!');
}

main()
  .catch((e) => {
    console.error('Ошибка сидинга базы данных:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
