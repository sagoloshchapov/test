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
                avatar_url: '',
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
                avatar_url: user.avatar_url || '',
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
            const users = await this.supabaseRequest('users?select=id,username,group_name,stats,avatar_url');
            
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
                        xp: userStats.totalXP || 0,
                        avatar_url: user.avatar_url || ''
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
    
    async updateAvatar(userId, avatarUrl) {
        try {
            const response = await fetch('/api/supabase-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: `users?id=eq.${userId}`,
                    method: 'PATCH',
                    body: { avatar_url: avatarUrl },
                    headers: { 'Prefer': 'return=representation' }
                })
            });
            
            if (response.ok) {
                if (this.currentUser && this.currentUser.id === userId) {
                    this.currentUser.avatar_url = avatarUrl;
                    localStorage.setItem('dialogue_currentUser', JSON.stringify(this.currentUser));
                }
                this.cache.clear();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Ошибка обновления аватара:', error);
            return false;
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
        const authModal = document.getElementById('authModal');
        const mainContainer = document.getElementById('mainContainer');
        
        if (authModal) authModal.style.display = 'flex';
        if (mainContainer) mainContainer.style.display = 'none';
        
        this.showLoginForm();
    }
    
    showMainApp() {
        const authModal = document.getElementById('authModal');
        const mainContainer = document.getElementById('mainContainer');
        
        if (authModal) authModal.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'flex';
        
        this.updateInterfaceBasedOnRole();
    }
    
    showLoginForm() {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('resetPasswordForm').style.display = 'none';
        document.getElementById('trainerLoginForm').style.display = 'none';
        clearErrors();
    }

    updateInterfaceBasedOnRole() {
        if (!this.currentUser) return;
        
        const headerTitle = document.getElementById('appTitle');
        const headerSubtitle = document.getElementById('headerSubtitle');
        
        if (headerTitle && headerSubtitle) {
            if (this.userRole === 'trainer') {
                headerTitle.textContent = 'Панель тренера';
                headerSubtitle.textContent = `Тренер: ${this.currentUser.username}`;
            } else {
                headerTitle.textContent = 'Диалоговый тренажер';
                headerSubtitle.textContent = 'Тренировка работы с клиентами';
            }
        }
        
        const currentUserName = document.getElementById('currentUserName');
        if (currentUserName) {
            currentUserName.textContent = this.currentUser.username;
        }
        
        const groupBadge = document.getElementById('userGroupBadge');
        if (groupBadge) {
            if (this.userRole === 'trainer') {
                groupBadge.textContent = 'Тренер';
                groupBadge.style.background = 'linear-gradient(135deg, #155d27, #27ae60)';
            } else if (this.currentUser.group) {
                groupBadge.textContent = this.currentUser.group;
                groupBadge.style.background = 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))';
            } else {
                groupBadge.style.display = 'none';
            }
            groupBadge.style.display = 'inline-block';
        }
        
        // Обновляем аватар в хедере
        const headerAvatar = document.getElementById('headerUserAvatar');
        if (headerAvatar) {
            if (this.currentUser.avatar_url) {
                headerAvatar.innerHTML = `<img src="${this.currentUser.avatar_url}" alt="${this.currentUser.username}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            } else {
                headerAvatar.innerHTML = '<i class="fas fa-user"></i>';
            }
        }
        
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
        
        console.log("=== ФИНАЛЬНЫЙ ПРОМПТ ===");
        console.log("Тип клиента:", isRandomClient ? "Случайный" : selectedClientType);
        console.log("Вертикаль:", auth.currentUser?.group);
        
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
    const contentWrapper = document.getElementById('contentWrapper');
    
    if (sidebar && contentWrapper) {
        sidebar.innerHTML = '';
        contentWrapper.innerHTML = '';
        
        if (auth.isTrainer()) {
            loadTrainerInterface();
        } else {
            loadStudentInterface();
        }
    }
}

function loadStudentInterface() {
    const sidebar = document.getElementById('sidebar');
    const contentWrapper = document.getElementById('contentWrapper');
    
    if (!sidebar || !contentWrapper) return;
    
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
        <a href="javascript:void(0);" onclick="switchTab('profile')" class="nav-item" data-tab="profile">
            <i class="fas fa-user-circle"></i> Профиль
        </a>
        <a href="javascript:void(0);" onclick="switchTab('history')" class="nav-item" data-tab="history">
            <i class="fas fa-history"></i> История
        </a>
    `;
    
    contentWrapper.innerHTML = `
        <div class="tab-content active" id="home-tab">
            <div class="welcome-section">
                <div class="section-title">
                    <i class="fas fa-bullhorn"></i>
                    <span>Добро пожаловать в диалоговый тренажер!</span>
                </div>
                
                <div class="about-section">
                    <div class="about-content">
                        <h3 class="about-title">
                            <i class="fas fa-robot"></i>
                            О тренажере
                        </h3>
                        <p class="about-description">
                            Этот тренажер выполняет функции клиента, чтобы операторы могли тренироваться отрабатывать возражения и сложные ситуации. 
                            Искусственный интеллект играет роль клиента с различными типами поведения, но не знает внутренние логики и процессы вашей компании.
                        </p>
                        <p class="about-description">
                            <strong>Ваша задача:</strong> помочь виртуальному клиенту, отработать его возражения, объяснить что ему нужно делать, 
                            и найти оптимальное решение в рамках своей компетенции.
                        </p>
                        <div class="about-features">
                            <div class="about-feature">
                                <h5><i class="fas fa-graduation-cap"></i> Обучение на практике</h5>
                                <p>Тренируйтесь в безопасной среде без риска для реальных клиентов</p>
                            </div>
                            <div class="about-feature">
                                <h5><i class="fas fa-users"></i> Разные типы клиентов</h5>
                                <p>Отрабатывайте навыки с агрессивными, пассивными, требовательными и другими типами клиентов</p>
                            </div>
                            <div class="about-feature">
                                <h5><i class="fas fa-chart-line"></i> Отслеживание прогресса</h5>
                                <p>Получайте обратную связь и следите за своим профессиональным ростом</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="confidentiality-warning">
                    <h4><i class="fas fa-exclamation-triangle"></i> ВАЖНО: Конфиденциальность данных</h4>
                    <div class="confidentiality-list">
                        <div class="prohibited">
                            <strong>ЗАПРЕЩЕНО указывать:</strong>
                            <ul>
                                <li>Конфиденциальную информацию компании</li>
                                <li>Персональные данные клиентов</li>
                                <li>Банковские/паспортные данные</li>
                                <li>Внутренние логики и процессы</li>
                                <li>Коммерческие тайны</li>
                            </ul>
                        </div>
                        <div class="recommended">
                            <strong>РЕКОМЕНДАЦИИ:</strong>
                            <ul>
                                <li>Используйте вымышленные данные</li>
                                <li>Не указывайте реальные имена</li>
                                <li>Сохраняйте конфиденциальность</li>
                                <li>Используйте общие формулировки</li>
                                <li>Обращайтесь к тренеру при сомнениях</li>
                            </ul>
                        </div>
                    </div>
                </div>
                
                <div class="news-section">
                    <div class="news-title">
                        <i class="fas fa-newspaper"></i>
                        <span>Новости тренажера</span>
                    </div>
                    <div class="news-container">
                        <div class="news-scroll-container" id="newsScrollContainer">
                            <div class="news-grid" id="newsGrid"></div>
                        </div>
                        <div class="scroll-indicator">
                            <i class="fas fa-chevron-left scroll-arrow left" onclick="scrollNews(-1)"></i>
                            <i class="fas fa-chevron-right scroll-arrow right" onclick="scrollNews(1)"></i>
                        </div>
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
                <div class="scenario-section" id="scenarioSection">
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
                            <button class="btn btn-secondary" id="endTrainingBtn" onclick="finishChat()" style="display: none;">
                                Завершить диалог
                            </button>
                            <div class="training-timer" id="trainingTimer"></div>
                        </div>
                    </div>
                </div>

                <div class="chat-section" id="chatSection">
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

        <div class="tab-content" id="profile-tab">
            <div class="welcome-section">
                <div class="profile-header">
                    <div class="profile-avatar-container">
                        <div class="profile-avatar" id="profileAvatar">
                            ${auth.currentUser.avatar_url ? `<img src="${auth.currentUser.avatar_url}" alt="${auth.currentUser.username}">` : '<i class="fas fa-user"></i>'}
                        </div>
                        <button class="btn btn-sm btn-secondary" onclick="openAvatarModal()" style="margin-top: 10px;">
                            <i class="fas fa-camera"></i> Сменить аватар
                        </button>
                    </div>
                    <div class="profile-info">
                        <div class="profile-name" id="profileUserName">${auth.currentUser.username}</div>
                        <div class="profile-group">
                            <span>Вертикаль:</span>
                            <span class="profile-group-badge" id="profileUserGroup">${auth.currentUser.group || 'Не указана'}</span>
                        </div>
                        <div class="profile-stats">
                            <div class="limit-badge">Уровень: ${auth.currentUser.stats.currentLevel || 1}</div>
                            <div class="limit-badge">Тренировок: ${auth.currentUser.stats.completedSessions || 0}</div>
                            <div class="limit-badge">XP: ${auth.currentUser.stats.totalXP || 0}</div>
                        </div>
                    </div>
                </div>

                <div class="profile-settings">
                    <div class="settings-section">
                        <h3 class="settings-title">
                            <i class="fas fa-medal"></i>
                            Ваши достижения
                        </h3>
                        <div class="badges-grid" id="profileBadgesGrid"></div>
                    </div>

                    <div class="settings-section">
                        <h3 class="settings-title">
                            <i class="fas fa-chart-line"></i>
                            Прогресс обучения
                        </h3>
                        <div class="progress-panel">
                            <div class="level-info">
                                <div class="level-badge">Уровень ${auth.currentUser.stats.currentLevel || 1}</div>
                                <div class="level-name">${levels.find(l => l.level === auth.currentUser.stats.currentLevel)?.name || 'Новичок'}</div>
                            </div>
                            
                            <div class="xp-bar">
                                <div class="xp-fill" style="width: ${calculateXPProgress()}%"></div>
                                <div class="xp-text">${auth.currentUser.stats.totalXP || 0}/${getNextLevelXP()} XP</div>
                            </div>
                            
                            <div class="stats-grid">
                                <div class="stat-item">
                                    <span class="stat-icon">🎯</span>
                                    <span class="stat-value">${auth.currentUser.stats.completedSessions || 0}</span>
                                    <span class="stat-label">тренировок</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-icon">⭐</span>
                                    <span class="stat-value">${(auth.currentUser.stats.averageScore || 0).toFixed(1)}</span>
                                    <span class="stat-label">средний балл</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-icon">🔥</span>
                                    <span class="stat-value">${auth.currentUser.stats.currentStreak || 0}</span>
                                    <span class="stat-label">дней подряд</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-icon">🏆</span>
                                    <span class="stat-value">${auth.currentUser.stats.achievementsUnlocked?.length || 0}</span>
                                    <span class="stat-label">достижений</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="settings-section">
                        <h3 class="settings-title">
                            <i class="fas fa-history"></i>
                            История тренировок
                        </h3>
                        <div style="margin-top: 15px;" id="profileHistoryList"></div>
                    </div>
                </div>
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
                
                <div style="margin-top: 15px;" id="historyList"></div>
            </div>
        </div>
    `;
    
    checkAndResetDailyLimit();
    updateDailyLimitNotification();
    
    loadStats();
    loadSystemStats();
    setupLeaderboardTabs();
    renderProfileAchievements();
    renderHistory();
    renderProfileHistory();
    renderDynamicNews();
}

function calculateXPProgress() {
    if (!auth.currentUser) return 0;
    const userStats = auth.currentUser.stats;
    const currentLevel = levels.find(l => l.level === userStats.currentLevel) || levels[0];
    const nextLevel = levels.find(l => l.level === userStats.currentLevel + 1);
    
    const currentLevelXP = currentLevel.requiredXP;
    const nextLevelXP = nextLevel ? nextLevel.requiredXP : currentLevelXP + 100;
    const xpProgress = userStats.totalXP - currentLevelXP;
    const xpNeeded = nextLevelXP - currentLevelXP;
    
    return Math.min(100, (xpProgress / xpNeeded) * 100);
}

function getNextLevelXP() {
    if (!auth.currentUser) return 100;
    const userStats = auth.currentUser.stats;
    const nextLevel = levels.find(l => l.level === userStats.currentLevel + 1);
    return nextLevel ? nextLevel.requiredXP : (levels.find(l => l.level === userStats.currentLevel)?.requiredXP || 0) + 100;
}

function renderProfileAchievements() {
    if (!auth.currentUser) return;
    
    const badgesGrid = document.getElementById('profileBadgesGrid');
    if (!badgesGrid) return;
    
    badgesGrid.innerHTML = '';
    
    const userAchievements = auth.currentUser.stats.achievementsUnlocked || [];
    
    if (userAchievements.length === 0) {
        badgesGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #666; padding: 20px;">У вас пока нет достижений. Начните тренировки!</div>';
        return;
    }
    
    userAchievements.forEach(achievementId => {
        const achievement = achievements.find(a => a.id === achievementId);
        if (achievement) {
            const badge = document.createElement('div');
            badge.className = 'badge earned';
            badge.innerHTML = `
                <span class="badge-icon">${achievement.icon}</span>
                <span class="badge-name">${achievement.name}</span>
                <span class="badge-desc">${achievement.description}</span>
            `;
            badge.title = achievement.description;
            badgesGrid.appendChild(badge);
        }
    });
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
    
    const startBtn = document.getElementById('startTrainingBtn');
    if (startBtn) startBtn.disabled = false;
    
    const scenarioTitle = document.getElementById('scenarioTitle');
    const scenarioDesc = document.getElementById('scenarioDescription');
    
    if (scenarioTitle && scenarioDesc) {
        if (isRandomClient) {
            scenarioTitle.textContent = 'Случайный клиент';
            scenarioDesc.textContent = 'Выбран случайный тип клиента. Диалог начнется с сообщения от клиента.';
        } else {
            const clientType = clientTypes[type];
            scenarioTitle.textContent = clientType.name;
            scenarioDesc.textContent = clientType.description;
        }
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
    
    // Анимация перехода
    const scenarioSection = document.getElementById('scenarioSection');
    const chatSection = document.getElementById('chatSection');
    const trainingContainer = document.querySelector('.training-container');
    
    if (scenarioSection && chatSection && trainingContainer) {
        // Плавно скрываем выбор клиента
        scenarioSection.style.opacity = '0';
        scenarioSection.style.transform = 'translateX(-20px)';
        scenarioSection.style.transition = 'all 0.5s ease';
        
        setTimeout(() => {
            scenarioSection.style.display = 'none';
            
            // Увеличиваем чат на место скрытого выбора клиента
            chatSection.style.gridColumn = '1 / -1';
            chatSection.style.transition = 'all 0.5s ease';
            chatSection.style.width = '100%';
            
            // Добавляем анимацию расширения
            chatSection.classList.add('chat-expanded');
            
            // Обновляем заголовок чата
            const chatTitle = document.querySelector('.chat-title');
            if (chatTitle) {
                const clientType = clientTypes[selectedClientType];
                chatTitle.textContent = `💬 Диалог с ${isRandomClient ? 'случайным клиентом' : clientType.name.toLowerCase()}`;
            }
            
            // Показываем кнопку "Завершить диалог"
            const endBtn = document.getElementById('endTrainingBtn');
            if (endBtn) endBtn.style.display = 'block';
            
            setTimeout(() => {
                startTrainingProcess();
            }, 300);
        }, 500);
    } else {
        startTrainingProcess();
    }
}

async function startTrainingProcess() {
    trainingInProgress = true;
    trainingStartTime = new Date();
    chatMessages = [];
    lastAIFeedback = "";
    
    const startBtn = document.getElementById('startTrainingBtn');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatStatus = document.getElementById('chatStatus');
    
    if (startBtn) startBtn.style.display = 'none';
    if (chatInput) chatInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (chatStatus) {
        chatStatus.textContent = 'Тренировка активна';
        chatStatus.className = 'chat-status training-active';
    }
    
    const chatMessagesDiv = document.getElementById('chatMessages');
    if (chatMessagesDiv) chatMessagesDiv.innerHTML = '';
    
    await sendPromptToAI();
    
    startTrainingTimer();
    
    setTimeout(() => {
        if (chatInput) chatInput.focus();
        if (chatMessagesDiv) chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    }, 100);
}

function startTrainingTimer() {
    clearInterval(trainingTimerInterval);
    trainingTimerInterval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now - trainingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timer = document.getElementById('trainingTimer');
        if (timer) timer.textContent = `Время: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        
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
    
    const startBtn = document.getElementById('startTrainingBtn');
    const endBtn = document.getElementById('endTrainingBtn');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const trainingTimer = document.getElementById('trainingTimer');
    const chatStatus = document.getElementById('chatStatus');
    
    if (startBtn) {
        startBtn.style.display = 'flex';
        startBtn.disabled = true;
    }
    if (endBtn) endBtn.style.display = 'none';
    if (trainingTimer) trainingTimer.textContent = '';
    if (chatInput) chatInput.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    if (chatStatus) {
        chatStatus.textContent = 'Ожидание начала';
        chatStatus.className = 'chat-status';
    }
    
    document.querySelectorAll('.client-type-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.style.pointerEvents = 'auto';
    });
    
    const scenarioTitle = document.getElementById('scenarioTitle');
    const scenarioDesc = document.getElementById('scenarioDescription');
    
    if (scenarioTitle) scenarioTitle.textContent = 'Выберите тип клиента';
    if (scenarioDesc) scenarioDesc.textContent = 'Выберите тип клиента из списка выше, чтобы начать тренировку. Тренировка длится до 15 минут.';
    
    // Восстанавливаем исходный вид интерфейса
    const scenarioSection = document.getElementById('scenarioSection');
    const chatSection = document.getElementById('chatSection');
    
    if (scenarioSection && chatSection) {
        // Убираем расширение чата
        chatSection.style.gridColumn = '';
        chatSection.style.width = '';
        chatSection.classList.remove('chat-expanded');
        
        // Показываем выбор клиента
        scenarioSection.style.display = 'block';
        setTimeout(() => {
            scenarioSection.style.opacity = '1';
            scenarioSection.style.transform = 'translateX(0)';
        }, 10);
        
        // Возвращаем заголовок чата
        const chatTitle = document.querySelector('.chat-title');
        if (chatTitle) {
            chatTitle.textContent = '💬 Тренировочный чат';
        }
    }
}

function handleChatInput(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input ? input.value.trim() : '';
    
    if (!message || !trainingInProgress) return;
    
    addMessage('user', message);
    
    if (input) {
        input.value = '';
        input.style.height = 'auto';
    }
    
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
    renderProfileHistory();
    renderProgressChart();
    loadSystemStats();
    renderProfileAchievements();
    
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
        renderProfileAchievements();
    }
}

async function renderDynamicNews() {
    const newsGrid = document.getElementById('newsGrid');
    if (!newsGrid) return;
    
    if (dynamicNews.length > 0) {
        let newsHTML = '';
        // Показываем все новости в скроллере
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

function scrollNews(direction) {
    const container = document.getElementById('newsScrollContainer');
    if (!container) return;
    
    const scrollAmount = 300; // Количество пикселей для прокрутки
    container.scrollLeft += direction * scrollAmount;
}

function showFeedbackModal() {
    if (!feedbackShown && auth.currentUser && auth.userRole === 'user') {
        setTimeout(() => {
            const feedbackModal = document.getElementById('feedbackModal');
            if (feedbackModal) feedbackModal.style.display = 'flex';
            feedbackShown = true;
        }, 1000);
    }
}

function openFeedbackForm() {
    window.open('https://forms.yandex.ru/u/696634f8d046880022dab232', '_blank');
    closeFeedbackModal();
}

function closeFeedbackModal() {
    const feedbackModal = document.getElementById('feedbackModal');
    if (feedbackModal) feedbackModal.style.display = 'none';
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
    
    const navItem = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    const tabContent = document.getElementById(`${tabName}-tab`);
    
    if (navItem) navItem.classList.add('active');
    if (tabContent) tabContent.classList.add('active');
    
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
            case 'profile':
                renderProfileAchievements();
                renderProfileHistory();
                break;
            case 'history':
                renderHistory();
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
        
        const totalUsers = document.getElementById('totalUsers');
        const totalSessions = document.getElementById('totalSessions');
        const avgSystemScore = document.getElementById('avgSystemScore');
        const activeToday = document.getElementById('activeToday');
        
        if (totalUsers) totalUsers.textContent = stats.totalUsers || 0;
        if (totalSessions) totalSessions.textContent = stats.totalSessions || 0;
        if (avgSystemScore) avgSystemScore.textContent = (stats.avgScore || 0).toFixed(1);
        if (activeToday) activeToday.textContent = stats.activeToday || 0;
    } catch (error) {
        console.error('Ошибка загрузки статистики системы:', error);
    }
}

async function updateProgressUI() {
    if (!auth.currentUser) return;
    
    const userStats = auth.currentUser.stats;
    const currentLevel = levels.find(l => l.level === userStats.currentLevel) || levels[0];
    const nextLevel = levels.find(l => l.level === userStats.currentLevel + 1);
    
    const levelBadge = document.getElementById('currentLevelBadge');
    const levelName = document.getElementById('currentLevelName');
    const xpFill = document.getElementById('xpFill');
    const xpText = document.getElementById('xpText');
    const sessionsCount = document.getElementById('sessionsCount');
    const avgScore = document.getElementById('avgScore');
    const streakCount = document.getElementById('streakCount');
    
    if (levelBadge) levelBadge.textContent = `Уровень ${userStats.currentLevel}`;
    if (levelName) levelName.textContent = currentLevel.name;
    
    const currentLevelXP = currentLevel.requiredXP;
    const nextLevelXP = nextLevel ? nextLevel.requiredXP : currentLevelXP + 100;
    const xpProgress = userStats.totalXP - currentLevelXP;
    const xpNeeded = nextLevelXP - currentLevelXP;
    const percentage = Math.min(100, (xpProgress / xpNeeded) * 100);
    
    if (xpFill) xpFill.style.width = `${percentage}%`;
    if (xpText) xpText.textContent = `${userStats.totalXP}/${nextLevelXP} XP`;
    if (sessionsCount) sessionsCount.textContent = userStats.completedSessions;
    if (avgScore) avgScore.textContent = userStats.averageScore.toFixed(1);
    if (streakCount) streakCount.textContent = userStats.currentStreak;
    
    checkLevelUp();
}

async function updateRankPosition() {
    if (!auth.currentUser) return;
    
    try {
        const verticalLeaderboard = await auth.getLeaderboard(auth.currentUser.group);
        const verticalRank = verticalLeaderboard.findIndex(p => p.id === auth.currentUser.id) + 1;
        const rankPosition = document.getElementById('rankPosition');
        if (rankPosition) rankPosition.textContent = verticalRank > 0 ? verticalRank : '-';
    } catch (error) {
        console.error('Ошибка обновления позиции в рейтинге:', error);
        const rankPosition = document.getElementById('rankPosition');
        if (rankPosition) rankPosition.textContent = '-';
    }
}

function renderProgressChart() {
    if (!auth.currentUser || !auth.currentUser.stats.trainingHistory) return;
    
    const history = auth.currentUser.stats.trainingHistory;
    if (history.length === 0) return;
    
    const ctx = document.getElementById('progressChart');
    if (!ctx) return;
    
    const chartCtx = ctx.getContext('2d');
    
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
    
    progressChart = new Chart(chartCtx, {
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
            let trophy = '';
            if (index === 0) {
                rankClass = 'rank-1';
                trophy = '🥇';
            } else if (index === 1) {
                rankClass = 'rank-2';
                trophy = '🥈';
            } else if (index === 2) {
                rankClass = 'rank-3';
                trophy = '🥉';
            }
            
            // Используем аватар, если есть, иначе иконку
            const avatar = player.avatar_url ? 
                `<img src="${player.avatar_url}" alt="${player.username}" class="leaderboard-avatar">` : 
                '<i class="fas fa-user"></i>';
            
            row.innerHTML = `
                <td class="rank ${rankClass}">
                    ${trophy ? `<span class="trophy">${trophy}</span>` : index + 1}
                </td>
                <td class="player-name">
                    <div class="leaderboard-player">
                        <div class="leaderboard-avatar-container">
                            ${avatar}
                        </div>
                        <span>${player.username} ${player.id === auth.currentUser?.id ? '(Вы)' : ''}</span>
                    </div>
                </td>
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

async function renderProfileHistory() {
    if (!auth.currentUser) return;
    
    const profileHistoryList = document.getElementById('profileHistoryList');
    if (!profileHistoryList) return;
    
    try {
        const localHistory = auth.currentUser.stats.trainingHistory || [];
        
        let history = [...localHistory];
        history.sort((a, b) => new Date(b.date) - new Date(a.date));
        history = history.slice(0, 5); // Показываем только последние 5 тренировок
        
        profileHistoryList.innerHTML = '';
        
        if (history.length === 0) {
            profileHistoryList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Нет данных о тренировках</div>';
            return;
        }
        
        history.forEach(item => {
            const clientType = clientTypes[item.clientType];
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.onclick = () => viewChatHistory(item);
            
            historyItem.innerHTML = `
                <div class="history-item-header">
                    <div class="history-item-title">${clientType ? clientType.name : 'Тренировка'}</div>
                    <div class="history-item-score">${item.score}/5</div>
                </div>
                <div class="history-item-details">${item.scenario || ''}</div>
                <div class="history-item-footer">
                    <div>
                        <span>${formatDate(item.date)}</span>
                        <span style="margin-left: 10px; color: #10a37f;">+${item.xp} XP</span>
                    </div>
                </div>
            `;
            profileHistoryList.appendChild(historyItem);
        });
    } catch (error) {
        console.error('Ошибка рендеринга истории профиля:', error);
        profileHistoryList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Ошибка загрузки истории</div>';
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

function loadTrainerInterface() {
    const sidebar = document.getElementById('sidebar');
    const contentWrapper = document.getElementById('contentWrapper');
    
    if (!sidebar || !contentWrapper) return;
    
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
    `;
    
    contentWrapper.innerHTML = `
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
                
                <div id="trainerStudentsContent">
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
                
                <div id="trainerSessionsContent">
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
                <div id="trainerStatisticsContent">
                    <p style="color: #666; margin-bottom: 15px; font-size: 14px;">
                        Загрузка статистики...
                    </p>
                </div>
            </div>
        </div>
    `;
    
    loadTrainerDashboard();
}

async function loadTrainerDashboard() {
    const dashboardContent = document.getElementById('trainerDashboardContent');
    if (!dashboardContent) return;
    
    dashboardContent.innerHTML = '<p style="color: #666; margin-bottom: 15px; font-size: 14px;">Загрузка данных о студентах...</p>';
    
    try {
        const students = await auth.getStudents();
        const allSessions = await auth.getAllTrainingSessions({ vertical: 'all' });
        
        let html = `
            <div class="stats-cards">
                <div class="stat-card">
                    <div class="value">${students.length}</div>
                    <div class="label">Всего учеников</div>
                </div>
                <div class="stat-card">
                    <div class="value">${allSessions?.length || 0}</div>
                    <div class="label">Всего тренировок</div>
                </div>
            </div>
            
            <div class="section-title" style="margin-top: 25px;">
                <i class="fas fa-history"></i>
                <span>Последние тренировки</span>
            </div>
            
            <div class="scrollable-container" style="max-height: 400px; overflow-y: auto; margin-top: 10px;">
        `;
        
        if (allSessions?.length) {
            allSessions.slice(0, 50).forEach(session => {
                const student = students.find(s => s.id === session.user_id);
                const clientType = clientTypes[session.client_type];
                
                html += `
                    <div class="student-item">
                        <div class="student-info">
                            <div class="student-name">${student ? student.username : 'Неизвестный ученик'}</div>
                            <div class="student-group">${session.vertical || 'Без вертикали'} • ${clientType ? clientType.name : session.client_type}</div>
                            <div style="margin-top: 5px; font-size: 12px; color: #666;">${session.scenario || 'Тренировка'}</div>
                        </div>
                        <div class="student-stats">
                            <div class="stat-badge">${session.score}/5</div>
                            <div class="stat-badge">${formatDate(session.date)}</div>
                        </div>
                        <div class="trainer-actions">
                            <button class="view-chat-btn-trainer" onclick="viewStudentChat('${session.user_id}', '${session.id}')">
                                <i class="fas fa-comments"></i> Чат
                            </button>
                            <button class="comment-btn" onclick="openCommentModal('${session.user_id}', '${session.id}', '${student ? student.username : 'Неизвестный'}')">
                                <i class="fas fa-comment"></i> Комментарий
                            </button>
                        </div>
                    </div>
                `;
            });
        } else {
            html += '<div style="text-align: center; padding: 20px; color: #666;">Нет данных о тренировках</div>';
        }
        
        html += `</div>`;
        
        dashboardContent.innerHTML = html;
        
    } catch (error) {
        console.error('Ошибка загрузки дашборда:', error);
        dashboardContent.innerHTML = '<p style="color: #dc3545;">Ошибка загрузки данных</p>';
    }
}

async function loadAllStudents() {
    const studentsContent = document.getElementById('trainerStudentsContent');
    if (!studentsContent) return;
    
    studentsContent.innerHTML = '<p style="color: #666; margin-bottom: 15px; font-size: 14px;">Загрузка списка учеников...</p>';
    
    try {
        const students = await auth.getStudents();
        const allSessions = await auth.getAllTrainingSessions({ vertical: 'all' });
        
        let html = `
            <div class="stats-cards">
                <div class="stat-card">
                    <div class="value">${students.length}</div>
                    <div class="label">Всего учеников</div>
                </div>
            </div>
            
            <div class="section-title" style="margin-top: 25px;">
                <i class="fas fa-users"></i>
                <span>Все ученики</span>
            </div>
            
            <div class="scrollable-container" style="max-height: 500px; overflow-y: auto;">
        `;
        
        if (students.length > 0) {
            const studentsByGroup = {};
            students.forEach(student => {
                const group = student.group_name || 'Без вертикали';
                if (!studentsByGroup[group]) studentsByGroup[group] = [];
                studentsByGroup[group].push(student);
            });
            
            for (const [group, groupStudents] of Object.entries(studentsByGroup)) {
                const groupId = `group_${group.replace(/\s+/g, '_')}`;
                html += `
                    <div class="vertical-group" id="${groupId}">
                        <div class="vertical-header" onclick="toggleVerticalGroup('${groupId}')">
                            <div>
                                <i class="fas fa-building"></i>
                                <span>${group}</span>
                                <span class="vertical-count">${groupStudents.length}</span>
                            </div>
                            <div class="toggle-icon">▼</div>
                        </div>
                        <div class="vertical-content" id="${groupId}_content">
                `;
                
                groupStudents.forEach(student => {
                    const studentSessions = allSessions?.filter(s => s.user_id === student.id) || [];
                    const totalScore = studentSessions.reduce((sum, s) => sum + (s.score || 0), 0);
                    const avgScore = studentSessions.length > 0 ? (totalScore / studentSessions.length).toFixed(1) : '0.0';
                    
                    html += `
                        <div class="student-item">
                            <div class="student-info">
                                <div class="student-name">${student.username}</div>
                                <div class="student-group">${student.group_name || 'Без вертикали'}</div>
                            </div>
                            <div class="student-stats">
                                <div class="stat-badge">${studentSessions.length} тренировок</div>
                                <div class="stat-badge">Средний: ${avgScore}/5</div>
                                <div class="stat-badge">Уровень: ${student.stats?.currentLevel || 1}</div>
                            </div>
                            <div class="trainer-actions">
                                <button class="view-chat-btn-trainer" onclick="viewStudentSessions('${student.id}', '${student.username}')">
                                    <i class="fas fa-history"></i> Тренировки
                                </button>
                            </div>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            }
            
            const firstGroup = Object.keys(studentsByGroup)[0];
            if (firstGroup) {
                setTimeout(() => toggleVerticalGroup(`group_${firstGroup.replace(/\s+/g, '_')}`, true), 100);
            }
        } else {
            html += '<div style="text-align: center; padding: 20px; color: #666;">Нет учеников в системе</div>';
        }
        
        html += `</div>`;
        
        studentsContent.innerHTML = html;
        
    } catch (error) {
        console.error('Ошибка загрузки учеников:', error);
        studentsContent.innerHTML = '<p style="color: #dc3545;">Ошибка загрузки данных</p>';
    }
}

async function searchStudents() {
    const searchInput = document.getElementById('studentSearchInput');
    const dateFrom = document.getElementById('studentDateFrom');
    const dateTo = document.getElementById('studentDateTo');
    
    if (!searchInput) return;
    
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    const studentsContent = document.getElementById('trainerStudentsContent');
    if (!studentsContent) return;
    
    studentsContent.innerHTML = '<p style="color: #666; margin-bottom: 15px; font-size: 14px;">Поиск учеников...</p>';
    
    try {
        const students = await auth.getStudents();
        const allSessions = await auth.getAllTrainingSessions({ vertical: 'all' });
        
        let filteredStudents = students;
        
        if (searchTerm) {
            filteredStudents = students.filter(student => 
                student.username.toLowerCase().includes(searchTerm) ||
                (student.group_name && student.group_name.toLowerCase().includes(searchTerm))
            );
        }
        
        if (dateFrom.value || dateTo.value) {
            filteredStudents = filteredStudents.filter(student => {
                if (!student.stats) return true;
                
                try {
                    const stats = typeof student.stats === 'string' ? 
                        JSON.parse(student.stats) : student.stats;
                    
                    if (!stats.registrationDate) return true;
                    
                    const regDate = new Date(stats.registrationDate);
                    const fromDate = dateFrom.value ? new Date(dateFrom.value) : null;
                    const toDate = dateTo.value ? new Date(dateTo.value) : null;
                    
                    if (fromDate && regDate < fromDate) return false;
                    if (toDate && regDate > toDate) return false;
                    
                    return true;
                } catch {
                    return true;
                }
            });
        }
        
        const studentsByGroup = {};
        filteredStudents.forEach(student => {
            const group = student.group_name || 'Без вертикали';
            if (!studentsByGroup[group]) {
                studentsByGroup[group] = [];
            }
            studentsByGroup[group].push(student);
        });
        
        let html = `
            <div class="stats-cards">
                <div class="stat-card">
                    <div class="value">${filteredStudents.length}</div>
                    <div class="label">Найдено учеников</div>
                </div>
            </div>
            
            <div class="section-title" style="margin-top: 25px;">
                <i class="fas fa-users"></i>
                <span>Результаты поиска</span>
                ${searchTerm ? `<span style="font-size: 12px; color: #666; margin-left: 10px;">По запросу: "${searchTerm}"</span>` : ''}
            </div>
            
            <div class="scrollable-container" style="max-height: 500px; overflow-y: auto;">
        `;
        
        if (filteredStudents.length > 0) {
            for (const [group, groupStudents] of Object.entries(studentsByGroup)) {
                const groupId = `group_${group.replace(/\s+/g, '_')}_search`;
                html += `
                    <div class="vertical-group" id="${groupId}">
                        <div class="vertical-header" onclick="toggleVerticalGroup('${groupId}')">
                            <div>
                                <i class="fas fa-building"></i>
                                <span>${group}</span>
                                <span class="vertical-count">${groupStudents.length}</span>
                            </div>
                            <div class="toggle-icon">▼</div>
                        </div>
                        <div class="vertical-content" id="${groupId}_content">
                `;
                
                groupStudents.forEach(student => {
                    const studentSessions = allSessions?.filter(s => s.user_id === student.id) || [];
                    const totalScore = studentSessions.reduce((sum, s) => sum + (s.score || 0), 0);
                    const avgScore = studentSessions.length > 0 ? (totalScore / studentSessions.length).toFixed(1) : '0.0';
                    
                    html += `
                        <div class="student-item">
                            <div class="student-info">
                                <div class="student-name">${student.username}</div>
                                <div class="student-group">${student.group_name || 'Без вертикали'}</div>
                            </div>
                            <div class="student-stats">
                                <div class="stat-badge">${studentSessions.length} тренировок</div>
                                <div class="stat-badge">Средний: ${avgScore}/5</div>
                                <div class="stat-badge">Уровень: ${student.stats?.currentLevel || 1}</div>
                            </div>
                            <div class="trainer-actions">
                                <button class="view-chat-btn-trainer" onclick="viewStudentSessions('${student.id}', '${student.username}')">
                                    <i class="fas fa-history"></i> Тренировки
                                </button>
                            </div>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            }
        } else {
            html += '<div style="text-align: center; padding: 20px; color: #666;">По вашему запросу ничего не найдено</div>';
        }
        
        html += `</div>`;
        
        studentsContent.innerHTML = html;
        
    } catch (error) {
        console.error('Ошибка поиска учеников:', error);
        studentsContent.innerHTML = '<p style="color: #dc3545;">Ошибка поиска</p>';
    }
}

async function searchSessions() {
    const searchInput = document.getElementById('sessionSearchInput');
    const dateFrom = document.getElementById('sessionDateFrom');
    const dateTo = document.getElementById('sessionDateTo');
    const scoreFilter = document.getElementById('sessionScoreFilter');
    
    if (!searchInput) return;
    
    const searchTerm = searchInput.value.toLowerCase().trim();
    const minScore = scoreFilter.value ? parseInt(scoreFilter.value) : 0;
    
    const sessionsContent = document.getElementById('trainerSessionsContent');
    if (!sessionsContent) return;
    
    sessionsContent.innerHTML = '<p style="color: #666; margin-bottom: 15px; font-size: 14px;">Поиск тренировок...</p>';
    
    try {
        const students = await auth.getStudents();
        let allSessions = await auth.getAllTrainingSessions({ vertical: 'all' });
        
        const filterSelect = document.getElementById('sessionFilter');
        const filterValue = filterSelect ? filterSelect.value : 'all';
        
        if (filterValue !== 'all' && allSessions) {
            allSessions = allSessions.filter(session => session.vertical === filterValue);
        }
        
        let filteredSessions = allSessions || [];
        
        if (searchTerm) {
            filteredSessions = filteredSessions.filter(session => {
                const student = students.find(s => s.id === session.user_id);
                const studentName = student ? student.username.toLowerCase() : '';
                const scenario = session.scenario ? session.scenario.toLowerCase() : '';
                const clientType = session.client_type ? session.client_type.toLowerCase() : '';
                
                return studentName.includes(searchTerm) || scenario.includes(searchTerm) || clientType.includes(searchTerm);
            });
        }
        
        if (dateFrom.value || dateTo.value) {
            filteredSessions = filteredSessions.filter(session => {
                if (!session.date) return false;
                
                const sessionDate = new Date(session.date);
                const fromDate = dateFrom.value ? new Date(dateFrom.value) : null;
                const toDate = dateTo.value ? new Date(dateTo.value) : null;
                
                if (fromDate && sessionDate < fromDate) return false;
                if (toDate && sessionDate > toDate) return false;
                return true;
            });
        }
        
        if (minScore > 0) {
            filteredSessions = filteredSessions.filter(session => session.score && session.score >= minScore);
        }
        
        let html = `
            <div class="stats-cards">
                <div class="stat-card">
                    <div class="value">${filteredSessions.length}</div>
                    <div class="label">Найдено тренировок</div>
                </div>
            </div>
            
            <div class="section-title" style="margin-top: 25px;">
                <i class="fas fa-history"></i>
                <span>Результаты поиска тренировок</span>
                ${searchTerm ? `<span style="font-size: 12px; color: #666; margin-left: 10px;">По запросу: "${searchTerm}"</span>` : ''}
            </div>
            
            <div class="scrollable-container" style="max-height: 600px; overflow-y: auto;">
        `;
        
        if (filteredSessions.length > 0) {
            const sessionsByDate = {};
            filteredSessions.forEach(session => {
                const date = new Date(session.date).toLocaleDateString('ru-RU');
                if (!sessionsByDate[date]) sessionsByDate[date] = [];
                sessionsByDate[date].push(session);
            });
            
            for (const [date, dateSessions] of Object.entries(sessionsByDate)) {
                const dateId = `date_${date.replace(/[\.\s]/g, '_')}`;
                html += `
                    <div class="vertical-group" id="${dateId}">
                        <div class="vertical-header" onclick="toggleVerticalGroup('${dateId}')">
                            <div>
                                <i class="far fa-calendar"></i>
                                <span>${date}</span>
                                <span class="vertical-count">${dateSessions.length}</span>
                            </div>
                            <div class="toggle-icon">▼</div>
                        </div>
                        <div class="vertical-content" id="${dateId}_content">
                `;
                
                dateSessions.forEach(session => {
                    const student = students.find(s => s.id === session.user_id);
                    const clientType = clientTypes[session.client_type];
                    
                    html += `
                        <div class="student-item">
                            <div class="student-info">
                                <div class="student-name">${student ? student.username : 'Неизвестный ученик'}</div>
                                <div class="student-group">${session.vertical || 'Без вертикали'} • ${clientType ? clientType.name : session.client_type}</div>
                            </div>
                            <div class="student-stats">
                                <div class="stat-badge">${session.score}/5</div>
                                <div class="stat-badge">${formatTime(session.date)}</div>
                            </div>
                            <div class="trainer-actions">
                                <button class="view-chat-btn-trainer" onclick="viewStudentChat('${session.user_id}', '${session.id}')">
                                    <i class="fas fa-comments"></i> Чат
                                </button>
                                <button class="comment-btn" onclick="openCommentModal('${session.user_id}', '${session.id}', '${student ? student.username : 'Неизвестный'}')">
                                    <i class="fas fa-comment"></i> Комментарий
                                </button>
                            </div>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            }
            
            const firstDate = Object.keys(sessionsByDate)[0];
            if (firstDate) {
                const dateId = `date_${firstDate.replace(/[\.\s]/g, '_')}`;
                setTimeout(() => toggleVerticalGroup(dateId, true), 100);
            }
        } else {
            html += '<div style="text-align: center; padding: 20px; color: #666;">По вашему запросу ничего не найдено</div>';
        }
        
        html += `</div>`;
        
        sessionsContent.innerHTML = html;
        
    } catch (error) {
        console.error('Ошибка поиска тренировок:', error);
        sessionsContent.innerHTML = '<p style="color: #dc3545;">Ошибка поиска</p>';
    }
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function loadAllSessions() {
    await searchSessions();
}

async function viewStudentSessions(studentId, studentName) {
    try {
        const sessions = await auth.supabaseRequest(`training_sessions?user_id=eq.${studentId}&order=date.desc`);
        
        let html = `
            <div class="section-title">
                <i class="fas fa-history"></i>
                <span>Тренировки ученика: ${studentName}</span>
            </div>
            
            <div class="scrollable-container" style="max-height: 500px; overflow-y: auto;">
        `;
        
        if (sessions?.length) {
            sessions.forEach(session => {
                const clientType = clientTypes[session.client_type];
                
                html += `
                    <div class="student-item">
                        <div class="student-info">
                            <div class="student-group">${session.vertical || 'Без вертикали'} • ${clientType ? clientType.name : session.client_type}</div>
                            <div style="margin-top: 5px; font-size: 12px; color: #666;">${session.scenario || 'Тренировка'}</div>
                        </div>
                        <div class="student-stats">
                            <div class="stat-badge">${session.score}/5</div>
                            <div class="stat-badge">${formatDate(session.date)}</div>
                        </div>
                        <div class="trainer-actions">
                            <button class="view-chat-btn-trainer" onclick="viewStudentChat('${studentId}', '${session.id}')">
                                <i class="fas fa-comments"></i> Чат
                            </button>
                            <button class="comment-btn" onclick="openCommentModal('${studentId}', '${session.id}', '${studentName}')">
                                <i class="fas fa-comment"></i> Комментарий
                            </button>
                        </div>
                    </div>
                `;
            });
        } else {
            html += '<div style="text-align: center; padding: 20px; color: #666;">У ученика нет тренировок</div>';
        }
        
        html += `</div>`;
        
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = html;
        
        const chatModalTitle = document.getElementById('chatModalTitle');
        const chatModalMessages = document.getElementById('chatModalMessages');
        const chatModal = document.getElementById('chatModal');
        
        if (chatModalTitle) chatModalTitle.textContent = `Тренировки ученика: ${studentName}`;
        if (chatModalMessages) {
            chatModalMessages.innerHTML = '';
            chatModalMessages.appendChild(tempContainer);
        }
        if (chatModal) chatModal.style.display = 'flex';
        
    } catch (error) {
        console.error('Ошибка загрузки тренировок ученика:', error);
        alert('Ошибка загрузки тренировок ученика');
    }
}

async function viewStudentChat(studentId, sessionId) {
    try {
        const session = await auth.supabaseRequest(`training_sessions?id=eq.${sessionId}`);
        if (!session?.length) return;
        
        const sessionData = session[0];
        const student = await auth.supabaseRequest(`users?id=eq.${studentId}`);
        const studentName = student?.[0] ? student[0].username : 'Студент';
        const clientType = clientTypes[sessionData.client_type];
        
        const chatModalTitle = document.getElementById('chatModalTitle');
        const chatModalClientType = document.getElementById('chatModalClientType');
        const chatModalDate = document.getElementById('chatModalDate');
        const chatModalScore = document.getElementById('chatModalScore');
        const messagesContainer = document.getElementById('chatModalMessages');
        const chatModal = document.getElementById('chatModal');
        
        if (chatModalTitle) chatModalTitle.textContent = `Диалог: ${studentName}`;
        if (chatModalClientType) chatModalClientType.textContent = clientType ? clientType.name : sessionData.client_type || '-';
        if (chatModalDate) chatModalDate.textContent = formatDate(sessionData.date);
        if (chatModalScore) chatModalScore.textContent = sessionData.score || 0;
        if (messagesContainer) messagesContainer.innerHTML = '';
        
        let messages = [];
        if (sessionData.messages && Array.isArray(sessionData.messages)) {
            messages = sessionData.messages;
        } else if (typeof sessionData.messages === 'string') {
            try {
                messages = JSON.parse(sessionData.messages);
            } catch (e) {
                console.error('Ошибка парсинга сообщений:', e);
            }
        }
        
        if (messages.length > 0 && messagesContainer) {
            messages.forEach(msg => {
                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${msg.sender === 'user' ? 'user' : 'ai'}`;
                messageDiv.textContent = msg.text;
                messagesContainer.appendChild(messageDiv);
            });
        } else if (messagesContainer) {
            messagesContainer.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Нет данных о диалоге</div>';
        }
        
        if (sessionData.ai_feedback?.trim() && messagesContainer) {
            const aiFeedbackContainer = document.createElement('div');
            aiFeedbackContainer.style.cssText = 'margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;';
            aiFeedbackContainer.innerHTML = `
                <div style="font-weight: 600; margin-bottom: 10px; color: #333;">Обратная связь от DeepSeek:</div>
                <div style="background: white; padding: 15px; border-radius: 6px; border: 1px solid #e9ecef; font-size: 13px; line-height: 1.6; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">${sessionData.ai_feedback}</div>
            `;
            messagesContainer.appendChild(aiFeedbackContainer);
        }
        
        if (sessionData.trainer_comments?.length && messagesContainer) {
            const commentsContainer = document.createElement('div');
            commentsContainer.style.cssText = 'margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;';
            commentsContainer.innerHTML = '<div style="font-weight: 600; margin-bottom: 10px; color: #333;">Комментарии тренера:</div>';
            
            sessionData.trainer_comments.forEach(comment => {
                const commentDiv = document.createElement('div');
                commentDiv.className = 'trainer-comment';
                commentDiv.innerHTML = `
                    <div class="comment-header">
                        <span>${comment.trainer}</span>
                        <span>${formatDate(comment.date)}</span>
                    </div>
                    <div class="comment-text">${comment.comment}</div>
                `;
                commentsContainer.appendChild(commentDiv);
            });
            
            messagesContainer.appendChild(commentsContainer);
        }
        
        if (messagesContainer) {
            const commentButton = document.createElement('button');
            commentButton.className = 'btn btn-primary';
            commentButton.style.cssText = 'margin-top: 15px; align-self: center;';
            commentButton.innerHTML = '<i class="fas fa-comment"></i> Добавить комментарий';
            commentButton.onclick = () => openCommentModal(studentId, sessionId, studentName);
            messagesContainer.appendChild(commentButton);
        }
        
        if (chatModal) chatModal.style.display = 'flex';
        
    } catch (error) {
        console.error('Ошибка загрузки чата:', error);
        alert('Ошибка загрузки диалога');
    }
}

function openCommentModal(studentId, sessionId, studentName) {
    selectedStudentForComment = studentId;
    selectedSessionForComment = sessionId;
    
    const commentModalTitle = document.getElementById('commentModalTitle');
    const commentModalStudentInfo = document.getElementById('commentModalStudentInfo');
    const commentModal = document.getElementById('commentModal');
    
    if (commentModalTitle) commentModalTitle.textContent = `Комментарий для: ${studentName}`;
    if (commentModalStudentInfo) commentModalStudentInfo.textContent = `Сессия: ${sessionId}`;
    
    const commentText = document.getElementById('commentText');
    if (commentText) commentText.value = '';
    
    loadExistingComments(sessionId);
    
    if (commentModal) commentModal.style.display = 'flex';
}

async function loadExistingComments(sessionId) {
    const existingComments = document.getElementById('existingComments');
    if (!existingComments) return;
    
    existingComments.innerHTML = '<div style="color: #666; font-size: 13px; margin-bottom: 10px;">Загрузка комментариев...</div>';
    
    try {
        const session = await auth.supabaseRequest(`training_sessions?id=eq.${sessionId}`);
        if (!session?.length) return;
        
        const comments = session[0].trainer_comments || [];
        
        if (comments.length === 0) {
            existingComments.innerHTML = '<div style="color: #666; font-size: 13px; margin-bottom: 10px;">Комментариев пока нет</div>';
            return;
        }
        
        let html = '<div style="margin-bottom: 15px;"><strong>Существующие комментарии:</strong></div>';
        comments.forEach(comment => {
            html += `
                <div class="trainer-comment" style="margin-bottom: 10px;">
                    <div class="comment-header">
                        <span>${comment.trainer}</span>
                        <span>${formatDate(comment.date)}</span>
                    </div>
                    <div class="comment-text">${comment.comment}</div>
                </div>
            `;
        });
        
        existingComments.innerHTML = html;
    } catch (error) {
        console.error('Ошибка загрузки комментариев:', error);
        existingComments.innerHTML = '<div style="color: #dc3545; font-size: 13px;">Ошибка загрузки комментариев</div>';
    }
}

async function submitComment() {
    const commentText = document.getElementById('commentText');
    if (!commentText) return;
    
    const comment = commentText.value.trim();
    
    if (!comment) {
        alert('Введите текст комментария');
        return;
    }
    
    if (!selectedStudentForComment || !selectedSessionForComment) {
        alert('Ошибка: не выбрана сессия для комментария');
        return;
    }
    
    try {
        const success = await auth.addTrainerComment(selectedSessionForComment, comment);
        
        if (success) {
            alert('Комментарий успешно добавлен!');
            closeCommentModal();
            
            const chatModal = document.getElementById('chatModal');
            if (chatModal && chatModal.style.display === 'flex') {
                viewStudentChat(selectedStudentForComment, selectedSessionForComment);
            }
        } else {
            alert('Ошибка при добавлении комментария');
        }
    } catch (error) {
        console.error('Ошибка добавления комментария:', error);
        alert('Ошибка при добавлении комментария');
    }
}

function closeCommentModal() {
    const commentModal = document.getElementById('commentModal');
    if (commentModal) commentModal.style.display = 'none';
    selectedStudentForComment = null;
    selectedSessionForComment = null;
}

function filterSessions() {
    loadAllSessions();
}

function viewChatHistory(session) {
    if (!session) return;
    
    const clientType = clientTypes[session.clientType];
    
    const chatModalTitle = document.getElementById('chatModalTitle');
    const chatModalClientType = document.getElementById('chatModalClientType');
    const chatModalDate = document.getElementById('chatModalDate');
    const chatModalScore = document.getElementById('chatModalScore');
    const messagesContainer = document.getElementById('chatModalMessages');
    const chatModal = document.getElementById('chatModal');
    
    if (chatModalTitle) chatModalTitle.textContent = clientType ? clientType.name : 'Диалог с клиентом';
    if (chatModalClientType) chatModalClientType.textContent = clientType ? clientType.name : '-';
    if (chatModalDate) chatModalDate.textContent = formatDate(session.date);
    if (chatModalScore) chatModalScore.textContent = session.score || 0;
    if (messagesContainer) messagesContainer.innerHTML = '';
    
    let messages = [];
    
    if (session.messages && Array.isArray(session.messages)) {
        messages = session.messages;
    } else if (typeof session.messages === 'string') {
        try {
            messages = JSON.parse(session.messages);
        } catch (e) {
            console.error('Ошибка парсинга сообщений:', e);
            messages = [];
        }
    }
    
    if (messages.length === 0 && messagesContainer) {
        messages = [
            { sender: 'ai', text: 'Добрый день! Чем могу помочь?', timestamp: session.date },
            { sender: 'user', text: 'У меня проблема с...', timestamp: new Date(new Date(session.date).getTime() + 60000).toISOString() },
            { sender: 'ai', text: 'Понимаю вашу ситуацию. Давайте решим этот вопрос.', timestamp: new Date(new Date(session.date).getTime() + 120000).toISOString() },
            { sender: 'user', text: 'Спасибо за помощь!', timestamp: new Date(new Date(session.date).getTime() + 180000).toISOString() }
        ];
    }
    
    if (messagesContainer) {
        messages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.sender}`;
            messageDiv.textContent = msg.text;
            messagesContainer.appendChild(messageDiv);
        });
        
        if (session.ai_feedback?.trim()) {
            const aiFeedbackContainer = document.createElement('div');
            aiFeedbackContainer.style.cssText = 'margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;';
            aiFeedbackContainer.innerHTML = `
                <div style="font-weight: 600; margin-bottom: 10px; color: #333;">Обратная связь от DeepSeek:</div>
                <div style="background: white; padding: 15px; border-radius: 6px; border: 1px solid #e9ecef; font-size: 13px; line-height: 1.6; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">${session.ai_feedback}</div>
            `;
            messagesContainer.appendChild(aiFeedbackContainer);
        }
        
        if (session.trainer_comments?.length) {
            const commentsContainer = document.createElement('div');
            commentsContainer.style.cssText = 'margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;';
            commentsContainer.innerHTML = '<div style="font-weight: 600; margin-bottom: 10px; color: #333;">Комментарии тренера:</div>';
            
            session.trainer_comments.forEach(comment => {
                const commentDiv = document.createElement('div');
                commentDiv.className = 'trainer-comment';
                commentDiv.innerHTML = `
                    <div class="comment-header">
                        <span>${comment.trainer}</span>
                        <span>${formatDate(comment.date)}</span>
                    </div>
                    <div class="comment-text">${comment.comment}</div>
                `;
                commentsContainer.appendChild(commentDiv);
            });
            
            messagesContainer.appendChild(commentsContainer);
        }
    }
    
    setTimeout(() => {
        if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
    
    if (chatModal) chatModal.style.display = 'flex';
}

function closeChatModal() {
    const chatModal = document.getElementById('chatModal');
    if (chatModal) chatModal.style.display = 'none';
}

function formatDate(dateString) {
    const date = new Date(dateString);
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

function showResultModal(title, scenario, icon, xpEarned, evaluation, duration, aiFeedback = "") {
    const resultTitle = document.getElementById('resultTitle');
    const resultIcon = document.getElementById('resultIcon');
    const resultXP = document.getElementById('resultXP');
    const resultDetails = document.getElementById('resultDetails');
    const aiFeedbackContainer = document.getElementById('aiFeedbackContainer');
    const aiFeedbackContent = document.getElementById('aiFeedbackContent');
    const resultModal = document.getElementById('resultModal');
    
    if (resultTitle) resultTitle.textContent = title;
    if (resultIcon) resultIcon.textContent = icon;
    if (resultXP) resultXP.textContent = `+${xpEarned} XP`;
    
    let details = `<div style="margin-bottom: 10px;"><strong>Сценарий:</strong> ${scenario}</div>`;
    
    if (evaluation) {
        details += `<div style="margin-bottom: 5px;"><strong>Оценка:</strong> ${evaluation.score}/5</div>`;
        details += `<div style="margin-bottom: 5px;"><strong>Время:</strong> ${formatDuration(duration)}</div>`;
        details += `<div style="margin-bottom: 5px;"><strong>Обратная связь:</strong> ${evaluation.feedback}</div>`;
        
        if (evaluation.criteria) {
            details += `<div style="margin-top: 10px; font-size: 12px; color: #666;">`;
            details += `<div>✓ Сообщений: ${evaluation.criteria.messageCount}</div>`;
            details += `<div>✓ Профессиональных фраз: ${evaluation.criteria.professionalPhrases}</div>`;
            details += `<div>✓ Корректное завершение: ${evaluation.criteria.properEnding ? 'Да' : 'Можно лучше'}</div>`;
            details += `</div>`;
        }
    }
    
    if (resultDetails) resultDetails.innerHTML = details;
    
    if (aiFeedback && aiFeedback.trim().length > 0) {
        if (aiFeedbackContent) aiFeedbackContent.textContent = aiFeedback;
        if (aiFeedbackContainer) {
            aiFeedbackContainer.style.display = 'block';
            if (aiFeedbackContent) {
                aiFeedbackContent.style.maxHeight = '400px';
                aiFeedbackContent.style.overflowY = 'auto';
            }
        }
    } else if (aiFeedbackContainer) {
        aiFeedbackContainer.style.display = 'none';
    }
    
    if (resultModal) resultModal.style.display = 'flex';
}

function showAchievementNotification(achievement) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        padding: 15px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 1001;
        animation: slideIn 0.3s ease;
        border-left: 4px solid #10a37f;
        min-width: 250px;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span style="font-size: 24px;">${achievement.icon}</span>
            <div>
                <div style="font-weight: 600; color: #333;">🎉 Новое достижение!</div>
                <div style="font-size: 12px; color: #666;">${achievement.name}</div>
            </div>
        </div>
        <div style="font-size: 13px; color: #555;">${achievement.description}</div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function closeResultModal() {
    const resultModal = document.getElementById('resultModal');
    const aiFeedbackContainer = document.getElementById('aiFeedbackContainer');
    
    if (resultModal) resultModal.style.display = 'none';
    if (aiFeedbackContainer) aiFeedbackContainer.style.display = 'none';
    
    loadDemoChat();
}

// Функции для работы с аватаром
function openAvatarModal() {
    const modal = document.getElementById('avatarModal');
    const avatarPreview = document.getElementById('avatarPreview');
    
    if (auth.currentUser.avatar_url) {
        avatarPreview.innerHTML = `<img src="${auth.currentUser.avatar_url}" alt="Текущий аватар">`;
    } else {
        avatarPreview.innerHTML = '<i class="fas fa-user"></i>';
    }
    
    const avatarUrlInput = document.getElementById('avatarUrl');
    avatarUrlInput.value = auth.currentUser.avatar_url || '';
    
    modal.style.display = 'flex';
}

function closeAvatarModal() {
    const modal = document.getElementById('avatarModal');
    modal.style.display = 'none';
}

function selectDefaultAvatar(type) {
    const urls = {
        male: 'https://api.dicebear.com/7.x/avataaars/svg?seed=male&backgroundColor=4cc9f0',
        female: 'https://api.dicebear.com/7.x/avataaars/svg?seed=female&backgroundColor=f472b6',
        robot: 'https://api.dicebear.com/7.x/bottts/svg?seed=robot&backgroundColor=60a5fa',
        cat: 'https://api.dicebear.com/7.x/avataaars/svg?seed=cat&backgroundColor=fbbf24'
    };
    
    const urlInput = document.getElementById('avatarUrl');
    const avatarPreview = document.getElementById('avatarPreview');
    
    urlInput.value = urls[type];
    avatarPreview.innerHTML = `<img src="${urls[type]}" alt="Превью аватара">`;
}

async function saveAvatar() {
    const avatarUrlInput = document.getElementById('avatarUrl');
    const avatarUrl = avatarUrlInput.value.trim();
    
    if (!avatarUrl) {
        alert('Введите URL изображения или выберите один из вариантов');
        return;
    }
    
    // Проверяем URL
    if (!avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://')) {
        alert('Пожалуйста, введите корректный URL (начинается с http:// или https://)');
        return;
    }
    
    try {
        const success = await auth.updateAvatar(auth.currentUser.id, avatarUrl);
        
        if (success) {
            alert('Аватар успешно обновлен!');
            
            // Обновляем аватар в интерфейсе
            const profileAvatar = document.getElementById('profileAvatar');
            if (profileAvatar) {
                profileAvatar.innerHTML = `<img src="${avatarUrl}" alt="${auth.currentUser.username}">`;
            }
            
            // Обновляем аватар в заголовке
            const headerAvatar = document.getElementById('headerUserAvatar');
            if (headerAvatar) {
                headerAvatar.innerHTML = `<img src="${avatarUrl}" alt="${auth.currentUser.username}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            }
            
            closeAvatarModal();
        } else {
            alert('Ошибка при обновлении аватара');
        }
    } catch (error) {
        console.error('Ошибка сохранения аватара:', error);
        alert('Ошибка при сохранении аватара');
    }
}

// Добавляем стили для анимаций
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .toggle-icon {
        transition: transform 0.3s;
    }
    
    .toggle-icon.expanded {
        transform: rotate(180deg);
    }
    
    .vertical-content {
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.3s ease-out;
    }
    
    .vertical-content.expanded {
        max-height: 1000px;
        transition: max-height 0.5s ease-in;
    }
    
    .profile-stats {
        display: flex;
        gap: 10px;
        margin-top: 10px;
        flex-wrap: wrap;
    }
    
    /* Стили для аватаров */
    .profile-avatar-container {
        text-align: center;
    }
    
    .profile-avatar {
        width: 100px;
        height: 100px;
        background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
        border-radius: var(--radius-xl);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        color: white;
        box-shadow: var(--shadow-lg);
        overflow: hidden;
        position: relative;
    }
    
    .profile-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: var(--radius-xl);
    }
    
    .leaderboard-player {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    
    .leaderboard-avatar-container {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 16px;
        overflow: hidden;
    }
    
    .leaderboard-avatar {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 50%;
    }
    
    /* Стили для кубков в рейтинге */
    .rank {
        position: relative;
        font-weight: 700;
        width: 50px;
        text-align: center;
    }
    
    .rank-1 .trophy {
        color: #ffd700;
        font-size: 20px;
        display: inline-block;
        animation: trophyGlow 2s infinite;
    }
    
    .rank-2 .trophy {
        color: #c0c0c0;
        font-size: 18px;
        display: inline-block;
    }
    
    .rank-3 .trophy {
        color: #cd7f32;
        font-size: 16px;
        display: inline-block;
    }
    
    @keyframes trophyGlow {
        0%, 100% {
            text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
        }
        50% {
            text-shadow: 0 0 20px rgba(255, 215, 0, 0.8), 0 0 30px rgba(255, 215, 0, 0.6);
        }
    }
    
    /* Анимации для тренировки */
    .training-container {
        display: grid;
        grid-template-columns: 1fr 1.5fr;
        gap: 24px;
        margin-top: 24px;
        transition: all 0.5s ease;
    }
    
    .chat-expanded {
        animation: expandChat 0.5s ease;
    }
    
    @keyframes expandChat {
        from {
            transform: scale(0.95);
            opacity: 0.8;
        }
        to {
            transform: scale(1);
            opacity: 1;
        }
    }
    
    /* Стили для модального окна аватара */
    .avatar-preview-container {
        display: flex;
        justify-content: center;
        margin: 20px 0;
    }
    
    .avatar-preview {
        width: 120px;
        height: 120px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 48px;
        color: white;
        overflow: hidden;
        border: 4px solid white;
        box-shadow: var(--shadow-lg);
    }
    
    .avatar-preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    
    .avatar-options {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        margin: 20px 0;
    }
    
    .avatar-option {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 10px;
        border-radius: var(--radius-md);
        border: 2px solid var(--border-color);
        cursor: pointer;
        transition: all var(--transition-fast);
    }
    
    .avatar-option:hover {
        border-color: var(--primary-color);
        transform: translateY(-2px);
    }
    
    .avatar-option-preview {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: var(--bg-surface);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        color: var(--primary-color);
        margin-bottom: 8px;
    }
    
    .avatar-option span {
        font-size: 12px;
        color: var(--text-secondary);
    }
    
    .help-text {
        font-size: 12px;
        color: #666;
        margin-top: 5px;
    }
    
    /* Стили для скроллера новостей */
    .news-container {
        position: relative;
    }
    
    .news-scroll-container {
        overflow-x: auto;
        white-space: nowrap;
        padding: 10px 0;
        scrollbar-width: thin;
        scrollbar-color: var(--primary-color) var(--bg-surface);
    }
    
    .news-scroll-container::-webkit-scrollbar {
        height: 8px;
    }
    
    .news-scroll-container::-webkit-scrollbar-track {
        background: var(--bg-surface);
        border-radius: 4px;
    }
    
    .news-scroll-container::-webkit-scrollbar-thumb {
        background: var(--primary-color);
        border-radius: 4px;
    }
    
    .news-grid {
        display: inline-flex;
        gap: 15px;
    }
    
    .news-item {
        flex: 0 0 auto;
        width: 300px;
        white-space: normal;
    }
    
    .scroll-indicator {
        display: flex;
        justify-content: space-between;
        margin-top: 10px;
    }
    
    .scroll-arrow {
        width: 36px;
        height: 36px;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all var(--transition-fast);
        color: var(--text-secondary);
    }
    
    .scroll-arrow:hover {
        background: var(--primary-color);
        color: white;
        border-color: var(--primary-color);
        transform: scale(1.1);
    }
    
    .scroll-arrow.left {
        transform: rotate(90deg);
    }
    
    .scroll-arrow.right {
        transform: rotate(-90deg);
    }
    
    .scroll-arrow.left:hover {
        transform: rotate(90deg) scale(1.1);
    }
    
    .scroll-arrow.right:hover {
        transform: rotate(-90deg) scale(1.1);
    }
`;
document.head.appendChild(style);

function setupLeaderboardTabs() {
    const tabs = document.querySelectorAll('.leaderboard-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            const filter = this.dataset.filter;
            updateLeaderboard(filter);
        });
    });
}

function toggleVerticalGroup(groupId, forceOpen = false) {
    const content = document.getElementById(`${groupId}_content`);
    const icon = document.querySelector(`#${groupId} .toggle-icon`);
    
    if (!content || !icon) return;
    
    if (forceOpen || content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        icon.classList.remove('expanded');
    } else {
        content.classList.add('expanded');
        icon.classList.add('expanded');
    }
}

setInterval(() => {
    if (auth.currentUser && !auth.isTrainer()) {
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
        
        if (now >= tomorrow) {
            checkAndResetDailyLimit();
            updateDailyLimitNotification();
        }
    }
}, 60000);

function finishChat() {
    if (!trainingInProgress) return;
    
    addMessage('user', "[[ДИАЛОГ ЗАВЕРШЕН]]");
    
    addMessage('ai', "Подготовка результатов чата...");
    
    setTimeout(() => {
        sendPromptToAI();
    }, 1000);
}

async function loadTrainerStatistics() {
    const statisticsContent = document.getElementById('trainerStatisticsContent');
    if (!statisticsContent) return;
    
    statisticsContent.innerHTML = '<p style="color: #666; margin-bottom: 15px; font-size: 14px;">Загрузка статистики...</p>';
    
    try {
        const students = await auth.getStudents();
        const allSessions = await auth.getAllTrainingSessions({ vertical: 'all' });
        
        const statsByVertical = {};
        const studentsByVertical = {};
        
        students.forEach(student => {
            const vertical = student.group_name || 'Без вертикали';
            if (!statsByVertical[vertical]) {
                statsByVertical[vertical] = { sessions: 0, totalScore: 0, students: 0 };
            }
            if (!studentsByVertical[vertical]) {
                studentsByVertical[vertical] = new Set();
            }
            studentsByVertical[vertical].add(student.id);
        });
        
        if (allSessions) {
            allSessions.forEach(session => {
                const vertical = session.vertical || 'Без вертикали';
                if (statsByVertical[vertical]) {
                    statsByVertical[vertical].sessions++;
                    statsByVertical[vertical].totalScore += session.score || 0;
                }
            });
        }
        
        let html = `
            <div class="stats-cards">
                <div class="stat-card">
                    <div class="value">${students.length}</div>
                    <div class="label">Всего учеников</div>
                </div>
                <div class="stat-card">
                    <div class="value">${allSessions?.length || 0}</div>
                    <div class="label">Всего тренировок</div>
                </div>
            </div>
            
            <div class="section-title" style="margin-top: 25px;">
                <i class="fas fa-chart-bar"></i>
                <span>Статистика по вертикалям</span>
            </div>
            
            <div class="scrollable-container" style="max-height: 500px; overflow-y: auto;">
        `;
        
        for (const [vertical, stats] of Object.entries(statsByVertical)) {
            const studentCount = studentsByVertical[vertical]?.size || 0;
            const avgScore = stats.sessions > 0 ? (stats.totalScore / stats.sessions).toFixed(1) : '0.0';
            
            html += `
                <div class="student-item">
                    <div class="student-info">
                        <div class="student-name">${vertical}</div>
                    </div>
                    <div class="student-stats">
                        <div class="stat-badge">${studentCount} учеников</div>
                        <div class="stat-badge">${stats.sessions} тренировок</div>
                        <div class="stat-badge">Средний: ${avgScore}/5</div>
                    </div>
                </div>
            `;
        }
        
        html += `</div>`;
        
        statisticsContent.innerHTML = html;
        
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
        statisticsContent.innerHTML = '<p style="color: #dc3545;">Ошибка загрузки данных</p>';
    }
}
