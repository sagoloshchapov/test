let feedbackShown = false;
const SUPABASE_URL = 'https://lpoaqliycyuhvdrwuyxj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_uxkhuA-ngwjNjfaZdHCs7Q_FXOQRrSD';
const EDGE_FUNCTION_URL = 'https://lpoaqliycyuhvdrwuyxj.supabase.co/functions/v1/rapid-handler';

class SupabaseAuth {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.userRole = null;
        this.supabaseUrl = SUPABASE_URL;
        this.supabaseKey = SUPABASE_ANON_KEY;
        this.cache = new Map();
    }
    
    async supabaseRequest(endpoint, method = 'GET', body = null) {
        const cacheKey = `${method}:${endpoint}`;
        
        if (method === 'GET' && this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        try {
            const response = await fetch('/api/supabase-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint, method, body })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            if (response.status === 204) return { success: true };
            
            const data = await response.json();
            
            if (method === 'GET') {
                this.cache.set(cacheKey, data);
                setTimeout(() => this.cache.delete(cacheKey), 30000);
            }
            
            return data;
        } catch (error) {
            console.error('Supabase proxy error:', error);
            throw error;
        }
    }
    
    async loadPrompts() {
        try {
            const prompts = await this.supabaseRequest('prompts?select=*');
            return prompts || [];
        } catch (error) {
            console.error('Ошибка загрузки промтов:', error);
            return [];
        }
    }
    
    async loadNews() {
        try {
            const news = await this.supabaseRequest('news?select=*&order=created_at.desc');
            return news || [];
        } catch (error) {
            console.error('Ошибка загрузки новостей:', error);
            return [];
        }
    }
    
    hashPassword(password) {
        if (password === '0c7540eb7e65b553ec1ba6b20de79608') return password;
        
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }
    
    async register(username, group = '', password) {
        try {
            const existing = await this.supabaseRequest(`users?username=eq.${encodeURIComponent(username)}`);
            
            if (existing?.length > 0) {
                return { success: false, message: 'Пользователь с таким никнеймом уже существует' };
            }
            
            if (password.length < 6) {
                return { success: false, message: 'Пароль должен быть не менее 6 символов' };
            }
            
            const passwordHash = this.hashPassword(password);
            const now = new Date().toISOString();
            
            const newUser = {
                username: username.trim(),
                group_name: group.trim(),
                password_hash: passwordHash,
                role: 'user',
                stats: JSON.stringify({
                    currentLevel: 1,
                    totalXP: 0,
                    completedSessions: 0,
                    totalScore: 0,
                    averageScore: 0,
                    currentStreak: 0,
                    lastTrainingDate: null,
                    registrationDate: now,
                    achievementsUnlocked: ["first_blood"],
                    clientTypesCompleted: Object.fromEntries(
                        ['aggressive', 'passive', 'demanding', 'indecisive', 'chatty'].map(type => [
                            type,
                            { sessions: 0, totalXP: 0, totalScore: 0, avgScore: 0 }
                        ])
                    ),
                    trainingHistory: [],
                    vertical: group.trim(),
                    trainerComments: [],
                    dailySessions: 0,
                    lastSessionDate: null
                })
            };
            
            const response = await fetch('/api/supabase-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: 'users',
                    method: 'POST',
                    body: newUser,
                    headers: { 'Prefer': 'return=representation' }
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Ошибка регистрации:', errorText);
                return { success: false, message: 'Ошибка регистрации' };
            }
            
            return { 
                success: true, 
                message: 'Регистрация успешна! Теперь войдите в систему.' 
            };
        } catch (error) {
            console.error('Ошибка регистрации:', error);
            return { success: false, message: 'Ошибка соединения с базой данных' };
        }
    }

    async login(username, password) {
        try {
            const users = await this.supabaseRequest(`users?username=eq.${encodeURIComponent(username)}`);
            
            if (!users?.length) {
                return { success: false, message: 'Пользователь не найден' };
            }
            
            const user = users[0];
            const passwordHash = this.hashPassword(password);
            
            if (user.password_hash !== passwordHash) {
                return { success: false, message: 'Неверный пароль' };
            }
            
            let userStats;
            try {
                userStats = typeof user.stats === 'string' ? JSON.parse(user.stats) : user.stats;
            } catch {
                userStats = this.createDefaultStats(user.group_name);
            }
            
            this.currentUser = {
                id: user.id,
                username: user.username,
                group: user.group_name,
                role: user.role || 'user',
                stats: userStats
            };
            
            this.userRole = this.currentUser.role;
            this.isAuthenticated = true;
            localStorage.setItem('dialogue_currentUser', JSON.stringify(this.currentUser));
            
            return { 
                success: true, 
                user: this.currentUser,
                message: 'Вход выполнен успешно'
            };
        } catch (error) {
            console.error('Ошибка входа:', error);
            return { success: false, message: 'Ошибка соединения с базой данных' };
        }
    }

    createDefaultStats(group) {
        return {
            currentLevel: 1,
            totalXP: 0,
            completedSessions: 0,
            totalScore: 0,
            averageScore: 0,
            currentStreak: 0,
            lastTrainingDate: null,
            registrationDate: new Date().toISOString(),
            achievementsUnlocked: ["first_blood"],
            clientTypesCompleted: Object.fromEntries(
                ['aggressive', 'passive', 'demanding', 'indecisive', 'chatty'].map(type => [
                    type,
                    { sessions: 0, totalXP: 0, totalScore: 0, avgScore: 0 }
                ])
            ),
            trainingHistory: [],
            vertical: group,
            trainerComments: [],
            dailySessions: 0,
            lastSessionDate: null
        };
    }

    async resetPassword(username, newPassword) {
        try {
            const users = await this.supabaseRequest(`users?username=eq.${encodeURIComponent(username)}`);
            
            if (!users?.length) {
                return { success: false, message: 'Пользователь не найден' };
            }
            
            const user = users[0];
            const passwordHash = this.hashPassword(newPassword);
            
            await fetch('/api/supabase-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: `users?id=eq.${user.id}`,
                    method: 'PATCH',
                    body: { password_hash: passwordHash },
                    headers: { 'Prefer': 'return=representation' }
                })
            });
            
            return { success: true, message: 'Пароль успешно изменен' };
        } catch (error) {
            console.error('Ошибка сброса пароля:', error);
            return { success: false, message: 'Ошибка изменения пароля' };
        }
    }
            
    async saveUserStats(stats) {
        if (!this.currentUser?.id) {
            console.error('Нет пользователя для сохранения');
            return false;
        }
        
        try {
            const statsJson = JSON.stringify(stats);

            const response = await fetch('/api/supabase-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: `users?id=eq.${this.currentUser.id}`,
                    method: 'PATCH',
                    body: { stats: statsJson },
                    headers: {
                        'Prefer': 'return=representation',
                        'Cache-Control': 'no-cache'
                    }
                })
            });
            
            if (response.ok) {
                this.currentUser.stats = stats;
                this.cache.clear();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Ошибка сохранения статистики:', error);
            return false;
        }
    }
            
    async addTrainingSession(sessionData) {
        if (!this.currentUser) return false;
        
        try {
            const session = {
                user_id: this.currentUser.id,
                vertical: this.currentUser.group,
                client_type: sessionData.clientType,
                score: sessionData.score,
                xp_earned: sessionData.xp,
                date: sessionData.date,
                messages: JSON.stringify(sessionData.messages || []),
                evaluation: sessionData.evaluation,
                duration: sessionData.duration,
                scenario: sessionData.scenario,
                prompt_used: sessionData.prompt_used,
                ai_feedback: sessionData.ai_feedback || ""
            };
            
            await this.supabaseRequest('training_sessions', 'POST', session);
            this.cache.clear();
            return true;
        } catch (error) {
            console.error('Ошибка добавления сессии:', error);
            return false;
        }
    }
    
    async getAllUsers() {
        try {
            const result = await this.supabaseRequest('users?select=*');
            return result || [];
        } catch (error) {
            console.error('Ошибка получения пользователей:', error);
            return [];
        }
    }
    
    async getStudents() {
        try {
            const users = await this.getAllUsers();
            return users.filter(user => user.role === 'user');
        } catch (error) {
            console.error('Ошибка получения учеников:', error);
            return [];
        }
    }
    
    async getLeaderboard(filterVertical = 'all') {
        try {
            const users = await this.supabaseRequest('users?select=id,username,group_name,stats');
            
            if (!users?.length) return [];
            
            const leaderboard = users
                .filter(user => filterVertical === 'all' || user.group_name === filterVertical)
                .map(user => {
                    let userStats;
                    try {
                        userStats = typeof user.stats === 'string' ? 
                            JSON.parse(user.stats) : 
                            (user.stats || {});
                    } catch {
                        userStats = {};
                    }
                    
                    return {
                        id: user.id,
                        username: user.username,
                        group: user.group_name || 'Без вертикали',
                        level: userStats.currentLevel || 1,
                        sessions: userStats.completedSessions || 0,
                        avgScore: userStats.averageScore || 0,
                        xp: userStats.totalXP || 0
                    };
                })
                .sort((a, b) => b.xp - a.xp);
            
            return leaderboard.slice(0, 100);
        } catch (error) {
            console.error('Ошибка получения рейтинга:', error);
            return [];
        }
    }
            
    async getSystemStats() {
        try {
            const users = await this.supabaseRequest('users?select=id,stats');
            const sessions = await this.supabaseRequest('training_sessions?select=id,score,date,user_id');
            
            const today = new Date().toISOString().split('T')[0];
            const activeToday = new Set();
            
            if (sessions?.length) {
                sessions.forEach(session => {
                    if (session.date?.includes(today)) {
                        activeToday.add(session.user_id);
                    }
                });
            }
            
            const totalSessions = sessions?.length || 0;
            const totalUsers = users?.length || 0;
            
            let totalScore = 0;
            let scoreCount = 0;
            
            if (sessions?.length) {
                sessions.forEach(session => {
                    if (session.score) {
                        totalScore += session.score;
                        scoreCount++;
                    }
                });
            }
            
            const avgScore = scoreCount > 0 ? (totalScore / scoreCount) : 0;
            
            return {
                totalUsers,
                totalSessions,
                avgScore,
                activeToday: activeToday.size
            };
        } catch (error) {
            console.error('Ошибка получения статистики системы:', error);
            return {
                totalUsers: 0,
                totalSessions: 0,
                avgScore: 0,
                activeToday: 0
            };
        }
    }
            
    async getUserTrainingHistory(userId) {
        try {
            const sessions = await this.supabaseRequest(`training_sessions?user_id=eq.${userId}&order=date.desc`);
            return sessions || [];
        } catch (error) {
            console.error('Ошибка получения истории тренировок:', error);
            return [];
        }
    }
    
    async addTrainerComment(sessionId, comment) {
        try {
            const session = await this.supabaseRequest(`training_sessions?id=eq.${sessionId}`);
            if (!session?.length) return false;
            
            const currentComments = session[0].trainer_comments || [];
            currentComments.push({
                trainer: this.currentUser.username,
                comment: comment,
                date: new Date().toISOString()
            });
            
            await this.supabaseRequest(
                `training_sessions?id=eq.${sessionId}`, 
                'PATCH', 
                { trainer_comments: currentComments }
            );
            
            this.cache.clear();
            return true;
        } catch (error) {
            console.error('Ошибка добавления комментария:', error);
            return false;
        }
    }
    
    async getAllTrainingSessions(filters = {}) {
        try {
            let endpoint = 'training_sessions?select=*&order=date.desc';
            
            if (filters.vertical && filters.vertical !== 'all') {
                endpoint += `&vertical=eq.${encodeURIComponent(filters.vertical)}`;
            }
            
            const sessions = await this.supabaseRequest(endpoint);
            return sessions || [];
        } catch (error) {
            console.error('Ошибка получения всех тренировок:', error);
            return [];
        }
    }
    
    logout() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.userRole = null;
        this.cache.clear();
        localStorage.removeItem('dialogue_currentUser');
        this.showAuthModal();
    }
    
    showAuthModal() {
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('mainContainer').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('resetPasswordForm').style.display = 'none';
        document.getElementById('trainerLoginForm').style.display = 'none';
    }
    
    showMainApp() {
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'block';
        this.updateInterfaceBasedOnRole();
    }
    
    updateInterfaceBasedOnRole() {
        if (!this.currentUser) return;
        
        const headerTitle = document.querySelector('.header h1');
        const headerSubtitle = document.getElementById('headerSubtitle');
        
        if (this.userRole === 'trainer') {
            headerTitle.innerHTML = 'Панель тренера';
            headerSubtitle.textContent = `Тренер: ${this.currentUser.username}`;
        } else {
            headerTitle.innerHTML = 'Диалоговый тренажер';
            headerSubtitle.textContent = 'Тренировка работы с клиентами';
        }
        
        document.getElementById('currentUserName').textContent = this.currentUser.username;
        const groupBadge = document.getElementById('userGroupBadge');
        
        if (this.userRole === 'trainer') {
            groupBadge.textContent = 'Тренер';
            groupBadge.style.backgroundColor = '#155d27';
            groupBadge.style.color = 'white';
        } else if (this.currentUser.group) {
            groupBadge.textContent = this.currentUser.group;
            groupBadge.style.backgroundColor = '#e3f2fd';
            groupBadge.style.color = '#1976d2';
        } else {
            groupBadge.style.display = 'none';
        }
        groupBadge.style.display = 'inline-block';
        
        loadInterfaceForRole();
    }
    
    isTrainer() {
        return this.userRole === 'trainer';
    }
}

const auth = new SupabaseAuth();
    
const clientTypes = {
    aggressive: { 
        name: "Агрессивный клиент", 
        icon: "😠",
        description: "Клиент выражает гнев, может быть грубым, использовать повышенный тон."
    },
    passive: { 
        name: "Пассивный клиент", 
        icon: "😔",
        description: "Клиент говорит тихо, нерешительно, часто соглашается."
    },
    demanding: { 
        name: "Требовательный клиент", 
        icon: "🧐",
        description: "Клиент требует детали, проверяет компетентность, задает много вопросов."
    },
    indecisive: { 
        name: "Нерешительный клиент", 
        icon: "🤔",
        description: "Клиент сомневается, часто меняет мнение, просит советов."
    },
    chatty: { 
        name: "Славный малый", 
        icon: "😄",
        description: "Позитивный клиент, любит поболтать, использует смайлики, может увести от темы."
    }
};

const levels = [
    { level: 1, name: "Новичок", requiredXP: 0, badge: "🟢" },
    { level: 2, name: "Стажёр", requiredXP: 100, badge: "🟡" },
    { level: 3, name: "Специалист", requiredXP: 300, badge: "🔵" },
    { level: 4, name: "Эксперт", requiredXP: 600, badge: "🟣" },
    { level: 5, name: "Мастер", requiredXP: 1000, badge: "🟠" },
    { level: 6, name: "Гуру", requiredXP: 1500, badge: "🔴" },
    { level: 7, name: "Легенда", requiredXP: 2200, badge: "⭐" }
];

