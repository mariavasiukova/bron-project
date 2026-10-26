const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyToken, isAdmin } = require('../middleware/security');

// 1. Все записи с фильтрами
router.get('/bookings', verifyToken, isAdmin, async (req, res) => {
    const { status, date } = req.query;
    let query = `
    SELECT b.*, r.name as resource_name, u.username 
    FROM bookings b
    JOIN resources r ON b.resource_id = r.id
    JOIN users u ON b.user_id = u.id
    WHERE 1=1
  `;
    const params = [];

    if (status) {
        params.push(status);
        query += ` AND b.status = $${params.length}`;
    }
    if (date) {
        params.push(date);
        query += ` AND b.start_time::date = $${params.length}::date`;
    }

    query += ' ORDER BY b.start_time DESC';

    try {
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения всех броней' });
    }
});

// 2. Отмена чужой брони с причиной (для админа)
router.post('/bookings/:id/cancel', verifyToken, isAdmin, async (req, res) => {
    const { reason } = req.body;
    if (!reason || reason.trim() === '') {
        return res.status(400).json({ error: 'Причина отмены обязательна для администратора' });
    }

    try {
        const result = await db.query(`
      UPDATE bookings 
      SET status = 'cancelled', cancellation_reason = $1, cancelled_by = $2, cancelled_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND status = 'active'
      RETURNING *
    `, [reason, req.user.id, req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Активная бронь не найдена' });
        }

        // Аудит
        await db.query(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
      VALUES ($1, 'ADMIN_CANCEL', 'booking', $2, $3)
    `, [req.user.id, req.params.id, `Админ отменил бронь. Причина: ${reason}`]);

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка отмены' });
    }
});

module.exports = router;