// Конфигурация
const SUPABASE_URL = 'https://lpoaqliycyuhvdrwuyxj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_uxkhuA-ngwjNjfaZdHCs7Q_FXOQRrSD';
const EDGE_FUNCTION_URL = 'https://lpoaqliycyuhvdrwuyxj.supabase.co/functions/v1/rapid-handler';

// Глобальные переменные
let auth = {
    currentUser: null,
    isAuthenticated: false,
    userRole: null
};

let selectedClientType = null;
let trainingInProgress = false;
let chatMessages = [];
let currentTrainingStart = null;
let dailySessionsUsed = 0;
const DAILY_LIMIT = 5;
let currentExportFormat = 'pdf';
let currentReportType = 'excel';
let currentChatForExport = null;

// Типы клиентов
const clientTypes = {
    aggressive: { 
        name: "Агрессивный", 
        icon: "😠",
        description: "Клиент выражает гнев, может быть грубым"
    },
    passive: { 
        name: "Пассивный", 
        icon: "😔",
        description: "Клиент говорит тихо, нерешительно"
    },
    demanding: { 
        name: "Требовательный", 
        icon: "🧐",
        description: "Клиент требует детали, задает много вопросов"
    },
    indecisive: { 
        name: "Нерешительный", 
        icon: "🤔",
        description: "Клиент сомневается, часто меняет мнение"
    },
    chatty: { 
        name: "Славный малый", 
        icon: "😄",
        description: "Позитивный клиент, любит поболтать"
    }
};

// Уровни
const levels = [
    { level: 1, name: "Новичок", requiredXP: 0 },
    { level: 2, name: "Стажёр", requiredXP: 100 },
    { level: 3, name: "Специалист", requiredXP: 300 },
    { level: 4, name: "Эксперт", requiredXP: 600 },
    { level: 5, name: "Мастер", requiredXP: 1000 }
];

// ========== АВТОРИЗАЦИЯ ==========

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    checkAuthStatus();
    initEventListeners();
});

// Проверка статуса авторизации
function checkAuthStatus() {
    const userData = localStorage.getItem('dialogue_user');
    if (userData) {
        try {
            const user = JSON.parse(userData);
            auth.currentUser = user;
            auth.isAuthenticated = true;
            auth.userRole = user.role || 'user';
            showApp();
        } catch (e) {
            console.error('Ошибка загрузки пользователя:', e);
            showAuthModal();
        }
    } else {
        showAuthModal();
    }
}

// Показать окно авторизации
function showAuthModal() {
    document.getElementById('authModal').classList.add('active');
    document.getElementById('appContainer').style.display = 'none';
}

// Скрыть окно авторизации
function hideAuthModal() {
    document.getElementById('authModal').classList.remove('active');
}

// Показать приложение
function showApp() {
    hideAuthModal();
    document.getElementById('appContainer').style.display = 'block';
    updateUserInterface();
    loadUserInterface();
}

// Переключение форм
function showRegisterForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('resetPasswordForm').style.display = 'none';
    document.getElementById('trainerLoginForm').style.display = 'none';
}

function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('resetPasswordForm').style.display = 'none';
    document.getElementById('trainerLoginForm').style.display = 'none';
}

function showResetPasswordForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('resetPasswordForm').style.display = 'block';
    document.getElementById('trainerLoginForm').style.display = 'none';
}

function showTrainerLogin() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('resetPasswordForm').style.display = 'none';
    document.getElementById('trainerLoginForm').style.display = 'block';
}

// Переключение видимости пароля
function togglePassword(fieldId) {
    const field = document.getElementById(fieldId);
    const toggleBtn = field.parentNode.querySelector('.password-toggle i');
    
    if (field.type === 'password') {
        field.type = 'text';
        toggleBtn.className = 'fas fa-eye-slash';
    } else {
        field.type = 'password';
        toggleBtn.className = 'fas fa-eye';
    }
}

// Вход
async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorElement = document.getElementById('loginError');
    
    // Сброс ошибок
    errorElement.style.display = 'none';
    
    // Валидация
    if (!username || !password) {
        showError(errorElement, 'Заполните все поля');
        return;
    }
    
    // Симуляция запроса к серверу
    showLoading();
    
    try {
        // В реальном приложении здесь был бы запрос к серверу
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Демо-пользователи
        const demoUsers = {
            'студент': { role: 'user', group: 'ОПК', stats: { level: 2, xp: 150 } },
            'тренер': { role: 'trainer', group: 'Тренер', stats: { level: 5, xp: 1000 } }
        };
        
        if (!demoUsers[username.toLowerCase()] || password !== '123456') {
            throw new Error('Неверный логин или пароль');
        }
        
        const userData = demoUsers[username.toLowerCase()];
        const user = {
            id: Date.now().toString(),
            username: username,
            role: userData.role,
            group: userData.group,
            stats: userData.stats
        };
        
        auth.currentUser = user;
        auth.isAuthenticated = true;
        auth.userRole = user.role;
        
        // Сохраняем в localStorage
        localStorage.setItem('dialogue_user', JSON.stringify(user));
        
        // Показываем приложение
        showApp();
        
        // Показываем уведомление
        showNotification('success', 'Вход выполнен', `Добро пожаловать, ${username}!`);
        
    } catch (error) {
        showError(errorElement, error.message);
    } finally {
        hideLoading();
    }
}

// Регистрация
async function handleRegister() {
    const username = document.getElementById('registerUsername').value.trim();
    const group = document.getElementById('registerGroup').value;
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
    const errorElement = document.getElementById('passwordMatchError');
    
    errorElement.style.display = 'none';
    
    // Валидация
    if (!username || !group || !password || !passwordConfirm) {
        showError(errorElement, 'Заполните все поля');
        return;
    }
    
    if (username.length < 3) {
        showError(errorElement, 'Никнейм должен быть не менее 3 символов');
        return;
    }
    
    if (password.length < 6) {
        showError(errorElement, 'Пароль должен быть не менее 6 символов');
        return;
    }
    
    if (password !== passwordConfirm) {
        showError(errorElement, 'Пароли не совпадают');
        return;
    }
    
    showLoading();
    
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const user = {
            id: Date.now().toString(),
            username: username,
            role: 'user',
            group: group,
            stats: {
                level: 1,
                xp: 0,
                sessions: 0,
                avgScore: 0,
                achievements: []
            }
        };
        
        auth.currentUser = user;
        auth.isAuthenticated = true;
        auth.userRole = 'user';
        
        localStorage.setItem('dialogue_user', JSON.stringify(user));
        
        showApp();
        showNotification('success', 'Регистрация успешна', 'Теперь вы можете начать тренировки!');
        
    } catch (error) {
        showError(errorElement, 'Ошибка регистрации');
    } finally {
        hideLoading();
    }
}

// Сброс пароля
async function handleResetPassword() {
    const username = document.getElementById('resetUsername').value.trim();
    const newPassword = document.getElementById('resetNewPassword').value;
    const passwordConfirm = document.getElementById('resetPasswordConfirm').value;
    const errorElement = document.getElementById('resetPasswordError');
    
    errorElement.style.display = 'none';
    
    if (!username || !newPassword || !passwordConfirm) {
        showError(errorElement, 'Заполните все поля');
        return;
    }
    
    if (newPassword.length < 6) {
        showError(errorElement, 'Пароль должен быть не менее 6 символов');
        return;
    }
    
    if (newPassword !== passwordConfirm) {
        showError(errorElement, 'Пароли не совпадают');
        return;
    }
    
    showLoading();
    
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        showNotification('success', 'Пароль изменен', 'Теперь вы можете войти с новым паролем');
        showLoginForm();
        
    } catch (error) {
        showError(errorElement, 'Ошибка сброса пароля');
    } finally {
        hideLoading();
    }
}

// Вход тренера
async function handleTrainerLogin() {
    const username = document.getElementById('trainerUsername').value.trim();
    const password = document.getElementById('trainerPassword').value;
    const errorElement = document.getElementById('trainerLoginError');
    
    errorElement.style.display = 'none';
    
    if (!username || !password) {
        showError(errorElement, 'Заполните все поля');
        return;
    }
    
    showLoading();
    
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Демо-тренер
        if (username !== 'тренер' || password !== '123456') {
            throw new Error('Неверный логин тренера или пароль');
        }
        
        const user = {
            id: 'trainer_001',
            username: 'Тренер',
            role: 'trainer',
            group: 'Тренер',
            stats: { level: 5, xp: 1000 }
        };
        
        auth.currentUser = user;
        auth.isAuthenticated = true;
        auth.userRole = 'trainer';
        
        localStorage.setItem('dialogue_user', JSON.stringify(user));
        
        showApp();
        showNotification('success', 'Вход выполнен', 'Панель тренера загружена');
        
    } catch (error) {
        showError(errorElement, error.message);
    } finally {
        hideLoading();
    }
}

// Выход
function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        auth.currentUser = null;
        auth.isAuthenticated = false;
        auth.userRole = null;
        
        localStorage.removeItem('dialogue_user');
        
        showAuthModal();
        showNotification('info', 'Выход выполнен', 'Вы успешно вышли из системы');
    }
}

// ========== ИНТЕРФЕЙС ПОЛЬЗОВАТЕЛЯ ==========