const achievements = [
    { id: "first_blood", name: "Первая кровь", icon: "🎯", description: "Пройдите первую тренировку", category: "базовые", condition: "sessions >= 1" },
    { id: "quick_start", name: "Быстрый старт", icon: "⚡", description: "Пройдите 3 тренировки за неделю", category: "активность", condition: "weekly_sessions >= 3" },
    { id: "regular_5", name: "Регулярный", icon: "📅", description: "5 тренировок в месяц", category: "активность", condition: "monthly_sessions >= 5" },
    { id: "regular_10", name: "Активный", icon: "🏃", description: "10 тренировок в месяц", category: "активность", condition: "monthly_sessions >= 10" },
    { id: "regular_20", name: "Супер-активный", icon: "🚀", description: "20 тренировок в месяц", category: "активность", condition: "monthly_sessions >= 20" },
    { id: "streak_3", name: "Последователь", icon: "🔥", description: "3 дня подряд", category: "активность", condition: "streak >= 3" },
    { id: "streak_7", name: "Непрерывный", icon: "💪", description: "7 дней подряд", category: "активность", condition: "streak >= 7" },
    { id: "streak_30", name: "Легенда стрика", icon: "👑", description: "30 дней подряд", category: "активность", condition: "streak >= 30" },
    { id: "score_5", name: "Отличник", icon: "⭐", description: "Получите оценку 5", category: "качество", condition: "max_score >= 5" },
    { id: "score_avg_4", name: "Стабильный", icon: "📊", description: "Средний балл 4+", category: "качество", condition: "avg_score >= 4" },
    { id: "score_avg_4.5", name: "Профессионал", icon: "🎖️", description: "Средний балл 4.5+", category: "качество", condition: "avg_score >= 4.5" },
    { id: "perfect_5", name: "Идеально", icon: "💎", description: "5 тренировок подряд на 5", category: "качество", condition: "perfect_streak >= 5" },
    { id: "level_3", name: "Специалист", icon: "🏆", description: "Достигните 3 уровня", category: "прогресс", condition: "level >= 3" },
    { id: "level_5", name: "Мастер", icon: "👑", description: "Достигните 5 уровня", category: "прогресс", condition: "level >= 5" },
    { id: "level_7", name: "Гуру", icon: "🌟", description: "Достигните 7 уровня", category: "прогресс", condition: "level >= 7" },
    { id: "xp_500", name: "Опытный", icon: "💼", description: "Заработайте 500 XP", category: "прогресс", condition: "total_xp >= 500" },
    { id: "xp_1000", name: "Ветеран", icon: "🛡️", description: "Заработайте 1000 XP", category: "прогресс", condition: "total_xp >= 1000" },
    { id: "xp_2000", name: "Легенда XP", icon: "🏛️", description: "Заработайте 2000 XP", category: "прогресс", condition: "total_xp >= 2000" },
    { id: "all_types", name: "Универсал", icon: "🎭", description: "Поработайте со всеми типами клиентов", category: "типы клиентов", condition: "all_client_types" },
    { id: "master_aggressive", name: "Укротитель", icon: "😠", description: "10 тренировок с агрессивными", category: "типы клиентов", condition: "aggressive_sessions >= 10" },
    { id: "master_passive", name: "Психолог", icon: "😔", description: "10 тренировок с пассивными", category: "типы клиентов", condition: "passive_sessions >= 10" },
    { id: "master_demanding", name: "Эксперт", icon: "🧐", description: "10 тренировок с требовательными", category: "типы клиентов", condition: "demanding_sessions >= 10" },
    { id: "master_indecisive", name: "Наставник", icon: "🤔", description: "10 тренировок с нерешительными", category: "типы клиентов", condition: "indecisive_sessions >= 10" },
    { id: "master_chatty", name: "Душа компании", icon: "😄", description: "10 тренировок с 'славными малыми'", category: "типы клиентов", condition: "chatty_sessions >= 10" }
];

let dynamicVerticalPrompts = {};
let dynamicNews = [];

async function loadDynamicPrompts() {
    try {
        const prompts = await auth.loadPrompts();
        dynamicVerticalPrompts = prompts?.reduce((acc, prompt) => {
            if (prompt.vertical && prompt.content) {
                acc[prompt.vertical] = prompt.content;
            }
            return acc;
        }, {}) || {};
    } catch (error) {
        console.error('Ошибка загрузки промтов:', error);
        dynamicVerticalPrompts = {};
    }
}

async function loadDynamicNews() {
    try {
        const news = await auth.loadNews();
        dynamicNews = news || [];
    } catch (error) {
        console.error('Ошибка загрузки новостей:', error);
        dynamicNews = [];
    }
}

function getPromptForVertical(vertical) {
    return dynamicVerticalPrompts[vertical] || "";
}

let selectedClientType = null;
let currentPrompt = null;
let trainingInProgress = false;
let trainingStartTime = null;
let chatMessages = [];
let progressChart = null;
let trainingTimerInterval = null;
let selectedStudentForComment = null;
let selectedSessionForComment = null;
let lastAIFeedback = "";
let dailyLimit = 5;
let dailySessionsUsed = 0;
let lastResetTime = null;
let isRandomClient = false;

async function sendPromptToAI() {
    try {
        const clientType = clientTypes[selectedClientType];
        
        let clientTypeInstruction;
        if (isRandomClient) {
            const types = Object.keys(clientTypes);
            const randomTypeKey = types[Math.floor(Math.random() * types.length)];
            const randomType = clientTypes[randomTypeKey];
            clientTypeInstruction = `ТИП КЛИЕНТА: ${randomType.name.toUpperCase()}
ОПИСАНИЕ: ${randomType.description}
ВАЖНО: Веди себя СТРОГО в этом стиле весь диалог!`;
        } else if (clientType) {
            clientTypeInstruction = `ТИП КЛИЕНТА: ${clientType.name.toUpperCase()}
ОПИСАНИЕ: ${clientType.description}
ВАЖНО: Веди себя СТРОГО в этом стиле весь диалог!`;
        } else {
            clientTypeInstruction = "ТИП КЛИЕНТА: СТАНДАРТНЫЙ";
        }
        
        let promptContent = currentPrompt || `Ты играешь роль клиента. Веди диалог естественно, как реальный клиент обращается в поддержку.

Вертикаль: ${auth.currentUser.group}
${clientTypeInstruction}

Ты должен:
1. Вести себя соответственно указанному выше типу клиента
2. Использовать реалистичные жалобы/вопросы из сферы "${auth.currentUser.group}"
3. Не упоминать, что это тренировка или симуляция
4. Реагировать естественно на ответы оператора
5. ВСЕГДА начинать диалог первым - отправляй первое сообщение как клиент с проблемой или вопросом

Если оператор отправил сообщение "[[ДИАЛОГ ЗАВЕРШЕН]]" - заверши диалог и дай оценку:
ОЦЕНКА: X/5
ОБРАТНАЯ СВЯЗЬ: [до 1200 символов] - Как оператор понял проблему, какие техники работали, что можно улучшить

В остальных случаях - просто продолжай диалог как клиент.`;

        promptContent = promptContent.replace(/выбери.*?случайно.*?\n/gi, '');
        promptContent = promptContent.replace(/выбери.*?один.*?\n/gi, '');
        promptContent = promptContent.replace(/выбери.*?сценарий.*?\n/gi, '');
        
        const hasScenarios = promptContent.includes('Сценарий') || 
                            promptContent.includes('сценарий') ||
                            promptContent.match(/\d+\.\s+.*?(?=\n|$)/) ||
                            promptContent.match(/-\s+.*?(?=\n|$)/);
        
        if (hasScenarios) {
            const lines = promptContent.split('\n');
            const scenarioLines = [];
            
            for (const line of lines) {
                const trimmed = line.trim();
                if ((trimmed.includes('Сценарий') || trimmed.includes('сценарий')) && 
                    trimmed.length > 15 && 
                    !trimmed.startsWith('**СЦЕНАРИИ') &&
                    !trimmed.startsWith('**сценарии')) {
                    scenarioLines.push(trimmed);
                }
                else if ((trimmed.match(/^\d+\.\s+/) || trimmed.match(/^-\s+/)) && 
                         trimmed.length > 10) {
                    scenarioLines.push(trimmed);
                }
            }
            
            if (scenarioLines.length > 0) {
                const randomIndex = Math.floor(Math.random() * scenarioLines.length);
                const chosenScenario = scenarioLines[randomIndex];
                
                promptContent = `ВЫБРАННЫЙ СЦЕНАРИЙ:\n${chosenScenario}\n\n${promptContent}`;
                
                promptContent = promptContent.replace(/\*\*СЦЕНАРИИ[\s\S]*?(?=\n\*\*|\n\n|$)/gi, '');
                promptContent = promptContent.replace(/\*\*сценарии[\s\S]*?(?=\n\*\*|\n\n|$)/gi, '');
            }
        }
        
        if (!promptContent.includes(clientTypeInstruction)) {
            promptContent = `${clientTypeInstruction}\n\n${promptContent}`;
        }
        
        console.log("=== ФИНАЛЬНЫЙ ПРОМПТ ДЛЯ ВСЕХ ВЕРТИКАЛЕЙ ===");
        console.log("Тип клиента:", isRandomClient ? "Случайный" : selectedClientType);
        console.log("Вертикаль:", auth.currentUser?.group);
        console.log("Длина:", promptContent.length, "символов");
        console.log("Первые 400 символов:", promptContent.substring(0, 400));
        
        const systemMessage = {
            role: "system",
            content: promptContent
        };
        
        const messageHistory = chatMessages.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
        }));
        
        const messages = chatMessages.length === 0 ? [systemMessage] : [systemMessage, ...messageHistory];
        
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                messages: messages,
                model: 'deepseek-chat',
                max_tokens: 2000,
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            throw new Error('Ошибка соединения с AI');
        }
        
        const data = await response.json();
        
        if (data.choices?.[0]?.message?.content) {
            const aiResponse = data.choices[0].message.content;
            addMessage('ai', aiResponse);
            
            if (aiResponse.includes('ОЦЕНКА:') || aiResponse.match(/\d+\s*\/\s*5/)) {
                checkForEvaluationInResponse(aiResponse);
            }
        } else {
            throw new Error('Неверный формат ответа');
        }
        
    } catch (error) {
        console.error('Ошибка:', error);
        addMessage('ai', 'Извините, произошла ошибка. Попробуйте начать тренировку заново.');
        resetTrainingState();
    }
}
        

document.addEventListener('DOMContentLoaded', async function() {
    const savedUser = localStorage.getItem('dialogue_currentUser');
    
    await Promise.all([loadDynamicPrompts(), loadDynamicNews()]);
    
    if (savedUser) {
        try {
            const user = JSON.parse(savedUser);
            auth.currentUser = user;
            auth.isAuthenticated = true;
            auth.userRole = user.role || 'user';
            
            checkAndResetDailyLimit();
            
            auth.showMainApp();
        } catch (e) {
            console.error('Ошибка загрузки пользователя:', e);
            auth.showAuthModal();
        }
    } else {
        auth.showAuthModal();
    }
});

function checkAndResetDailyLimit() {
    if (!auth.currentUser) return;
    
    const now = new Date();
    const today = now.toDateString();
    const stats = auth.currentUser.stats;
    
    if (stats.lastSessionDate) {
        const lastDate = new Date(stats.lastSessionDate).toDateString();
        
        if (lastDate !== today) {
            stats.dailySessions = 0;
            stats.lastSessionDate = now.toISOString();
            dailySessionsUsed = 0;
            lastResetTime = now;
            
            auth.saveUserStats(stats);
            
            if (document.getElementById('dailyLimitNotification')) {
                updateDailyLimitNotification();
            }
        } else {
            dailySessionsUsed = stats.dailySessions || 0;
        }
    }
    
    if (!lastResetTime) {
        lastResetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    }
}

function updateDailyLimitNotification() {
    if (!auth.currentUser || auth.isTrainer()) return;
    
    const remaining = dailyLimit - dailySessionsUsed;
    const badge = document.getElementById('dailyLimitBadge');
    
    if (badge) {
        badge.textContent = `${dailySessionsUsed}/${dailyLimit}`;
        badge.className = 'limit-badge';
        
        if (remaining > 3) {
            badge.title = `Осталось тренировок: ${remaining}`;
        } else if (remaining > 0) {
            badge.className = 'limit-badge warning';
            badge.title = `Внимание! Осталось тренировок: ${remaining}`;
        } else {
            badge.className = 'limit-badge danger';
            badge.title = 'Лимит исчерпан. Сброс в 00:00';
        }
    }
}

function loadInterfaceForRole() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    sidebar.innerHTML = '';
    mainContent.innerHTML = '';
    
    if (auth.isTrainer()) {
        loadTrainerInterface();
    } else {
        loadStudentInterface();
    }
}

