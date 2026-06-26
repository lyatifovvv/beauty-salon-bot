import * as fs from 'fs';
import * as path from 'path';

export interface SalonConfig {
  name: string;
  address: string;
  phone: string;
  howToGet: string;
  rules: string;
  workingHours: Record<string, { from: string; to: string } | null>;
}

const CONFIG_PATH = path.join(process.cwd(), 'salon_config.json');

const DEFAULT_CONFIG: SalonConfig = {
  name: 'Sebastian',
  address: 'г. Москва, ул. Красивая, д. 10 (вход со двора, код на двери *45К*)',
  phone: '+7 (999) 111-22-33',
  howToGet: '5 минут пешком от метро «Цветной бульвар». Выйдя из метро, поверните направо, пройдите до перекрестка и заверните во двор за кофейней.',
  rules: 'Пожалуйста, приходи за 5-10 минут до начала визита. Если планы изменятся, отменить запись можно не позднее чем за 3 часа.',
  workingHours: {
    "1": { "from": "10:00", "to": "21:00" },
    "2": { "from": "10:00", "to": "21:00" },
    "3": { "from": "10:00", "to": "21:00" },
    "4": { "from": "10:00", "to": "21:00" },
    "5": { "from": "10:00", "to": "21:00" },
    "6": { "from": "10:00", "to": "21:00" },
    "7": { "from": "10:00", "to": "21:00" }
  }
};

let cachedConfig: SalonConfig | null = null;

export function getSalonConfig(): SalonConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      cachedConfig = JSON.parse(data);
      return cachedConfig!;
    }
  } catch (err) {
    console.error('Ошибка чтения конфигурации салона:', err);
  }

  // Если файла нет или ошибка, сохраняем дефолтный
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  } catch (err) {
    console.error('Ошибка записи дефолтной конфигурации салона:', err);
  }
  cachedConfig = DEFAULT_CONFIG;
  return cachedConfig;
}

export function updateSalonConfig(data: Partial<SalonConfig>): SalonConfig {
  const current = getSalonConfig();
  const updated = { ...current, ...data };
  
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.error('Ошибка обновления конфигурации салона:', err);
  }
  
  cachedConfig = updated;
  return updated;
}

/**
 * Пересечение часов мастера с графиком работы салона на выбранный день
 */
export function intersectHours(
  masterHours: { from: string; to: string } | null,
  day: string
): { from: string; to: string } | null {
  if (!masterHours) return null;

  const config = getSalonConfig();
  const salonHours = config.workingHours[day];
  if (!salonHours) return null; // Салон выходной -> мастер тоже выходной

  // Вычисляем пересечение интервалов
  const from = masterHours.from > salonHours.from ? masterHours.from : salonHours.from;
  const to = masterHours.to < salonHours.to ? masterHours.to : salonHours.to;

  if (from >= to) {
    return null; // Нет пересечения
  }

  return { from, to };
}
