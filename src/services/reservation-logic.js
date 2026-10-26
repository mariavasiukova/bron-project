const db = require('../database');

async function createBooking({ userId, resourceId, startTime, endTime, purpose, idempotencyKey }) {
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // 1. ИДЕМПОТЕНТНОСТЬ
        const idemCheck = await client.query(
            'SELECT booking_id FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2',
            [userId, idempotencyKey]
        );
        if (idemCheck.rows.length > 0) {
            const existingBooking = await client.query('SELECT * FROM bookings WHERE id = $1', [idemCheck.rows[0].booking_id]);
            await client.query('COMMIT');
            return { status: 'success', data: existingBooking.rows[0], idempotent: true };
        }

        // 2. ВАЛИДАЦИЯ ВРЕМЕНИ (Шаг 11)
        const start = new Date(startTime);
        const end = new Date(endTime);
        const now = new Date();

        if (start < now) {
            await client.query('ROLLBACK');
            return { status: 'error', code: 400, message: 'Нельзя бронировать в прошлом' };
        }
        const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        if (start > maxDate) {
            await client.query('ROLLBACK');
            return { status: 'error', code: 400, message: 'Нельзя бронировать более чем за 30 суток' };
        }

        // Перевод в МСК (UTC+3) для проверки часов
        const startMsk = new Date(start.getTime() + 3 * 60 * 60 * 1000);
        const endMsk = new Date(end.getTime() + 3 * 60 * 60 * 1000);

        const startHour = startMsk.getUTCHours();
        const startMin = startMsk.getUTCMinutes();
        const endHour = endMsk.getUTCHours();
        const endMin = endMsk.getUTCMinutes();

        if (startHour < 8) {
            await client.query('ROLLBACK');
            return { status: 'error', code: 400, message: 'Ресурсы доступны с 08:00 МСК' };
        }
        if (endHour > 22 || (endHour === 22 && endMin > 0)) {
            await client.query('ROLLBACK');
            return { status: 'error', code: 400, message: 'Ресурсы доступны до 22:00 МСК' };
        }
        if (startMsk.getUTCDate() !== endMsk.getUTCDate()) {
            await client.query('ROLLBACK');
            return { status: 'error', code: 400, message: 'Бронирование должно быть в пределах одного дня' };
        }
        if (startMin % 30 !== 0 || endMin % 30 !== 0) {
            await client.query('ROLLBACK');
            return { status: 'error', code: 400, message: 'Время должно быть кратно 30 минутам' };
        }

        const durationMin = (end - start) / (1000 * 60);
        if (durationMin < 30) {
            await client.query('ROLLBACK');
            return { status: 'error', code: 400, message: 'Минимальная продолжительность — 30 минут' };
        }
        if (durationMin > 240) {
            await client.query('ROLLBACK');
            return { status: 'error', code: 400, message: 'Максимальная продолжительность — 4 часа' };
        }

        // 3. БЛОКИРОВКА РЕСУРСА
        const resourceRes = await client.query('SELECT * FROM resources WHERE id = $1 FOR UPDATE', [resourceId]);
        if (resourceRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { status: 'error', code: 404, message: 'Ресурс не найден' };
        }
        if (!resourceRes.rows[0].is_active) {
            await client.query('ROLLBACK');
            return { status: 'error', code: 400, message: 'Ресурс отключен для новых бронирований' };
        }

        // 4. ПРОВЕРКА КОНФЛИКТОВ
        const conflictRes = await client.query(`
      SELECT id FROM bookings 
      WHERE resource_id = $1 
        AND status = 'active' 
        AND start_time < $3 
        AND end_time > $2
    `, [resourceId, startTime, endTime]);

        if (conflictRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return { status: 'error', code: 409, message: 'Ресурс уже занят в выбранное время' };
        }

        // 5. СОЗДАНИЕ
        const insertRes = await client.query(`
      INSERT INTO bookings (resource_id, user_id, start_time, end_time, purpose, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      RETURNING *
    `, [resourceId, userId, startTime, endTime, purpose]);

        const newBooking = insertRes.rows[0];

        await client.query(
            'INSERT INTO idempotency_keys (user_id, idempotency_key, booking_id) VALUES ($1, $2, $3)',
            [userId, idempotencyKey, newBooking.id]
        );

        await client.query('COMMIT');
        return { status: 'success', data: newBooking };

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка транзакции:', err);
        return { status: 'error', code: 500, message: 'Ошибка сервера при создании брони' };
    } finally {
        client.release();
    }
}

module.exports = { createBooking };