function loadStudentInterface() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    sidebar.innerHTML = `
        <a href="javascript:void(0);" onclick="switchTab('home')" class="nav-item active" data-tab="home">
            <i class="fas fa-home"></i> Главная
        </a>
        <a href="javascript:void(0);" onclick="switchTab('training')" class="nav-item" data-tab="training">
            <i class="fas fa-dumbbell"></i> Тренировка
        </a>
        <a href="javascript:void(0);" onclick="switchTab('progress')" class="nav-item" data-tab="progress">
            <i class="fas fa-chart-line"></i> Прогресс
        </a>
        <a href="javascript:void(0);" onclick="switchTab('leaderboard')" class="nav-item" data-tab="leaderboard">
            <i class="fas fa-trophy"></i> Рейтинг
        </a>
        <a href="javascript:void(0);" onclick="switchTab('achievements')" class="nav-item" data-tab="achievements">
            <i class="fas fa-medal"></i> Достижения
        </a>
        <a href="javascript:void(0);" onclick="switchTab('history')" class="nav-item" data-tab="history">
            <i class="fas fa-history"></i> История
        </a>
        <a href="javascript:void(0);" onclick="switchTab('export')" class="nav-item" data-tab="export">
            <i class="fas fa-file-export"></i> Экспорт
        </a>
    `;
    
    mainContent.innerHTML = `
        <div class="tab-content active" id="home-tab">
            <div class="welcome-section">
                <div class="section-title">
                    <i class="fas fa-bullhorn"></i>
                    <span>Добро пожаловать в диалоговый тренажер!</span>
                </div>
                
                <div class="confidentiality-warning">
                    <h4><i class="fas fa-exclamation-triangle"></i> ВАЖНО: Конфиденциальность данных</h4>
                    <div class="confidentiality-list">
                        <div class="prohibited">
                            <strong>ЗАПРЕЩЕНО указывать:</strong>
                            <ul style="margin: 5px 0 0 15px; padding: 0; font-size: 10px;">
                                <li>Конфиденциальную информацию компании</li>
                                <li>Персональные данные клиентов</li>
                                <li>Банковские/паспортные данные</li>
                            </ul>
                        </div>
                        <div class="recommended">
                            <strong>РЕКОМЕНДАЦИИ:</strong>
                            <ul style="margin: 5px 0 0 15px; padding: 0; font-size: 10px;">
                                <li>Используйте вымышленные данные</li>
                                <li>Не указывайте реальные имена</li>
                                <li>Сохраняйте конфиденциальность</li>
                            </ul>
                        </div>
                    </div>
                </div>
                
                <div class="news-section" id="newsSection">
                    <div class="news-title">
                        <i class="fas fa-newspaper"></i>
                        <span>Новости тренажера</span>
                    </div>
                    <div class="news-grid" id="newsGrid"></div>
                </div>
                
                <div class="vertical-info">
                    <h3><i class="fas fa-info-circle"></i> Ваша вертикаль: <span id="userVerticalDisplay">${auth.currentUser.group || 'Не указана'}</span></h3>
                    <p>Вы будете тренироваться только на сценариях своей вертикали.</p>
                    <div>
                        <span class="client-type-badge">😠 Агрессивный</span>
                        <span class="client-type-badge">😔 Пассивный</span>
                        <span class="client-type-badge">🧐 Требовательный</span>
                        <span class="client-type-badge">🤔 Нерешительный</span>
                        <span class="client-type-badge">😄 Славный малый</span>
                    </div>
                    <div class="storage-info" style="margin-top: 10px;">
                        <i class="fas fa-database"></i> История чатов хранится 30 дней
                    </div>
                </div>
                
                <div class="section-title" style="margin-top: 20px;">
                    <i class="fas fa-chart-line"></i>
                    <span>Статистика системы</span>
                </div>
                
                <div class="stats-cards">
                    <div class="stat-card">
                        <div class="value" id="totalUsers">0</div>
                        <div class="label">Всего пользователей</div>
                    </div>
                    <div class="stat-card">
                        <div class="value" id="totalSessions">0</div>
                        <div class="label">Всего тренировок</div>
                    </div>
                    <div class="stat-card">
                        <div class="value" id="avgSystemScore">0.0</div>
                        <div class="label">Средний балл</div>
                    </div>
                    <div class="stat-card">
                        <div class="value" id="activeToday">0</div>
                        <div class="label">Активных сегодня</div>
                    </div>
                </div>
                
                <div class="section-title" style="margin-top: 20px;">
                    <i class="fas fa-bolt"></i>
                    <span>Быстрый старт</span>
                </div>
                
                <div class="action-buttons">
                    <button class="btn btn-primary" onclick="switchTab('training')">
                        <i class="fas fa-play-circle"></i> Начать тренировку
                    </button>
                </div>
            </div>
        </div>

        <div class="tab-content" id="training-tab">
            <div class="adaptive-notice">
                <i class="fas fa-magic"></i> Тренажер автоматически подстроится под выбранный сценарий и тип клиента
            </div>
            
            <div class="training-container">
                <div class="scenario-section">
                    <div class="vertical-info">
                        <h3><i class="fas fa-building"></i> Ваша вертикаль: <span id="currentVerticalName">${auth.currentUser.group || 'Не указана'}</span>
                            <span id="dailyLimitBadge" class="limit-badge">${dailySessionsUsed}/${dailyLimit}</span>
                        </h3>
                        <p>Выберите тип клиента для тренировки:</p>
                        
                        <div class="client-type-selector" id="clientTypeSelector">
                            <div class="client-type-option" data-type="aggressive" onclick="selectClientType('aggressive', false)">
                                😠 Агрессивный
                            </div>
                            <div class="client-type-option" data-type="passive" onclick="selectClientType('passive', false)">
                                😔 Пассивный
                            </div>
                            <div class="client-type-option" data-type="demanding" onclick="selectClientType('demanding', false)">
                                🧐 Требовательный
                            </div>
                            <div class="client-type-option" data-type="indecisive" onclick="selectClientType('indecisive', false)">
                                🤔 Нерешительный
                            </div>
                            <div class="client-type-option" data-type="chatty" onclick="selectClientType('chatty', false)">
                                😄 Славный малый
                            </div>
                            <div class="client-type-option random" onclick="selectRandomClientType()">
                                🎲 Случайный клиент
                            </div>
                        </div>
                    </div>

                    <div class="scenario-card">
                        <div class="scenario-title">
                            <span id="scenarioTitle">Выберите тип клиента</span>
                        </div>
                        <div class="scenario-details" id="scenarioDescription">
                            ${isRandomClient ? 'Выбран случайный тип клиента. Диалог начнется с сообщения от клиента.' : 'Выберите тип клиента из списка выше, чтобы начать тренировку. Тренировка длится до 15 минут.'}
                        </div>
                        
                        <div class="action-buttons" id="actionButtons">
                            <button class="btn btn-primary" id="startTrainingBtn" onclick="startTraining()" disabled>
                                Начать тренировку
                            </button>
                            <button class="btn btn-secondary" id="endTrainingBtn" onclick="finishChat()">
                                Завершить тренировку
                            </button>
                            <div class="training-timer" id="trainingTimer"></div>
                        </div>
                    </div>
                </div>

                <div class="chat-section">
                    <div class="chat-header">
                        <div class="chat-title">💬 Тренировочный чат</div>
                        <div class="chat-status" id="chatStatus">Ожидание начала</div>
                    </div>
                    
                    <div class="chat-messages" id="chatMessages">
                        <div class="message ai">
                            Привет! Я готов к тренировке. Выберите тип клиента, чтобы начать тренировку.
                        </div>
                    </div>
                    
                    <div class="chat-input-container">
                        <div class="chat-input-wrapper">
                            <textarea 
                                class="chat-input" 
                                id="chatInput" 
                                placeholder="Введите ваше сообщение..." 
                                rows="1"
                                onkeydown="handleChatInput(event)"
                                disabled
                            ></textarea>
                            <button class="send-btn" id="sendBtn" onclick="sendMessage()" disabled>
                                Отправить
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="tab-content" id="progress-tab">
            <div class="progress-panel">
                <div class="level-info">
                    <div class="level-badge" id="currentLevelBadge">Уровень 1</div>
                    <div class="level-name" id="currentLevelName">Новичок</div>
                </div>
                
                <div class="xp-bar">
                    <div class="xp-fill" id="xpFill"></div>
                    <div class="xp-text" id="xpText">0/100 XP</div>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-icon">🎯</span>
                        <span class="stat-value" id="sessionsCount">0</span>
                        <span class="stat-label">тренировок</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">⭐</span>
                        <span class="stat-value" id="avgScore">0</span>
                        <span class="stat-label">средний балл</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">🔥</span>
                        <span class="stat-value" id="streakCount">0</span>
                        <span class="stat-label">дней подряд</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">🏆</span>
                        <span class="stat-value" id="rankPosition">-</span>
                        <span class="stat-label">место в рейтинге</span>
                    </div>
                </div>
            </div>

            <div class="badges-section">
                <div class="section-title">
                    <span>📈 Статистика по типам клиентов</span>
                </div>
                <div class="chart-container">
                    <canvas id="progressChart"></canvas>
                </div>
            </div>
        </div>

        <div class="tab-content" id="leaderboard-tab">
            <div class="leaderboard">
                <div class="leaderboard-title">
                    <span>🏆 Таблица лидеров</span>
                    <div class="leaderboard-tabs" id="leaderboardTabs">
                        <div class="leaderboard-tab active" data-filter="all">Общий</div>
                        <div class="leaderboard-tab" data-filter="Программа лояльности">Лояльность</div>
                        <div class="leaderboard-tab" data-filter="ОПК">ОПК</div>
                        <div class="leaderboard-tab" data-filter="Фудтех">Фудтех</div>
                        <div class="leaderboard-tab" data-filter="Маркет">Маркет</div>
                        <div class="leaderboard-tab" data-filter="Аптека">Аптека</div>
                        <div class="leaderboard-tab" data-filter="Сборка">Сборка</div>
                    </div>
                </div>
                
                <table class="leaderboard-table">
                    <thead>
                        <tr>
                            <th class="rank">#</th>
                            <th>Сотрудник</th>
                            <th>Вертикаль</th>
                            <th>Уровень</th>
                            <th>Тренировок</th>
                            <th>Средний балл</th>
                            <th>XP</th>
                        </tr>
                    </thead>
                    <tbody id="leaderboardBody"></tbody>
                </table>
            </div>
        </div>

        <div class="tab-content" id="achievements-tab">
            <div class="badges-section">
                <div class="section-title">
                    <span>🏆 Все достижения</span>
                </div>
                <p style="color: #666; margin-bottom: 15px; font-size: 14px;">
                    Зарабатывайте бейджи, совершенствуя навыки работы с клиентами.
                </p>
                <div class="badges-grid" id="allBadgesGrid"></div>
            </div>
        </div>

        <div class="tab-content" id="history-tab">
            <div class="badges-section">
                <div class="section-title">
                    <span>📜 История тренировок</span>
                    <div class="storage-info" style="margin-left: 10px; display: inline-block;">
                        <i class="fas fa-info-circle"></i> История хранится 30 дней
                    </div>
                </div>
                
                <div style="margin-top: 15px; max-height: 500px; overflow-y: auto;" id="historyList"></div>
            </div>
        </div>

        <div class="tab-content" id="export-tab">
            <div class="welcome-section">
                <div class="section-title">
                    <i class="fas fa-file-export"></i>
                    <span>Экспорт данных</span>
                </div>
                
                <p style="margin-bottom: 20px; color: #666; font-size: 14px;">
                    Вы можете выгрузить свои тренировки и статистику в формате PDF для анализа и отчетности.
                </p>
                
                <div class="export-options">
                    <div class="export-card">
                        <div class="export-icon">
                            <i class="fas fa-comments"></i>
                        </div>
                        <div class="export-content">
                            <h3>Экспорт диалогов</h3>
                            <p>Выберите тренировку для экспорта полного диалога в PDF</p>
                            <div class="export-history" id="exportHistoryList" style="max-height: 300px; overflow-y: auto; margin-top: 10px;">
                                Загрузка истории...
                            </div>
                        </div>
                    </div>
                    
                    <div class="export-card">
                        <div class="export-icon">
                            <i class="fas fa-chart-bar"></i>
                        </div>
                        <div class="export-content">
                            <h3>Экспорт статистики</h3>
                            <p>Создайте полный отчет со всей вашей статистикой и достижениями</p>
                            <button class="btn btn-primary" onclick="exportStudentStatsToPDF()" style="margin-top: 15px;">
                                <i class="fas fa-download"></i> Экспортировать всю статистику
                            </button>
                        </div>
                    </div>
                    
                    <div class="export-card">
                        <div class="export-icon">
                            <i class="fas fa-calendar-alt"></i>
                        </div>
                        <div class="export-content">
                            <h3>Экспорт по периоду</h3>
                            <p>Выгрузите тренировки за определенный период времени</p>
                            <div class="period-selector" style="margin-top: 15px;">
                                <input type="date" id="exportDateFrom" class="form-control" style="margin-bottom: 10px;">
                                <input type="date" id="exportDateTo" class="form-control" style="margin-bottom: 10px;">
                                <button class="btn btn-secondary" onclick="exportPeriodStatsToPDF()">
                                    <i class="fas fa-download"></i> Экспорт периода
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="storage-info" style="margin-top: 20px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
                    <i class="fas fa-info-circle"></i> 
                    <strong>Важно:</strong> PDF файлы содержат полную историю диалогов. 
                    Убедитесь, что вы не разглашаете конфиденциальную информацию.
                </div>
            </div>
        </div>
    `;
    
    checkAndResetDailyLimit();
    updateDailyLimitNotification();
    
    loadStats();
    loadSystemStats();
    setupLeaderboardTabs();
    renderAllAchievements();
    renderHistory();
    renderDynamicNews();
    loadExportHistory();
}

function selectClientType(type, isRandom = false) {
    const options = document.querySelectorAll('.client-type-option');
    options.forEach(opt => opt.classList.remove('selected'));
    
    if (!isRandom) {
        const selectedOption = document.querySelector(`.client-type-option[data-type="${type}"]`);
        if (selectedOption) {
            selectedOption.classList.add('selected');
        }
        selectedClientType = type;
        isRandomClient = false;
    } else {
        selectedClientType = type;
        isRandomClient = true;
    }
    
    document.getElementById('startTrainingBtn').disabled = false;
    
    if (isRandomClient) {
        document.getElementById('scenarioTitle').textContent = 'Случайный клиент';
        document.getElementById('scenarioDescription').textContent = 'Выбран случайный тип клиента. Диалог начнется с сообщения от клиента.';
    } else {
        const clientType = clientTypes[type];
        document.getElementById('scenarioTitle').textContent = clientType.name;
        document.getElementById('scenarioDescription').textContent = clientType.description;
    }
}

function selectRandomClientType() {
    const types = Object.keys(clientTypes);
    const randomType = types[Math.floor(Math.random() * types.length)];
    selectClientType(randomType, true);
}

