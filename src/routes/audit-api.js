const express = require('express');
const router = express.Router();
const db = require('../database');
const { verifyToken, isAdmin } = require('../middleware/security');

router.get('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const result = await db.query(`
      SELECT a.*, u.username 
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 100
    `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения аудита' });
    }
});

module.exports = router;