// Обновление интерфейса пользователя
function updateUserInterface() {
    if (!auth.currentUser) return;
    
    const userName = document.getElementById('currentUserName');
    const userBadge = document.getElementById('userGroupBadge');
    const headerSubtitle = document.getElementById('headerSubtitle');
    
    userName.textContent = auth.currentUser.username;
    
    if (auth.userRole === 'trainer') {
        userBadge.textContent = 'Тренер';
        userBadge.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
        headerSubtitle.textContent = 'Панель управления тренировками';
    } else {
        userBadge.textContent = auth.currentUser.group || 'Ученик';
        userBadge.style.background = 'rgba(255, 255, 255, 0.2)';
        headerSubtitle.textContent = 'Тренировка работы с клиентами';
    }
}

// Загрузка интерфейса по роли
function loadUserInterface() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    
    // Очищаем
    sidebar.innerHTML = '';
    mainContent.innerHTML = '';
    
    if (auth.userRole === 'trainer') {
        loadTrainerInterface();
    } else {
        loadStudentInterface();
    }
}

// Интерфейс ученика
function loadStudentInterface() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    
    // Боковая панель
    sidebar.innerHTML = `
        <div class="nav-items">
            <a class="nav-item active" onclick="switchTab('dashboard')">
                <i class="fas fa-home"></i>
                <span>Главная</span>
            </a>
            <a class="nav-item" onclick="switchTab('training')">
                <i class="fas fa-dumbbell"></i>
                <span>Тренировка</span>
            </a>
            <a class="nav-item" onclick="switchTab('progress')">
                <i class="fas fa-chart-line"></i>
                <span>Прогресс</span>
            </a>
            <a class="nav-item" onclick="switchTab('leaderboard')">
                <i class="fas fa-trophy"></i>
                <span>Рейтинг</span>
            </a>
            <a class="nav-item" onclick="switchTab('achievements')">
                <i class="fas fa-medal"></i>
                <span>Достижения</span>
            </a>
            <a class="nav-item" onclick="switchTab('history')">
                <i class="fas fa-history"></i>
                <span>История</span>
            </a>
        </div>
    `;
    
    // Загружаем главную страницу
    loadDashboard();
}

// Интерфейс тренера
function loadTrainerInterface() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    
    // Боковая панель
    sidebar.innerHTML = `
        <div class="nav-items">
            <a class="nav-item active" onclick="switchTab('trainer_dashboard')">
                <i class="fas fa-chalkboard-teacher"></i>
                <span>Дашборд</span>
            </a>
            <a class="nav-item" onclick="switchTab('trainer_students')">
                <i class="fas fa-users"></i>
                <span>Ученики</span>
            </a>
            <a class="nav-item" onclick="switchTab('trainer_sessions')">
                <i class="fas fa-history"></i>
                <span>Тренировки</span>
            </a>
            <a class="nav-item" onclick="switchTab('trainer_reports')">
                <i class="fas fa-chart-bar"></i>
                <span>Отчеты</span>
            </a>
            <a class="nav-item" onclick="openReportModal()">
                <i class="fas fa-file-export"></i>
                <span>Экспорт</span>
            </a>
        </div>
    `;
    
    // Загружаем дашборд тренера
    loadTrainerDashboard();
}

// Переключение вкладок
function switchTab(tabName) {
    // Обновляем активную вкладку в сайдбаре
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    // Загружаем контент
    const mainContent = document.getElementById('mainContent');
    
    switch(tabName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'training':
            loadTrainingPage();
            break;
        case 'progress':
            loadProgressPage();
            break;
        case 'leaderboard':
            loadLeaderboardPage();
            break;
        case 'achievements':
            loadAchievementsPage();
            break;
        case 'history':
            loadHistoryPage();
            break;
        case 'trainer_dashboard':
            loadTrainerDashboard();
            break;
        case 'trainer_students':
            loadTrainerStudents();
            break;
        case 'trainer_sessions':
            loadTrainerSessions();
            break;
        case 'trainer_reports':
            loadTrainerReports();
            break;
    }
}

// ========== СТРАНИЦЫ УЧЕНИКА ==========

