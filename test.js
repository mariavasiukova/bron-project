const axios = require('axios');

async function testIdempotency() {
    console.log('--- ТЕСТ ИДЕМПОТЕНТНОСТИ (двойное нажатие) ---');

    const login = await axios.post('http://localhost:8080/api/auth/login', { username: 'ivan', password: 'user123' });
    const token = login.data.token;

    const body = {
        resourceId: 6,
        startTime: "2026-11-07T12:00:00+03:00",
        endTime: "2026-11-07T13:00:00+03:00",
        purpose: "Двойной клик"
    };

    const sendRequest = (key) => {
        return axios.post('http://localhost:8080/api/bookings', body, {
            headers: { 'Authorization': `Bearer ${token}`, 'Idempotency-Key': key }
        }).then(res => ({ status: res.status, id: res.data.id }))
            .catch(err => ({ status: err.response?.status, error: err.response?.data?.error }));
    };

    // Отправляем ДВА одинаковых запроса с ОДНИМ ключом
    console.log('1-й клик...');
    const res1 = await sendRequest('idem-key-777');
    console.log(`Статус: ${res1.status}, ID брони: ${res1.id}`);

    console.log('2-й клик (тот же ключ)...');
    const res2 = await sendRequest('idem-key-777');
    console.log(`Статус: ${res2.status}, ID брони: ${res2.id}`);

    if (res1.id === res2.id) {
        console.log('\nУСПЕХ: ID совпадают! Дубликата нет.');
    } else {
        console.log('\nОШИБКА: Создался дубликат!');
    }
}

testIdempotency();