// api/auth.js - обработчик авторизации
module.exports = async (req, res) => {
  // Разрешаем CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Обработка OPTIONS запроса
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Твоя логика авторизации
  if (req.method === 'POST') {
    const { username, password } = req.body;
    
    // Здесь проверка с Supabase
    res.setHeader('Content-Type', 'application/json');
    res.json({ 
      success: true, 
      message: 'Авторизация успешна',
      user: { username }
    });
  }
};