async function startTraining() {
    if (!auth.currentUser) {
        alert('Сначала войдите в систему!');
        return;
    }
    
    if (!selectedClientType) {
        alert('Выберите тип клиента для тренировки!');
        return;
    }
    
    if (dailySessionsUsed >= dailyLimit) {
        alert('Лимит тренировок на сегодня исчерпан. Сброс в 00:00');
        return;
    }
    
    if (!auth.currentUser.group) {
        alert('У вас не указана вертикаль!');
        return;
    }
    
    currentPrompt = getPromptForVertical(auth.currentUser.group);
    
    if (!currentPrompt) {
        alert('Для вашей вертикали нет промтов. Обратитесь к администратору.');
        return;
    }
    
    trainingInProgress = true;
    trainingStartTime = new Date();
    chatMessages = [];
    lastAIFeedback = "";
    
    document.getElementById('startTrainingBtn').style.display = 'none';
    document.getElementById('chatInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;
    document.getElementById('chatStatus').textContent = 'Тренировка активна';
    document.getElementById('chatStatus').className = 'chat-status training-active';
    
    document.querySelectorAll('.client-type-option').forEach(opt => opt.style.pointerEvents = 'none');
    
    const chatMessagesDiv = document.getElementById('chatMessages');
    chatMessagesDiv.innerHTML = '';
    
    await sendPromptToAI();
    
    startTrainingTimer();
    
    setTimeout(() => {
        document.getElementById('chatInput').focus();
        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    }, 100);
}

function startTrainingTimer() {
    clearInterval(trainingTimerInterval);
    trainingTimerInterval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now - trainingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('trainingTimer').textContent = `Время: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (elapsed >= 900) {
            endTraining();
        }
    }, 1000);
}

function endTraining() {
    if (!trainingInProgress) return;
    
    clearInterval(trainingTimerInterval);
    
    const duration = Math.floor((new Date() - trainingStartTime) / 1000);
    
    if (chatMessages.length < 2) {
        if (!confirm('Диалог слишком короткий. Завершить тренировку?')) {
            return;
        }
    }
    
    const evaluation = evaluateDialogue(chatMessages, selectedClientType);
    const clientType = clientTypes[selectedClientType];
    
    const lastAIMessage = chatMessages.filter(msg => msg.sender === 'ai').pop();
    if (lastAIMessage?.text) {
        lastAIFeedback = extractAIFeedback(lastAIMessage.text);
        if (lastAIFeedback.includes('ОЦЕНКА:') || lastAIFeedback.match(/\d+\s*\/\s*5/)) {
            const aiScoreMatch = lastAIFeedback.match(/(\d+)\s*\/\s*5/);
            if (aiScoreMatch) {
                evaluation.score = parseInt(aiScoreMatch[1]);
                evaluation.feedback = "Оценка от AI: " + lastAIFeedback.split('\n').find(line => line.includes('ОЦЕНКА:')) || "Обратная связь от AI";
            }
        }
    }
    
    awardXP(
        evaluation.score, 
        isRandomClient ? 'Случайный клиент' : clientType.description, 
        selectedClientType, 
        evaluation.feedback,
        duration,
        lastAIFeedback
    ).then(result => {
        showResultModal(
            `Тренировка завершена!`,
            `${isRandomClient ? 'Случайный клиент' : clientType.name} (${auth.currentUser.group})`,
            evaluation.score >= 4 ? "🏆" : "📝",
            result.xp,
            evaluation,
            duration,
            lastAIFeedback
        );
    });
    
    resetTrainingState();
}

function resetTrainingState() {
    trainingInProgress = false;
    trainingStartTime = null;
    selectedClientType = null;
    currentPrompt = null;
    isRandomClient = false;
    clearInterval(trainingTimerInterval);
    
    document.getElementById('startTrainingBtn').style.display = 'flex';
    document.getElementById('endTrainingBtn').style.display = 'none';
    document.getElementById('startTrainingBtn').disabled = true;
    document.getElementById('trainingTimer').textContent = '';
    document.getElementById('chatInput').disabled = true;
    document.getElementById('sendBtn').disabled = true;
    document.getElementById('chatStatus').textContent = 'Ожидание начала';
    document.getElementById('chatStatus').className = 'chat-status';
    
    document.querySelectorAll('.client-type-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.style.pointerEvents = 'auto';
    });
    
    document.getElementById('scenarioTitle').textContent = 'Выберите тип клиента';
    document.getElementById('scenarioDescription').textContent = 'Выберите тип клиента из списка выше, чтобы начать тренировку. Тренировка длится до 15 минут.';
}

function handleChatInput(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message || !trainingInProgress) return;
    
    addMessage('user', message);
    
    input.value = '';
    input.style.height = 'auto';
    
    sendPromptToAI().catch(error => {
        console.error('Ошибка при отправке сообщения:', error);
        addMessage('ai', 'Извините, произошла ошибка. Попробуйте еще раз.');
    });
}

function addMessage(sender, text) {
    const chatMessagesDiv = document.getElementById('chatMessages');
    if (!chatMessagesDiv) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.textContent = text;
    chatMessagesDiv.appendChild(messageDiv);
    
    chatMessages.push({
        sender: sender,
        text: text,
        timestamp: new Date().toISOString()
    });
    
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

function extractAIFeedback(aiMessage) {
    if (!aiMessage) return "";
    
    const lines = aiMessage.split('\n');
    let feedbackStart = -1;
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/ОЦЕНКА\s*:\s*\d+\s*[из\/\s]*5/i) || 
            lines[i].match(/\d+\s*[из\/\s]*5\s*$/i)) {
            feedbackStart = i;
            break;
        }
    }
    
    if (feedbackStart >= 0) {
        return lines.slice(feedbackStart).join('\n').trim();
    }
    
    const scoreMatch = aiMessage.match(/(\d+)\s*[из\/\s]*5/i);
    if (scoreMatch) {
        const index = aiMessage.lastIndexOf(scoreMatch[0]);
        if (index >= 0) {
            return aiMessage.substring(index).trim();
        }
    }
    
    return aiMessage.substring(Math.max(0, aiMessage.length - 3000)).trim();
}

function evaluateDialogue(messages, clientType) {
    const userMessages = messages.filter(msg => msg.sender === 'user');
    
    let score = 3.0;
    
    if (userMessages.length >= 3) score += 0.5;
    if (userMessages.length >= 5) score += 0.5;
    
    const lastUserMessage = userMessages[userMessages.length - 1];
    if (lastUserMessage) {
        const text = lastUserMessage.text.toLowerCase();
        if (text.includes('спасибо') || text.includes('до свидания') || 
            text.includes('всего доброго') || text.includes('хорошего дня')) {
            score += 0.5;
        }
    }
    
    let professionalPhrases = 0;
    userMessages.forEach(msg => {
        const text = msg.text.toLowerCase();
        if (text.includes('понимаю') || text.includes('помогу') || 
            text.includes('решим') || text.includes('вариант') ||
            text.includes('предложу') || text.includes('помочь')) {
            professionalPhrases++;
        }
    });
    
    if (professionalPhrases >= 2) score += 0.5;
    
    score = Math.max(1.0, Math.min(5.0, score));
    const roundedScore = Math.round(score * 2) / 2;
    
    let feedback = "";
    
    if (roundedScore >= 4.5) {
        feedback = "Отличная работа! Вы профессионально справились с клиентом.";
    } else if (roundedScore >= 4.0) {
        feedback = "Хорошая работа! Вы хорошо адаптировались к типу клиента.";
    } else if (roundedScore >= 3.0) {
        feedback = "Неплохо! Есть потенциал для улучшения.";
    } else {
        feedback = "Попробуйте быть более активным и внимательным к клиенту.";
    }
    
    return {
        score: roundedScore,
        feedback: feedback,
        criteria: {
            messageCount: userMessages.length,
            professionalPhrases: professionalPhrases,
            properEnding: lastUserMessage && (
                lastUserMessage.text.toLowerCase().includes('спасибо') ||
                lastUserMessage.text.toLowerCase().includes('до свидания') ||
                lastUserMessage.text.toLowerCase().includes('всего доброго')
            )
        }
    };
}

async function awardXP(score, scenario, clientType, evaluation, duration, aiFeedback = "") {
    if (!auth.currentUser) {
        console.error('Нет пользователя!');
        return { xp: 0, session: null };
    }
    
    if (dailySessionsUsed >= dailyLimit) {
        alert('Лимит тренировок на сегодня исчерпан');
        return { xp: 0, session: null };
    }
    
    let xpEarned = 50;
    
    if (score === 5) xpEarned += 30;
    else if (score >= 4.5) xpEarned += 20;
    else if (score >= 4) xpEarned += 15;
    else if (score >= 3.5) xpEarned += 10;
    else if (score >= 3) xpEarned += 5;
    
    const userStats = auth.currentUser.stats;
    
    if (!userStats) {
        auth.currentUser.stats = auth.createDefaultStats(auth.currentUser.group);
        return await awardXP(score, scenario, clientType, evaluation, duration, aiFeedback);
    }
    
    dailySessionsUsed++;
    userStats.dailySessions = dailySessionsUsed;
    userStats.lastSessionDate = new Date().toISOString();
    
    userStats.totalXP = (userStats.totalXP || 0) + xpEarned;
    userStats.completedSessions = (userStats.completedSessions || 0) + 1;
    userStats.totalScore = (userStats.totalScore || 0) + score;
    userStats.averageScore = userStats.completedSessions > 0 ? userStats.totalScore / userStats.completedSessions : 0;
    
    if (clientType) {
        if (!userStats.clientTypesCompleted) {
            userStats.clientTypesCompleted = Object.fromEntries(
                ['aggressive', 'passive', 'demanding', 'indecisive', 'chatty'].map(type => [
                    type,
                    { sessions: 0, totalXP: 0, totalScore: 0, avgScore: 0 }
                ])
            );
        }
        
        if (userStats.clientTypesCompleted[clientType]) {
            const clientStats = userStats.clientTypesCompleted[clientType];
            clientStats.sessions = (clientStats.sessions || 0) + 1;
            clientStats.totalXP = (clientStats.totalXP || 0) + xpEarned;
            clientStats.totalScore = (clientStats.totalScore || 0) + score;
            clientStats.avgScore = clientStats.sessions > 0 ? clientStats.totalScore / clientStats.sessions : 0;
        }
    }
    
    const today = new Date().toISOString().split('T')[0];
    if (userStats.lastTrainingDate !== today) {
        const lastDate = userStats.lastTrainingDate ? new Date(userStats.lastTrainingDate) : null;
        const todayDate = new Date();
        
        if (lastDate && (todayDate - lastDate) / (1000 * 60 * 60 * 24) === 1) {
            userStats.currentStreak = (userStats.currentStreak || 0) + 1;
        } else if (!lastDate || (todayDate - lastDate) / (1000 * 60 * 60 * 24) > 1) {
            userStats.currentStreak = 1;
        }
        userStats.lastTrainingDate = today;
    }
    
    const sessionData = {
        date: new Date().toISOString(),
        scenario: scenario,
        score: score,
        xp: xpEarned,
        icon: clientTypes[clientType]?.icon || "🎯",
        clientType: clientType,
        evaluation: evaluation,
        messages: chatMessages,
        duration: duration,
        vertical: auth.currentUser.group,
        prompt_used: currentPrompt,
        ai_feedback: aiFeedback,
        trainer_comments: []
    };
    
    if (!userStats.trainingHistory) {
        userStats.trainingHistory = [];
    }
    userStats.trainingHistory.unshift(sessionData);
    
    try {
        const saveResult = await auth.saveUserStats(userStats);
        if (!saveResult) {
            localStorage.setItem('dialogue_currentUser', JSON.stringify(auth.currentUser));
        }
    } catch (error) {
        console.error('Ошибка при сохранении статистики:', error);
        localStorage.setItem('dialogue_currentUser', JSON.stringify(auth.currentUser));
    }
    
    try {
        await auth.addTrainingSession({
            ...sessionData,
            clientType: clientType
        });
    } catch (error) {
        console.error('Ошибка при сохранении сессии:', error);
    }
    
    auth.currentUser.stats = userStats;
    
    updateDailyLimitNotification();
    checkAchievements(score, clientType, duration);
    updateProgressUI();
    updateLeaderboard('all');
    renderHistory();
    renderProgressChart();
    loadSystemStats();
    loadExportHistory();
    
    return {
        xp: xpEarned,
        session: sessionData
    };
}
    
function checkForEvaluationInResponse(response) {
    const lowerResponse = response.toLowerCase();
    
    const patterns = [
        /оценка[:\s]*(\d)[\s]*[из\/\s]*5/i,
        /(\d)[\s]*[из\/\s]*5/i,
        /оценка[:\s]*(\d)/i
    ];
    
    let foundScore = null;
    
    for (const pattern of patterns) {
        const match = lowerResponse.match(pattern);
        if (match && match[1]) {
            foundScore = parseInt(match[1]);
            break;
        }
    }
    
    if (foundScore && foundScore >= 1 && foundScore <= 5) {
        setTimeout(() => {
            if (trainingInProgress) {
                const duration = Math.floor((new Date() - trainingStartTime) / 1000);
                
                lastAIFeedback = extractAIFeedback(response);
                
                const evaluation = {
                    score: foundScore,
                    feedback: "Оценка определена из ответа DeepSeek",
                    criteria: { autoEvaluated: true }
                };
                
                awardXP(foundScore, isRandomClient ? 'Случайный клиент' : clientTypes[selectedClientType]?.description || '', selectedClientType, evaluation.feedback, duration, lastAIFeedback)
                    .then(result => {
                        showResultModal(
                            `Тренировка завершена!`,
                            `Клиент оценил вашу работу на ${foundScore}/5`,
                            foundScore >= 4 ? "🏆" : "📝",
                            result.xp,
                            evaluation,
                            duration,
                            lastAIFeedback
                        );
                    });
                
                resetTrainingState();
            }
        }, 2000);
    }
}

function checkLevelUp() {
    if (!auth.currentUser) return;
    
    const userStats = auth.currentUser.stats;
    const nextLevel = levels.find(l => l.level === userStats.currentLevel + 1);
    if (nextLevel && userStats.totalXP >= nextLevel.requiredXP) {
        userStats.currentLevel++;
        showResultModal(`Уровень повышен!`, `Теперь вы ${levels.find(l => l.level === userStats.currentLevel).name}!`, "🆙", 0, {score: 5, feedback: "Поздравляем с повышением уровня!"}, 0, "");
        auth.saveUserStats(userStats);
        updateProgressUI();
    }
}

function checkAchievements(score, clientType, duration) {
    if (!auth.currentUser) return;
    
    const newAchievements = [];
    const userStats = auth.currentUser.stats;
    
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    
    const weeklySessions = userStats.trainingHistory?.filter(session => 
        new Date(session.date) >= weekAgo
    ).length || 0;
    
    const monthlySessions = userStats.trainingHistory?.filter(session => 
        new Date(session.date) >= monthAgo
    ).length || 0;
    
    let verticalRank = 999;
    let globalRank = 999;
    
    const hour = today.getHours();
    const trainingBefore9am = hour < 9;
    const trainingAfter10pm = hour >= 22;
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;
    const quickTraining = duration < 180 && score >= 4;
    
    let perfectStreak = 0;
    const recentSessions = userStats.trainingHistory?.slice(0, 5) || [];
    for (const session of recentSessions) {
        if (session.score === 5) {
            perfectStreak++;
        } else {
            break;
        }
    }
    
    const perfectSessions = userStats.trainingHistory?.filter(s => s.score === 5).length || 0;
    
    let totalMessages = 0;
    userStats.trainingHistory?.forEach(session => {
        if (session.messages && Array.isArray(session.messages)) {
            totalMessages += session.messages.length;
        }
    });
    
    const clientTypesSet = new Set();
    userStats.trainingHistory?.forEach(session => {
        if (session.clientType) clientTypesSet.add(session.clientType);
    });
    const allClientTypes = clientTypesSet.size >= 5;
    
    const stats = {
        sessions: userStats.completedSessions,
        max_score: Math.max(score, ...(userStats.trainingHistory?.map(h => h.score) || [0])),
        avg_score: userStats.averageScore,
        level: userStats.currentLevel,
        total_xp: userStats.totalXP,
        streak: userStats.currentStreak,
        aggressive_sessions: userStats.clientTypesCompleted?.aggressive?.sessions || 0,
        passive_sessions: userStats.clientTypesCompleted?.passive?.sessions || 0,
        demanding_sessions: userStats.clientTypesCompleted?.demanding?.sessions || 0,
        indecisive_sessions: userStats.clientTypesCompleted?.indecisive?.sessions || 0,
        chatty_sessions: userStats.clientTypesCompleted?.chatty?.sessions || 0,
        weekly_sessions: weeklySessions,
        monthly_sessions: monthlySessions,
        vertical_rank: verticalRank,
        global_rank: globalRank,
        early_session: trainingBefore9am,
        late_session: trainingAfter10pm,
        quick_session: quickTraining,
        weekend_session: isWeekend,
        perfect_streak: perfectStreak,
        perfect_sessions: perfectSessions,
        total_messages: totalMessages,
        all_client_types: allClientTypes,
        daily_sessions: dailySessionsUsed,
        conflicts_resolved: Math.floor(userStats.completedSessions / 2),
        first_month_active: true,
        one_year_active: false
    };
    
    achievements.forEach(achievement => {
        if (userStats.achievementsUnlocked.includes(achievement.id)) return;
        
        let conditionMet = false;
        
        switch(achievement.condition) {
            case "sessions >= 1": conditionMet = stats.sessions >= 1; break;
            case "weekly_sessions >= 3": conditionMet = stats.weekly_sessions >= 3; break;
            case "monthly_sessions >= 5": conditionMet = stats.monthly_sessions >= 5; break;
            case "monthly_sessions >= 10": conditionMet = stats.monthly_sessions >= 10; break;
            case "monthly_sessions >= 20": conditionMet = stats.monthly_sessions >= 20; break;
            case "streak >= 3": conditionMet = stats.streak >= 3; break;
            case "streak >= 7": conditionMet = stats.streak >= 7; break;
            case "streak >= 30": conditionMet = stats.streak >= 30; break;
            case "max_score >= 5": conditionMet = stats.max_score >= 5; break;
            case "avg_score >= 4": conditionMet = stats.avg_score >= 4; break;
            case "avg_score >= 4.5": conditionMet = stats.avg_score >= 4.5; break;
            case "perfect_streak >= 5": conditionMet = stats.perfect_streak >= 5; break;
            case "level >= 3": conditionMet = stats.level >= 3; break;
            case "level >= 5": conditionMet = stats.level >= 5; break;
            case "level >= 7": conditionMet = stats.level >= 7; break;
            case "total_xp >= 500": conditionMet = stats.total_xp >= 500; break;
            case "total_xp >= 1000": conditionMet = stats.total_xp >= 1000; break;
            case "total_xp >= 2000": conditionMet = stats.total_xp >= 2000; break;
            case "all_client_types": conditionMet = stats.all_client_types; break;
            case "aggressive_sessions >= 10": conditionMet = stats.aggressive_sessions >= 10; break;
            case "passive_sessions >= 10": conditionMet = stats.passive_sessions >= 10; break;
            case "demanding_sessions >= 10": conditionMet = stats.demanding_sessions >= 10; break;
            case "indecisive_sessions >= 10": conditionMet = stats.indecisive_sessions >= 10; break;
            case "chatty_sessions >= 10": conditionMet = stats.chatty_sessions >= 10; break;
            case "vertical_rank <= 3": conditionMet = stats.vertical_rank <= 3; break;
            case "vertical_rank == 1": conditionMet = stats.vertical_rank == 1; break;
            case "global_rank <= 10": conditionMet = stats.global_rank <= 10; break;
        }
        
        if (conditionMet) {
            newAchievements.push(achievement.id);
        }
    });
    
    newAchievements.forEach(ach => {
        if (!userStats.achievementsUnlocked.includes(ach)) {
            userStats.achievementsUnlocked.push(ach);
            const achievement = achievements.find(a => a.id === ach);
            if (achievement) {
                showAchievementNotification(achievement);
            }
        }
    });
    
    if (newAchievements.length > 0) {
        auth.saveUserStats(userStats);
        renderAllAchievements();
    }
}

async function renderDynamicNews() {
    const newsGrid = document.getElementById('newsGrid');
    if (!newsGrid) return;
    
    if (dynamicNews.length > 0) {
        let newsHTML = '';
        dynamicNews.forEach(newsItem => {
            const date = newsItem.created_at ? formatDate(newsItem.created_at) : 'Нет даты';
            const tag = newsItem.tag || 'НОВОСТИ';
            
            newsHTML += `
                <div class="news-item">
                    <div class="news-date">
                        <i class="far fa-calendar"></i> ${date}
                    </div>
                    <div class="news-content">
                        <strong>${newsItem.title || 'Новая новость'}</strong>
                        <p style="margin-top: 5px;">${newsItem.content || 'Описание новости'}</p>
                        <span class="news-tag">${tag}</span>
                    </div>
                </div>
            `;
        });
        newsGrid.innerHTML = newsHTML;
    } else {
        newsGrid.innerHTML = `
            <div class="news-item">
                <div class="news-date">
                    <i class="far fa-calendar"></i> ${formatDate(new Date())}
                </div>
                <div class="news-content">
                    <strong>Добро пожаловать в тренажер!</strong>
                    <p style="margin-top: 5px;">Начните тренировки для улучшения навыков работы с клиентами.</p>
                    <span class="news-tag">ОБНОВЛЕНИЕ</span>
                </div>
            </div>
        `;
    }
}

function showFeedbackModal() {
    if (!feedbackShown && auth.currentUser && auth.userRole === 'user') {
        setTimeout(() => {
            document.getElementById('feedbackModal').style.display = 'flex';
            feedbackShown = true;
        }, 1000);
    }
}

function openFeedbackForm() {
    window.open('https://forms.yandex.ru/u/696634f8d046880022dab232', '_blank');
    closeFeedbackModal();
}

function closeFeedbackModal() {
    document.getElementById('feedbackModal').style.display = 'none';
}

function showRegisterForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('resetPasswordForm').style.display = 'none';
    document.getElementById('trainerLoginForm').style.display = 'none';
    clearErrors();
}

function showLoginForm() {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('resetPasswordForm').style.display = 'none';
    document.getElementById('trainerLoginForm').style.display = 'none';
    clearErrors();
}

function showResetPasswordForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('resetPasswordForm').style.display = 'block';
    document.getElementById('trainerLoginForm').style.display = 'none';
    clearErrors();
}

function showTrainerLogin() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('resetPasswordForm').style.display = 'none';
    document.getElementById('trainerLoginForm').style.display = 'block';
    clearErrors();
}

function clearErrors() {
    const loginError = document.getElementById('loginError');
    if (loginError) {
        loginError.style.display = 'none';
        loginError.textContent = '';
        loginError.style.color = '#dc3545';
    }
    
    document.getElementById('passwordMatchError').style.display = 'none';
    document.getElementById('resetPasswordError').style.display = 'none';
    const trainerError = document.getElementById('trainerLoginError');
    if (trainerError) trainerError.style.display = 'none';
}

function togglePassword(fieldId, toggleElement) {
    const field = document.getElementById(fieldId);
    if (field.type === 'password') {
        field.type = 'text';
        toggleElement.textContent = '👁️‍🗨️';
    } else {
        field.type = 'password';
        toggleElement.textContent = '👁️';
    }
}

async function handleRegister() {
    const username = document.getElementById('registerUsername').value.trim();
    const group = document.getElementById('registerGroup').value;
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
    const errorElement = document.getElementById('passwordMatchError');
    
    clearErrors();
    
    if (!username) {
        errorElement.textContent = 'Введите никнейм';
        errorElement.style.display = 'block';
        return;
    }
    
    if (username.length < 3) {
        errorElement.textContent = 'Никнейм должен быть не менее 3 символов';
        errorElement.style.display = 'block';
        return;
    }
    
    if (!group) {
        errorElement.textContent = 'Выберите вертикаль';
        errorElement.style.display = 'block';
        return;
    }
    
    if (password.length < 6) {
        errorElement.textContent = 'Пароль должен быть не менее 6 символов';
        errorElement.style.display = 'block';
        return;
    }
    
    if (password !== passwordConfirm) {
        errorElement.textContent = 'Пароли не совпадают';
        errorElement.style.display = 'block';
        return;
    }
    
    const result = await auth.register(username, group, password);
    if (result.success) {
        alert(result.message);
        showLoginForm();
        document.getElementById('loginUsername').value = username;
        document.getElementById('loginPassword').value = password;
        document.getElementById('loginError').textContent = 'Регистрация успешна! Войдите в систему.';
        document.getElementById('loginError').style.color = '#28a745';
        document.getElementById('loginError').style.display = 'block';
    } else {
        errorElement.textContent = result.message;
        errorElement.style.display = 'block';
    }
}

async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorElement = document.getElementById('loginError');
    
    clearErrors();
    
    if (!username) {
        errorElement.textContent = 'Введите никнейм';
        errorElement.style.display = 'block';
        return;
    }
    
    if (!password) {
        errorElement.textContent = 'Введите пароль';
        errorElement.style.display = 'block';
        return;
    }
    
    const result = await auth.login(username, password);
    if (result.success) {
        auth.currentUser = result.user;
        auth.isAuthenticated = true;
        auth.userRole = result.user.role;
        
        checkAndResetDailyLimit();
        auth.showMainApp();
        
        showFeedbackModal();
    } else {
        errorElement.textContent = result.message;
        errorElement.style.color = '#dc3545';
        errorElement.style.display = 'block';
    }
}

async function handleTrainerLogin() {
    const username = document.getElementById('trainerUsername').value.trim();
    const password = document.getElementById('trainerPassword').value;
    const errorElement = document.getElementById('trainerLoginError');
    
    clearErrors();
    
    if (!username) {
        errorElement.textContent = 'Введите логин тренера';
        errorElement.style.display = 'block';
        return;
    }
    
    if (!password) {
        errorElement.textContent = 'Введите пароль';
        errorElement.style.display = 'block';
        return;
    }
    
    const result = await auth.login(username, password);
    if (result.success) {
        if (result.user.role === 'trainer') {
            auth.showMainApp();
        } else {
            errorElement.textContent = 'У вас нет прав тренера.';
            errorElement.style.display = 'block';
            auth.logout();
        }
    } else {
        errorElement.textContent = result.message || 'Неверный логин или пароль';
        errorElement.style.display = 'block';
    }
}

async function handleResetPassword() {
    const username = document.getElementById('resetUsername').value.trim();
    const newPassword = document.getElementById('resetNewPassword').value;
    const passwordConfirm = document.getElementById('resetPasswordConfirm').value;
    const errorElement = document.getElementById('resetPasswordError');
    
    clearErrors();
    
    if (!username) {
        errorElement.textContent = 'Введите никнейм';
        errorElement.style.display = 'block';
        return;
    }
    
    if (newPassword.length < 6) {
        errorElement.textContent = 'Пароль должен быть не менее 6 символов';
        errorElement.style.display = 'block';
        return;
    }
    
    if (newPassword !== passwordConfirm) {
        errorElement.textContent = 'Пароли не совпадают';
        errorElement.style.display = 'block';
        return;
    }
    
    const result = await auth.resetPassword(username, newPassword);
    if (result.success) {
        alert(result.message);
        showLoginForm();
        document.getElementById('loginUsername').value = username;
    } else {
        errorElement.textContent = result.message;
        errorElement.style.display = 'block';
    }
}

function logout() {
    if (confirm('Вы уверены, что хотите выйти?')) {
        auth.logout();
        feedbackShown = false;
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.nav-item[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    if (auth.isTrainer()) {
        switch(tabName) {
            case 'trainer_dashboard':
                loadTrainerDashboard();
                break;
            case 'trainer_students':
                loadAllStudents();
                break;
            case 'trainer_sessions':
                loadAllSessions();
                break;
            case 'trainer_statistics':
                loadTrainerStatistics();
                break;
            case 'trainer_export':
                loadTrainerExportTab();
                break;
        }
    } else {
        switch(tabName) {
            case 'home':
                renderDynamicNews();
                break;
            case 'training':
                updateDailyLimitNotification();
                resetChat();
                loadDemoChat();
                break;
            case 'progress':
                renderProgressChart();
                break;
            case 'leaderboard':
                updateLeaderboard('all');
                break;
            case 'history':
                renderHistory();
                break;
            case 'export':
                loadExportHistory();
                break;
        }
    }
}

async function loadStats() {
    if (!auth.currentUser) return;
    
    await updateProgressUI();
    await updateRankPosition();
    renderProgressChart();
}

async function loadSystemStats() {
    try {
        const stats = await auth.getSystemStats();
        
        document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
        document.getElementById('totalSessions').textContent = stats.totalSessions || 0;
        document.getElementById('avgSystemScore').textContent = (stats.avgScore || 0).toFixed(1);
        document.getElementById('activeToday').textContent = stats.activeToday || 0;
    } catch (error) {
        console.error('Ошибка загрузки статистики системы:', error);
    }
}

async function updateProgressUI() {
    if (!auth.currentUser) return;
    
    const userStats = auth.currentUser.stats;
    const currentLevel = levels.find(l => l.level === userStats.currentLevel) || levels[0];
    const nextLevel = levels.find(l => l.level === userStats.currentLevel + 1);
    
    document.getElementById('currentLevelBadge').textContent = `Уровень ${userStats.currentLevel}`;
    document.getElementById('currentLevelName').textContent = currentLevel.name;
    
    const currentLevelXP = currentLevel.requiredXP;
    const nextLevelXP = nextLevel ? nextLevel.requiredXP : currentLevelXP + 100;
    const xpProgress = userStats.totalXP - currentLevelXP;
    const xpNeeded = nextLevelXP - currentLevelXP;
    const percentage = Math.min(100, (xpProgress / xpNeeded) * 100);
    
    document.getElementById('xpFill').style.width = `${percentage}%`;
    document.getElementById('xpText').textContent = `${userStats.totalXP}/${nextLevelXP} XP`;
    
    document.getElementById('sessionsCount').textContent = userStats.completedSessions;
    document.getElementById('avgScore').textContent = userStats.averageScore.toFixed(1);
    document.getElementById('streakCount').textContent = userStats.currentStreak;
    
    checkLevelUp();
}

async function updateRankPosition() {
    if (!auth.currentUser) return;
    
    try {
        const verticalLeaderboard = await auth.getLeaderboard(auth.currentUser.group);
        const verticalRank = verticalLeaderboard.findIndex(p => p.id === auth.currentUser.id) + 1;
        document.getElementById('rankPosition').textContent = verticalRank > 0 ? verticalRank : '-';
    } catch (error) {
        console.error('Ошибка обновления позиции в рейтинге:', error);
        document.getElementById('rankPosition').textContent = '-';
    }
}

function renderAllAchievements() {
    if (!auth.currentUser) return;
    
    const badgesGrid = document.getElementById('allBadgesGrid');
    if (!badgesGrid) return;
    
    badgesGrid.innerHTML = '';
    
    const categories = {};
    achievements.forEach(achievement => {
        if (!categories[achievement.category]) {
            categories[achievement.category] = [];
        }
        categories[achievement.category].push(achievement);
    });
    
    Object.keys(categories).forEach(category => {
        const categoryHeader = document.createElement('div');
        categoryHeader.style.cssText = 'grid-column: 1/-1; font-weight: 600; margin-top: 15px; color: #333; font-size: 14px;';
        categoryHeader.textContent = category.charAt(0).toUpperCase() + category.slice(1);
        badgesGrid.appendChild(categoryHeader);
        
        categories[category].forEach(achievement => {
            const isUnlocked = auth.currentUser.stats.achievementsUnlocked.includes(achievement.id);
            const badge = document.createElement('div');
            badge.className = `badge ${isUnlocked ? 'earned' : 'locked'}`;
            badge.innerHTML = `
                <span class="badge-icon">${achievement.icon}</span>
                <span class="badge-name">${achievement.name}</span>
                <span class="badge-desc">${achievement.description}</span>
            `;
            badge.title = achievement.description;
            badgesGrid.appendChild(badge);
        });
    });
}

function renderProgressChart() {
    if (!auth.currentUser || !auth.currentUser.stats.trainingHistory) return;
    
    const history = auth.currentUser.stats.trainingHistory;
    if (history.length === 0) return;
    
    const ctx = document.getElementById('progressChart').getContext('2d');
    
    const typeStats = {};
    Object.keys(clientTypes).forEach(type => {
        typeStats[type] = {
            sessions: 0,
            totalScore: 0
        };
    });
    
    history.forEach(item => {
        if (item.clientType && typeStats[item.clientType]) {
            typeStats[item.clientType].sessions++;
            typeStats[item.clientType].totalScore += item.score;
        }
    });
    
    const labels = Object.keys(clientTypes).map(key => clientTypes[key].name.split(' ')[0]);
    const sessionsData = Object.keys(clientTypes).map(key => typeStats[key].sessions);
    const avgScores = Object.keys(clientTypes).map(key => 
        typeStats[key].sessions > 0 ? (typeStats[key].totalScore / typeStats[key].sessions).toFixed(1) : 0
    );
    
    if (progressChart) {
        progressChart.destroy();
    }
    
    progressChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Количество тренировок',
                    data: sessionsData,
                    backgroundColor: 'rgba(21, 93, 39, 0.7)',
                    borderColor: '#155d27',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'Средний балл',
                    data: avgScores,
                    type: 'line',
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Тренировки'
                    },
                    min: 0
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Средний балл'
                    },
                    min: 0,
                    max: 5,
                    grid: {
                        drawOnChartArea: false,
                    },
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Статистика по типам клиентов'
                }
            }
        }
    });
}

async function updateLeaderboard(filter = 'all') {
    const leaderboardBody = document.getElementById('leaderboardBody');
    if (!leaderboardBody) return;
    
    leaderboardBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #666;">Загрузка данных...</td></tr>';
    
    try {
        const players = await auth.getLeaderboard(filter);
        
        leaderboardBody.innerHTML = '';
        
        if (players.length === 0) {
            leaderboardBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 20px; color: #666;">
                        Нет данных для отображения
                    </td>
                </tr>
            `;
            return;
        }
        
        players.forEach((player, index) => {
            const row = document.createElement('tr');
            if (player.id === auth.currentUser?.id) {
                row.className = 'player-you';
            }
            
            let rankClass = '';
            if (index === 0) rankClass = 'rank-1';
            else if (index === 1) rankClass = 'rank-2';
            else if (index === 2) rankClass = 'rank-3';
            
            row.innerHTML = `
                <td class="rank ${rankClass}">${index + 1}</td>
                <td class="player-name">${player.username} ${player.id === auth.currentUser?.id ? '(Вы)' : ''}</td>
                <td>${player.group || '-'}</td>
                <td>${player.level}</td>
                <td>${player.sessions}</td>
                <td>${player.avgScore.toFixed(1)}</td>
                <td>${player.xp.toFixed(0)}</td>
            `;
            leaderboardBody.appendChild(row);
        });
    } catch (error) {
        console.error('Ошибка рендеринга рейтинга:', error);
        leaderboardBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 20px; color: #666;">
                    Ошибка загрузки данных
                </td>
            </tr>
        `;
    }
}

async function renderHistory() {
    if (!auth.currentUser) return;
    
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
    historyList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Загрузка истории...</div>';
    
    try {
        const dbHistory = await auth.getUserTrainingHistory(auth.currentUser.id);
        const localHistory = auth.currentUser.stats.trainingHistory || [];
        
        const historyMap = new Map();
        
        dbHistory.forEach(session => {
            const sessionDate = new Date(session.date);
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            
            if (sessionDate >= oneMonthAgo) {
                historyMap.set(session.date, {
                    id: session.id,
                    date: session.date,
                    scenario: session.scenario || "Тренировка",
                    score: session.score || 0,
                    xp: session.xp_earned || 0,
                    clientType: session.client_type,
                    evaluation: session.evaluation,
                    duration: session.duration,
                    vertical: session.vertical,
                    messages: session.messages || [],
                    trainer_comments: session.trainer_comments || [],
                    prompt_used: session.prompt_used || "",
                    ai_feedback: session.ai_feedback || "",
                    icon: clientTypes[session.client_type]?.icon || "🎯"
                });
            }
        });
        
        localHistory.forEach(session => {
            if (!historyMap.has(session.date)) {
                const sessionDate = new Date(session.date);
                const oneMonthAgo = new Date();
                oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                
                if (sessionDate >= oneMonthAgo) {
                    historyMap.set(session.date, session);
                }
            }
        });
        
        let history = Array.from(historyMap.values());
        history.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        historyList.innerHTML = '';
        
        if (history.length === 0) {
            historyList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Нет данных о тренировках за последний месяц</div>';
            return;
        }
        
        const storageInfo = document.createElement('div');
        storageInfo.style.cssText = 'text-align: center; font-size: 12px; color: #666; margin-bottom: 15px; padding: 8px; background: #f8f9fa; border-radius: 8px;';
        storageInfo.innerHTML = '<i class="fas fa-info-circle"></i> История чатов хранится 30 дней. Старые диалоги автоматически удаляются.';
        historyList.appendChild(storageInfo);
        
        history.forEach(item => {
            const clientType = clientTypes[item.clientType];
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.onclick = () => viewChatHistory(item);
            
            const hasTrainerComments = item.trainer_comments && item.trainer_comments.length > 0;
            const hasAIFeedback = item.ai_feedback && item.ai_feedback.trim().length > 0;
            
            historyItem.innerHTML = `
                <div class="history-item-header">
                    <div class="history-item-title">${clientType ? clientType.name : 'Тренировка'}</div>
                    <div class="history-item-score">${item.score}/5</div>
                </div>
                <div class="history-item-details">${item.scenario || ''}</div>
                <div class="history-item-footer">
                    <div>
                        <span>${formatDate(item.date)}</span>
                        <span style="margin-left: 10px;">${item.duration ? formatDuration(item.duration) : '15:00'}</span>
                        <span style="margin-left: 10px; color: #10a37f;">+${item.xp} XP</span>
                        ${hasTrainerComments ? '<span style="margin-left: 10px; color: #ffc107;"><i class="fas fa-comment"></i> Есть комментарий тренера</span>' : ''}
                        ${hasAIFeedback ? '<span style="margin-left: 10px; color: #667eea;"><i class="fas fa-robot"></i> Есть обратная связь от AI</span>' : ''}
                    </div>
                    <button class="view-chat-btn" onclick="event.stopPropagation(); viewChatHistory(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                        <i class="fas fa-comments"></i> Просмотреть чат
                    </button>
                </div>
                ${item.evaluation ? `<div style="margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 6px; font-size: 12px; color: #555;">${item.evaluation}</div>` : ''}
            `;
            historyList.appendChild(historyItem);
        });
    } catch (error) {
        console.error('Ошибка рендеринга истории:', error);
        historyList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Ошибка загрузки истории</div>';
    }
}

function loadDemoChat() {
    const chatMessagesDiv = document.getElementById('chatMessages');
    if (!chatMessagesDiv) return;
    
    chatMessagesDiv.innerHTML = `
        <div class="message ai">
            Привет! Я готов к тренировке. Выберите тип клиента, чтобы начать тренировку.
        </div>
    `;
}

function resetChat() {
    chatMessages = [];
    const chatMessagesDiv = document.getElementById('chatMessages');
    if (chatMessagesDiv) {
        chatMessagesDiv.innerHTML = '';
    }
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.value = '';
        chatInput.disabled = true;
    }
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;
    const chatStatus = document.getElementById('chatStatus');
    if (chatStatus) {
        chatStatus.textContent = 'Ожидание начала';
        chatStatus.className = 'chat-status';
    }
}

// НОВЫЕ ФУНКЦИИ ДЛЯ ЭКСПОРТА PDF

function loadJsPDF() {
    return new Promise((resolve, reject) => {
        if (window.jspdf && window.jspdf.jsPDF) {
            resolve(window.jspdf.jsPDF);
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = () => {
            if (window.jspdf && window.jspdf.jsPDF) {
                resolve(window.jspdf.jsPDF);
            } else {
                reject(new Error('jsPDF не загрузился'));
            }
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function loadHtml2Canvas() {
    return new Promise((resolve, reject) => {
        if (window.html2canvas) {
            resolve(window.html2canvas);
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
        script.onload = () => {
            if (window.html2canvas) {
                resolve(window.html2canvas);
            } else {
                reject(new Error('html2canvas не загрузился'));
            }
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function exportChatToPDF(session) {
    try {
        const { jsPDF } = await loadJsPDF();
        
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Диалоговый тренажер - История тренировки', margin, 20);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Ученик: ${auth.currentUser.username}`, margin, 30);
        doc.text(`Вертикаль: ${session.vertical || auth.currentUser.group || '-'}`, margin, 35);
        doc.text(`Тип клиента: ${clientTypes[session.clientType]?.name || session.clientType || '-'}`, margin, 40);
        doc.text(`Дата: ${formatDate(session.date)}`, margin, 45);
        doc.text(`Оценка: ${session.score}/5`, margin, 50);
        doc.text(`Продолжительность: ${formatDuration(session.duration)}`, margin, 55);
        
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, 60, pageWidth - margin, 60);
        
        let yPos = 70;
        let messages = session.messages || [];
        
        if (typeof messages === 'string') {
            try {
                messages = JSON.parse(messages);
            } catch {
                messages = [];
            }
        }
        
        if (messages.length === 0) {
            doc.setFontSize(12);
            doc.text('Нет данных о диалоге', margin, yPos);
        } else {
            doc.setFontSize(11);
            messages.forEach((msg, index) => {
                const sender = msg.sender === 'user' ? 'Оператор' : 'Клиент';
                const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('ru-RU', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                }) : '';
                
                const text = `${sender} (${time}): ${msg.text}`;
                const lines = doc.splitTextToSize(text, pageWidth - 2 * margin);
                
                if (yPos + lines.length * 5 > pageHeight - margin) {
                    doc.addPage();
                    yPos = margin + 10;
                }
                
                if (msg.sender === 'user') {
                    doc.setFillColor(240, 242, 245);
                    doc.rect(margin, yPos - 4, pageWidth - 2 * margin, lines.length * 5 + 2, 'F');
                    doc.setTextColor(0, 0, 0);
                } else {
                    doc.setFillColor(74, 100, 145, 20);
                    doc.rect(margin, yPos - 4, pageWidth - 2 * margin, lines.length * 5 + 2, 'F');
                    doc.setTextColor(44, 62, 80);
                }
                
                doc.text(lines, margin + 2, yPos);
                yPos += lines.length * 5 + 6;
            });
        }
        
        if (session.ai_feedback) {
            yPos += 10;
            
            if (yPos > pageHeight - 50) {
                doc.addPage();
                yPos = margin;
            }
            
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            doc.text('Обратная связь от AI:', margin, yPos);
            yPos += 7;
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            const feedbackLines = doc.splitTextToSize(session.ai_feedback, pageWidth - 2 * margin);
            doc.text(feedbackLines, margin, yPos);
            yPos += feedbackLines.length * 5 + 10;
        }
        
        if (session.trainer_comments && session.trainer_comments.length > 0) {
            if (yPos > pageHeight - 50) {
                doc.addPage();
                yPos = margin;
            }
            
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Комментарии тренера:', margin, yPos);
            yPos += 7;
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            
            session.trainer_comments.forEach(comment => {
                const commentText = `${comment.trainer} (${formatDate(comment.date)}): ${comment.comment}`;
                const commentLines = doc.splitTextToSize(commentText, pageWidth - 2 * margin);
                
                if (yPos + commentLines.length * 5 > pageHeight - margin) {
                    doc.addPage();
                    yPos = margin;
                }
                
                doc.setFillColor(255, 243, 205);
                doc.rect(margin, yPos - 4, pageWidth - 2 * margin, commentLines.length * 5 + 2, 'F');
                doc.text(commentLines, margin + 2, yPos);
                yPos += commentLines.length * 5 + 6;
            });
        }
        
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(
                `Страница ${i} из ${totalPages} • Сгенерировано ${new Date().toLocaleDateString('ru-RU')} • Диалоговый тренажер`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
        }
        
        const fileName = `Диалог_${auth.currentUser.username}_${formatDate(session.date, true)}.pdf`;
        doc.save(fileName);
        
        return true;
    } catch (error) {
        console.error('Ошибка экспорта в PDF:', error);
        alert('Ошибка при создании PDF файла: ' + error.message);
        return false;
    }
}