// Главная страница
function loadDashboard() {
    const mainContent = document.getElementById('mainContent');
    
    mainContent.innerHTML = `
        <div class="dashboard-panel">
            <div class="panel-header">
                <i class="fas fa-home"></i>
                <h2>Добро пожаловать, ${auth.currentUser.username}!</h2>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="value">${auth.currentUser.stats.level}</div>
                    <div class="label">Уровень</div>
                </div>
                <div class="stat-card">
                    <div class="value">${auth.currentUser.stats.xp}</div>
                    <div class="label">Опыт</div>
                </div>
                <div class="stat-card">
                    <div class="value">${dailySessionsUsed}/${DAILY_LIMIT}</div>
                    <div class="label">Тренировок сегодня</div>
                </div>
                <div class="stat-card">
                    <div class="value">${auth.currentUser.stats.avgScore || '0.0'}</div>
                    <div class="label">Средний балл</div>
                </div>
            </div>
            
            <div class="quick-actions">
                <h3 style="margin: 24px 0 16px 0; color: #2c3e50;">Быстрые действия</h3>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <button class="btn btn-primary" onclick="switchTab('training')">
                        <i class="fas fa-play-circle"></i> Начать тренировку
                    </button>
                    <button class="btn btn-secondary" onclick="switchTab('progress')">
                        <i class="fas fa-chart-line"></i> Посмотреть прогресс
                    </button>
                    <button class="btn btn-secondary" onclick="switchTab('history')">
                        <i class="fas fa-history"></i> История тренировок
                    </button>
                </div>
            </div>
            
            <div class="news-section" style="margin-top: 32px;">
                <h3 style="margin-bottom: 16px; color: #2c3e50;"><i class="fas fa-newspaper"></i> Новости тренажера</h3>
                <div class="news-item">
                    <div class="news-date">Сегодня</div>
                    <div class="news-content">
                        <h4>Добавлена система экспорта чатов</h4>
                        <p>Теперь вы можете скачивать свои диалоги в форматах PDF, TXT и HTML.</p>
                    </div>
                </div>
                <div class="news-item">
                    <div class="news-date">Вчера</div>
                    <div class="news-content">
                        <h4>Новый тип клиента</h4>
                        <p>Добавлен тип "Славный малый" для тренировки работы с позитивными клиентами.</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Страница тренировки
function loadTrainingPage() {
    const mainContent = document.getElementById('mainContent');
    
    mainContent.innerHTML = `
        <div class="training-section">
            <div class="client-types">
                <div class="panel-header">
                    <i class="fas fa-users"></i>
                    <h2>Выберите тип клиента</h2>
                </div>
                
                <div class="client-type-grid">
                    ${Object.entries(clientTypes).map(([key, type]) => `
                        <div class="client-type" onclick="selectClientType('${key}')">
                            <div class="client-icon">${type.icon}</div>
                            <div class="client-info">
                                <h4>${type.name}</h4>
                                <p>${type.description}</p>
                            </div>
                        </div>
                    `).join('')}
                    
                    <div class="client-type" onclick="selectRandomClient()">
                        <div class="client-icon">🎲</div>
                        <div class="client-info">
                            <h4>Случайный клиент</h4>
                            <p>Неизвестный тип - проверьте свои навыки</p>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 24px;">
                    <button class="btn btn-primary btn-block" id="startTrainingBtn" onclick="startTraining()" disabled>
                        <i class="fas fa-play"></i> Начать тренировку
                    </button>
                    <button class="btn btn-secondary btn-block" id="endTrainingBtn" onclick="finishTraining()" style="display: none; margin-top: 12px;">
                        <i class="fas fa-stop"></i> Завершить тренировку
                    </button>
                </div>
                
                <div style="margin-top: 24px; padding: 16px; background: #f8f9fa; border-radius: 12px;">
                    <h4 style="margin-bottom: 8px; color: #2c3e50;"><i class="fas fa-info-circle"></i> Информация</h4>
                    <p style="font-size: 14px; color: #6c757d; margin-bottom: 8px;">
                        <strong>Вертикаль:</strong> ${auth.currentUser.group}
                    </p>
                    <p style="font-size: 14px; color: #6c757d;">
                        <strong>Лимит:</strong> ${dailySessionsUsed}/${DAILY_LIMIT} тренировок в день
                    </p>
                </div>
            </div>
            
            <div class="chat-container">
                <div class="chat-header">
                    <div class="chat-title">Тренировочный чат</div>
                    <div class="chat-status" id="chatStatus">Ожидание начала</div>
                </div>
                
                <div class="chat-messages" id="trainingChat">
                    <div class="message ai">
                        Привет! Я готов к тренировке. Выберите тип клиента и нажмите "Начать тренировку".
                    </div>
                </div>
                
                <div class="chat-input-area">
                    <div class="chat-input-wrapper">
                        <textarea 
                            class="chat-input" 
                            id="trainingInput" 
                            placeholder="Введите ваше сообщение..." 
                            rows="2"
                            disabled
                        ></textarea>
                        <button class="send-btn" id="sendBtn" onclick="sendTrainingMessage()" disabled>
                            <i class="fas fa-paper-plane"></i> Отправить
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Страница прогресса
function loadProgressPage() {
    const mainContent = document.getElementById('mainContent');
    const stats = auth.currentUser.stats;
    
    mainContent.innerHTML = `
        <div class="dashboard-panel">
            <div class="panel-header">
                <i class="fas fa-chart-line"></i>
                <h2>Ваш прогресс</h2>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="value">${stats.level}</div>
                    <div class="label">Текущий уровень</div>
                </div>
                <div class="stat-card">
                    <div class="value">${stats.xp}</div>
                    <div class="label">Всего опыта</div>
                </div>
                <div class="stat-card">
                    <div class="value">${stats.sessions || 0}</div>
                    <div class="label">Тренировок</div>
                </div>
                <div class="stat-card">
                    <div class="value">${stats.avgScore || '0.0'}/5</div>
                    <div class="label">Средний балл</div>
                </div>
            </div>
            
            <div style="margin-top: 32px;">
                <h3 style="margin-bottom: 16px; color: #2c3e50;"><i class="fas fa-chart-bar"></i> Статистика по типам клиентов</h3>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 12px;">
                    <p style="color: #6c757d; text-align: center;">Здесь будет график вашей статистики</p>
                </div>
            </div>
            
            <div style="margin-top: 32px;">
                <h3 style="margin-bottom: 16px; color: #2c3e50;"><i class="fas fa-target"></i> Цели на этой неделе</h3>
                <div style="display: grid; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 8px;">
                        <span>Провести 5 тренировок</span>
                        <span style="color: #667eea; font-weight: 600;">${Math.min(3, 5)}/5</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 8px;">
                        <span>Получить средний балл 4.0+</span>
                        <span style="color: #667eea; font-weight: 600;">3.8/5</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8f9fa; border-radius: 8px;">
                        <span>Попробовать все типы клиентов</span>
                        <span style="color: #667eea; font-weight: 600;">3/5</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Страница рейтинга
function loadLeaderboardPage() {
    const mainContent = document.getElementById('mainContent');
    
    // Демо-данные рейтинга
    const demoLeaderboard = [
        { username: 'Алексей_П', group: 'ОПК', level: 5, xp: 1250, sessions: 42, avgScore: 4.8 },
        { username: 'Мария_К', group: 'Лояльность', level: 4, xp: 980, sessions: 35, avgScore: 4.6 },
        { username: 'Иван_С', group: 'Фудтех', level: 4, xp: 920, sessions: 38, avgScore: 4.5 },
        { username: auth.currentUser.username, group: auth.currentUser.group, level: auth.currentUser.stats.level, xp: auth.currentUser.stats.xp, sessions: auth.currentUser.stats.sessions || 0, avgScore: auth.currentUser.stats.avgScore || 0 },
        { username: 'Ольга_В', group: 'Маркет', level: 3, xp: 650, sessions: 28, avgScore: 4.2 },
        { username: 'Дмитрий_М', group: 'Аптека', level: 3, xp: 580, sessions: 25, avgScore: 4.1 },
        { username: 'Екатерина_Р', group: 'Сборка', level: 2, xp: 320, sessions: 18, avgScore: 3.9 },
        { username: 'Сергей_Т', group: 'ОПК', level: 2, xp: 280, sessions: 15, avgScore: 3.8 }
    ];
    
    // Сортируем по XP
    demoLeaderboard.sort((a, b) => b.xp - a.xp);
    
    mainContent.innerHTML = `
        <div class="leaderboard">
            <div class="panel-header">
                <i class="fas fa-trophy"></i>
                <h2>Рейтинг учеников</h2>
            </div>
            
            <div class="leaderboard-filters">
                <div class="filter-tab active" onclick="filterLeaderboard('all')">Все</div>
                <div class="filter-tab" onclick="filterLeaderboard('ОПК')">ОПК</div>
                <div class="filter-tab" onclick="filterLeaderboard('Лояльность')">Лояльность</div>
                <div class="filter-tab" onclick="filterLeaderboard('Фудтех')">Фудтех</div>
                <div class="filter-tab" onclick="filterLeaderboard('Маркет')">Маркет</div>
                <div class="filter-tab" onclick="filterLeaderboard('Аптека')">Аптека</div>
                <div class="filter-tab" onclick="filterLeaderboard('Сборка')">Сборка</div>
            </div>
            
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th class="rank">#</th>
                        <th>Ученик</th>
                        <th>Вертикаль</th>
                        <th>Уровень</th>
                        <th>Тренировок</th>
                        <th>Средний балл</th>
                        <th>Опыт</th>
                    </tr>
                </thead>
                <tbody id="leaderboardBody">
                    ${demoLeaderboard.map((user, index) => `
                        <tr class="${user.username === auth.currentUser.username ? 'current-user' : ''}">
                            <td class="rank ${index < 3 ? `rank-${index + 1}` : ''}">${index + 1}</td>
                            <td>${user.username} ${user.username === auth.currentUser.username ? '(Вы)' : ''}</td>
                            <td>${user.group}</td>
                            <td>${user.level}</td>
                            <td>${user.sessions}</td>
                            <td>${user.avgScore.toFixed(1)}</td>
                            <td>${user.xp}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Фильтрация рейтинга
function filterLeaderboard(filter) {
    // Обновляем активный фильтр
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // В реальном приложении здесь была бы фильтрация данных
    showNotification('info', 'Фильтр применен', `Показаны результаты для: ${filter === 'all' ? 'Все вертикали' : filter}`);
}

// Страница достижений
function loadAchievementsPage() {
    const mainContent = document.getElementById('mainContent');
    
    // Демо-достижения
    const achievements = [
        { id: 1, name: 'Первая кровь', icon: '🎯', description: 'Пройдите первую тренировку', earned: true },
        { id: 2, name: 'Быстрый старт', icon: '⚡', description: '3 тренировки за неделю', earned: true },
        { id: 3, name: 'Отличник', icon: '⭐', description: 'Получить оценку 5', earned: false },
        { id: 4, name: 'Универсал', icon: '🎭', description: 'Поработать со всеми типами клиентов', earned: false },
        { id: 5, name: 'Профессионал', icon: '👨‍💼', description: 'Средний балл 4.5+', earned: false },
        { id: 6, name: 'Мастер диалога', icon: '💬', description: 'Провести 50 тренировок', earned: false },
        { id: 7, name: 'Непрерывный рост', icon: '📈', description: '7 дней тренировок подряд', earned: false },
        { id: 8, name: 'Эксперт', icon: '🏆', description: 'Достигнуть 5 уровня', earned: false }
    ];
    
    mainContent.innerHTML = `
        <div class="dashboard-panel">
            <div class="panel-header">
                <i class="fas fa-medal"></i>
                <h2>Ваши достижения</h2>
            </div>
            
            <div style="margin: 24px 0;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                    <div style="font-size: 32px;">🏅</div>
                    <div>
                        <h3 style="color: #2c3e50; margin-bottom: 4px;">Прогресс</h3>
                        <p style="color: #6c757d;">${achievements.filter(a => a.earned).length} из ${achievements.length} достижений</p>
                    </div>
                </div>
                
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); height: 8px; border-radius: 4px; overflow: hidden;">
                    <div style="width: ${(achievements.filter(a => a.earned).length / achievements.length) * 100}%; height: 100%; background: white;"></div>
                </div>
            </div>
            
            <div class="achievements-grid">
                ${achievements.map(achievement => `
                    <div class="achievement-card ${achievement.earned ? 'earned' : ''}">
                        <div class="achievement-icon">${achievement.icon}</div>
                        <div class="achievement-name">${achievement.name}</div>
                        <div class="achievement-desc">${achievement.description}</div>
                        <div style="margin-top: 12px; font-size: 12px; color: ${achievement.earned ? '#4cd964' : '#ff9500'};">
                            ${achievement.earned ? '✅ Получено' : '🔒 Не получено'}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Страница истории
function loadHistoryPage() {
    const mainContent = document.getElementById('mainContent');
    
    // Демо-история
    const history = [
        { id: 1, date: '2024-01-15', clientType: 'Агрессивный', score: 4, duration: '5:20', xp: 50 },
        { id: 2, date: '2024-01-14', clientType: 'Требовательный', score: 5, duration: '7:45', xp: 75 },
        { id: 3, date: '2024-01-13', clientType: 'Пассивный', score: 3, duration: '4:10', xp: 40 },
        { id: 4, date: '2024-01-12', clientType: 'Нерешительный', score: 4, duration: '6:30', xp: 55 },
        { id: 5, date: '2024-01-11', clientType: 'Славный малый', score: 5, duration: '8:15', xp: 80 }
    ];
    
    mainContent.innerHTML = `
        <div class="dashboard-panel">
            <div class="panel-header">
                <i class="fas fa-history"></i>
                <h2>История тренировок</h2>
                <button class="btn btn-export" onclick="exportHistory()" style="margin-left: auto;">
                    <i class="fas fa-file-excel"></i> Экспорт истории
                </button>
            </div>
            
            <div class="history-list">
                ${history.map(session => `
                    <div class="history-item" onclick="viewChatHistory(${session.id})">
                        <div class="history-info">
                            <h4>${session.clientType} клиент</h4>
                            <p>${formatDate(session.date)} • ${session.duration}</p>
                        </div>
                        <div class="history-stats">
                            <div class="history-score">${session.score}/5</div>
                            <div style="color: #4cd964; font-weight: 600;">+${session.xp} XP</div>
                            <i class="fas fa-chevron-right" style="color: #6c757d;"></i>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            <div style="margin-top: 24px; text-align: center;">
                <p style="color: #6c757d; font-size: 14px;">
                    <i class="fas fa-info-circle"></i> История хранится 30 дней
                </p>
            </div>
        </div>
    `;
}

// ========== ТРЕНЕРСКИЙ ИНТЕРФЕЙС ==========

// Дашборд тренера
function loadTrainerDashboard() {
    const mainContent = document.getElementById('mainContent');
    
    mainContent.innerHTML = `
        <div class="dashboard-panel">
            <div class="panel-header">
                <i class="fas fa-chalkboard-teacher"></i>
                <h2>Панель тренера</h2>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="value">24</div>
                    <div class="label">Всего учеников</div>
                </div>
                <div class="stat-card">
                    <div class="value">156</div>
                    <div class="label">Тренировок</div>
                </div>
                <div class="stat-card">
                    <div class="value">4.3</div>
                    <div class="label">Средний балл</div>
                </div>
                <div class="stat-card">
                    <div class="value">12</div>
                    <div class="label">Активных сегодня</div>
                </div>
            </div>
            
            <div style="margin-top: 32px;">
                <h3 style="margin-bottom: 16px; color: #2c3e50;"><i class="fas fa-fire"></i> Последние активности</h3>
                <div class="history-list">
                    <div class="history-item">
                        <div class="history-info">
                            <h4>Алексей_П - Агрессивный клиент</h4>
                            <p>5 минут назад • 4/5</p>
                        </div>
                        <div class="history-stats">
                            <button class="btn btn-secondary btn-sm" onclick="viewStudentChat(1)">
                                <i class="fas fa-eye"></i> Просмотр
                            </button>
                        </div>
                    </div>
                    <div class="history-item">
                        <div class="history-info">
                            <h4>Мария_К - Требовательный клиент</h4>
                            <p>15 минут назад • 5/5</p>
                        </div>
                        <div class="history-stats">
                            <button class="btn btn-secondary btn-sm" onclick="viewStudentChat(2)">
                                <i class="fas fa-eye"></i> Просмотр
                            </button>
                        </div>
                    </div>
                    <div class="history-item">
                        <div class="history-info">
                            <h4>Иван_С - Славный малый</h4>
                            <p>30 минут назад • 4/5</p>
                        </div>
                        <div class="history-stats">
                            <button class="btn btn-secondary btn-sm" onclick="viewStudentChat(3)">
                                <i class="fas fa-eye"></i> Просмотр
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 32px; display: flex; gap: 12px;">
                <button class="btn btn-primary" onclick="switchTab('trainer_students')">
                    <i class="fas fa-users"></i> Все ученики
                </button>
                <button class="btn btn-secondary" onclick="openReportModal()">
                    <i class="fas fa-file-export"></i> Экспорт отчетов
                </button>
            </div>
        </div>
    `;
}

// Список учеников тренера
function loadTrainerStudents() {
    const mainContent = document.getElementById('mainContent');
    
    // Демо-ученики
    const demoStudents = [
        { id: 1, username: 'Алексей_П', group: 'ОПК', level: 5, sessions: 42, avgScore: 4.8, lastActive: 'Сегодня' },
        { id: 2, username: 'Мария_К', group: 'Лояльность', level: 4, sessions: 35, avgScore: 4.6, lastActive: 'Сегодня' },
        { id: 3, username: 'Иван_С', group: 'Фудтех', level: 4, sessions: 38, avgScore: 4.5, lastActive: 'Вчера' },
        { id: 4, username: 'Ольга_В', group: 'Маркет', level: 3, sessions: 28, avgScore: 4.2, lastActive: '2 дня назад' },
        { id: 5, username: 'Дмитрий_М', group: 'Аптека', level: 3, sessions: 25, avgScore: 4.1, lastActive: 'Сегодня' },
        { id: 6, username: 'Екатерина_Р', group: 'Сборка', level: 2, sessions: 18, avgScore: 3.9, lastActive: '3 дня назад' }
    ];
    
    mainContent.innerHTML = `
        <div class="dashboard-panel">
            <div class="panel-header">
                <i class="fas fa-users"></i>
                <h2>Все ученики</h2>
                <button class="btn btn-export" onclick="exportStudentsReport()" style="margin-left: auto;">
                    <i class="fas fa-file-excel"></i> Экспорт списка
                </button>
            </div>
            
            <div class="trainer-grid">
                ${demoStudents.map(student => `
                    <div class="student-card">
                        <div class="student-header">
                            <div class="student-name">${student.username}</div>
                            <div class="student-group">${student.group}</div>
                        </div>
                        
                        <div class="student-stats">
                            <div class="student-stat">
                                <div class="value">${student.level}</div>
                                <div class="label">Уровень</div>
                            </div>
                            <div class="student-stat">
                                <div class="value">${student.sessions}</div>
                                <div class="label">Тренировок</div>
                            </div>
                            <div class="student-stat">
                                <div class="value">${student.avgScore}</div>
                                <div class="label">Средний балл</div>
                            </div>
                        </div>
                        
                        <div style="margin: 16px 0; font-size: 13px; color: #6c757d;">
                            <i class="far fa-clock"></i> Активен: ${student.lastActive}
                        </div>
                        
                        <div class="trainer-actions">
                            <button class="btn btn-secondary btn-sm" onclick="viewStudentChat(${student.id})">
                                <i class="fas fa-eye"></i> Тренировки
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="addComment(${student.id})">
                                <i class="fas fa-comment"></i> Комментарий
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Тренировки учеников
function loadTrainerSessions() {
    const mainContent = document.getElementById('mainContent');
    
    mainContent.innerHTML = `
        <div class="dashboard-panel">
            <div class="panel-header">
                <i class="fas fa-history"></i>
                <h2>Все тренировки</h2>
                <div style="margin-left: auto; display: flex; gap: 12px;">
                    <select class="filter-select" style="min-width: 150px;">
                        <option>Все вертикали</option>
                        <option>ОПК</option>
                        <option>Лояльность</option>
                    </select>
                    <button class="btn btn-export" onclick="exportAllSessions()">
                        <i class="fas fa-download"></i> Экспорт
                    </button>
                </div>
            </div>
            
            <div class="history-list" style="max-height: 600px; overflow-y: auto;">
                ${Array.from({ length: 20 }, (_, i) => {
                    const students = ['Алексей_П', 'Мария_К', 'Иван_С', 'Ольга_В', 'Дмитрий_М'];
                    const types = Object.values(clientTypes);
                    const type = types[Math.floor(Math.random() * types.length)];
                    const score = Math.floor(Math.random() * 2) + 3; // 3-5
                    const date = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000);
                    
                    return `
                        <div class="history-item">
                            <div class="history-info">
                                <h4>${students[i % students.length]} - ${type.name}</h4>
                                <p>${formatDate(date.toISOString())} • Вертикаль: ${['ОПК', 'Лояльность', 'Фудтех'][i % 3]}</p>
                            </div>
                            <div class="history-stats">
                                <div class="history-score">${score}/5</div>
                                <div style="display: flex; gap: 8px;">
                                    <button class="btn btn-secondary btn-sm" onclick="viewStudentChat(${i + 1})">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    <button class="btn btn-export btn-sm" onclick="exportSingleSession(${i + 1})">
                                        <i class="fas fa-download"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// Отчеты тренера
function loadTrainerReports() {
    const mainContent = document.getElementById('mainContent');
    
    mainContent.innerHTML = `
        <div class="dashboard-panel">
            <div class="panel-header">
                <i class="fas fa-chart-bar"></i>
                <h2>Аналитика и отчеты</h2>
            </div>
            
            <div class="trainer-grid">
                <div class="student-card">
                    <div class="student-header">
                        <div class="student-name">Статистика по вертикалям</div>
                        <div class="student-group"><i class="fas fa-chart-pie"></i></div>
                    </div>
                    <div style="margin: 16px 0;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span>ОПК</span>
                            <span style="font-weight: 600;">42 тренировки</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span>Лояльность</span>
                            <span style="font-weight: 600;">35 тренировок</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span>Фудтех</span>
                            <span style="font-weight: 600;">38 тренировок</span>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block" onclick="exportVerticalStats()">
                        <i class="fas fa-download"></i> Экспорт отчета
                    </button>
                </div>
                
                <div class="student-card">
                    <div class="student-header">
                        <div class="student-name">Прогресс учеников</div>
                        <div class="student-group"><i class="fas fa-trending-up"></i></div>
                    </div>
                    <div style="margin: 16px 0;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span>Лучший прогресс</span>
                            <span style="color: #4cd964; font-weight: 600;">+24%</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span>Средний прогресс</span>
                            <span style="color: #ff9500; font-weight: 600;">+12%</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span>Требуют внимания</span>
                            <span style="color: #ff3b30; font-weight: 600;">3 ученика</span>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block" onclick="exportProgressReport()">
                        <i class="fas fa-download"></i> Экспорт отчета
                    </button>
                </div>
                
                <div class="student-card">
                    <div class="student-header">
                        <div class="student-name">Эффективность по типам</div>
                        <div class="student-group"><i class="fas fa-chart-bar"></i></div>
                    </div>
                    <div style="margin: 16px 0;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span>Агрессивный</span>
                            <span style="font-weight: 600;">4.2/5</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span>Требовательный</span>
                            <span style="font-weight: 600;">4.5/5</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span>Славный малый</span>
                            <span style="font-weight: 600;">4.8/5</span>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-block" onclick="exportTypeStats()">
                        <i class="fas fa-download"></i> Экспорт отчета
                    </button>
                </div>
            </div>
            
            <div style="margin-top: 32px; text-align: center;">
                <button class="btn btn-primary btn-lg" onclick="openReportModal()">
                    <i class="fas fa-file-export"></i> Расширенный экспорт отчетов
                </button>
            </div>
        </div>
    `;
}

// ========== ТРЕНИРОВКА ==========

// Выбор типа клиента
function selectClientType(type) {
    selectedClientType = type;
    
    // Сбрасываем выделение
    document.querySelectorAll('.client-type').forEach(el => {
        el.classList.remove('selected');
    });
    
    // Выделяем выбранный
    event.currentTarget.classList.add('selected');
    
    // Активируем кнопку начала
    document.getElementById('startTrainingBtn').disabled = false;
    
    // Обновляем статус
    const typeInfo = clientTypes[type];
    document.getElementById('chatStatus').textContent = `Выбран: ${typeInfo.name}`;
    
    // Добавляем сообщение в чат
    const chat = document.getElementById('trainingChat');
    chat.innerHTML = `
        <div class="message ai">
            Вы выбрали тренировку с <strong>${typeInfo.name} клиентом</strong>.
            <br>${typeInfo.description}
            <br><br>Нажмите "Начать тренировку", когда будете готовы.
        </div>
    `;
}

// Выбор случайного клиента
function selectRandomClient() {
    const types = Object.keys(clientTypes);
    const randomType = types[Math.floor(Math.random() * types.length)];
    selectClientType(randomType);
}

// Начало тренировки
function startTraining() {
    if (dailySessionsUsed >= DAILY_LIMIT) {
        showNotification('error', 'Лимит исчерпан', `Вы уже провели ${DAILY_LIMIT} тренировок сегодня. Завтра лимит обновится.`);
        return;
    }
    
    if (!selectedClientType) {
        showNotification('warning', 'Выберите тип клиента', 'Пожалуйста, выберите тип клиента для тренировки');
        return;
    }
    
    trainingInProgress = true;
    currentTrainingStart = new Date();
    chatMessages = [];
    
    // Обновляем интерфейс
    document.getElementById('startTrainingBtn').style.display = 'none';
    document.getElementById('endTrainingBtn').style.display = 'block';
    document.getElementById('trainingInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;
    document.getElementById('chatStatus').textContent = 'Тренировка активна';
    document.getElementById('chatStatus').style.background = '#d4edda';
    document.getElementById('chatStatus').style.color = '#155724';
    
    // Блокируем выбор типа клиента
    document.querySelectorAll('.client-type').forEach(el => {
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.6';
    });
    
    // Начинаем диалог
    const typeInfo = clientTypes[selectedClientType];
    const chat = document.getElementById('trainingChat');
    chat.innerHTML = '';
    
    // Первое сообщение от AI
    setTimeout(() => {
        addTrainingMessage('ai', `Здравствуйте! ${getClientGreeting(selectedClientType)}`);
    }, 500);
}

// Завершение тренировки
function finishTraining() {
    if (!trainingInProgress) return;
    
    trainingInProgress = false;
    const duration = Math.floor((new Date() - currentTrainingStart) / 1000);
    
    // Обновляем интерфейс
    document.getElementById('startTrainingBtn').style.display = 'block';
    document.getElementById('endTrainingBtn').style.display = 'none';
    document.getElementById('trainingInput').disabled = true;
    document.getElementById('sendBtn').disabled = true;
    document.getElementById('chatStatus').textContent = 'Тренировка завершена';
    document.getElementById('chatStatus').style.background = '#f8f9fa';
    document.getElementById('chatStatus').style.color = '#6c757d';
    
    // Разблокируем выбор типа клиента
    document.querySelectorAll('.client-type').forEach(el => {
        el.style.pointerEvents = 'auto';
        el.style.opacity = '1';
    });
    
    // Добавляем финальное сообщение
    addTrainingMessage('user', '[[ДИАЛОГ ЗАВЕРШЕН]]');
    
    // Оцениваем диалог
    setTimeout(() => {
        evaluateTraining(duration);
    }, 1000);
}

// Отправка сообщения в тренировке
function sendTrainingMessage() {
    const input = document.getElementById('trainingInput');
    const message = input.value.trim();
    
    if (!message || !trainingInProgress) return;
    
    // Добавляем сообщение пользователя
    addTrainingMessage('user', message);
    input.value = '';
    
    // Симуляция ответа AI
    setTimeout(() => {
        const aiResponse = getAIResponse(selectedClientType, message);
        addTrainingMessage('ai', aiResponse);
    }, 1000 + Math.random() * 2000);
}

// Добавление сообщения в тренировочный чат
function addTrainingMessage(sender, text) {
    const chat = document.getElementById('trainingChat');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.textContent = text;
    chat.appendChild(messageDiv);
    
    // Сохраняем сообщение
    chatMessages.push({ sender, text, time: new Date().toISOString() });
    
    // Прокручиваем вниз
    chat.scrollTop = chat.scrollHeight;
}

// Оценка тренировки
function evaluateTraining(duration) {
    // Генерация оценки
    const score = 3 + Math.random() * 2; // 3-5
    const xp = Math.floor(30 + score * 10 + Math.random() * 20);
    
    // Обновляем статистику пользователя
    dailySessionsUsed++;
    auth.currentUser.stats.xp += xp;
    auth.currentUser.stats.sessions = (auth.currentUser.stats.sessions || 0) + 1;
    
    // Пересчитываем уровень
    const newLevel = calculateLevel(auth.currentUser.stats.xp);
    if (newLevel > auth.currentUser.stats.level) {
        auth.currentUser.stats.level = newLevel;
    }
    
    // Сохраняем
    localStorage.setItem('dialogue_user', JSON.stringify(auth.currentUser));
    
    // Показываем результаты
    showResultModal(score, xp, duration);
    
    // Сохраняем чат для возможного экспорта
    currentChatForExport = {
        type: selectedClientType,
        score: score.toFixed(1),
        duration: formatDuration(duration),
        messages: [...chatMessages],
        date: new Date().toISOString(),
        xp: xp
    };
}

// Показать модальное окно результатов
function showResultModal(score, xp, duration) {
    const resultIcon = document.getElementById('resultIcon');
    const resultTitle = document.getElementById('resultTitle');
    const resultScore = document.getElementById('resultScore');
    const resultXP = document.getElementById('resultXP');
    const resultTime = document.getElementById('resultTime');
    const resultFeedback = document.getElementById('resultFeedback');
    
    // Обновляем данные
    resultScore.textContent = score.toFixed(1);
    resultXP.textContent = `+${xp}`;
    resultTime.textContent = formatDuration(duration);
    
    // Выбираем иконку и заголовок в зависимости от оценки
    if (score >= 4.5) {
        resultIcon.textContent = '🏆';
        resultTitle.textContent = 'Отличная работа!';
    } else if (score >= 4) {
        resultIcon.textContent = '⭐';
        resultTitle.textContent = 'Хороший результат!';
    } else {
        resultIcon.textContent = '📝';
        resultTitle.textContent = 'Неплохо, есть куда расти!';
    }
    
    // Генерация обратной связи
    const feedback = generateFeedback(score, selectedClientType);
    resultFeedback.innerHTML = feedback;
    
    // Показываем модальное окно
    document.getElementById('resultModal').classList.add('active');
}

// Закрыть модальное окно результатов
function closeResultModal() {
    document.getElementById('resultModal').classList.remove('active');
    
    // Обновляем интерфейс
    if (auth.userRole === 'trainer') {
        loadTrainerDashboard();
    } else {
        loadTrainingPage();
    }
}

// ========== ЭКСПОРТ ==========

// Открыть модальное окно экспорта
function openExportModal() {
    if (!currentChatForExport) {
        showNotification('warning', 'Нет данных', 'Сначала завершите тренировку для экспорта');
        return;
    }
    
    document.getElementById('exportModal').classList.add('active');
}

// Закрыть модальное окно экспорта
function closeExportModal() {
    document.getElementById('exportModal').classList.remove('active');
}

// Выбрать формат экспорта
function selectExportFormat(format) {
    currentExportFormat = format;
    
    // Обновляем выделение
    document.querySelectorAll('.export-option').forEach(option => {
        option.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
}

// Экспорт чата
async function exportChat() {
    if (!currentChatForExport) return;
    
    const includeFeedback = document.getElementById('includeFeedback').checked;
    const includeComments = document.getElementById('includeComments').checked;
    const includeMetadata = document.getElementById('includeMetadata').checked;
    
    try {
        showLoading();
        
        // Формируем содержимое
        const content = formatChatForExport(currentChatForExport, {
            includeFeedback,
            includeComments,
            includeMetadata
        });
        
        // Экспортируем в выбранном формате
        switch(currentExportFormat) {
            case 'pdf':
                await exportAsPDF(content);
                break;
            case 'txt':
                exportAsTXT(content);
                break;
            case 'html':
                exportAsHTML(content);
                break;
        }
        
        showNotification('success', 'Экспорт завершен', 'Файл скачивается...');
        closeExportModal();
        
    } catch (error) {
        console.error('Ошибка экспорта:', error);
        showNotification('error', 'Ошибка экспорта', 'Не удалось экспортировать файл');
    } finally {
        hideLoading();
    }
}

// Форматирование чата для экспорта
function formatChatForExport(chatData, options) {
    const typeInfo = clientTypes[chatData.type] || { name: 'Неизвестный', icon: '❓' };
    
    let content = '';
    
    // Метаданные
    if (options.includeMetadata) {
        content += `ДИАЛОГОВЫЙ ТРЕНАЖЕР\n`;
        content += `==============================\n\n`;
        content += `Тип клиента: ${typeInfo.name} ${typeInfo.icon}\n`;
        content += `Дата тренировки: ${formatDate(chatData.date)}\n`;
        content += `Длительность: ${chatData.duration}\n`;
        content += `Оценка: ${chatData.score}/5\n`;
        content += `Получено опыта: ${chatData.xp} XP\n`;
        content += `Вертикаль: ${auth.currentUser.group}\n`;
        content += `Ученик: ${auth.currentUser.username}\n\n`;
        content += `==============================\n\n`;
    }
    
    // Сообщения
    chatData.messages.forEach(msg => {
        const sender = msg.sender === 'user' ? 'ОПЕРАТОР' : 'КЛИЕНТ';
        const time = msg.time ? formatTime(msg.time) : '';
        content += `${sender} ${time}:\n${msg.text}\n\n`;
    });
    
    // Обратная связь
    if (options.includeFeedback) {
        content += `==============================\n\n`;
        content += `ОБРАТНАЯ СВЯЗЬ:\n\n`;
        content += generateFeedback(parseFloat(chatData.score), chatData.type);
        content += `\n\n`;
    }
    
    // Комментарии тренера
    if (options.includeComments && auth.userRole === 'trainer') {
        content += `==============================\n\n`;
        content += `КОММЕНТАРИИ ТРЕНЕРА:\n\n`;
        content += `Тренер: ${auth.currentUser.username}\n`;
        content += `Дата: ${formatDate(new Date().toISOString())}\n`;
        content += `Комментарий: Хорошая работа! Продолжайте в том же духе.\n\n`;
    }
    
    return content;
}

// Экспорт в PDF
async function exportAsPDF(content) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Заголовок
        doc.setFontSize(16);
        doc.setTextColor(44, 62, 80);
        doc.text('Диалоговый тренажер - Экспорт чата', 105, 20, { align: 'center' });
        
        doc.setFontSize(12);
        doc.setTextColor(100, 100, 100);
        doc.text(`Экспортировано: ${formatDate(new Date().toISOString())}`, 105, 30, { align: 'center' });
        
        // Содержимое
        doc.setFontSize(10);
        doc.setTextColor(50, 50, 50);
        
        const lines = content.split('\n');
        let y = 50;
        const pageHeight = doc.internal.pageSize.height;
        
        for (let line of lines) {
            if (y > pageHeight - 20) {
                doc.addPage();
                y = 20;
            }
            
            if (line.includes('ОПЕРАТОР:')) {
                doc.setTextColor(25, 118, 210);
                doc.setFont('helvetica', 'bold');
            } else if (line.includes('КЛИЕНТ:')) {
                doc.setTextColor(102, 102, 102);
                doc.setFont('helvetica', 'bold');
            } else if (line.includes('ДИАЛОГОВЫЙ ТРЕНАЖЕР')) {
                doc.setTextColor(44, 62, 80);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
            } else {
                doc.setTextColor(50, 50, 50);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
            }
            
            doc.text(line, 20, y, { maxWidth: 170 });
            y += line ? 7 : 5;
        }
        
        // Сохраняем
        const filename = `диалог_${formatDate(currentChatForExport.date, 'file')}.pdf`;
        doc.save(filename);
        
    } catch (error) {
        console.error('PDF export error:', error);
        // Fallback на TXT
        exportAsTXT(content);
    }
}

// Экспорт в TXT
function exportAsTXT(content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `диалог_${formatDate(currentChatForExport.date, 'file')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Экспорт в HTML
function exportAsHTML(content) {
    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Диалоговый тренажер - Экспорт чата</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        .message { margin: 10px 0; padding: 10px; border-radius: 8px; }
        .user { background: #e3f2fd; border-left: 4px solid #1976d2; margin-left: 20px; }
        .ai { background: #f5f5f5; border-left: 4px solid #666; margin-right: 20px; }
        .meta { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; text-align: center; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Диалоговый тренажер</h1>
        <p>Экспорт тренировочного диалога</p>
    </div>
    
    <div class="meta">
        <p><strong>Ученик:</strong> ${auth.currentUser.username}</p>
        <p><strong>Тип клиента:</strong> ${clientTypes[currentChatForExport.type]?.name || 'Неизвестный'}</p>
        <p><strong>Дата:</strong> ${formatDate(currentChatForExport.date)}</p>
        <p><strong>Оценка:</strong> ${currentChatForExport.score}/5</p>
        <p><strong>Опыт:</strong> ${currentChatForExport.xp} XP</p>
    </div>
    
    <div class="chat-content">
        ${content.split('\n').map(line => {
            if (line.includes('ОПЕРАТОР:')) {
                return `<div class="message user"><strong>${line}</strong></div>`;
            } else if (line.includes('КЛИЕНТ:')) {
                return `<div class="message ai"><strong>${line}</strong></div>`;
            } else if (line && !line.includes('===')) {
                return `<p>${line}</p>`;
            }
            return '';
        }).join('')}
    </div>
    
    <div class="footer">
        <p>Экспортировано из Диалогового тренажера</p>
        <p>${new Date().toLocaleString('ru-RU')}</p>
    </div>
</body>
</html>`;
    
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `диалог_${formatDate(currentChatForExport.date, 'file')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ========== ОТЧЕТЫ ТРЕНЕРА ==========

// Открыть модальное окно отчетов
function openReportModal() {
    if (auth.userRole !== 'trainer') {
        showNotification('error', 'Доступ запрещен', 'Только тренеры могут экспортировать отчеты');
        return;
    }
    
    // Загружаем список учеников
    loadStudentsForReport();
    
    // Устанавливаем даты по умолчанию
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);
    
    document.getElementById('reportDateFrom').value = weekAgo.toISOString().split('T')[0];
    document.getElementById('reportDateTo').value = today.toISOString().split('T')[0];
    
    // Показываем модальное окно
    document.getElementById('reportModal').classList.add('active');
}

// Закрыть модальное окно отчетов
function closeReportModal() {
    document.getElementById('reportModal').classList.remove('active');
}

// Выбрать тип отчета
function selectReportType(type) {
    currentReportType = type;
    
    document.querySelectorAll('.report-type').forEach(el => {
        el.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
}

// Загрузить список учеников для отчета
function loadStudentsForReport() {
    const select = document.getElementById('reportStudent');
    
    // Демо-ученики
    const demoStudents = [
        { id: 'all', name: 'Все ученики' },
        { id: 1, name: 'Алексей_П (ОПК)' },
        { id: 2, name: 'Мария_К (Лояльность)' },
        { id: 3, name: 'Иван_С (Фудтех)' },
        { id: 4, name: 'Ольга_В (Маркет)' },
        { id: 5, name: 'Дмитрий_М (Аптека)' },
        { id: 6, name: 'Екатерина_Р (Сборка)' }
    ];
    
    select.innerHTML = demoStudents.map(student => 
        `<option value="${student.id}">${student.name}</option>`
    ).join('');
}

// Сформировать отчет
async function generateReport() {
    const dateFrom = document.getElementById('reportDateFrom').value;
    const dateTo = document.getElementById('reportDateTo').value;
    const vertical = document.getElementById('reportVertical').value;
    const studentId = document.getElementById('reportStudent').value;
    
    if (!dateFrom || !dateTo) {
        showNotification('error', 'Ошибка', 'Укажите период отчета');
        return;
    }
    
    try {
        showLoading();
        
        // Генерируем демо-данные
        const reportData = generateDemoReportData(dateFrom, dateTo, vertical, studentId);
        
        // Экспортируем в выбранном формате
        switch(currentReportType) {
            case 'excel':
                await exportExcelReport(reportData);
                break;
            case 'pdf':
                await exportPDFReport(reportData);
                break;
            case 'chats':
                await exportChatsArchive(reportData);
                break;
        }
        
        showNotification('success', 'Отчет сформирован', 'Файл скачивается...');
        closeReportModal();
        
    } catch (error) {
        console.error('Ошибка формирования отчета:', error);
        showNotification('error', 'Ошибка', 'Не удалось сформировать отчет');
    } finally {
        hideLoading();
    }
}

// Генерация демо-данных отчета
function generateDemoReportData(dateFrom, dateTo, vertical, studentId) {
    // Демо-данные
    const students = [
        { id: 1, username: 'Алексей_П', group: 'ОПК', sessions: 42, avgScore: 4.8, totalXP: 1250 },
        { id: 2, username: 'Мария_К', group: 'Лояльность', sessions: 35, avgScore: 4.6, totalXP: 980 },
        { id: 3, username: 'Иван_С', group: 'Фудтех', sessions: 38, avgScore: 4.5, totalXP: 920 },
        { id: 4, username: 'Ольга_В', group: 'Маркет', sessions: 28, avgScore: 4.2, totalXP: 650 },
        { id: 5, username: 'Дмитрий_М', group: 'Аптека', sessions: 25, avgScore: 4.1, totalXP: 580 },
        { id: 6, username: 'Екатерина_Р', group: 'Сборка', sessions: 18, avgScore: 3.9, totalXP: 320 }
    ];
    
    // Фильтруем по вертикали
    let filteredStudents = students;
    if (vertical !== 'all') {
        filteredStudents = students.filter(s => s.group === vertical);
    }
    
    // Фильтруем по ученику
    if (studentId !== 'all') {
        filteredStudents = students.filter(s => s.id === parseInt(studentId));
    }
    
    // Демо-сессии
    const sessions = [];
    filteredStudents.forEach(student => {
        for (let i = 0; i < student.sessions; i++) {
            const typeKeys = Object.keys(clientTypes);
            const type = typeKeys[Math.floor(Math.random() * typeKeys.length)];
            
            sessions.push({
                student: student.username,
                group: student.group,
                date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
                type: clientTypes[type].name,
                score: (3.5 + Math.random() * 1.5).toFixed(1),
                duration: `${Math.floor(Math.random() * 10)}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
                xp: Math.floor(30 + Math.random() * 70)
            });
        }
    });
    
    return {
        period: { from: dateFrom, to: dateTo },
        vertical: vertical,
        studentId: studentId,
        students: filteredStudents,
        sessions: sessions,
        totals: {
            totalStudents: filteredStudents.length,
            totalSessions: sessions.length,
            avgScore: (filteredStudents.reduce((sum, s) => sum + s.avgScore, 0) / filteredStudents.length).toFixed(2),
            totalXP: filteredStudents.reduce((sum, s) => sum + s.totalXP, 0)
        }
    };
}

// Экспорт Excel отчета
async function exportExcelReport(reportData) {
    if (!window.XLSX) {
        showNotification('error', 'Ошибка', 'Библиотека XLSX не загружена');
        return;
    }
    
    try {
        const wb = XLSX.utils.book_new();
        
        // Лист 1: Сводка
        const summaryData = [
            ['Отчет по тренировкам'],
            ['Период:', `${reportData.period.from} - ${reportData.period.to}`],
            ['Вертикаль:', reportData.vertical === 'all' ? 'Все' : reportData.vertical],
            ['Ученик:', reportData.studentId === 'all' ? 'Все' : reportData.students[0]?.username],
            ['Дата формирования:', new Date().toLocaleString('ru-RU')],
            [],
            ['Статистика:', '', ''],
            ['Всего учеников:', reportData.totals.totalStudents],
            ['Всего тренировок:', reportData.totals.totalSessions],
            ['Средний балл:', reportData.totals.avgScore],
            ['Общий опыт:', reportData.totals.totalXP]
        ];
        
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, summarySheet, 'Сводка');
        
        // Лист 2: Ученики
        const studentsData = [
            ['Ученики', 'Вертикаль', 'Тренировок', 'Средний балл', 'Общий XP']
        ];
        
        reportData.students.forEach(student => {
            studentsData.push([
                student.username,
                student.group,
                student.sessions,
                student.avgScore,
                student.totalXP
            ]);
        });
        
        const studentsSheet = XLSX.utils.aoa_to_sheet(studentsData);
        XLSX.utils.book_append_sheet(wb, studentsSheet, 'Ученики');
        
        // Лист 3: Тренировки
        const sessionsData = [
            ['Дата', 'Ученик', 'Вертикаль', 'Тип клиента', 'Оценка', 'Длительность', 'XP']
        ];
        
        reportData.sessions.forEach(session => {
            sessionsData.push([
                formatDate(session.date),
                session.student,
                session.group,
                session.type,
                session.score,
                session.duration,
                session.xp
            ]);
        });
        
        const sessionsSheet = XLSX.utils.aoa_to_sheet(sessionsData);
        XLSX.utils.book_append_sheet(wb, sessionsSheet, 'Тренировки');
        
        // Сохраняем
        const filename = `отчет_${reportData.period.from}_${reportData.period.to}_${reportData.vertical}_${new Date().getTime()}.xlsx`;
        XLSX.writeFile(wb, filename);
        
    } catch (error) {
        console.error('Excel export error:', error);
        throw error;
    }
}

// Экспорт PDF отчета
async function exportPDFReport(reportData) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Заголовок
        doc.setFontSize(16);
        doc.text('Отчет по тренировкам', 105, 20, { align: 'center' });
        
        doc.setFontSize(12);
        doc.text(`Период: ${reportData.period.from} - ${reportData.period.to}`, 105, 30, { align: 'center' });
        
        // Сводка
        let y = 50;
        doc.setFontSize(14);
        doc.text('Сводная статистика', 20, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.text(`Всего учеников: ${reportData.totals.totalStudents}`, 20, y);
        y += 7;
        doc.text(`Всего тренировок: ${reportData.totals.totalSessions}`, 20, y);
        y += 7;
        doc.text(`Средний балл: ${reportData.totals.avgScore}`, 20, y);
        y += 7;
        doc.text(`Общий опыт: ${reportData.totals.totalXP} XP`, 20, y);
        y += 15;
        
        // Таблица учеников
        if (reportData.students.length > 0) {
            doc.setFontSize(14);
            doc.text('Статистика по ученикам', 20, y);
            y += 10;
            
            doc.setFontSize(9);
            
            // Заголовок таблицы
            doc.text('Ученик', 20, y);
            doc.text('Тренировок', 90, y);
            doc.text('Ср. балл', 130, y);
            doc.text('XP', 160, y);
            
            y += 6;
            doc.line(20, y, 190, y);
            y += 4;
            
            // Данные
            doc.setFontSize(8);
            
            reportData.students.forEach(student => {
                if (y > 250) {
                    doc.addPage();
                    y = 20;
                }
                
                doc.text(student.username, 20, y);
                doc.text(student.sessions.toString(), 90, y);
                doc.text(student.avgScore.toString(), 130, y);
                doc.text(student.totalXP.toString(), 160, y);
                
                y += 6;
            });
        }
        
        // Сохраняем
        const filename = `отчет_${reportData.period.from}_${reportData.period.to}_${reportData.vertical}_${new Date().getTime()}.pdf`;
        doc.save(filename);
        
    } catch (error) {
        console.error('PDF report error:', error);
        throw error;
    }
}

// Экспорт архива чатов
async function exportChatsArchive(reportData) {
    if (!window.JSZip) {
        showNotification('error', 'Ошибка', 'Библиотека JSZip не загружена');
        return;
    }
    
    try {
        const zip = new JSZip();
        const chatFolder = zip.folder("чаты");
        
        // Создаем индексный файл
        let indexContent = 'Архив тренировочных чатов\n';
        indexContent += '===========================\n\n';
        
        // Создаем демо-чаты
        reportData.sessions.slice(0, 10).forEach((session, index) => {
            const chatContent = createDemoChatContent(session, index);
            const filename = `чат_${session.student}_${formatDate(session.date, 'file')}_${index}.txt`;
            
            chatFolder.file(filename, chatContent);
            indexContent += `${index + 1}. ${session.student} - ${session.type} - ${formatDate(session.date)} - ${session.score}/5\n`;
        });
        
        chatFolder.file("index.txt", indexContent);
        
        // Генерируем и скачиваем архив
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `архив_чатов_${reportData.period.from}_${reportData.period.to}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
    } catch (error) {
        console.error('Archive export error:', error);
        throw error;
    }
}

// Экспорт функций для тренера
function exportStudentsReport() {
    if (auth.userRole !== 'trainer') return;
    
    // Демо-данные
    const demoData = generateDemoReportData(
        new Date().toISOString().split('T')[0],
        new Date().toISOString().split('T')[0],
        'all',
        'all'
    );
    
    exportExcelReport(demoData);
}

function exportAllSessions() {
    if (auth.userRole !== 'trainer') return;
    
    const demoData = generateDemoReportData(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        new Date().toISOString().split('T')[0],
        'all',
        'all'
    );
    
    exportExcelReport(demoData);
}

function exportSingleSession(id) {
    showNotification('info', 'Экспорт', `Экспорт сессии #${id}...`);
    // В реальном приложении здесь был бы экспорт конкретной сессии
}

function exportVerticalStats() {
    if (auth.userRole !== 'trainer') return;
    
    const demoData = generateDemoReportData(
        new Date().toISOString().split('T')[0],
        new Date().toISOString().split('T')[0],
        'all',
        'all'
    );
    
    exportExcelReport(demoData);
}

function exportProgressReport() {
    exportVerticalStats(); // Используем ту же функцию для демо
}

function exportTypeStats() {
    exportVerticalStats(); // Используем ту же функцию для демо
}

function exportHistory() {
    if (auth.userRole === 'trainer') {
        exportAllSessions();
    } else {
        // Экспорт истории ученика
        const demoData = generateDemoReportData(
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            new Date().toISOString().split('T')[0],
            auth.currentUser.group,
            auth.currentUser.id
        );
        
        exportExcelReport(demoData);
    }
}

// ========== УТИЛИТЫ ==========

// Показать уведомление
function showNotification(type, title, message) {
    const container = document.getElementById('notificationContainer');
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-icon">
            ${type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '❌'}
        </div>
        <div class="notification-content">
            <h4>${title}</h4>
            <p>${message}</p>
        </div>
    `;
    
    container.appendChild(notification);
    
    // Автоудаление через 5 секунд
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Показать ошибку
function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
}

// Показать загрузку
function showLoading() {
    const loading = document.createElement('div');
    loading.id = 'loadingOverlay';
    loading.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    loading.innerHTML = `
        <div class="loading-spinner"></div>
    `;
    
    document.body.appendChild(loading);
}

// Скрыть загрузку
function hideLoading() {
    const loading = document.getElementById('loadingOverlay');
    if (loading) loading.remove();
}

// Форматирование даты
function formatDate(dateString, format = 'display') {
    const date = new Date(dateString);
    
    if (format === 'file') {
        return date.toISOString().split('T')[0].replace(/-/g, '');
    }
    
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Форматирование времени
function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// Форматирование длительности
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Расчет уровня по XP
function calculateLevel(xp) {
    for (let i = levels.length - 1; i >= 0; i--) {
        if (xp >= levels[i].requiredXP) {
            return levels[i].level;
        }
    }
    return 1;
}

// Получение приветствия клиента
function getClientGreeting(type) {
    const greetings = {
        aggressive: "У меня серьезная проблема и я очень зол! Ваша компания опять все испортила!",
        passive: "Здравствуйте... извините за беспокойство... у меня небольшая проблема...",
        demanding: "Добрый день. Мне нужна подробная информация о ваших услугах. И пожалуйста, будьте точны.",
        indecisive: "Эмм... здравствуйте... я не уверен, может быть вы мне поможете... или нет...",
        chatty: "Привет! Как дела? Отличная погода сегодня, правда? Кстати, у меня вопрос!"
    };
    
    return greetings[type] || "Здравствуйте! У меня есть вопрос по вашим услугам.";
}

// Получение ответа AI
function getAIResponse(type, message) {
    const responses = {
        aggressive: [
            "Вы что, не понимаете? Я требую немедленного решения!",
            "Это неприемлемо! Я хочу поговорить с вашим руководителем!",
            "Вы только время зря тратите! Давайте решайте проблему!"
        ],
        passive: [
            "Извините... может быть вы правы...",
            "Я не уверен... может быть стоит попробовать...",
            "Спасибо за помощь... надеюсь это сработает..."
        ],
        demanding: [
            "А есть ли гарантия на это решение?",
            "Можете предоставить письменное подтверждение?",
            "Каковы сроки реализации этого варианта?"
        ],
        indecisive: [
            "Хмм... а может быть есть другой вариант?",
            "Я не уверен... что вы посоветуете?",
            "С одной стороны это хорошо, но с другой..."
        ],
        chatty: [
            "О, отлично! Кстати, вы смотрели новый фильм?",
            "Спасибо! Вы очень помогли! Кстати, как у вас настроение?",
            "Здорово! А знаете, у меня еще есть вопрос..."
        ]
    };
    
    const typeResponses = responses[type] || ["Понятно. Что вы можете предложить еще?"];
    return typeResponses[Math.floor(Math.random() * typeResponses.length)];
}

// Генерация обратной связи
function generateFeedback(score, type) {
    const typeName = clientTypes[type]?.name || 'клиентом';
    
    if (score >= 4.5) {
        return `Отличная работа с ${typeName}! Вы показали:
        ✅ Профессиональное ведение диалога
        ✅ Умение слышать клиента
        ✅ Эффективное решение проблемы
        ✅ Правильное завершение разговора
        
        Продолжайте в том же духе!`;
    } else if (score >= 4) {
        return `Хорошая работа с ${typeName}. Сильные стороны:
        ✓ Хорошее понимание проблемы
        ✓ Вежливое общение
        ✓ Предложено решение
        
        На что обратить внимание:
        • Можно быть более уверенным
        • Добавить больше уточняющих вопросов`;
    } else if (score >= 3) {
        return `Неплохая попытка работы с ${typeName}. Что получилось:
        ✓ Базовое понимание ситуации
        ✓ Вежливое обращение
        
        Что улучшить:
        • Нужно активнее слушать клиента
        • Предлагать более конкретные решения
        • Контролировать эмоции в сложных ситуациях`;
    } else {
        return `Работа с ${typeName} требует улучшения. Рекомендации:
        • Больше внимания потребностям клиента
        • Развивать навыки активного слушания
        • Учиться сохранять спокойствие
        • Тренировать варианты решений
        
        Попробуйте еще раз, у вас получится!`;
    }
}

// Создание демо-контента чата
function createDemoChatContent(session, index) {
    const typeInfo = clientTypes[Object.keys(clientTypes)[index % Object.keys(clientTypes).length]];
    
    let content = `ТРЕНАЖЕР: Экспорт чата #${index + 1}\n`;
    content += '================================\n\n';
    content += `Ученик: ${session.student}\n`;
    content += `Вертикаль: ${session.group}\n`;
    content += `Тип клиента: ${typeInfo.name}\n`;
    content += `Дата: ${formatDate(session.date)}\n`;
    content += `Оценка: ${session.score}/5\n`;
    content += `Длительность: ${session.duration}\n\n`;
    content += '================================\n\n';
    
    // Демо-диалог
    const messages = [
        { sender: 'ai', text: getClientGreeting(Object.keys(clientTypes)[index % Object.keys(clientTypes).length]) },
        { sender: 'user', text: 'Здравствуйте! Расскажите, пожалуйста, подробнее о вашей проблеме.' },
        { sender: 'ai', text: getAIResponse(Object.keys(clientTypes)[index % Object.keys(clientTypes).length], '') },
        { sender: 'user', text: 'Я понимаю вашу ситуацию. Давайте рассмотрим возможные варианты решения.' },
        { sender: 'ai', text: 'Хорошо, я готов выслушать ваши предложения.' },
        { sender: 'user', text: 'Предлагаю следующий вариант...' },
        { sender: 'ai', text: 'Спасибо за помощь! Это действительно хорошее решение.' }
    ];
    
    messages.forEach(msg => {
        content += `${msg.sender === 'user' ? 'ОПЕРАТОР' : 'КЛИЕНТ'}:\n`;
        content += `${msg.text}\n\n`;
    });
    
    content += '================================\n\n';
    content += 'ОБРАТНАЯ СВЯЗЬ:\n\n';
    content += generateFeedback(parseFloat(session.score), Object.keys(clientTypes)[index % Object.keys(clientTypes).length]);
    
    return content;
}

// Просмотр истории чата
function viewChatHistory(id) {
    // В реальном приложении здесь была бы загрузка чата из базы данных
    currentChatForExport = {
        type: Object.keys(clientTypes)[id % Object.keys(clientTypes).length],
        score: (3.5 + Math.random() * 1.5).toFixed(1),
        duration: `${Math.floor(Math.random() * 10)}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
        messages: [
            { sender: 'ai', text: 'Здравствуйте! У меня вопрос по вашим услугам.', time: new Date().toISOString() },
            { sender: 'user', text: 'Добрый день! Чем могу помочь?', time: new Date().toISOString() },
            { sender: 'ai', text: 'Мне нужна информация о возможности возврата товара.', time: new Date().toISOString() },
            { sender: 'user', text: 'Конечно, расскажу о нашей политике возвратов.', time: new Date().toISOString() }
        ],
        date: new Date(Date.now() - id * 24 * 60 * 60 * 1000).toISOString(),
        xp: Math.floor(30 + Math.random() * 70)
    };
    
    // Показываем модальное окно чата
    const modal = document.getElementById('chatModal');
    const title = document.getElementById('chatModalTitle');
    const clientType = document.getElementById('chatModalClientType');
    const date = document.getElementById('chatModalDate');
    const score = document.getElementById('chatModalScore');
    const messages = document.getElementById('chatModalMessages');
    
    const typeInfo = clientTypes[currentChatForExport.type] || { name: 'Неизвестный' };
    
    title.textContent = `Диалог: ${typeInfo.name} клиент`;
    clientType.textContent = typeInfo.name;
    date.textContent = formatDate(currentChatForExport.date);
    score.textContent = currentChatForExport.score;
    
    messages.innerHTML = '';
    currentChatForExport.messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${msg.sender}`;
        msgDiv.textContent = msg.text;
        messages.appendChild(msgDiv);
    });
    
    modal.classList.add('active');
}

// Просмотр чата ученика (для тренера)
function viewStudentChat(studentId) {
    // В реальном приложении здесь была бы загрузка чата конкретного ученика
    viewChatHistory(studentId);
}

// Добавить комментарий
function addComment(studentId) {
    showNotification('info', 'Комментарий', `Добавление комментария для ученика #${studentId}`);
    // В реальном приложении здесь было бы модальное окно для комментария
}

// Закрыть модальное окно чата
function closeChatModal() {
    document.getElementById('chatModal').classList.remove('active');
}

// Инициализация обработчиков событий
function initEventListeners() {
    // Обработчик клавиши Enter в чате
    document.addEventListener('keydown', function(event) {
        if (event.target.id === 'trainingInput' && event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendTrainingMessage();
        }
    });
    
    // Автофокус на поле ввода при начале тренировки
    document.addEventListener('click', function(event) {
        if (event.target.id === 'startTrainingBtn' && !trainingInProgress) {
            setTimeout(() => {
                document.getElementById('trainingInput').focus();
            }, 100);
        }
    });
}

// Инициализация при загрузке
initEventListeners();
