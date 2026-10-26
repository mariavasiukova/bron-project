const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function seed() {
  try {
    console.log('Начинаем заполнение базы...');

    const adminPass = await bcrypt.hash('admin123', 10);
    const userPass = await bcrypt.hash('user123', 10);

    await pool.query(`
      INSERT INTO users (username, password_hash, role) 
      VALUES 
        ('admin', $1, 'admin'),
        ('ivan', $2, 'user'),
        ('maria', $2, 'user')
      ON CONFLICT (username) DO NOTHING;
    `, [adminPass, userPass]);

    // 2. Создаем ресурсы (переговорные комнаты) - 10 штук
    await pool.query(`
      INSERT INTO resources (name, description, location, is_active)
      VALUES 
        ('Переговорная "Альфа"', 'Комната на 6 человек, есть проектор', 'Корпус А, 2 этаж', true),
        ('Переговорная "Бета"', 'Комната на 4 человека, есть маркерная доска', 'Корпус А, 2 этаж', true),
        ('Переговорная "Гамма"', 'Большой зал на 12 человек, видеоконференцсвязь', 'Корпус Б, 1 этаж', true),
        ('Аудитория 301', 'Учебная аудитория с компьютерами', 'Корпус В, 3 этаж', true),
        ('Лаборатория робототехники', 'Стенды и оборудование', 'Корпус Г, 1 этаж', false),
        ('Переговорная "Дельта"', 'Уютная комната на 3 человека', 'Корпус А, 1 этаж', true),
        ('Аудитория 402', 'Лекционный зал на 30 человек', 'Корпус В, 4 этаж', true),
        ('Коворкинг "Зона"', 'Открытое пространство для работы', 'Корпус Б, 2 этаж', true),
        ('Студия звукозаписи', 'Оборудованная студия', 'Корпус Д, 1 этаж', true),
        ('Кабинет "Тихо"', 'Маленькая комната для переговоров', 'Корпус А, 3 этаж', true)
      ON CONFLICT DO NOTHING;
    `);

    console.log('База успешно заполнена!');
    console.log('Админ: admin / admin123');
    console.log('Пользователи: ivan / user123, maria / user123');
  } catch (err) {
    console.error('Ошибка при заполнении:', err);
  } finally {
    await pool.end();
  }
}

seed();