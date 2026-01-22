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
        this.promptsCache = null;
        this.newsCache = null;
        this.promptsLoaded = false;
        this.newsLoaded = false;
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
            
            if (method !== 'GET') {
                this.cache.clear();
            } else {
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
        if (this.promptsLoaded && this.promptsCache) {
            return this.promptsCache;
        }
        
        try {
            const prompts = await this.supabaseRequest('prompts?select=*');
            this.promptsCache = prompts || [];
            this.promptsLoaded = true;
            return this.promptsCache;
        } catch (error) {
            console.error('Ошибка загрузки промтов:', error);
            return [];
        }
    }
    
    async loadNews() {
        if (this.newsLoaded && this.newsCache) {
            return this.newsCache;
        }
        
        try {
            const news = await this.supabaseRequest('news?select=*&order=created_at.desc');
            this.newsCache = news || [];
            this.newsLoaded = true;
            return this.newsCache;
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
            console.log('Начало регистрации:', username);
            
            const existing = await this.supabaseRequest(`users?username=eq.${encodeURIComponent(username)}`);
            
            if (existing && existing.length > 0) {
                return { success: false, message: 'Пользователь с таким никнеймом уже существует' };
            }
            
            if (password.length < 6) {
                return { success: false, message: 'Пароль должен быть не менее 6 символов' };
            }
            
            if (!group) {
                return { success: false, message: 'Выберите вертикаль' };
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
            
            console.log('Отправка данных нового пользователя:', newUser);
            
            const responseData = await this.supabaseRequest('users', 'POST', newUser);
            
            console.log('Данные ответа:', responseData);
            
            this.cache.clear();
            
            return { 
                success: true, 
                message: 'Регистрация успешна! Теперь войдите в систему.' 
            };
        } catch (error) {
            console.error('Ошибка регистрации:', error);
            return { 
                success: false, 
                message: 'Ошибка соединения с базой данных. Проверьте подключение к интернету.' 
            };
        }
    }

    async login(username, password) {
        try {
            const users = await this.supabaseRequest(`users?username=eq.${encodeURIComponent(username)}`);
            
            if (!users || !users.length) {
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
            
            const avatarUrl = await this.getUserAvatar(user.id);
            
            this.currentUser = {
                id: user.id,
                username: user.username,
                group: user.group_name,
                role: user.role || 'user',
                avatar_url: avatarUrl || '',
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
            
            if (!users || users.length === 0) return [];
            
            const allAvatars = await this.supabaseRequest('user_avatars?select=user_id,avatar_url');
            
            const avatarMap = new Map();
            if (allAvatars && Array.isArray(allAvatars)) {
                allAvatars.forEach(avatar => {
                    avatarMap.set(avatar.user_id, avatar.avatar_url);
                });
            }
            
            const leaderboard = users
                .filter(user => {
                    const username = user.username.toLowerCase();
                    return !['test', 'testf', 'testm', 'testo', 'tests', 'testa'].includes(username);
                })
                .map(user => {
                    let stats = {};
                    try {
                        stats = typeof user.stats === 'string' ? JSON.parse(user.stats) : user.stats;
                    } catch { }
                    
                    const avatarUrl = avatarMap.get(user.id) || null;
                    
                    return {
                        id: user.id,
                        username: user.username || 'Без имени',
                        group: user.group_name || 'Без вертикали',
                        level: stats.currentLevel || 1,
                        sessions: stats.completedSessions || 0,
                        avgScore: stats.averageScore || 0,
                        xp: stats.totalXP || 0,
                        avatar_url: avatarUrl || ''
                    };
                });
            
            const filtered = leaderboard.filter(user => 
                filterVertical === 'all' || user.group === filterVertical
            );
            
            return filtered
                .sort((a, b) => b.xp - a.xp)
                .slice(0, 100);
                
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
            const existingAvatar = await this.supabaseRequest(`user_avatars?user_id=eq.${userId}`);
            
            if (existingAvatar && existingAvatar.length > 0) {
                await this.supabaseRequest(
                    `user_avatars?user_id=eq.${userId}`,
                    'PATCH',
                    { 
                        avatar_url: avatarUrl,
                        updated_at: new Date().toISOString()
                    }
                );
            } else {
                await this.supabaseRequest(
                    'user_avatars',
                    'POST',
                    { 
                        user_id: userId,
                        avatar_url: avatarUrl,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }
                );
            }
            
            if (this.currentUser && this.currentUser.id === userId) {
                this.currentUser.avatar_url = avatarUrl;
                localStorage.setItem('dialogue_currentUser', JSON.stringify(this.currentUser));
            }
            this.cache.clear();
            return true;
            
        } catch (error) {
            console.error('Ошибка обновления аватара:', error);
            return false;
        }
    }  

    async getUserAvatar(userId) {
        try {
            const avatars = await this.supabaseRequest(`user_avatars?user_id=eq.${userId}`);
            if (avatars && avatars.length > 0) {
                return avatars[0].avatar_url;
            }
            return null;
        } catch (error) {
            console.error('Ошибка получения аватара:', error);
            return null;
        }
    }
    
    async uploadAvatar(userId, file) {
        try {
            if (!file || !file.type.startsWith('image/')) {
                return { success: false, message: 'Выберите файл изображения (JPG, PNG, GIF)' };
            }
            
            if (file.size > 5 * 1024 * 1024) {
                return { success: false, message: 'Размер файла не должен превышать 5 МБ' };
            }
            
            const reader = new FileReader();
            
            return new Promise((resolve) => {
                reader.onload = async (e) => {
                    const base64Image = e.target.result;
                    
                    try {
                        const success = await this.updateAvatar(userId, base64Image);
                        if (success) {
                            resolve({ success: true, url: base64Image });
                        } else {
                            resolve({ success: false, message: 'Не удалось сохранить аватар' });
                        }
                    } catch (error) {
                        console.error('Ошибка сохранения аватара:', error);
                        resolve({ success: false, message: 'Ошибка сохранения аватара' });
                    }
                };
                
                reader.onerror = () => {
                    resolve({ success: false, message: 'Ошибка чтения файла' });
                };
                
                reader.readAsDataURL(file);
            });
            
        } catch (error) {
            console.error('Ошибка загрузки аватара:', error);
            return { success: false, message: 'Ошибка загрузки файла' };
        }
    }
    
    logout() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.userRole = null;
        this.cache.clear();
        this.promptsCache = null;
        this.newsCache = null;
        this.promptsLoaded = false;
        this.newsLoaded = false;
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
        
        const headerAvatar = document.getElementById('headerUserAvatar');
        if (headerAvatar) {
            if (this.currentUser.avatar_url && this.currentUser.avatar_url.startsWith('data:image')) {
                headerAvatar.innerHTML = `<img src="${this.currentUser.avatar_url}" alt="${this.currentUser.username}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            } else {
                this.getUserAvatar(this.currentUser.id).then(avatarUrl => {
                    if (avatarUrl && avatarUrl.startsWith('data:image')) {
                        this.currentUser.avatar_url = avatarUrl;
                        headerAvatar.innerHTML = `<img src="${avatarUrl}" alt="${this.currentUser.username}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                        localStorage.setItem('dialogue_currentUser', JSON.stringify(this.currentUser));
                    } else {
                        headerAvatar.innerHTML = '<i class="fas fa-user"></i>';
                    }
                }).catch(() => {
                    headerAvatar.innerHTML = '<i class="fas fa-user"></i>';
                });
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

// РАСШИРЕННЫЙ СПИСОК ДОСТИЖЕНИЙ
const achievements = [
    // Базовые достижения
    { id: "first_blood", name: "Первая кровь", icon: "🎯", description: "Пройдите первую тренировку", category: "базовые", condition: "sessions >= 1" },
    { id: "quick_start", name: "Быстрый старт", icon: "⚡", description: "Пройдите 3 тренировки за неделю", category: "активность", condition: "weekly_sessions >= 3" },
    { id: "regular_5", name: "Регулярный", icon: "📅", description: "5 тренировок в месяц", category: "активность", condition: "monthly_sessions >= 5" },
    { id: "regular_10", name: "Активный", icon: "🏃", description: "10 тренировок в месяц", category: "активность", condition: "monthly_sessions >= 10" },
    { id: "regular_20", name: "Супер-активный", icon: "🚀", description: "20 тренировок в месяц", category: "активность", condition: "monthly_sessions >= 20" },
    
    // Серии
    { id: "streak_3", name: "Последователь", icon: "🔥", description: "3 дня подряд", category: "активность", condition: "streak >= 3" },
    { id: "streak_7", name: "Непрерывный", icon: "💪", description: "7 дней подряд", category: "активность", condition: "streak >= 7" },
    { id: "streak_30", name: "Легенда стрика", icon: "👑", description: "30 дней подряд", category: "активность", condition: "streak >= 30" },
    
    // Качество работы
    { id: "score_5", name: "Отличник", icon: "⭐", description: "Получите оценку 5", category: "качество", condition: "max_score >= 5" },
    { id: "score_avg_4", name: "Стабильный", icon: "📊", description: "Средний балл 4+", category: "качество", condition: "avg_score >= 4" },
    { id: "score_avg_4.5", name: "Профессионал", icon: "🎖️", description: "Средний балл 4.5+", category: "качество", condition: "avg_score >= 4.5" },
    { id: "perfect_5", name: "Идеально", icon: "💎", description: "5 тренировок подряд на 5", category: "качество", condition: "perfect_streak >= 5" },
    
    // Прогресс
    { id: "level_3", name: "Специалист", icon: "🏆", description: "Достигните 3 уровня", category: "прогресс", condition: "level >= 3" },
    { id: "level_5", name: "Мастер", icon: "👑", description: "Достигните 5 уровня", category: "прогресс", condition: "level >= 5" },
    { id: "level_7", name: "Гуру", icon: "🌟", description: "Достигните 7 уровня", category: "прогресс", condition: "level >= 7" },
    { id: "xp_500", name: "Опытный", icon: "💼", description: "Заработайте 500 XP", category: "прогресс", condition: "total_xp >= 500" },
    { id: "xp_1000", name: "Ветеран", icon: "🛡️", description: "Заработайте 1000 XP", category: "прогресс", condition: "total_xp >= 1000" },
    { id: "xp_2000", name: "Легенда XP", icon: "🏛️", description: "Заработайте 2000 XP", category: "прогресс", condition: "total_xp >= 2000" },
    
    // Типы клиентов
    { id: "all_types", name: "Универсал", icon: "🎭", description: "Поработайте со всеми типами клиентов", category: "типы клиентов", condition: "all_client_types" },
    { id: "master_aggressive", name: "Укротитель", icon: "😠", description: "10 тренировок с агрессивными", category: "типы клиентов", condition: "aggressive_sessions >= 10" },
    { id: "master_passive", name: "Психолог", icon: "😔", description: "10 тренировок с пассивными", category: "типы клиентов", condition: "passive_sessions >= 10" },
    { id: "master_demanding", name: "Эксперт", icon: "🧐", description: "10 тренировок с требовательными", category: "типы клиентов", condition: "demanding_sessions >= 10" },
    { id: "master_indecisive", name: "Наставник", icon: "🤔", description: "10 тренировок с нерешительными", category: "типы клиентов", condition: "indecisive_sessions >= 10" },
    { id: "master_chatty", name: "Душа компании", icon: "😄", description: "10 тренировок с 'славными малыми'", category: "типы клиентов", condition: "chatty_sessions >= 10" },
    
    // Новые достижения
    { id: "early_bird", name: "Жаворонок", icon: "🌅", description: "Пройдите тренировку до 9 утра", category: "особые", condition: "early_session" },
    { id: "night_owl", name: "Сова", icon: "🌙", description: "Пройдите тренировку после 22:00", category: "особые", condition: "late_session" },
    { id: "weekend_warrior", name: "Выходной боец", icon: "🎪", description: "Пройдите тренировку в выходной", category: "особые", condition: "weekend_session" },
    { id: "quick_thinker", name: "Быстрый ум", icon: "⚡", description: "Завершите тренировку менее чем за 3 минуты с оценкой 4+", category: "особые", condition: "quick_session" },
    { id: "perfect_10", name: "Совершенство", icon: "💯", description: "10 тренировок подряд с оценкой 5", category: "качество", condition: "perfect_streak >= 10" },
    { id: "conversation_master", name: "Мастер диалога", icon: "💬", description: "Отправьте более 100 сообщений в чатах", category: "активность", condition: "total_messages >= 100" },
    { id: "conflict_resolver", name: "Миротворец", icon: "🕊️", description: "Решите 50 конфликтных ситуаций", category: "особые", condition: "conflicts_resolved >= 50" },
    { id: "versatile_expert", name: "Разносторонний эксперт", icon: "🎯", description: "Пройдите по 5 тренировок каждого типа клиентов", category: "типы клиентов", condition: "all_types_5" },
    { id: "first_month", name: "Первый месяц", icon: "📆", description: "Активно тренируйтесь в течение первого месяца", category: "активность", condition: "first_month_active" },
    { id: "one_year", name: "Год совершенства", icon: "🎂", description: "Тренируйтесь в течение года", category: "активность", condition: "one_year_active" },
    { id: "vertical_champion", name: "Чемпион вертикали", icon: "🥇", description: "Займите 1 место в рейтинге своей вертикали", category: "соревнование", condition: "vertical_rank == 1" },
    { id: "top_3_vertical", name: "Топ-3 вертикали", icon: "🥉", description: "Войдите в топ-3 своей вертикали", category: "соревнование", condition: "vertical_rank <= 3" },
    { id: "global_top_10", name: "Мировой топ-10", icon: "🌍", description: "Войдите в топ-10 общего рейтинга", category: "соревнование", condition: "global_rank <= 10" },
    { id: "daily_challenge", name: "Дневной вызов", icon: "☀️", description: "Выполните все 5 тренировок за один день", category: "особые", condition: "daily_sessions >= 5" }
];

let dynamicVerticalPrompts = {};
let dynamicNews = [];
let selectedClientType = null;
let currentPrompt = null;
let trainingInProgress = false;
let trainingStartTime = null;
let chatMessages = [];
let progressChart = null;
let achievementsChart = null;
let trainingTimerInterval = null;
let selectedStudentForComment = null;
let selectedSessionForComment = null;
let lastAIFeedback = "";
let dailyLimit = 5;
let dailySessionsUsed = 0;
let lastResetTime = null;
let isRandomClient = false;
let lastChatSessionData = null;

async function loadDynamicPrompts() {
    try {
        const prompts = await auth.loadPrompts();
        dynamicVerticalPrompts = prompts.reduce((acc, prompt) => {
            if (prompt.vertical && prompt.content) {
                acc[prompt.vertical] = prompt.content;
            }
            return acc;
        }, {});
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
            
            const avatarUrl = await auth.getUserAvatar(user.id);
            user.avatar_url = avatarUrl || user.avatar_url || '';
            
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

function loadAchievementsTab() {
    if (!auth.currentUser) return '';
    
    const userStats = auth.currentUser.stats;
    const userAchievements = userStats.achievementsUnlocked || [];
    
    // Статистика для проверки достижений
    const stats = calculateAchievementStats();
    
    let html = `
        <div class="achievements-section">
            <div class="section-title">
                <span>🏆 Достижения</span>
            </div>
            
            <div class="stats-cards">
                <div class="stat-card">
                    <div class="value">${userAchievements.length}/${achievements.length}</div>
                    <div class="label">Открыто достижений</div>
                </div>
                <div class="stat-card">
                    <div class="value">${calculateCompletionPercentage()}%</div>
                    <div class="label">Прогресс</div>
                </div>
                <div class="stat-card">
                    <div class="value">${getNextAchievement()}</div>
                    <div class="label">Ближайшее достижение</div>
                </div>
                <div class="stat-card">
                    <div class="value">${getRarestAchievement()}</div>
                    <div class="label">Самое редкое</div>
                </div>
            </div>
            
            <div class="achievements-filter">
                <button class="filter-btn active" onclick="filterAchievements('all', event)">Все</button>
                <button class="filter-btn" onclick="filterAchievements('базовые', event)">Базовые</button>
                <button class="filter-btn" onclick="filterAchievements('активность', event)">Активность</button>
                <button class="filter-btn" onclick="filterAchievements('качество', event)">Качество</button>
                <button class="filter-btn" onclick="filterAchievements('прогресс', event)">Прогресс</button>
                <button class="filter-btn" onclick="filterAchievements('типы клиентов', event)">Типы клиентов</button>
                <button class="filter-btn" onclick="filterAchievements('особые', event)">Особые</button>
                <button class="filter-btn" onclick="filterAchievements('соревнование', event)">Соревнование</button>
                <button class="filter-btn" onclick="filterAchievements('unlocked', event)">Полученные</button>
                <button class="filter-btn" onclick="filterAchievements('locked', event)">Не полученные</button>
            </div>
            
            <div class="achievements-grid" id="achievementsGrid"></div>
        </div>
        
        <div class="progress-panel">
            <div class="section-title">
                <span>📈 Прогресс по категориям</span>
            </div>
            <div class="chart-container">
                <canvas id="achievementsChart"></canvas>
            </div>
        </div>
    `;
    
    return html;
}

function calculateAchievementStats() {
    if (!auth.currentUser) return {};
    
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
    
    let perfectStreak = 0;
    const recentSessions = userStats.trainingHistory?.slice(0, 10) || [];
    for (const session of recentSessions) {
        if (session.score === 5) {
            perfectStreak++;
        } else {
            break;
        }
    }
    
    let allClientTypes = false;
    const clientTypesCount = {};
    Object.keys(clientTypes).forEach(type => {
        clientTypesCount[type] = userStats.clientTypesCompleted?.[type]?.sessions || 0;
    });
    
    const uniqueTypes = Object.values(clientTypesCount).filter(count => count > 0).length;
    allClientTypes = uniqueTypes >= Object.keys(clientTypes).length;
    
    const hour = today.getHours();
    const trainingBefore9am = hour < 9;
    const trainingAfter10pm = hour >= 22;
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;
    
    let totalMessages = 0;
    userStats.trainingHistory?.forEach(session => {
        if (session.messages && Array.isArray(session.messages)) {
            totalMessages += session.messages.length;
        }
    });
    
    return {
        sessions: userStats.completedSessions,
        max_score: Math.max(...(userStats.trainingHistory?.map(h => h.score) || [0])),
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
        perfect_streak: perfectStreak,
        perfect_sessions: userStats.trainingHistory?.filter(s => s.score === 5).length || 0,
        all_client_types: allClientTypes,
        early_session: trainingBefore9am,
        late_session: trainingAfter10pm,
        weekend_session: isWeekend,
        total_messages: totalMessages,
        daily_sessions: dailySessionsUsed,
        conflicts_resolved: Math.floor(userStats.completedSessions / 2),
        first_month_active: userStats.completedSessions >= 10,
        one_year_active: false
    };
}

function calculateCompletionPercentage() {
    if (!auth.currentUser) return 0;
    
    const userAchievements = auth.currentUser.stats.achievementsUnlocked || [];
    return Math.round((userAchievements.length / achievements.length) * 100);
}

function getNextAchievement() {
    if (!auth.currentUser) return "Нет данных";
    
    const userAchievements = auth.currentUser.stats.achievementsUnlocked || [];
    const stats = calculateAchievementStats();
    
    for (const achievement of achievements) {
        if (!userAchievements.includes(achievement.id)) {
            return achievement.name;
        }
    }
    
    return "Все получены!";
}

function getRarestAchievement() {
    // Здесь можно добавить логику для определения самого редкого достижения
    return "Легенда стрика";
}

function filterAchievements(filter, event) {
    const grid = document.getElementById('achievementsGrid');
    if (!grid) return;
    
    const userStats = auth.currentUser.stats;
    const userAchievements = userStats.achievementsUnlocked || [];
    const stats = calculateAchievementStats();
    
    let filteredAchievements = achievements;
    
    if (filter !== 'all') {
        if (filter === 'unlocked') {
            filteredAchievements = achievements.filter(a => userAchievements.includes(a.id));
        } else if (filter === 'locked') {
            filteredAchievements = achievements.filter(a => !userAchievements.includes(a.id));
        } else {
            filteredAchievements = achievements.filter(a => a.category === filter);
        }
    }
    
    renderAchievementsGrid(filteredAchievements, userAchievements, stats);
    
 
    document.querySelectorAll('.achievements-filter .filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    

    if (event && event.target) {
        event.target.classList.add('active');
    } else {

        const firstBtn = document.querySelector('.achievements-filter .filter-btn');
        if (firstBtn) firstBtn.classList.add('active');
    }
}
    
    renderAchievementsGrid(filteredAchievements, userAchievements, stats);
    

    document.querySelectorAll('.achievements-filter .filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
}

function renderAchievementsGrid(achievementsList, userAchievements, stats) {
    const grid = document.getElementById('achievementsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (achievementsList.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 20px;">🏆</div>
                <div style="font-size: 16px; font-weight: 500; margin-bottom: 10px;">Достижений не найдено</div>
                <div style="font-size: 14px;">Попробуйте другой фильтр</div>
            </div>
        `;
        return;
    }
    
    achievementsList.forEach(achievement => {
        const isUnlocked = userAchievements.includes(achievement.id);
        const progress = calculateAchievementProgress(achievement, stats);
        
        const card = document.createElement('div');
        card.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;
        
        card.innerHTML = `
            <div class="achievement-header">
                <div class="achievement-icon">${achievement.icon}</div>
                <div class="achievement-title">
                    <div class="achievement-name">${achievement.name}</div>
                    <div class="achievement-category">${achievement.category}</div>
                </div>
            </div>
            <div class="achievement-description">${achievement.description}</div>
            ${progress.showProgress ? `
                <div class="achievement-progress">
                    <div class="progress-text">
                        <span>Прогресс</span>
                        <span>${progress.current}/${progress.total}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress.percentage}%"></div>
                    </div>
                </div>
            ` : ''}
            <div class="achievement-status ${isUnlocked ? 'status-unlocked' : 'status-locked'}">
                ${isUnlocked ? '✅ Получено' : '🔒 Не получено'}
            </div>
        `;
        
        grid.appendChild(card);
    });
}

function calculateAchievementProgress(achievement, stats) {
    let current = 0;
    let total = 0;
    let showProgress = false;
    
    switch(achievement.condition) {
        case "sessions >= 1":
            current = stats.sessions;
            total = 1;
            showProgress = true;
            break;
        case "weekly_sessions >= 3":
            current = stats.weekly_sessions;
            total = 3;
            showProgress = true;
            break;
        case "monthly_sessions >= 5":
            current = stats.monthly_sessions;
            total = 5;
            showProgress = true;
            break;
        case "monthly_sessions >= 10":
            current = stats.monthly_sessions;
            total = 10;
            showProgress = true;
            break;
        case "monthly_sessions >= 20":
            current = stats.monthly_sessions;
            total = 20;
            showProgress = true;
            break;
        case "streak >= 3":
            current = stats.streak;
            total = 3;
            showProgress = true;
            break;
        case "streak >= 7":
            current = stats.streak;
            total = 7;
            showProgress = true;
            break;
        case "streak >= 30":
            current = stats.streak;
            total = 30;
            showProgress = true;
            break;
        case "aggressive_sessions >= 10":
            current = stats.aggressive_sessions;
            total = 10;
            showProgress = true;
            break;
        case "passive_sessions >= 10":
            current = stats.passive_sessions;
            total = 10;
            showProgress = true;
            break;
        case "demanding_sessions >= 10":
            current = stats.demanding_sessions;
            total = 10;
            showProgress = true;
            break;
        case "indecisive_sessions >= 10":
            current = stats.indecisive_sessions;
            total = 10;
            showProgress = true;
            break;
        case "chatty_sessions >= 10":
            current = stats.chatty_sessions;
            total = 10;
            showProgress = true;
            break;
        case "perfect_streak >= 5":
            current = stats.perfect_streak;
            total = 5;
            showProgress = true;
            break;
        case "perfect_streak >= 10":
            current = stats.perfect_streak;
            total = 10;
            showProgress = true;
            break;
        case "total_messages >= 100":
            current = stats.total_messages;
            total = 100;
            showProgress = true;
            break;
        case "conflicts_resolved >= 50":
            current = stats.conflicts_resolved;
            total = 50;
            showProgress = true;
            break;
        case "daily_sessions >= 5":
            current = stats.daily_sessions;
            total = 5;
            showProgress = true;
            break;
        default:
            showProgress = false;
    }
    
    const percentage = showProgress ? Math.min(100, (current / total) * 100) : 0;
    
    return {
        current,
        total,
        percentage,
        showProgress
    };
}

function renderAchievementsChart() {
    if (!auth.currentUser) return;
    
    const ctx = document.getElementById('achievementsChart');
    if (!ctx) return;
    
    const userAchievements = auth.currentUser.stats.achievementsUnlocked || [];
    
    // Группируем достижения по категориям
    const categories = {};
    achievements.forEach(achievement => {
        if (!categories[achievement.category]) {
            categories[achievement.category] = {
                total: 0,
                unlocked: 0
            };
        }
        categories[achievement.category].total++;
        
        if (userAchievements.includes(achievement.id)) {
            categories[achievement.category].unlocked++;
        }
    });
    
    const categoryNames = Object.keys(categories);
    const unlockedData = categoryNames.map(cat => categories[cat].unlocked);
    const totalData = categoryNames.map(cat => categories[cat].total);
    
    // Удаляем предыдущий chart если он существует
    if (achievementsChart) {
        achievementsChart.destroy();
    }
    
    achievementsChart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: categoryNames,
            datasets: [
                {
                    label: 'Получено',
                    data: unlockedData,
                    backgroundColor: 'rgba(39, 174, 96, 0.7)',
                    borderColor: 'rgba(39, 174, 96, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Всего',
                    data: totalData,
                    backgroundColor: 'rgba(21, 93, 39, 0.3)',
                    borderColor: 'rgba(21, 93, 39, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Количество достижений'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Категории'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Прогресс по категориям достижений'
                }
            }
        }
    });
}

function loadStudentInterface() {
    const sidebar = document.getElementById('sidebar');
    const contentWrapper = document.getElementById('contentWrapper');
    
    if (!sidebar || !contentWrapper) return;
    
    // ДОБАВЛЯЕМ ВКЛАДКУ ДОСТИЖЕНИЙ В САЙДБАР
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
        <a href="javascript:void(0);" onclick="switchTab('profile')" class="nav-item" data-tab="profile">
            <i class="fas fa-user-circle"></i> Профиль
        </a>
        <a href="javascript:void(0);" onclick="switchTab('achievements')" class="nav-item" data-tab="achievements">
        <i class="fas fa-medal"></i> Достижения
        </a>
        <a href="javascript:void(0);" onclick="switchTab('history')" class="nav-item" data-tab="history">
            <i class="fas fa-history"></i> История
        </a>
    `;
    
    // Создаем HTML для вкладки достижений
    const achievementsTabHTML = `
        <div class="tab-content" id="achievements-tab">
            ${loadAchievementsTab()}
        </div>
    `;
    
    // Остальной HTML (как было)
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
                            Этот тренажер выполняет функции клиента, открывая возможность отрабатывать возражения и сложные ситуации. 
                            Искусственный интеллект играет роль клиента с различными типами поведения, как и клиент он не знает внутренних логик и процессы нашей компании.
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
                                <li>Обращайтесь к руководителю при сомнениях</li>
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
                            <button class="btn btn-danger" id="finishTrainingBtn" onclick="finishChat()" style="display: none;">
                                <i class="fas fa-flag-checkered"></i> Завершить диалог
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
                        <div class="chat-controls" id="chatControls" style="display: none; margin-top: 10px; text-align: center;">
                            <button class="btn btn-danger btn-sm" onclick="finishChat()">
                                <i class="fas fa-flag-checkered"></i> Завершить диалог
                            </button>
                            <span style="margin-left: 10px; font-size: 12px; color: #666;">или отправьте [[ДИАЛОГ ЗАВЕРШЕН]]</span>
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

        ${achievementsTabHTML}

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
                            Последние достижения
                        </h3>
                        <div class="recent-achievements" id="recentAchievements">
                            <div class="loading-achievements">Загрузка достижений...</div>
                        </div>
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
    renderRecentAchievements();
    renderHistory();
    renderProfileHistory();
    renderDynamicNews();
    
    // Инициализируем вкладку достижений
    renderAchievementsTabContent();
}

function renderAchievementsTabContent() {
    const tab = document.getElementById('achievements-tab');
    if (!tab) return;
    

    setTimeout(() => {
        try {

            filterAchievements('all');
            renderAchievementsChart();
        } catch (error) {
            console.error('Ошибка инициализации вкладки достижений:', error);
        }
    }, 100);
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
    
    const scenarioSection = document.getElementById('scenarioSection');
    const chatSection = document.getElementById('chatSection');
    
    if (scenarioSection && chatSection) {
        scenarioSection.style.opacity = '0';
        scenarioSection.style.transform = 'translateX(-20px)';
        scenarioSection.style.transition = 'all 0.5s ease';
        
        setTimeout(() => {
            scenarioSection.style.display = 'none';
            
            chatSection.style.gridColumn = '1 / -1';
            chatSection.style.transition = 'all 0.5s ease';
            chatSection.style.width = '100%';
            
            chatSection.classList.add('chat-expanded');
            
            const chatTitle = document.querySelector('.chat-title');
            if (chatTitle) {
                const clientType = clientTypes[selectedClientType];
                chatTitle.textContent = `💬 Диалог с ${isRandomClient ? 'случайным клиентом' : clientType.name.toLowerCase()}`;
            }
            
            const finishBtn = document.getElementById('finishTrainingBtn');
            if (finishBtn) finishBtn.style.display = 'block';
            
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
    lastChatSessionData = null;
    
    const startBtn = document.getElementById('startTrainingBtn');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatStatus = document.getElementById('chatStatus');
    const chatControls = document.getElementById('chatControls');
    
    if (startBtn) startBtn.style.display = 'none';
    if (chatInput) {
        chatInput.disabled = false;
        chatInput.focus();
    }
    if (sendBtn) sendBtn.disabled = false;
    if (chatStatus) {
        chatStatus.textContent = 'Тренировка активна';
        chatStatus.className = 'chat-status training-active';
    }
    if (chatControls) chatControls.style.display = 'block';
    
    const chatMessagesDiv = document.getElementById('chatMessages');
    if (chatMessagesDiv) chatMessagesDiv.innerHTML = '';
    
    await sendPromptToAI();
    
    startTrainingTimer();
    
    setTimeout(() => {
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

function finishChat() {
    if (!trainingInProgress) return;
    
    addMessage('user', "[[ДИАЛОГ ЗАВЕРШЕН]]");
    
    const chatInput = document.getElementById('chatInput');
    if (chatInput) chatInput.disabled = true;
    
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;
    
    const chatControls = document.getElementById('chatControls');
    if (chatControls) chatControls.style.display = 'none';
    
    addMessage('ai', "Подготовка результатов чата...");
    
    setTimeout(() => {
        sendPromptToAI();
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
    
    lastChatSessionData = {
        date: new Date().toISOString(),
        scenario: isRandomClient ? 'Случайный клиент' : clientType.description,
        score: evaluation.score,
        xp: 0,
        icon: clientTypes[selectedClientType]?.icon || "🎯",
        clientType: selectedClientType,
        evaluation: evaluation,
        messages: [...chatMessages],
        duration: duration,
        vertical: auth.currentUser.group,
        prompt_used: currentPrompt,
        ai_feedback: lastAIFeedback,
        trainer_comments: []
    };
    
    awardXP(
        evaluation.score, 
        isRandomClient ? 'Случайный клиент' : clientType.description, 
        selectedClientType, 
        evaluation.feedback,
        duration,
        lastAIFeedback
    ).then(result => {
        lastChatSessionData.xp = result.xp;
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
    const finishBtn = document.getElementById('finishTrainingBtn');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const trainingTimer = document.getElementById('trainingTimer');
    const chatStatus = document.getElementById('chatStatus');
    const chatControls = document.getElementById('chatControls');
    
    if (startBtn) {
        startBtn.style.display = 'flex';
        startBtn.disabled = true;
    }
    if (finishBtn) finishBtn.style.display = 'none';
    if (trainingTimer) trainingTimer.textContent = '';
    if (chatInput) chatInput.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    if (chatStatus) {
        chatStatus.textContent = 'Ожидание начала';
        chatStatus.className = 'chat-status';
    }
    if (chatControls) chatControls.style.display = 'none';
    
    document.querySelectorAll('.client-type-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.style.pointerEvents = 'auto';
    });
    
    const scenarioTitle = document.getElementById('scenarioTitle');
    const scenarioDesc = document.getElementById('scenarioDescription');
    
    if (scenarioTitle) scenarioTitle.textContent = 'Выберите тип клиента';
    if (scenarioDesc) scenarioDesc.textContent = 'Выберите тип клиента из списка выше, чтобы начать тренировку. Тренировка длится до 15 минут.';
    
    const scenarioSection = document.getElementById('scenarioSection');
    const chatSection = document.getElementById('chatSection');
    
    if (scenarioSection && chatSection) {
        chatSection.style.gridColumn = '';
        chatSection.style.width = '';
        chatSection.classList.remove('chat-expanded');
        
        scenarioSection.style.display = 'block';
        setTimeout(() => {
            scenarioSection.style.opacity = '1';
            scenarioSection.style.transform = 'translateX(0)';
        }, 10);
        
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
    
    if (message === '[[ДИАЛОГ ЗАВЕРШЕН]]') {
        finishChat();
        return;
    }
    
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
    renderRecentAchievements();
    
    // Обновляем вкладку достижений, если она активна
    if (document.getElementById('achievements-tab')?.classList.contains('active')) {
        renderAchievementsTabContent();
    }
    
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
                
                lastChatSessionData = {
                    date: new Date().toISOString(),
                    scenario: isRandomClient ? 'Случайный клиент' : clientTypes[selectedClientType]?.description || '',
                    score: foundScore,
                    xp: 0,
                    icon: clientTypes[selectedClientType]?.icon || "🎯",
                    clientType: selectedClientType,
                    evaluation: evaluation,
                    messages: [...chatMessages],
                    duration: duration,
                    vertical: auth.currentUser.group,
                    prompt_used: currentPrompt,
                    ai_feedback: lastAIFeedback,
                    trainer_comments: []
                };
                
                awardXP(foundScore, isRandomClient ? 'Случайный клиент' : clientTypes[selectedClientType]?.description || '', selectedClientType, evaluation.feedback, duration, lastAIFeedback)
                    .then(result => {
                        lastChatSessionData.xp = result.xp;
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

// ОБНОВЛЕННАЯ ФУНКЦИЯ ПРОВЕРКИ ДОСТИЖЕНИЙ
function checkAchievements(score, clientType, duration) {
    if (!auth.currentUser) return;
    
    const newAchievements = [];
    const userStats = auth.currentUser.stats;
    
    // Обновляем статистику для проверки достижений
    const stats = calculateAchievementStats();
    
    // Проверяем каждое достижение
    achievements.forEach(achievement => {
        if (userStats.achievementsUnlocked.includes(achievement.id)) return;
        
        let conditionMet = false;
        
        // Проверяем условие достижения
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
            case "perfect_streak >= 10": conditionMet = stats.perfect_streak >= 10; break;
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
            case "early_session": conditionMet = stats.early_session; break;
            case "late_session": conditionMet = stats.late_session; break;
            case "weekend_session": conditionMet = stats.weekend_session; break;
            case "quick_session": conditionMet = duration < 180 && score >= 4; break;
            case "total_messages >= 100": conditionMet = stats.total_messages >= 100; break;
            case "conflicts_resolved >= 50": conditionMet = stats.conflicts_resolved >= 50; break;
            case "all_types_5": 
                const allTypes5 = Object.keys(clientTypes).every(type => 
                    userStats.clientTypesCompleted?.[type]?.sessions >= 5
                );
                conditionMet = allTypes5;
                break;
            case "first_month_active": 
                const registrationDate = new Date(userStats.registrationDate || new Date());
                const monthAgo = new Date();
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                conditionMet = registrationDate >= monthAgo && stats.sessions >= 10;
                break;
            case "one_year_active": 
                const yearAgo = new Date();
                yearAgo.setFullYear(yearAgo.getFullYear() - 1);
                const regDate = new Date(userStats.registrationDate || new Date());
                conditionMet = regDate <= yearAgo;
                break;
            case "vertical_rank == 1": 
                // Здесь нужно добавить логику для проверки позиции в рейтинге
                conditionMet = false;
                break;
            case "vertical_rank <= 3":
                // Здесь нужно добавить логику для проверки позиции в рейтинге
                conditionMet = false;
                break;
            case "global_rank <= 10":
                // Здесь нужно добавить логику для проверки позиции в рейтинге
                conditionMet = false;
                break;
            case "daily_sessions >= 5": conditionMet = stats.daily_sessions >= 5; break;
        }
        
        if (conditionMet) {
            newAchievements.push(achievement.id);
        }
    });
    
    // Добавляем новые достижения
    newAchievements.forEach(ach => {
        if (!userStats.achievementsUnlocked.includes(ach)) {
            userStats.achievementsUnlocked.push(ach);
            const achievement = achievements.find(a => a.id === ach);
            if (achievement) {
                showAchievementNotification(achievement);
            }
        }
    });
    
    // Сохраняем обновлённую статистику
    if (newAchievements.length > 0) {
        auth.saveUserStats(userStats);
        
        // Обновляем интерфейс достижений, если открыта соответствующая вкладка
        if (document.getElementById('achievements-tab')?.classList.contains('active')) {
            renderAchievementsTabContent();
        }
    }
}

// ФУНКЦИЯ УВЕДОМЛЕНИЯ О ДОСТИЖЕНИИ
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
        border-left: 4px solid var(--secondary-color);
        min-width: 250px;
        max-width: 300px;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span style="font-size: 32px;">${achievement.icon}</span>
            <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--primary-color); font-size: 16px;">🎉 Новое достижение!</div>
                <div style="font-size: 14px; font-weight: 500; color: var(--text-primary);">${achievement.name}</div>
            </div>
        </div>
        <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.4;">${achievement.description}</div>
        <div style="margin-top: 8px; font-size: 12px; color: var(--accent-color); font-weight: 500;">
            <i class="fas fa-trophy"></i> Категория: ${achievement.category}
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Добавляем анимацию
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
    `;
    document.head.appendChild(style);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            notification.remove();
            style.remove();
        }, 300);
    }, 5000);
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

function scrollNews(direction) {
    const container = document.getElementById('newsScrollContainer');
    if (!container) return;
    
    const scrollAmount = 300;
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
        auth.cache.clear();
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
            case 'achievements':
                renderAchievementsTabContent();
                break;
            case 'leaderboard':
                updateLeaderboard('all');
                break;
            case 'profile':
                renderRecentAchievements();
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

    if (!auth.currentUser || !auth.currentUser.id) {
        const rankPosition = document.getElementById('rankPosition');
        if (rankPosition) rankPosition.textContent = '-';
        return;
    }
    
    try {
        const verticalLeaderboard = await auth.getLeaderboard(auth.currentUser.group);
        
        if (!verticalLeaderboard || verticalLeaderboard.length === 0) {
            const rankPosition = document.getElementById('rankPosition');
            if (rankPosition) rankPosition.textContent = '-';
            return;
        }
        
        const verticalRank = verticalLeaderboard.findIndex(p => p.id === auth.currentUser.id) + 1;
        const rankPosition = document.getElementById('rankPosition');
        if (rankPosition) {
            rankPosition.textContent = verticalRank > 0 ? verticalRank : '-';
        }
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
    const username = player.username.toLowerCase();
    if (['test', 'testf', 'testm', 'testo', 'tests', 'testa'].includes(username)) {
        return; 
    }
    
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
            
            let avatarHTML = '';
            if (player.avatar_url && player.avatar_url.startsWith('data:image')) {
                avatarHTML = `<img src="${player.avatar_url}" alt="${player.username}" class="leaderboard-avatar">`;
            } else {
                const defaultColors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe', '#43e97b', '#38f9d7', '#fa709a'];
                const colorIndex = player.username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % defaultColors.length;
                const initials = player.username.substring(0, 2).toUpperCase();
                avatarHTML = `
                    <div class="default-avatar" style="background: ${defaultColors[colorIndex]};">
                        ${initials}
                    </div>
                `;
            }
            
            row.innerHTML = `
                <td class="rank ${rankClass}">
                    ${trophy ? `<span class="trophy">${trophy}</span>` : index + 1}
                </td>
                <td class="player-name">
                    <div class="leaderboard-player">
                        <div class="leaderboard-avatar-container">
                            ${avatarHTML}
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
        history = history.slice(0, 5);
        
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
    const chatControls = document.getElementById('chatControls');
    if (chatControls) chatControls.style.display = 'none';
}

function renderRecentAchievements() {
    const recentAchievements = document.getElementById('recentAchievements');
    if (!recentAchievements) return;
    
    if (!auth.currentUser) {
        recentAchievements.innerHTML = '<div class="no-achievements">Нет данных</div>';
        return;
    }
    
    const userAchievements = auth.currentUser.stats.achievementsUnlocked || [];
    
    if (userAchievements.length === 0) {
        recentAchievements.innerHTML = `
            <div class="no-achievements">
                <div class="no-achievements-icon">🏆</div>
                <div class="no-achievements-text">У вас пока нет достижений</div>
                <div class="no-achievements-subtext">Начните тренировки, чтобы заработать достижения!</div>
            </div>
        `;
        return;
    }
    
    let recentAchievementIds = [...userAchievements].reverse().slice(0, 3);
    
    recentAchievements.innerHTML = '<div class="recent-achievements-grid"></div>';
    const grid = recentAchievements.querySelector('.recent-achievements-grid');
    
    recentAchievementIds.forEach(achievementId => {
        const achievement = achievements.find(a => a.id === achievementId);
        if (achievement) {
            const badge = document.createElement('div');
            badge.className = 'recent-badge';
            badge.innerHTML = `
                <div class="recent-badge-icon">${achievement.icon}</div>
                <div class="recent-badge-info">
                    <div class="recent-badge-name">${achievement.name}</div>
                    <div class="recent-badge-desc">${achievement.description}</div>
                </div>
            `;
            badge.title = achievement.description;
            grid.appendChild(badge);
        }
    });
}

function showResultModal(title, scenario, icon, xpEarned, evaluation, duration, aiFeedback = "") {
    const resultTitle = document.getElementById('resultTitle');
    const resultChatContent = document.getElementById('resultChatContent');
    const resultFeedbackContent = document.getElementById('resultFeedbackContent');
    const resultModal = document.getElementById('resultModal');


    let finalScore = evaluation.score;
    

    if (aiFeedback) {
        const scoreMatch = aiFeedback.match(/(\d+)[\s]*[\/из\s]*5/i);
        if (scoreMatch && scoreMatch[1]) {
            const aiScore = parseInt(scoreMatch[1]);

            if (aiScore >= 1 && aiScore <= 5) {
                finalScore = aiScore;
            }
        }
    }
    
    if (resultTitle) resultTitle.textContent = title;
    
    // Очищаем содержимое
    if (resultChatContent) resultChatContent.innerHTML = '';
    if (resultFeedbackContent) resultFeedbackContent.innerHTML = '';
    
    // Заполняем левую колонку (чат)
    if (resultChatContent && chatMessages && chatMessages.length > 0) {
        let chatHTML = '<div style="padding: 20px;">';
        

        chatHTML += `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <div style="text-align: center; margin-bottom: 10px;">
                    <div style="font-size: 32px; font-weight: bold; color: #155d27;">${finalScore}/5</div>
                    <div style="color: #10a37f; font-weight: 600; font-size: 18px;">+${xpEarned} XP</div>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ddd;">
                    <span>Сценарий:</span>
                    <span><strong>${scenario}</strong></span>
                </div>
<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ddd;">
    <span>Тип клиента:</span>
    <span>
        ${lastChatSessionData && lastChatSessionData.clientType ? 
            (lastChatSessionData.scenario && lastChatSessionData.scenario.includes('Случайный') ? 
                'Случайный (' + (clientTypes[lastChatSessionData.clientType]?.name || lastChatSessionData.clientType) + ')' : 
                (clientTypes[lastChatSessionData.clientType]?.name || lastChatSessionData.clientType)) 
            : 'Не указан'}
    </span>
</div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ddd;">
                    <span>Вертикаль:</span>
                    <span>${auth.currentUser?.group || ''}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                    <span>Время:</span>
                    <span>${formatDuration(duration)}</span>
                </div>
            </div>
            <div style="font-weight: 600; margin: 20px 0 10px 0; color: #333;">
                <i class="fas fa-comments"></i> История диалога:
            </div>
        `;
        
        // Сообщения чата
        chatMessages.forEach(msg => {
            const isAI = msg.sender === 'ai';
            chatHTML += `
                <div style="margin-bottom: 15px;">
                    <div style="font-size: 12px; font-weight: 600; margin-bottom: 4px; color: ${isAI ? '#155d27' : '#1e88e5'};">
                        ${isAI ? 'Клиент (AI)' : 'Вы (Оператор)'}
                    </div>
                    <div style="padding: 10px; border-radius: 8px; background: ${isAI ? '#e8f5e9' : '#e3f2fd'}; border-left: 3px solid ${isAI ? '#4caf50' : '#2196f3'};">
                        ${msg.text}
                    </div>
                </div>
            `;
        });
        
        chatHTML += '</div>';
        resultChatContent.innerHTML = chatHTML;
    }
    
    // Заполняем правую колонку (обратная связь)
    if (resultFeedbackContent) {
        let feedbackHTML = '<div style="padding: 20px;">';
        
        // Обратная связь от AI
        if (aiFeedback && aiFeedback.trim().length > 0) {
            feedbackHTML += `
                <div style="margin-bottom: 20px;">
                    <div style="font-weight: 600; margin-bottom: 10px; color: #155d27;">
                        <i class="fas fa-robot"></i> Обратная связь от DeepSeek AI
                    </div>
                    <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #ddd; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
                        ${aiFeedback}
                    </div>
                </div>
            `;
        }
        
        
        feedbackHTML += `
            <div style="margin-top: 20px;">
                <button class="btn btn-primary" onclick="downloadChatAsPDF()" style="width: 100%; padding: 12px;">
                    <i class="fas fa-download"></i> Скачать диалог в PDF
                </button>
            </div>
        `;
        
        feedbackHTML += '</div>';
        resultFeedbackContent.innerHTML = feedbackHTML;
    }
    
    if (resultModal) resultModal.style.display = 'flex';
}

function downloadChatAsPDF() {
    if (!chatMessages || chatMessages.length === 0) {
        alert('Нет данных диалога для скачивания');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    const html = `
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .title { color: #155d27; font-size: 24px; }
                .subtitle { color: #666; font-size: 14px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
                td { padding: 8px 12px; border: 1px solid #ddd; }
                .chat-title { background: #155d27; color: white; padding: 10px; margin-bottom: 15px; }
                .message { margin-bottom: 15px; }
                .ai-message { background: #f0f9f0; padding: 10px; border-left: 4px solid #4caf50; }
                .user-message { background: #f0f8ff; padding: 10px; border-left: 4px solid #2196f3; text-align: right; }
                .sender { font-weight: bold; margin-bottom: 5px; }
                .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">Отчет по тренировочному диалогу</div>
                <div class="subtitle">Диалоговый тренажер AI | ${new Date().toLocaleDateString('ru-RU')}</div>
            </div>
            
            <table>
                <tr><td><strong>Сотрудник:</strong></td><td>${auth.currentUser?.username || ''}</td></tr>
                <tr><td><strong>Вертикаль:</strong></td><td>${auth.currentUser?.group || ''}</td></tr>
                <tr><td><strong>Тип клиента:</strong></td><td>${
    lastChatSessionData && lastChatSessionData.clientType ? 
        (lastChatSessionData.scenario && lastChatSessionData.scenario.includes('Случайный') ? 
            'Случайный (' + (clientTypes[lastChatSessionData.clientType]?.name || lastChatSessionData.clientType) + ')' : 
            (clientTypes[lastChatSessionData.clientType]?.name || lastChatSessionData.clientType)) 
        : 'Не указан'
}</td></tr>
                <tr><td><strong>Оценка:</strong></td><td>${lastChatSessionData?.score || '0'}/5</td></tr>
                <tr><td><strong>Дата:</strong></td><td>${formatDate(lastChatSessionData?.date || '')}</td></tr>
            </table>
            
            <div class="chat-title">Полный диалог</div>
            ${chatMessages.map(msg => `
                <div class="message ${msg.sender === 'ai' ? 'ai-message' : 'user-message'}">
                    <div class="sender">${msg.sender === 'ai' ? 'Клиент' : 'Оператор'}</div>
                    <div>${msg.text}</div>
                </div>
            `).join('')}
            
            ${lastAIFeedback ? `
            <div style="margin-top: 30px; padding: 15px; background: #f8f9fa;">
                <strong>Обратная связь от AI:</strong><br>
                ${lastAIFeedback}
            </div>
            ` : ''}
            
            <div class="footer">
                © ${new Date().getFullYear()} Dialog.AI Trainer | Magnit-OMNI
            </div>
        </body>
        </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    
    setTimeout(() => {
        printWindow.print();
    }, 500);
}

function viewLastChatSession() {
    if (lastChatSessionData) {
        viewChatHistory(lastChatSessionData);
        closeResultModal();
    } else {
        alert('Нет данных о последнем чате');
    }
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

function closeResultModal() {
    const resultModal = document.getElementById('resultModal');
    const aiFeedbackContainer = document.getElementById('aiFeedbackContainer');
    
    if (resultModal) resultModal.style.display = 'none';
    if (aiFeedbackContainer) aiFeedbackContainer.style.display = 'none';
    
    loadDemoChat();
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

function openAvatarModal() {
    const modal = document.getElementById('avatarModal');
    const avatarPreview = document.getElementById('avatarPreview');
    
    if (auth.currentUser.avatar_url && auth.currentUser.avatar_url.startsWith('data:image')) {
        avatarPreview.innerHTML = `<img src="${auth.currentUser.avatar_url}" alt="Текущий аватар">`;
    } else {
        avatarPreview.innerHTML = '<i class="fas fa-user"></i>';
    }
    
    modal.style.display = 'flex';
}

function closeAvatarModal() {
    const modal = document.getElementById('avatarModal');
    modal.style.display = 'none';
}

async function saveAvatar() {
    const avatarPreview = document.getElementById('avatarPreview');
    const currentImg = avatarPreview.querySelector('img');
    
    if (!currentImg || !currentImg.src.startsWith('data:image')) {
        alert('Сначала загрузите изображение с компьютера');
        return;
    }
    
    try {
        const success = await auth.updateAvatar(auth.currentUser.id, currentImg.src);
        
        if (success) {
            alert('Аватар успешно обновлен!');
            
            const profileAvatar = document.getElementById('profileAvatar');
            if (profileAvatar) {
                profileAvatar.innerHTML = `<img src="${currentImg.src}" alt="${auth.currentUser.username}">`;
            }
            
            const headerAvatar = document.getElementById('headerUserAvatar');
            if (headerAvatar) {
                headerAvatar.innerHTML = `<img src="${currentImg.src}" alt="${auth.currentUser.username}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
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

function openFileUpload() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.onchange = handleAvatarUpload;
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите файл изображения (JPG, PNG, GIF)');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        alert('Размер файла не должен превышать 5 МБ');
        return;
    }
    
    const avatarPreview = document.getElementById('avatarPreview');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        avatarPreview.innerHTML = `<img src="${e.target.result}" alt="Превью аватара">`;
    };
    reader.onerror = () => {
        alert('Ошибка чтения файла');
    };
    reader.readAsDataURL(file);
}

function closeChatModal() {
    const chatModal = document.getElementById('chatModal');
    if (chatModal) chatModal.style.display = 'none';
}

// Тренерские функции (упрощённые для краткости)
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
                        Загрузка данных об участниках...
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
                </div>
                
                <div id="trainerSessionsContent">
                    <p style="color: #666; margin-bottom: 15px; font-size: 14px;">
                        Загрузка всех тренировок...
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
    
    dashboardContent.innerHTML = '<p style="color: #666; margin-bottom: 15px; font-size: 14px;">Загрузка данных...</p>';
    
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
            allSessions.slice(0, 10).forEach(session => {
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
            students.forEach(student => {
                html += `
                    <div class="student-item">
                        <div class="student-info">
                            <div class="student-name">${student.username}</div>
                            <div class="student-group">${student.group_name || 'Без вертикали'}</div>
                        </div>
                        <div class="student-stats">
                            <div class="stat-badge">Уровень: ${student.stats?.currentLevel || 1}</div>
                        </div>
                    </div>
                `;
            });
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

async function loadAllSessions() {
    const sessionsContent = document.getElementById('trainerSessionsContent');
    if (!sessionsContent) return;
    
    sessionsContent.innerHTML = '<p style="color: #666; margin-bottom: 15px; font-size: 14px;">Загрузка всех тренировок...</p>';
    
    try {
        const students = await auth.getStudents();
        let allSessions = await auth.getAllTrainingSessions({ vertical: 'all' });
        
        let html = `
            <div class="stats-cards">
                <div class="stat-card">
                    <div class="value">${allSessions?.length || 0}</div>
                    <div class="label">Всего тренировок</div>
                </div>
            </div>
            
            <div class="section-title" style="margin-top: 25px;">
                <i class="fas fa-history"></i>
                <span>Последние тренировки</span>
            </div>
            
            <div class="scrollable-container" style="max-height: 600px; overflow-y: auto;">
        `;
        
        if (allSessions?.length) {
            allSessions.slice(0, 20).forEach(session => {
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
                    </div>
                `;
            });
        } else {
            html += '<div style="text-align: center; padding: 20px; color: #666;">Нет данных о тренировках</div>';
        }
        
        html += `</div>`;
        
        sessionsContent.innerHTML = html;
        
    } catch (error) {
        console.error('Ошибка загрузки тренировок:', error);
        sessionsContent.innerHTML = '<p style="color: #dc3545;">Ошибка загрузки данных</p>';
    }
}
