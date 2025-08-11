import { AuthService, initializeAdmin } from '../services/auth.js';
import { ArticleService, ProjectService } from '../services/articles.js';
import { ChatService } from '../services/chat.js';
import { SecurityUtils, SessionManager } from '../utils/security.js';

class DeepBugApp {
    constructor() {
        this.currentSection = 'home';
        this.currentUser = null;
        this.currentAdmin = null;
        this.chatUnsubscribe = null;
        this.chatStatusUnsubscribe = null;
        this.isInitialized = false;
        
        this.init();
    }

    async init() {
        try {
            // Show loading screen
            this.showLoading();

            // Initialize Firebase admin
            await initializeAdmin();

            // Check authentication status
            this.checkAuthStatus();

            // Initialize UI
            this.initializeUI();
            this.initializeEventListeners();
            this.initializeTheme();

            // Load initial content
            await this.loadInitialContent();

            // Initialize routing
            this.initializeRouting();

            this.isInitialized = true;
        } catch (error) {
            console.error('App initialization error:', error);
            this.showNotification('خطأ في تحميل التطبيق', 'error');
        } finally {
            // Hide loading screen
            this.hideLoading();
        }
    }

    showLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.display = 'flex';
        }
    }

    hideLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            setTimeout(() => {
                loadingScreen.style.opacity = '0';
                setTimeout(() => {
                    loadingScreen.style.display = 'none';
                }, 500);
            }, 1000);
        }
    }

    checkAuthStatus() {
        // Check user authentication
        this.currentUser = AuthService.getCurrentUser();
        this.currentAdmin = AuthService.getCurrentAdmin();

        this.updateAuthUI();
    }

    updateAuthUI() {
        const guestControls = document.getElementById('guest-controls');
        const userControls = document.getElementById('user-controls');
        const chatLink = document.getElementById('chat-link');

        if (this.currentUser) {
            guestControls?.classList.add('hidden');
            userControls?.classList.remove('hidden');
            
            // Update user display
            const userNameDisplay = document.getElementById('user-name-display');
            const userAvatarImg = document.getElementById('user-avatar-img');
            
            if (userNameDisplay) userNameDisplay.textContent = this.currentUser.name;
            if (userAvatarImg) {
                userAvatarImg.src = this.currentUser.avatar || '/default-avatar.png';
                userAvatarImg.alt = this.currentUser.name;
            }

            // Enable chat access
            chatLink?.classList.remove('disabled');
        } else {
            guestControls?.classList.remove('hidden');
            userControls?.classList.add('hidden');
            
            // Disable chat access for guests
            chatLink?.classList.add('disabled');
        }
    }

    initializeUI() {
        // Initialize modals
        this.initializeModals();
        
        // Initialize navigation
        this.initializeNavigation();
        
        // Initialize forms
        this.initializeForms();
    }

    initializeEventListeners() {
        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        themeToggle?.addEventListener('click', () => this.toggleTheme());

        // Auth buttons
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const logoutBtn = document.getElementById('logout-btn');

        loginBtn?.addEventListener('click', () => this.showAuthModal('login'));
        registerBtn?.addEventListener('click', () => this.showAuthModal('register'));
        logoutBtn?.addEventListener('click', () => this.logout());

        // Mobile menu toggle
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        mobileMenuToggle?.addEventListener('click', () => this.toggleMobileMenu());

        // Category filters
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.filterArticles(e.target.dataset.category));
        });

        // Load more articles
        const loadMoreBtn = document.getElementById('load-more-articles');
        loadMoreBtn?.addEventListener('click', () => this.loadMoreArticles());

        // Chat functionality
        this.initializeChatEvents();

        // Window events
        window.addEventListener('scroll', () => this.handleScroll());
        window.addEventListener('resize', () => this.handleResize());
    }

    initializeModals() {
        // Auth modal
        const authModal = document.getElementById('auth-modal');
        const authModalClose = document.getElementById('auth-modal-close');
        const authToggleBtn = document.getElementById('auth-toggle-btn');

        authModalClose?.addEventListener('click', () => this.hideModal('auth-modal'));
        authToggleBtn?.addEventListener('click', () => this.toggleAuthMode());

        // Article modal
        const articleModalClose = document.getElementById('article-modal-close');
        articleModalClose?.addEventListener('click', () => this.hideModal('article-modal'));

        // Close modals on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideModal(e.target.id);
            }
        });
    }

    initializeNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                if (section) {
                    this.navigateToSection(section);
                }
            });
        });

        // Hero action buttons
        const heroActions = document.querySelectorAll('.hero-actions .btn');
        heroActions.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const section = e.target.dataset.section;
                if (section) {
                    this.navigateToSection(section);
                }
            });
        });
    }

    initializeForms() {
        // Login form
        const loginForm = document.getElementById('login-form');
        loginForm?.addEventListener('submit', (e) => this.handleLogin(e));

        // Register form
        const registerForm = document.getElementById('register-form');
        registerForm?.addEventListener('submit', (e) => this.handleRegister(e));

        // Google login
        const googleLoginBtn = document.getElementById('google-login-btn');
        googleLoginBtn?.addEventListener('click', () => this.handleGoogleLogin());
    }

    initializeChatEvents() {
        const sendMessageBtn = document.getElementById('send-message-btn');
        const chatInput = document.getElementById('chat-input');
        const chatLoginBtn = document.getElementById('chat-login-btn');

        sendMessageBtn?.addEventListener('click', () => this.sendChatMessage());
        chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
        chatLoginBtn?.addEventListener('click', () => this.showAuthModal('login'));

        // Initialize chat listeners
        this.initializeChatListeners();
    }

    initializeChatListeners() {
        if (this.chatUnsubscribe) {
            this.chatUnsubscribe();
        }
        if (this.chatStatusUnsubscribe) {
            this.chatStatusUnsubscribe();
        }

        // Listen to chat status
        this.chatStatusUnsubscribe = ChatService.listenToChatStatus((isOpen) => {
            this.updateChatStatus(isOpen);
        });

        // Listen to messages if user is authenticated
        if (this.currentUser) {
            this.chatUnsubscribe = ChatService.listenToMessages((messages) => {
                this.updateChatMessages(messages);
            });
        }
    }

    initializeTheme() {
        const savedTheme = localStorage.getItem('deepbug-theme') || 'light';
        this.setTheme(savedTheme);
    }

    initializeRouting() {
        // Handle initial route
        const hash = window.location.hash.slice(1) || 'home';
        this.navigateToSection(hash);

        // Handle route changes
        window.addEventListener('hashchange', () => {
            const section = window.location.hash.slice(1) || 'home';
            this.navigateToSection(section);
        });
    }

    async loadInitialContent() {
        try {
            // Load featured articles
            await this.loadFeaturedArticles();
            
            // Load featured projects
            await this.loadFeaturedProjects();
            
            // Load all articles
            await this.loadArticles();
            
            // Load all projects
            await this.loadProjects();
        } catch (error) {
            console.error('Error loading initial content:', error);
        }
    }

    async loadFeaturedArticles() {
        try {
            const articles = await ArticleService.getFeaturedArticles(6);
            const container = document.getElementById('featured-articles');
            
            if (container) {
                container.innerHTML = articles.map(article => this.createArticleCard(article)).join('');
            }
        } catch (error) {
            console.error('Error loading featured articles:', error);
        }
    }

    async loadFeaturedProjects() {
        try {
            const projects = await ProjectService.getFeaturedProjects(6);
            const container = document.getElementById('featured-projects');
            
            if (container) {
                container.innerHTML = projects.map(project => this.createProjectCard(project)).join('');
            }
        } catch (error) {
            console.error('Error loading featured projects:', error);
        }
    }

    async loadArticles(category = 'all', append = false) {
        try {
            let articles;
            if (category === 'all') {
                articles = await ArticleService.getPublishedArticles(20);
            } else {
                articles = await ArticleService.getArticlesByCategory(category, 20);
            }

            const container = document.getElementById('articles-grid');
            if (container) {
                const articlesHTML = articles.map(article => this.createArticleCard(article)).join('');
                
                if (append) {
                    container.innerHTML += articlesHTML;
                } else {
                    container.innerHTML = articlesHTML;
                }
            }
        } catch (error) {
            console.error('Error loading articles:', error);
        }
    }

    async loadProjects() {
        try {
            const projects = await ProjectService.getProjects(20);
            const container = document.getElementById('projects-grid');
            
            if (container) {
                container.innerHTML = projects.map(project => this.createProjectCard(project)).join('');
            }
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    }

    createArticleCard(article) {
        const date = article.publishedAt ? new Date(article.publishedAt.seconds * 1000).toLocaleDateString('ar-SA') : '';
        const imageUrl = article.cardImage || '/default-article.jpg';
        
        return `
            <div class="article-card" onclick="app.openArticle('${article.id}')">
                <img src="${imageUrl}" alt="${SecurityUtils.escapeHTML(article.title)}" class="article-card-image" loading="lazy">
                <div class="article-card-content">
                    <span class="article-card-category">${this.getCategoryName(article.category)}</span>
                    <h3 class="article-card-title">${SecurityUtils.escapeHTML(article.title)}</h3>
                    <p class="article-card-description">${SecurityUtils.escapeHTML(article.description)}</p>
                    <div class="article-card-meta">
                        <span class="article-date">${date}</span>
                        <div class="article-stats">
                            <span class="stat-item">
                                <span>👁</span>
                                <span>${article.views || 0}</span>
                            </span>
                            <span class="stat-item">
                                <span>❤️</span>
                                <span>${article.likes || 0}</span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    createProjectCard(project) {
        const imageUrl = project.image || '/default-project.jpg';
        const technologies = project.technologies || [];
        
        return `
            <div class="project-card">
                <img src="${imageUrl}" alt="${SecurityUtils.escapeHTML(project.name)}" class="project-card-image" loading="lazy">
                <div class="project-card-content">
                    <h3 class="project-card-title">${SecurityUtils.escapeHTML(project.name)}</h3>
                    <p class="project-card-description">${SecurityUtils.escapeHTML(project.description)}</p>
                    <div class="project-technologies">
                        ${technologies.map(tech => `<span class="tech-tag">${SecurityUtils.escapeHTML(tech)}</span>`).join('')}
                    </div>
                    <a href="${project.link}" target="_blank" rel="noopener" class="project-link">
                        عرض المشروع
                        <span>↗</span>
                    </a>
                </div>
            </div>
        `;
    }

    getCategoryName(category) {
        const categories = {
            'programming': 'البرمجة',
            'cybersecurity': 'الأمن السيبراني',
            'news': 'الأخبار',
            'projects': 'المشاريع'
        };
        return categories[category] || category;
    }

    async openArticle(articleId) {
        try {
            const article = await ArticleService.getArticle(articleId);
            if (!article) {
                this.showNotification('المقال غير موجود', 'error');
                return;
            }

            // Increment views
            await ArticleService.incrementViews(articleId);

            // Show article in modal
            const modal = document.getElementById('article-modal');
            const title = document.getElementById('article-modal-title');
            const content = document.getElementById('article-modal-content');

            if (title) title.textContent = article.title;
            if (content) {
                content.innerHTML = `
                    <div class="article-meta">
                        <span class="article-category">${this.getCategoryName(article.category)}</span>
                        <span class="article-date">${new Date(article.publishedAt.seconds * 1000).toLocaleDateString('ar-SA')}</span>
                    </div>
                    ${article.cardImage ? `<img src="${article.cardImage}" alt="${article.title}" class="article-image">` : ''}
                    <div class="article-description">${article.description}</div>
                    <div class="article-content">${article.content}</div>
                `;
            }

            this.showModal('article-modal');
        } catch (error) {
            console.error('Error opening article:', error);
            this.showNotification('خطأ في تحميل المقال', 'error');
        }
    }

    navigateToSection(section) {
        if (section === 'chat' && !this.currentUser) {
            this.showNotification('يجب تسجيل الدخول للوصول إلى الدردشة', 'warning');
            return;
        }

        // Update URL
        window.location.hash = section;

        // Update navigation
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.classList.toggle('active', link.dataset.section === section);
        });

        // Show section
        const sections = document.querySelectorAll('.section');
        sections.forEach(sec => {
            sec.classList.toggle('active', sec.id === section);
        });

        this.currentSection = section;

        // Initialize section-specific functionality
        if (section === 'chat') {
            this.initializeChat();
        }
    }

    async initializeChat() {
        const chatContent = document.getElementById('chat-content');
        const chatClosed = document.getElementById('chat-closed');
        const chatOpen = document.getElementById('chat-open');
        const chatAuthRequired = document.getElementById('chat-auth-required');

        if (!this.currentUser) {
            chatClosed?.classList.add('hidden');
            chatOpen?.classList.add('hidden');
            chatAuthRequired?.classList.remove('hidden');
            return;
        }

        chatAuthRequired?.classList.add('hidden');

        // Check chat status
        const isOpen = await ChatService.isChatOpen();
        this.updateChatStatus(isOpen);

        if (isOpen) {
            // Load messages
            const messages = await ChatService.getMessages(50);
            this.updateChatMessages(messages);
        }
    }

    updateChatStatus(isOpen) {
        const chatStatus = document.getElementById('chat-status');
        const statusIndicator = chatStatus?.querySelector('.status-indicator');
        const statusText = chatStatus?.querySelector('.status-text');
        const chatClosed = document.getElementById('chat-closed');
        const chatOpen = document.getElementById('chat-open');

        if (statusIndicator) {
            statusIndicator.classList.toggle('online', isOpen);
        }
        if (statusText) {
            statusText.textContent = isOpen ? 'مفتوحة' : 'مغلقة';
        }

        if (this.currentUser) {
            chatClosed?.classList.toggle('hidden', isOpen);
            chatOpen?.classList.toggle('hidden', !isOpen);
        }
    }

    updateChatMessages(messages) {
        const messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = messages.map(message => {
            const time = new Date(message.timestamp.seconds * 1000).toLocaleTimeString('ar-SA', {
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="chat-message ${message.isAdmin ? 'admin' : ''}">
                    <div class="message-header">
                        <div class="message-user">
                            ${message.userAvatar ? `<img src="${message.userAvatar}" alt="${message.userName}">` : ''}
                            <span>${SecurityUtils.escapeHTML(message.userName)}</span>
                            ${message.isAdmin ? '<span class="admin-badge">مدير</span>' : ''}
                        </div>
                        <span class="message-time">${time}</span>
                    </div>
                    <div class="message-content ${message.isDeleted ? 'message-deleted' : ''}">
                        ${message.isDeleted ? 'تم حذف هذه الرسالة' : SecurityUtils.escapeHTML(message.message)}
                    </div>
                </div>
            `;
        }).join('');

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async sendChatMessage() {
        if (!this.currentUser) return;

        const chatInput = document.getElementById('chat-input');
        const message = chatInput?.value.trim();

        if (!message) return;

        try {
            const result = await ChatService.sendMessage(
                this.currentUser.id,
                this.currentUser.name,
                message,
                this.currentUser.avatar,
                this.currentAdmin !== null
            );

            if (result.success) {
                chatInput.value = '';
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.showNotification('خطأ في إرسال الرسالة', 'error');
        }
    }

    filterArticles(category) {
        // Update filter buttons
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });

        // Load articles for category
        this.loadArticles(category);
    }

    async loadMoreArticles() {
        // Implementation for loading more articles
        // This would typically involve pagination
        this.showNotification('تم تحميل جميع المقالات', 'info');
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('deepbug-theme', theme);
        
        const themeIcon = document.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.textContent = theme === 'light' ? '🌙' : '☀️';
        }
    }

    toggleMobileMenu() {
        const navMenu = document.getElementById('nav-menu');
        navMenu?.classList.toggle('mobile-open');
    }

    showAuthModal(mode) {
        const modal = document.getElementById('auth-modal');
        const title = document.getElementById('auth-modal-title');
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const toggleText = document.getElementById('auth-toggle-text');
        const toggleBtn = document.getElementById('auth-toggle-btn');

        if (mode === 'login') {
            title.textContent = 'تسجيل الدخول';
            loginForm?.classList.remove('hidden');
            registerForm?.classList.add('hidden');
            toggleText.textContent = 'ليس لديك حساب؟';
            toggleBtn.textContent = 'إنشاء حساب جديد';
        } else {
            title.textContent = 'إنشاء حساب جديد';
            loginForm?.classList.add('hidden');
            registerForm?.classList.remove('hidden');
            toggleText.textContent = 'لديك حساب بالفعل؟';
            toggleBtn.textContent = 'تسجيل الدخول';
        }

        this.showModal('auth-modal');
    }

    toggleAuthMode() {
        const loginForm = document.getElementById('login-form');
        const isLoginVisible = !loginForm?.classList.contains('hidden');
        
        this.showAuthModal(isLoginVisible ? 'register' : 'login');
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('login-email')?.value;
        const password = document.getElementById('login-password')?.value;

        if (!email || !password) {
            this.showNotification('يرجى ملء جميع الحقول', 'warning');
            return;
        }

        try {
            const result = await AuthService.loginUser(email, password);
            
            if (result.success) {
                this.currentUser = result.user;
                this.updateAuthUI();
                this.hideModal('auth-modal');
                this.showNotification(result.message, 'success');
                this.initializeChatListeners();
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('خطأ في تسجيل الدخول', 'error');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        
        const name = document.getElementById('register-name')?.value;
        const email = document.getElementById('register-email')?.value;
        const password = document.getElementById('register-password')?.value;

        if (!name || !email || !password) {
            this.showNotification('يرجى ملء جميع الحقول', 'warning');
            return;
        }

        try {
            const result = await AuthService.registerUser(name, email, password);
            
            if (result.success) {
                this.currentUser = result.user;
                this.updateAuthUI();
                this.hideModal('auth-modal');
                this.showNotification(result.message, 'success');
                this.initializeChatListeners();
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Register error:', error);
            this.showNotification('خطأ في إنشاء الحساب', 'error');
        }
    }

    async handleGoogleLogin() {
        try {
            const result = await AuthService.loginWithGoogle();
            
            if (result.success) {
                this.currentUser = result.user;
                this.updateAuthUI();
                this.hideModal('auth-modal');
                this.showNotification(result.message, 'success');
                this.initializeChatListeners();
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Google login error:', error);
            this.showNotification('خطأ في تسجيل الدخول عبر جوجل', 'error');
        }
    }

    async logout() {
        try {
            await AuthService.logout();
            this.currentUser = null;
            this.currentAdmin = null;
            this.updateAuthUI();
            this.showNotification('تم تسجيل الخروج بنجاح', 'success');
            
            // Clean up chat listeners
            if (this.chatUnsubscribe) {
                this.chatUnsubscribe();
                this.chatUnsubscribe = null;
            }
            
            // Navigate to home if on restricted section
            if (this.currentSection === 'chat') {
                this.navigateToSection('home');
            }
        } catch (error) {
            console.error('Logout error:', error);
            this.showNotification('خطأ في تسجيل الخروج', 'error');
        }
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        modal?.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        modal?.classList.remove('active');
        document.body.style.overflow = '';
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        if (!container) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${icons[type] || icons.info}</span>
                <span class="notification-message">${SecurityUtils.escapeHTML(message)}</span>
            </div>
            <button class="notification-close">&times;</button>
        `;

        // Add close functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn?.addEventListener('click', () => {
            notification.remove();
        });

        container.appendChild(notification);

        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);

        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }

    handleScroll() {
        const header = document.getElementById('header');
        if (window.scrollY > 100) {
            header?.classList.add('scrolled');
        } else {
            header?.classList.remove('scrolled');
        }
    }

    handleResize() {
        // Handle responsive adjustments
        if (window.innerWidth > 768) {
            const navMenu = document.getElementById('nav-menu');
            navMenu?.classList.remove('mobile-open');
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DeepBugApp();
});

// Handle admin route
if (window.location.pathname === '/admin_deep_bug_admin') {
    import('./admin.js').then(module => {
        new module.AdminPanel();
    });
}

export default DeepBugApp;
