import DOMPurify from 'dompurify';
import validator from 'validator';

// Security configuration
export const SECURITY_CONFIG = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  MAX_NAME_LENGTH: 50,
  MAX_EMAIL_LENGTH: 100,
  MAX_MESSAGE_LENGTH: 1000,
  MIN_PASSWORD_LENGTH: 8,
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
};

// Rate limiting storage
const loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>();

export class SecurityUtils {
  // XSS Protection
  static sanitizeHTML(input: string): string {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel']
    });
  }

  // Input validation
  static validateEmail(email: string): boolean {
    if (!email || email.length > SECURITY_CONFIG.MAX_EMAIL_LENGTH) {
      return false;
    }
    return validator.isEmail(email);
  }

  static validateName(name: string): boolean {
    if (!name || name.length > SECURITY_CONFIG.MAX_NAME_LENGTH || name.length < 2) {
      return false;
    }
    // Allow only letters, numbers, spaces, and basic punctuation
    const nameRegex = /^[a-zA-Z0-9\u0600-\u06FF\s\-_.]+$/;
    return nameRegex.test(name);
  }

  static validatePassword(password: string): boolean {
    if (!password || password.length < SECURITY_CONFIG.MIN_PASSWORD_LENGTH) {
      return false;
    }
    // Require at least one letter and one number
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
    return passwordRegex.test(password);
  }

  static validateMessage(message: string): boolean {
    if (!message || message.length > SECURITY_CONFIG.MAX_MESSAGE_LENGTH) {
      return false;
    }
    return true;
  }

  // Rate limiting for login attempts
  static checkRateLimit(identifier: string): { allowed: boolean; remainingTime?: number } {
    const now = Date.now();
    const attempts = loginAttempts.get(identifier);

    if (!attempts) {
      loginAttempts.set(identifier, { count: 1, lastAttempt: now });
      return { allowed: true };
    }

    // Check if user is currently locked out
    if (attempts.lockedUntil && now < attempts.lockedUntil) {
      return { 
        allowed: false, 
        remainingTime: Math.ceil((attempts.lockedUntil - now) / 1000) 
      };
    }

    // Reset attempts if lockout period has passed
    if (attempts.lockedUntil && now >= attempts.lockedUntil) {
      loginAttempts.set(identifier, { count: 1, lastAttempt: now });
      return { allowed: true };
    }

    // Check if max attempts reached
    if (attempts.count >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = now + SECURITY_CONFIG.LOCKOUT_DURATION;
      loginAttempts.set(identifier, { 
        ...attempts, 
        lockedUntil 
      });
      return { 
        allowed: false, 
        remainingTime: Math.ceil(SECURITY_CONFIG.LOCKOUT_DURATION / 1000) 
      };
    }

    // Increment attempts
    loginAttempts.set(identifier, { 
      count: attempts.count + 1, 
      lastAttempt: now 
    });

    return { allowed: true };
  }

  static resetRateLimit(identifier: string): void {
    loginAttempts.delete(identifier);
  }

  // Generate secure random strings
  static generateSecureId(): string {
    return crypto.randomUUID();
  }

  // URL validation
  static validateURL(url: string): boolean {
    try {
      new URL(url);
      return validator.isURL(url, {
        protocols: ['http', 'https'],
        require_protocol: true
      });
    } catch {
      return false;
    }
  }

  // Escape HTML for display
  static escapeHTML(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // IDOR Protection - Generate and validate access tokens
  static generateAccessToken(userId: string, resource: string): string {
    const timestamp = Date.now();
    const data = `${userId}:${resource}:${timestamp}`;
    return btoa(data);
  }

  static validateAccessToken(token: string, userId: string, resource: string): boolean {
    try {
      const decoded = atob(token);
      const [tokenUserId, tokenResource, timestamp] = decoded.split(':');
      
      if (tokenUserId !== userId || tokenResource !== resource) {
        return false;
      }

      // Check if token is not expired (24 hours)
      const tokenAge = Date.now() - parseInt(timestamp);
      return tokenAge < SECURITY_CONFIG.SESSION_TIMEOUT;
    } catch {
      return false;
    }
  }

  // Content Security Policy headers (for server-side implementation)
  static getCSPHeaders(): string {
    return `
      default-src 'self';
      script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com;
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src 'self' https://fonts.gstatic.com;
      img-src 'self' data: https: http:;
      connect-src 'self' https://identitytoolkit.googleapis.com https://firestore.googleapis.com;
      frame-src https://deep-bug-4bb1d.firebaseapp.com;
    `.replace(/\s+/g, ' ').trim();
  }
}

// Session management
export class SessionManager {
  private static readonly SESSION_KEY = 'deepbug_session';
  private static readonly ADMIN_SESSION_KEY = 'deepbug_admin_session';

  static setUserSession(userId: string, userData: any): void {
    const session = {
      userId,
      userData,
      timestamp: Date.now(),
      expires: Date.now() + SECURITY_CONFIG.SESSION_TIMEOUT
    };
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
  }

  static setAdminSession(adminId: string, adminData: any): void {
    const session = {
      adminId,
      adminData,
      timestamp: Date.now(),
      expires: Date.now() + SECURITY_CONFIG.SESSION_TIMEOUT
    };
    localStorage.setItem(this.ADMIN_SESSION_KEY, JSON.stringify(session));
  }

  static getUserSession(): any {
    try {
      const session = localStorage.getItem(this.SESSION_KEY);
      if (!session) return null;

      const parsed = JSON.parse(session);
      if (Date.now() > parsed.expires) {
        this.clearUserSession();
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  static getAdminSession(): any {
    try {
      const session = localStorage.getItem(this.ADMIN_SESSION_KEY);
      if (!session) return null;

      const parsed = JSON.parse(session);
      if (Date.now() > parsed.expires) {
        this.clearAdminSession();
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  static clearUserSession(): void {
    localStorage.removeItem(this.SESSION_KEY);
  }

  static clearAdminSession(): void {
    localStorage.removeItem(this.ADMIN_SESSION_KEY);
  }

  static isValidSession(): boolean {
    return this.getUserSession() !== null;
  }

  static isValidAdminSession(): boolean {
    return this.getAdminSession() !== null;
  }
}