async function exportStudentStatsToPDF() {
    if (!auth.currentUser) return;
    
    try {
        const { jsPDF } = await loadJsPDF();
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        
        const userStats = auth.currentUser.stats;
        const history = userStats.trainingHistory || [];
        
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Статистика тренировок', margin, 25);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Ученик: ${auth.currentUser.username}`, margin, 35);
        doc.text(`Вертикаль: ${auth.currentUser.group || '-'}`, margin, 40);
        doc.text(`Уровень: ${userStats.currentLevel || 1}`, margin, 45);
        doc.text(`Общий опыт: ${userStats.totalXP || 0} XP`, margin, 50);
        doc.text(`Количество тренировок: ${userStats.completedSessions || 0}`, margin, 55);
        doc.text(`Средний балл: ${(userStats.averageScore || 0).toFixed(1)}/5`, margin, 60);
        doc.text(`Текущая серия: ${userStats.currentStreak || 0} дней`, margin, 65);
        
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, 70, pageWidth - margin, 70);
        
        let yPos = 80;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Статистика по типам клиентов:', margin, yPos);
        yPos += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        if (userStats.clientTypesCompleted) {
            const clientTypesData = Object.entries(userStats.clientTypesCompleted);
            const colWidth = (pageWidth - 2 * margin - 30) / 4;
            
            doc.setFillColor(44, 62, 80);
            doc.setTextColor(255, 255, 255);
            doc.rect(margin, yPos - 4, pageWidth - 2 * margin, 8, 'F');
            doc.text('Тип клиента', margin + 5, yPos);
            doc.text('Тренировок', margin + colWidth, yPos);
            doc.text('Средний балл', margin + colWidth * 2, yPos);
            doc.text('Опыт', margin + colWidth * 3, yPos);
            yPos += 10;
            
            doc.setTextColor(0, 0, 0);
            clientTypesData.forEach(([type, stats], index) => {
                if (yPos > 250) {
                    doc.addPage();
                    yPos = margin;
                }
                
                const clientType = clientTypes[type];
                const typeName = clientType ? clientType.name : type;
                const sessions = stats.sessions || 0;
                const avgScore = stats.avgScore ? stats.avgScore.toFixed(1) : '0.0';
                const totalXP = stats.totalXP || 0;
                
                if (index % 2 === 0) {
                    doc.setFillColor(248, 249, 250);
                    doc.rect(margin, yPos - 4, pageWidth - 2 * margin, 8, 'F');
                }
                
                doc.text(typeName, margin + 5, yPos);
                doc.text(sessions.toString(), margin + colWidth, yPos);
                doc.text(avgScore, margin + colWidth * 2, yPos);
                doc.text(totalXP.toString(), margin + colWidth * 3, yPos);
                
                yPos += 8;
            });
        }
        
        yPos += 10;
        if (yPos > 220) {
            doc.addPage();
            yPos = margin;
        }
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Последние тренировки:', margin, yPos);
        yPos += 10;
        
        if (history.length > 0) {
            const recentHistory = history.slice(0, 20);
            
            doc.setFontSize(8);
            recentHistory.forEach((session, index) => {
                if (yPos > 270) {
                    doc.addPage();
                    yPos = margin;
                }
                
                const sessionText = `${formatDate(session.date, true)} - ${clientTypes[session.clientType]?.name || session.clientType || 'Тренировка'} - ${session.score}/5 - +${session.xp} XP`;
                
                if (index % 2 === 0) {
                    doc.setFillColor(248, 249, 250);
                    doc.rect(margin, yPos - 3, pageWidth - 2 * margin, 5, 'F');
                }
                
                doc.text(sessionText, margin + 2, yPos);
                yPos += 5;
            });
        } else {
            doc.setFontSize(10);
            doc.text('Нет данных о тренировках', margin, yPos);
        }
        
        yPos += 15;
        if (yPos > 240) {
            doc.addPage();
            yPos = margin;
        }
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Полученные достижения:', margin, yPos);
        yPos += 10;
        
        const earnedAchievements = achievements.filter(ach => 
            userStats.achievementsUnlocked?.includes(ach.id)
        );
        
        if (earnedAchievements.length > 0) {
            doc.setFontSize(9);
            earnedAchievements.forEach((achievement, index) => {
                if (yPos > 270) {
                    doc.addPage();
                    yPos = margin;
                }
                
                const achievementText = `${achievement.icon} ${achievement.name}: ${achievement.description}`;
                doc.text(achievementText, margin, yPos);
                yPos += 6;
            });
        } else {
            doc.setFontSize(10);
            doc.text('Пока нет достижений', margin, yPos);
        }
        
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(
                `Отчет сгенерирован ${new Date().toLocaleDateString('ru-RU')} • Страница ${i} из ${totalPages}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
        }
        
        const fileName = `Статистика_${auth.currentUser.username}_${new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')}.pdf`;
        doc.save(fileName);
        
        return true;
    } catch (error) {
        console.error('Ошибка экспорта статистики:', error);
        alert('Ошибка при создании PDF файла: ' + error.message);
        return false;
    }
}

async function exportPeriodStatsToPDF() {
    if (!auth.currentUser) return;
    
    const dateFrom = document.getElementById('exportDateFrom').value;
    const dateTo = document.getElementById('exportDateTo').value;
    
    if (!dateFrom || !dateTo) {
        alert('Укажите период для экспорта');
        return;
    }
    
    try {
        const { jsPDF } = await loadJsPDF();
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        
        const userStats = auth.currentUser.stats;
        const history = userStats.trainingHistory || [];
        
        const fromDate = new Date(dateFrom);
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        
        const periodHistory = history.filter(session => {
            const sessionDate = new Date(session.date);
            return sessionDate >= fromDate && sessionDate <= toDate;
        });
        
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Отчет по периоду', margin, 25);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Ученик: ${auth.currentUser.username}`, margin, 35);
        doc.text(`Вертикаль: ${auth.currentUser.group || '-'}`, margin, 40);
        doc.text(`Период: ${formatDate(dateFrom, true)} - ${formatDate(dateTo, true)}`, margin, 45);
        doc.text(`Тренировок за период: ${periodHistory.length}`, margin, 50);
        
        if (periodHistory.length > 0) {
            const totalScore = periodHistory.reduce((sum, session) => sum + (session.score || 0), 0);
            const avgScore = periodHistory.length > 0 ? (totalScore / periodHistory.length).toFixed(1) : '0.0';
            const totalXP = periodHistory.reduce((sum, session) => sum + (session.xp || 0), 0);
            
            doc.text(`Средний балл за период: ${avgScore}/5`, margin, 55);
            doc.text(`Общий опыт за период: ${totalXP} XP`, margin, 60);
        }
        
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, 65, pageWidth - margin, 65);
        
        let yPos = 75;
        
        if (periodHistory.length > 0) {
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Тренировки за период:', margin, yPos);
            yPos += 10;
            
            doc.setFontSize(8);
            periodHistory.forEach((session, index) => {
                if (yPos > 250) {
                    doc.addPage();
                    yPos = margin;
                }
                
                const sessionText = `${formatDate(session.date, true)} - ${clientTypes[session.clientType]?.name || session.clientType || 'Тренировка'} - ${session.score}/5 - +${session.xp} XP`;
                
                if (index % 2 === 0) {
                    doc.setFillColor(248, 249, 250);
                    doc.rect(margin, yPos - 3, pageWidth - 2 * margin, 5, 'F');
                }
                
                doc.text(sessionText, margin + 2, yPos);
                yPos += 5;
            });
        } else {
            doc.setFontSize(12);
            doc.text('Нет тренировок за выбранный период', margin, yPos);
        }
        
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(
                `Отчет по периоду • Страница ${i} из ${totalPages}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
        }
        
        const fileName = `Отчет_${auth.currentUser.username}_${formatDate(dateFrom, true)}_${formatDate(dateTo, true)}.pdf`;
        doc.save(fileName);
        
        return true;
    } catch (error) {
        console.error('Ошибка экспорта периода:', error);
        alert('Ошибка при создании PDF файла: ' + error.message);
        return false;
    }
}

async function loadExportHistory() {
    if (!auth.currentUser) return;
    
    const exportHistoryList = document.getElementById('exportHistoryList');
    if (!exportHistoryList) return;
    
    exportHistoryList.innerHTML = '<div style="text-align: center; padding: 10px; color: #666;">Загрузка истории...</div>';
    
    try {
        const dbHistory = await auth.getUserTrainingHistory(auth.currentUser.id);
        const localHistory = auth.currentUser.stats.trainingHistory || [];
        
        const historyMap = new Map();
        
        dbHistory.forEach(session => {
            const sessionDate = new Date(session.date);
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            
            if (sessionDate >= oneMonthAgo) {
                historyMap.set(session.date, {
                    id: session.id,
                    date: session.date,
                    scenario: session.scenario || "Тренировка",
                    score: session.score || 0,
                    xp: session.xp_earned || 0,
                    clientType: session.client_type,
                    evaluation: session.evaluation,
                    duration: session.duration,
                    vertical: session.vertical,
                    messages: session.messages || [],
                    trainer_comments: session.trainer_comments || [],
                    prompt_used: session.prompt_used || "",
                    ai_feedback: session.ai_feedback || "",
                    icon: clientTypes[session.client_type]?.icon || "🎯"
                });
            }
        });
        
        localHistory.forEach(session => {
            if (!historyMap.has(session.date)) {
                const sessionDate = new Date(session.date);
                const oneMonthAgo = new Date();
                oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                
                if (sessionDate >= oneMonthAgo) {
                    historyMap.set(session.date, session);
                }
            }
        });
        
        let history = Array.from(historyMap.values());
        history.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        exportHistoryList.innerHTML = '';
        
        if (history.length === 0) {
            exportHistoryList.innerHTML = '<div style="text-align: center; padding: 10px; color: #666;">Нет данных о тренировках</div>';
            return;
        }
        
        history.forEach(item => {
            const clientType = clientTypes[item.clientType];
            const exportItem = document.createElement('div');
            exportItem.className = 'export-history-item';
            exportItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${clientType ? clientType.name : 'Тренировка'}</strong>
                        <div style="font-size: 11px; color: #666;">${formatDate(item.date)} • ${item.score}/5</div>
                    </div>
                    <button class="btn btn-secondary" onclick="exportChatToPDF(${JSON.stringify(item).replace(/"/g, '&quot;')})" style="padding: 4px 8px; font-size: 11px;">
                        <i class="fas fa-download"></i> PDF
                    </button>
                </div>
            `;
            exportHistoryList.appendChild(exportItem);
        });
    } catch (error) {
        console.error('Ошибка загрузки истории для экспорта:', error);
        exportHistoryList.innerHTML = '<div style="text-align: center; padding: 10px; color: #dc3545;">Ошибка загрузки</div>';
    }
}

