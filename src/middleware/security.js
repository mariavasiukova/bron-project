const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET = process.env.JWT_SECRET;
console.log("СЕКРЕТНЫЙ КЛЮЧ ПРИ ПРОВЕРКЕ:", SECRET);

// Проверка токена
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация (нет токена)' });
    }

    jwt.verify(token, SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Недействительный или истекший токен' });
        }
        req.user = decoded; // { id, username, role }
        next();
    });
}

// Проверка на администратора
function isAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Доступ запрещен (требуются права администратора)' });
    }
}

module.exports = { verifyToken, isAdmin };