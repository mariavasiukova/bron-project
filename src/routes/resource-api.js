const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyToken } = require('../middleware/security');

// 1. Каталог активных ресурсов (доступен всем)
router.get('/', async (req, res) => {
    try {
        const { search, location } = req.query;
        let query = 'SELECT * FROM resources WHERE is_active = true';
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            query += ` AND name ILIKE $${params.length}`;
        }
        if (location) {
            params.push(`%${location}%`);
            query += ` AND location ILIKE $${params.length}`;
        }

        query += ' ORDER BY id ASC';
        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения списка ресурсов' });
    }
});

// 2. Карточка ресурса (доступна всем)
router.get('/:id', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM resources WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ресурс не найден' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения ресурса' });
    }
});

// 3. Занятые интервалы на дату (доступно всем, без чужих данных)
router.get('/:id/availability', async (req, res) => {
    const { date } = req.query; // формат YYYY-MM-DD
    if (!date) {
        return res.status(400).json({ error: 'Укажите дату в параметре ?date=YYYY-MM-DD' });
    }

    try {
        // Ищем активные брони на этот день для этого ресурса
        const result = await db.query(`
      SELECT start_time, end_time 
      FROM bookings 
      WHERE resource_id = $1 
        AND status = 'active' 
        AND start_time::date = $2::date
      ORDER BY start_time ASC
    `, [req.params.id, date]);

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения занятых интервалов' });
    }
});

module.exports = router;