const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyToken } = require('../middleware/security');
const { createBooking } = require('../services/reservation-logic');

// 1. Создание бронирования
router.post('/', verifyToken, async (req, res) => {
    const { resourceId, startTime, endTime, purpose } = req.body;
    const userId = req.user.id; // Берем из токена, а не из тела запроса!

    // Валидация полей
    if (!resourceId || !startTime || !endTime || !purpose) {
        return res.status(400).json({ error: 'Все поля (resourceId, startTime, endTime, purpose) обязательны' });
    }
    if (purpose.length < 5 || purpose.length > 300) {
        return res.status(400).json({ error: 'Цель должна быть от 5 до 300 символов' });
    }
    if (new Date(startTime) >= new Date(endTime)) {
        return res.status(400).json({ error: 'Время окончания должно быть позже времени начала' });
    }

    // Получаем ключ идемпотентности из заголовка
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
        return res.status(400).json({ error: 'Заголовок Idempotency-Key обязателен' });
    }

    // Вызываем сервис
    const result = await createBooking({
        userId,
        resourceId,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        purpose,
        idempotencyKey
    });

    if (result.status === 'error') {
        return res.status(result.code).json({ error: result.message });
    }

    // Если это повторный запрос, вернем 200, если новый — 201
    res.status(result.idempotent ? 200 : 201).json(result.data);
});

// 2. Мои бронирования
router.get('/my', verifyToken, async (req, res) => {
    try {
        const result = await db.query(`
      SELECT b.*, r.name as resource_name 
      FROM bookings b
      JOIN resources r ON b.resource_id = r.id
      WHERE b.user_id = $1
      ORDER BY b.start_time DESC
    `, [req.user.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения списка броней' });
    }
});

// 3. Просмотр конкретной брони (только своей или админом)
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const result = await db.query(`
      SELECT b.*, r.name as resource_name 
      FROM bookings b
      JOIN resources r ON b.resource_id = r.id
      WHERE b.id = $1
    `, [req.params.id]);

        if (result.rows.length === 0) return res.status(404).json({ error: 'Бронь не найдена' });

        const booking = result.rows[0];
        // Проверка прав: админ или владелец
        if (req.user.role !== 'admin' && booking.user_id !== req.user.id) {
            return res.status(404).json({ error: 'Бронь не найдена' }); // Скрываем существование
        }
        res.json(booking);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения брони' });
    }
});

// 4. Отмена брони
router.post('/:id/cancel', verifyToken, async (req, res) => {
    const { reason } = req.body;
    const bookingId = req.params.id;

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const bookingRes = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Бронь не найдена' });
        }

        const booking = bookingRes.rows[0];

        // Проверка прав
        if (req.user.role !== 'admin' && booking.user_id !== req.user.id) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Бронь не найдена' });
        }

        if (booking.status === 'cancelled') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Бронь уже отменена' });
        }

        // Проверка времени: отменять можно только будущие брони
        if (new Date(booking.start_time) <= new Date()) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Нельзя отменить начавшуюся или завершенную бронь' });
        }

        // Админ ОБЯЗАН указать причину
        if (req.user.role === 'admin' && (!reason || reason.trim() === '')) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Администратор должен указать причину отмены' });
        }

        // Отменяем
        const cancelRes = await client.query(`
      UPDATE bookings 
      SET status = 'cancelled', cancellation_reason = $1, cancelled_by = $2, cancelled_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [reason || null, req.user.id, bookingId]);

        // Аудит
        await client.query(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES ($1, 'CANCEL_BOOKING', 'booking', $2, $3)
    `, [req.user.id, bookingId, `Отменена бронь #${bookingId}. Причина: ${reason || 'без причины'}`]);

        await client.query('COMMIT');
        res.json(cancelRes.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Ошибка отмены' });
    } finally {
        client.release();
    }
});

module.exports = router;