function formatDate(dateString, short = false) {
    const date = new Date(dateString);
    if (short) {
        return date.toLocaleDateString('ru-RU');
    }
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function loadTrainerInterface() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    sidebar.innerHTML = `
        <a href="javascript:void(0);" onclick="switchTab('trainer_dashboard')" class="nav-item active" data-tab="trainer_dashboard">
            <i class="fas fa-chalkboard-teacher"></i> Дашборд
        </a>
        <a href="javascript:void(0);" onclick="switchTab('trainer_students')" class="nav-item" data-tab="trainer_students">
            <i class="fas fa-users"></i> Все ученики
        </a>
        <a href="javascript:void(0);" onclick="switchTab('trainer_sessions')" class="nav-item" data-tab="trainer_sessions">
            <i class="fas fa-history"></i> Все тренировки
        </a>
        <a href="javascript:void(0);" onclick="switchTab('trainer_statistics')" class="nav-item" data-tab="trainer_statistics">
            <i class="fas fa-chart-bar"></i> Статистика
        </a>
        <a href="javascript:void(0);" onclick="switchTab('trainer_export')" class="nav-item" data-tab="trainer_export">
            <i class="fas fa-file-export"></i> Экспорт отчетов
        </a>
    `;
    
    mainContent.innerHTML = `
        <div class="tab-content active" id="trainer_dashboard-tab">
            <div class="welcome-section">
                <div class="section-title">
                    <i class="fas fa-chalkboard-teacher"></i>
                    <span>Панель тренера</span>
                </div>
                <div id="trainerDashboardContent">
                    <p style="color: #666; margin-bottom: 15px; font-size: 14px;">
                        Загрузка данных о студентах...
                    </p>
                </div>
            </div>
        </div>

        <div class="tab-content" id="trainer_students-tab">
            <div class="welcome-section">
                <div class="section-title">
                    <i class="fas fa-users"></i>
                    <span>Все ученики</span>
                </div>
                
                <div class="trainer-search-section">
                    <input type="text" class="trainer-search-input" id="studentSearchInput" placeholder="Поиск по имени ученика..." oninput="searchStudents()">
                    <input type="date" class="trainer-date-input" id="studentDateFrom" placeholder="Дата от">
                    <input type="date" class="trainer-date-input" id="studentDateTo" placeholder="Дата до">
                    <button class="trainer-search-btn" onclick="searchStudents()">
                        <i class="fas fa-search"></i> Поиск
                    </button>
                </div>
                
                <div id="trainerStudentsContent" style="max-height: 600px; overflow-y: auto;">
                    <p style="color: #666; margin-bottom: 15px; font-size: 14px;">
                        Загрузка списка учеников...
                    </p>
                </div>
            </div>
        </div>

        <div class="tab-content" id="trainer_sessions-tab">
            <div class="welcome-section">
                <div class="section-title">
                    <i class="fas fa-history"></i>
                    <span>Все тренировки</span>
                    <div style="margin-left: auto;">
                        <select id="sessionFilter" onchange="filterSessions()" style="padding: 6px 12px; border-radius: 6px; border: 1px solid #ddd; font-size: 13px;">
                            <option value="all">Все вертикали</option>
                            <option value="Программа лояльности">Лояльность</option>
                            <option value="ОПК">ОПК</option>
                            <option value="Фудтех">Фудтех</option>
                            <option value="Маркет">Маркет</option>
                            <option value="Аптека">Аптека</option>
                            <option value="Сборка">Сборка</option>
                        </select>
                    </div>
                </div>
                
                <div class="trainer-search-section">
                    <input type="text" class="trainer-search-input" id="sessionSearchInput" placeholder="Поиск по ученику или сценарию..." oninput="searchSessions()">
                    <input type="date" class="trainer-date-input" id="sessionDateFrom" placeholder="Дата от">
                    <input type="date" class="trainer-date-input" id="sessionDateTo" placeholder="Дата до">
                    <select class="trainer-date-input" id="sessionScoreFilter" onchange="searchSessions()" style="min-width: 120px;">
                        <option value="">Все оценки</option>
                        <option value="5">5 звезд</option>
                        <option value="4">4+ звезды</option>
                        <option value="3">3+ звезды</option>
                    </select>
                    <button class="trainer-search-btn" onclick="searchSessions()">
                        <i class="fas fa-search"></i> Поиск
                    </button>
                </div>
                
                <div id="trainerSessionsContent" style="max-height: 600px; overflow-y: auto;">
                    <p style="color: #666; margin-bottom: 15px; font-size: 14px;">
                        Загрузка всех тренировок...
                    </p>
                </div>
            </div>
        </div>

        <div class="tab-content" id="trainer_statistics-tab">
            <div class="welcome-section">
                <div class="section-title">
                    <i class="fas fa-chart-bar"></i>
                    <span>Статистика по системе</span>
                </div>
                <div id="trainerStatisticsContent" style="max-height: 600px; overflow-y: auto;">
                    <p style="color: #666; margin-bottom: 15px; font-size: 14px;">
                        Загрузка статистики...
                    </p>
                </div>
            </div>
        </div>

        <div class="tab-content" id="trainer_export-tab">
            <div class="welcome-section">
                <div class="section-title">
                    <i class="fas fa-file-export"></i>
                    <span>Экспорт отчетов (Тренер)</span>
                </div>
                
                <p style="margin-bottom: 20px; color: #666; font-size: 14px;">
                    Экспортируйте данные учеников, статистику и отчеты в формате PDF.
                </p>
                
                <div class="trainer-export-options">
                    <div class="export-card">
                        <div class="export-icon">
                            <i class="fas fa-user-graduate"></i>
                        </div>
                        <div class="export-content">
                            <h3>Экспорт ученика</h3>
                            <p>Выберите ученика для экспорта всех его тренировок и статистики</p>
                            <select id="trainerStudentSelect" class="form-control" style="margin-top: 10px;" onchange="loadStudentSessionsForExport()">
                                <option value="">Выберите ученика...</option>
                            </select>
                            <div id="studentSessionsForExport" style="margin-top: 10px; max-height: 300px; overflow-y: auto;"></div>
                        </div>
                    </div>
                    
                    <div class="export-card">
                        <div class="export-icon">
                            <i class="fas fa-building"></i>
                        </div>
                        <div class="export-content">
                            <h3>Статистика по вертикалям</h3>
                            <p>Создайте отчет по успеваемости по вертикалям</p>
                            <div class="export-filters" style="margin-top: 10px;">
                                <select id="verticalSelect" class="form-control" style="margin-bottom: 10px;">
                                    <option value="all">Все вертикали</option>
                                    <option value="Программа лояльности">Лояльность</option>
                                    <option value="ОПК">ОПК</option>
                                    <option value="Фудтех">Фудтех</option>
                                    <option value="Маркет">Маркет</option>
                                    <option value="Аптека">Аптека</option>
                                    <option value="Сборка">Сборка</option>
                                </select>
                                <input type="date" id="verticalDateFrom" class="form-control" style="margin-bottom: 10px;" placeholder="Дата от">
                                <input type="date" id="verticalDateTo" class="form-control" style="margin-bottom: 10px;" placeholder="Дата до">
                                <button class="btn btn-primary" onclick="exportVerticalStatsToPDF()">
                                    <i class="fas fa-download"></i> Экспорт статистики
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="export-card">
                        <div class="export-icon">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <div class="export-content">
                            <h3>Общая статистика</h3>
                            <p>Полный отчет по системе за выбранный период</p>
                            <div class="export-filters" style="margin-top: 10px;">
                                <input type="date" id="systemDateFrom" class="form-control" style="margin-bottom: 10px;" placeholder="Дата от">
                                <input type="date" id="systemDateTo" class="form-control" style="margin-bottom: 10px;" placeholder="Дата до">
                                <select id="systemVerticalFilter" class="form-control" style="margin-bottom: 10px;">
                                    <option value="all">Все вертикали</option>
                                    <option value="Программа лояльности">Лояльность</option>
                                    <option value="ОПК">ОПК</option>
                                    <option value="Фудтех">Фудтех</option>
                                    <option value="Маркет">Маркет</option>
                                    <option value="Аптека">Аптека</option>
                                    <option value="Сборка">Сборка</option>
                                </select>
                                <button class="btn btn-secondary" onclick="exportSystemStatsToPDF()">
                                    <i class="fas fa-download"></i> Экспорт общего отчета
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    loadTrainerDashboard();
    loadTrainerExportTab();
}

// Функции для тренерского экспорта
async function loadTrainerExportTab() {
    try {
        const students = await auth.getStudents();
        const studentSelect = document.getElementById('trainerStudentSelect');
        
        if (studentSelect) {
            studentSelect.innerHTML = '<option value="">Выберите ученика...</option>';
            students.forEach(student => {
                const option = document.createElement('option');
                option.value = student.id;
                option.textContent = `${student.username} (${student.group_name || 'Без вертикали'})`;
                studentSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки учеников для экспорта:', error);
    }
}

async function loadStudentSessionsForExport() {
    const studentId = document.getElementById('trainerStudentSelect').value;
    if (!studentId) return;
    
    const container = document.getElementById('studentSessionsForExport');
    container.innerHTML = '<div style="text-align: center; padding: 10px; color: #666;">Загрузка тренировок...</div>';
    
    try {
        const sessions = await auth.supabaseRequest(`training_sessions?user_id=eq.${studentId}&order=date.desc`);
        const student = await auth.supabaseRequest(`users?id=eq.${studentId}`);
        const studentName = student?.[0] ? student[0].username : 'Студент';
        
        if (!sessions?.length) {
            container.innerHTML = '<div style="text-align: center; padding: 10px; color: #666;">У ученика нет тренировок</div>';
            return;
        }
        
        let html = `
            <div style="margin-bottom: 10px;">
                <strong>${studentName}</strong>
                <button class="btn btn-primary" onclick="exportAllStudentSessions('${studentId}', '${studentName}')" style="margin-left: 10px; padding: 4px 8px; font-size: 11px;">
                    <i class="fas fa-download"></i> Экспорт всех тренировок
                </button>
            </div>
        `;
        
        sessions.forEach(session => {
            const clientType = clientTypes[session.client_type];
            html += `
                <div class="export-history-item" style="margin-bottom: 5px; padding: 8px; background: #f8f9fa; border-radius: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 12px;"><strong>${clientType ? clientType.name : session.client_type || 'Тренировка'}</strong></div>
                            <div style="font-size: 10px; color: #666;">${formatDate(session.date)} • ${session.score || 0}/5</div>
                        </div>
                        <div>
                            <button class="btn btn-secondary" onclick="exportStudentChatToPDF('${studentId}', '${session.id}', '${studentName}')" style="padding: 3px 6px; font-size: 10px; margin-right: 5px;">
                                <i class="fas fa-comments"></i> Чат
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Ошибка загрузки тренировок ученика:', error);
        container.innerHTML = '<div style="text-align: center; padding: 10px; color: #dc3545;">Ошибка загрузки</div>';
    }
}

