const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();

// Безопасность и логи
app.use(helmet({ contentSecurityPolicy: false })); // отключаем CSP для простоты фронта
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Раздача статики (фронтенд)
app.use(express.static(path.join(__dirname, '../web')));

app.use('/api/auth', require('./routes/auth-api'));
app.use('/api/resources', require('./routes/resource-api'));
app.use('/api/bookings', require('./routes/booking-api'));
app.use('/api/admin', require('./routes/admin-api'));
app.use('/api/admin/audit', require('./routes/audit-api'));

// Проверка работоспособности (Health Check)
app.get('/health/live', (req, res) => res.status(200).send('OK'));
app.get('/health/ready', async (req, res) => {
    try {
        const db = require('./database');
        await db.query('SELECT 1');
        res.status(200).send('OK');
    } catch (err) {
        res.status(503).send('DB Unavailable');
    }
});

// Глобальный обработчик ошибок
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Внутренняя ошибка сервера', message: err.message });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
})