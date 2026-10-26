const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
require('dotenv').config();

const SECRET = process.env.JWT_SECRET;
const EXPIRES = process.env.JWT_EXPIRES || '1h';

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Укажите логин и пароль' });

    try {
        const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ error: 'Неверный логин или пароль' });

        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) return res.status(401).json({ error: 'Неверный логин или пароль' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: EXPIRES });
        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера при входе' });
    }
});

router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || password.length < 6) {
        return res.status(400).json({ error: 'Логин и пароль (мин. 6 символов) обязательны' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await db.query(
            'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
            [username, hash, 'user']
        );

        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: EXPIRES });
        res.status(201).json({ token, user });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
        res.status(500).json({ error: 'Ошибка регистрации' });
    }
});

module.exports = router;