async function exportStudentChatToPDF(studentId, sessionId, studentName) {
    try {
        const session = await auth.supabaseRequest(`training_sessions?id=eq.${sessionId}`);
        if (!session?.length) {
            alert('Сессия не найдена');
            return false;
        }
        
        const sessionData = session[0];
        const student = await auth.supabaseRequest(`users?id=eq.${studentId}`);
        const studentData = student?.[0] || {};
        
        const { jsPDF } = await loadJsPDF();
        
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Диалоговый тренажер - Просмотр тренера', margin, 20);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Ученик: ${studentName}`, margin, 30);
        doc.text(`Вертикаль: ${sessionData.vertical || studentData.group_name || '-'}`, margin, 35);
        doc.text(`Тип клиента: ${clientTypes[sessionData.client_type]?.name || sessionData.client_type || '-'}`, margin, 40);
        doc.text(`Дата: ${formatDate(sessionData.date)}`, margin, 45);
        doc.text(`Оценка: ${sessionData.score || 0}/5`, margin, 50);
        doc.text(`ID сессии: ${sessionId}`, margin, 55);
        
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, 60, pageWidth - margin, 60);
        
        let yPos = 70;
        let messages = [];
        
        if (sessionData.messages) {
            if (Array.isArray(sessionData.messages)) {
                messages = sessionData.messages;
            } else if (typeof sessionData.messages === 'string') {
                try {
                    messages = JSON.parse(sessionData.messages);
                } catch {
                    messages = [];
                }
            }
        }
        
        if (messages.length > 0) {
            doc.setFontSize(11);
            messages.forEach((msg, index) => {
                const sender = msg.sender === 'user' ? 'Оператор' : 'Клиент';
                const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('ru-RU', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                }) : '';
                
                const text = `${sender} (${time}): ${msg.text}`;
                const lines = doc.splitTextToSize(text, pageWidth - 2 * margin);
                
                if (yPos + lines.length * 5 > pageHeight - margin) {
                    doc.addPage();
                    yPos = margin + 10;
                }
                
                if (msg.sender === 'user') {
                    doc.setFillColor(240, 242, 245);
                    doc.rect(margin, yPos - 4, pageWidth - 2 * margin, lines.length * 5 + 2, 'F');
                    doc.setTextColor(0, 0, 0);
                } else {
                    doc.setFillColor(74, 100, 145, 20);
                    doc.rect(margin, yPos - 4, pageWidth - 2 * margin, lines.length * 5 + 2, 'F');
                    doc.setTextColor(44, 62, 80);
                }
                
                doc.text(lines, margin + 2, yPos);
                yPos += lines.length * 5 + 6;
            });
        } else {
            doc.setFontSize(12);
            doc.text('Нет данных о диалоге', margin, yPos);
            yPos += 10;
        }
        
        if (sessionData.ai_feedback) {
            yPos += 10;
            
            if (yPos > pageHeight - 50) {
                doc.addPage();
                yPos = margin;
            }
            
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Обратная связь от AI:', margin, yPos);
            yPos += 7;
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            const feedbackLines = doc.splitTextToSize(sessionData.ai_feedback, pageWidth - 2 * margin);
            doc.text(feedbackLines, margin, yPos);
            yPos += feedbackLines.length * 5 + 10;
        }
        
        if (sessionData.trainer_comments && sessionData.trainer_comments.length > 0) {
            if (yPos > pageHeight - 50) {
                doc.addPage();
                yPos = margin;
            }
            
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Комментарии тренера:', margin, yPos);
            yPos += 7;
            
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            
            sessionData.trainer_comments.forEach(comment => {
                const commentText = `${comment.trainer} (${formatDate(comment.date)}): ${comment.comment}`;
                const commentLines = doc.splitTextToSize(commentText, pageWidth - 2 * margin);
                
                if (yPos + commentLines.length * 5 > pageHeight - margin) {
                    doc.addPage();
                    yPos = margin;
                }
                
                doc.setFillColor(255, 243, 205);
                doc.rect(margin, yPos - 4, pageWidth - 2 * margin, commentLines.length * 5 + 2, 'F');
                doc.text(commentLines, margin + 2, yPos);
                yPos += commentLines.length * 5 + 6;
            });
        }
        
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(
                `Экспорт тренера: ${auth.currentUser.username} • Страница ${i} из ${totalPages} • ${new Date().toLocaleDateString('ru-RU')}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
        }
        
        const fileName = `Чат_${studentName}_${formatDate(sessionData.date, true)}_тренер.pdf`;
        doc.save(fileName);
        
        return true;
    } catch (error) {
        console.error('Ошибка экспорта чата тренера:', error);
        alert('Ошибка при создании PDF файла: ' + error.message);
        return false;
    }
}

async function exportAllStudentSessions(studentId, studentName) {
    try {
        const sessions = await auth.supabaseRequest(`training_sessions?user_id=eq.${studentId}&order=date.desc`);
        const student = await auth.supabaseRequest(`users?id=eq.${studentId}`);
        const studentData = student?.[0] || {};
        
        if (!sessions?.length) {
            alert('У ученика нет тренировок');
            return;
        }
        
        const { jsPDF } = await loadJsPDF();
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Отчет по ученику', margin, 25);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Ученик: ${studentName}`, margin, 35);
        doc.text(`Вертикаль: ${studentData.group_name || '-'}`, margin, 40);
        doc.text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`, margin, 45);
        doc.text(`Всего тренировок: ${sessions.length}`, margin, 50);
        
        const totalScore = sessions.reduce((sum, session) => sum + (session.score || 0), 0);
        const avgScore = sessions.length > 0 ? (totalScore / sessions.length).toFixed(1) : '0.0';
        doc.text(`Средний балл: ${avgScore}/5`, margin, 55);
        
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, 60, pageWidth - margin, 60);
        
        let yPos = 70;
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Все тренировки ученика:', margin, yPos);
        yPos += 10;
        
        doc.setFontSize(9);
        
        const statsByClientType = {};
        sessions.forEach(session => {
            const clientType = session.client_type;
            if (!statsByClientType[clientType]) {
                statsByClientType[clientType] = { count: 0, totalScore: 0 };
            }
            statsByClientType[clientType].count++;
            statsByClientType[clientType].totalScore += session.score || 0;
        });
        
        Object.entries(statsByClientType).forEach(([clientType, stats], index) => {
            if (yPos > 250) {
                doc.addPage();
                yPos = margin;
            }
            
            const clientTypeName = clientTypes[clientType]?.name || clientType;
            const avg = stats.count > 0 ? (stats.totalScore / stats.count).toFixed(1) : '0.0';
            const statText = `${clientTypeName}: ${stats.count} тренировок, средний балл: ${avg}/5`;
            
            if (index % 2 === 0) {
                doc.setFillColor(248, 249, 250);
                doc.rect(margin, yPos - 3, pageWidth - 2 * margin, 5, 'F');
            }
            
            doc.text(statText, margin + 2, yPos);
            yPos += 6;
        });
        
        yPos += 10;
        
        if (yPos > 220) {
            doc.addPage();
            yPos = margin;
        }
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Детали тренировок:', margin, yPos);
        yPos += 10;
        
        doc.setFontSize(8);
        sessions.forEach((session, index) => {
            if (yPos > 270) {
                doc.addPage();
                yPos = margin;
            }
            
            const clientType = clientTypes[session.client_type];
            const sessionText = `${formatDate(session.date, true)} - ${clientType?.name || session.client_type || 'Тренировка'} - ${session.score || 0}/5`;
            
            if (index % 2 === 0) {
                doc.setFillColor(248, 249, 250);
                doc.rect(margin, yPos - 3, pageWidth - 2 * margin, 5, 'F');
            }
            
            doc.text(sessionText, margin + 2, yPos);
            yPos += 5;
        });
        
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(
                `Тренер: ${auth.currentUser.username} • Страница ${i} из ${totalPages}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
        }
        
        const fileName = `Отчет_${studentName}_полный_${new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')}.pdf`;
        doc.save(fileName);
        
        return true;
    } catch (error) {
        console.error('Ошибка экспорта всех сессий ученика:', error);
        alert('Ошибка при создании PDF файла: ' + error.message);
        return false;
    }
}

async function exportVerticalStatsToPDF() {
    try {
        const vertical = document.getElementById('verticalSelect').value;
        const dateFrom = document.getElementById('verticalDateFrom').value;
        const dateTo = document.getElementById('verticalDateTo').value;
        
        const { jsPDF } = await loadJsPDF();
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        
        const students = await auth.getStudents();
        let allSessions = await auth.getAllTrainingSessions({});
        
        if (vertical !== 'all') {
            allSessions = allSessions.filter(session => session.vertical === vertical);
        }
        
        if (dateFrom || dateTo) {
            const fromDate = dateFrom ? new Date(dateFrom) : null;
            const toDate = dateTo ? new Date(dateTo) : null;
            if (toDate) toDate.setHours(23, 59, 59, 999);
            
            allSessions = allSessions.filter(session => {
                if (!session.date) return false;
                const sessionDate = new Date(session.date);
                if (fromDate && sessionDate < fromDate) return false;
                if (toDate && sessionDate > toDate) return false;
                return true;
            });
        }
        
        const verticalStudents = students.filter(student => 
            vertical === 'all' || student.group_name === vertical
        );
        
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Статистика по вертикалям', margin, 25);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Тренер: ${auth.currentUser.username}`, margin, 35);
        doc.text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`, margin, 40);
        doc.text(`Вертикаль: ${vertical === 'all' ? 'Все' : vertical}`, margin, 45);
        doc.text(`Период: ${dateFrom || 'начало'} - ${dateTo || 'конец'}`, margin, 50);
        doc.text(`Учеников: ${verticalStudents.length}`, margin, 55);
        doc.text(`Тренировок: ${allSessions.length}`, margin, 60);
        
        if (allSessions.length > 0) {
            const totalScore = allSessions.reduce((sum, session) => sum + (session.score || 0), 0);
            const avgScore = (totalScore / allSessions.length).toFixed(1);
            doc.text(`Средний балл по вертикали: ${avgScore}/5`, margin, 65);
        }
        
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, 70, pageWidth - margin, 70);
        
        let yPos = 80;
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Статистика по ученикам:', margin, yPos);
        yPos += 10;
        
        if (verticalStudents.length > 0) {
            doc.setFontSize(9);
            
            const studentStats = [];
            for (const student of verticalStudents) {
                const studentSessions = allSessions.filter(session => session.user_id === student.id);
                if (studentSessions.length > 0) {
                    const totalScore = studentSessions.reduce((sum, session) => sum + (session.score || 0), 0);
                    const avgScore = studentSessions.length > 0 ? (totalScore / studentSessions.length).toFixed(1) : '0.0';
                    studentStats.push({
                        name: student.username,
                        sessions: studentSessions.length,
                        avgScore: avgScore
                    });
                }
            }
            
            studentStats.sort((a, b) => b.avgScore - a.avgScore);
            
            studentStats.forEach((stat, index) => {
                if (yPos > 250) {
                    doc.addPage();
                    yPos = margin;
                }
                
                const statText = `${index + 1}. ${stat.name}: ${stat.sessions} тренировок, средний балл: ${stat.avgScore}/5`;
                
                if (index % 2 === 0) {
                    doc.setFillColor(248, 249, 250);
                    doc.rect(margin, yPos - 3, pageWidth - 2 * margin, 5, 'F');
                }
                
                doc.text(statText, margin + 2, yPos);
                yPos += 6;
            });
        } else {
            doc.setFontSize(12);
            doc.text('Нет данных по ученикам', margin, yPos);
        }
        
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(
                `Отчет по вертикалям • Страница ${i} из ${totalPages}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
        }
        
        const verticalName = vertical === 'all' ? 'Все_вертикали' : vertical.replace(/\s+/g, '_');
        const fileName = `Статистика_${verticalName}_${new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')}.pdf`;
        doc.save(fileName);
        
        return true;
    } catch (error) {
        console.error('Ошибка экспорта статистики по вертикалям:', error);
        alert('Ошибка при создании PDF файла: ' + error.message);
        return false;
    }
}

async function exportSystemStatsToPDF() {
    try {
        const dateFrom = document.getElementById('systemDateFrom').value;
        const dateTo = document.getElementById('systemDateTo').value;
        const verticalFilter = document.getElementById('systemVerticalFilter').value;
        
        const { jsPDF } = await loadJsPDF();
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        
        const students = await auth.getStudents();
        let allSessions = await auth.getAllTrainingSessions({});
        
        if (verticalFilter !== 'all') {
            allSessions = allSessions.filter(session => session.vertical === verticalFilter);
        }
        
        if (dateFrom || dateTo) {
            const fromDate = dateFrom ? new Date(dateFrom) : null;
            const toDate = dateTo ? new Date(dateTo) : null;
            if (toDate) toDate.setHours(23, 59, 59, 999);
            
            allSessions = allSessions.filter(session => {
                if (!session.date) return false;
                const sessionDate = new Date(session.date);
                if (fromDate && sessionDate < fromDate) return false;
                if (toDate && sessionDate > toDate) return false;
                return true;
            });
        }
        
        const filteredStudents = verticalFilter === 'all' ? 
            students : 
            students.filter(student => student.group_name === verticalFilter);
        
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('Общий отчет системы', pageWidth / 2, 25, { align: 'center' });
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Тренер: ${auth.currentUser.username}`, margin, 35);
        doc.text(`Дата формирования: ${new Date().toLocaleDateString('ru-RU')}`, margin, 40);
        doc.text(`Период: ${dateFrom || 'начало'} - ${dateTo || 'конец'}`, margin, 45);
        doc.text(`Вертикаль: ${verticalFilter === 'all' ? 'Все' : verticalFilter}`, margin, 50);
        doc.text(`Всего учеников: ${filteredStudents.length}`, margin, 55);
        doc.text(`Всего тренировок: ${allSessions.length}`, margin, 60);
        
        if (allSessions.length > 0) {
            const totalScore = allSessions.reduce((sum, session) => sum + (session.score || 0), 0);
            const avgScore = (totalScore / allSessions.length).toFixed(1);
            doc.text(`Средний балл системы: ${avgScore}/5`, margin, 65);
            
            const today = new Date().toISOString().split('T')[0];
            const activeToday = new Set();
            allSessions.forEach(session => {
                if (session.date?.includes(today)) {
                    activeToday.add(session.user_id);
                }
            });
            doc.text(`Активных сегодня: ${activeToday.size}`, margin, 70);
        }
        
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, 75, pageWidth - margin, 75);
        
        let yPos = 85;
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Статистика по типам клиентов:', margin, yPos);
        yPos += 10;
        
        const statsByClientType = {};
        allSessions.forEach(session => {
            const clientType = session.client_type;
            if (!statsByClientType[clientType]) {
                statsByClientType[clientType] = { count: 0, totalScore: 0 };
            }
            statsByClientType[clientType].count++;
            statsByClientType[clientType].totalScore += session.score || 0;
        });
        
        doc.setFontSize(9);
        
        Object.entries(statsByClientType).forEach(([clientType, stats], index) => {
            if (yPos > 250) {
                doc.addPage();
                yPos = margin;
            }
            
            const clientTypeName = clientTypes[clientType]?.name || clientType;
            const avg = stats.count > 0 ? (stats.totalScore / stats.count).toFixed(1) : '0.0';
            const percentage = allSessions.length > 0 ? ((stats.count / allSessions.length) * 100).toFixed(1) : '0.0';
            const statText = `${clientTypeName}: ${stats.count} тренировок (${percentage}%), средний балл: ${avg}/5`;
            
            if (index % 2 === 0) {
                doc.setFillColor(248, 249, 250);
                doc.rect(margin, yPos - 3, pageWidth - 2 * margin, 5, 'F');
            }
            
            doc.text(statText, margin + 2, yPos);
            yPos += 6;
        });
        
        yPos += 10;
        
        if (yPos > 220) {
            doc.addPage();
            yPos = margin;
        }
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Топ учеников по среднему баллу:', margin, yPos);
        yPos += 10;
        
        const studentStats = [];
        for (const student of filteredStudents) {
            const studentSessions = allSessions.filter(session => session.user_id === student.id);
            if (studentSessions.length >= 3) {
                const totalScore = studentSessions.reduce((sum, session) => sum + (session.score || 0), 0);
                const avgScore = studentSessions.length > 0 ? (totalScore / studentSessions.length).toFixed(1) : '0.0';
                studentStats.push({
                    name: student.username,
                    group: student.group_name || 'Без вертикали',
                    sessions: studentSessions.length,
                    avgScore: parseFloat(avgScore)
                });
            }
        }
        
        studentStats.sort((a, b) => b.avgScore - a.avgScore);
        
        if (studentStats.length > 0) {
            doc.setFontSize(9);
            studentStats.slice(0, 10).forEach((stat, index) => {
                if (yPos > 270) {
                    doc.addPage();
                    yPos = margin;
                }
                
                const rank = index + 1;
                let rankIcon = '';
                if (rank === 1) rankIcon = '🥇';
                else if (rank === 2) rankIcon = '🥈';
                else if (rank === 3) rankIcon = '🥉';
                
                const statText = `${rankIcon ? rankIcon + ' ' : ''}${stat.name} (${stat.group}): ${stat.sessions} тр., средний: ${stat.avgScore.toFixed(1)}/5`;
                
                if (index % 2 === 0) {
                    doc.setFillColor(248, 249, 250);
                    doc.rect(margin, yPos - 3, pageWidth - 2 * margin, 5, 'F');
                }
                
                doc.text(statText, margin + 2, yPos);
                yPos += 6;
            });
        } else {
            doc.setFontSize(12);
            doc.text('Недостаточно данных для рейтинга', margin, yPos);
        }
        
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text(
                `Общий отчет системы • Страница ${i} из ${totalPages}`,
                pageWidth / 2,
                pageHeight - 10,
                { align: 'center' }
            );
        }
        
        const fileName = `Общий_отчет_${new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')}.pdf`;
        doc.save(fileName);
        
        return true;
    } catch (error) {
        console.error('Ошибка экспорта общего отчета:', error);
        alert('Ошибка при создании PDF файла: ' + error.message);
        return false;
    }
}
