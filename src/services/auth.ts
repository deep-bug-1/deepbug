import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { SecurityUtils, SessionManager, SECURITY_CONFIG } from '../utils/security';
import bcrypt from 'bcryptjs';

export interface UserData {
  id: string;
  name: string;
  email: string;
  provider: 'email' | 'google';
  avatar?: string;
  isActive: boolean;
  isBanned: boolean;
  createdAt: any;
  lastLogin: any;
  role: 'user';
}

export interface AdminData {
  id: string;
  name: string;
  email: string;
  role: 'admin';
  isActive: boolean;
  createdAt: any;
  lastLogin: any;
}

export class AuthService {
  private static googleProvider = new GoogleAuthProvider();

  // User Registration
  static async registerUser(name: string, email: string, password: string): Promise<{ success: boolean; message: string; user?: UserData }> {
    try {
      // Validate inputs
      if (!SecurityUtils.validateName(name)) {
        return { success: false, message: 'اسم غير صالح. يجب أن يكون بين 2-50 حرف ويحتوي على أحرف صالحة فقط.' };
      }

      if (!SecurityUtils.validateEmail(email)) {
        return { success: false, message: 'بريد إلكتروني غير صالح أو طويل جداً.' };
      }

      if (!SecurityUtils.validatePassword(password)) {
        return { success: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف ورقم.' };
      }

      // Check rate limiting
      const rateLimit = SecurityUtils.checkRateLimit(email);
      if (!rateLimit.allowed) {
        return { 
          success: false, 
          message: `تم تجاوز عدد المحاولات المسموح. حاول مرة أخرى بعد ${Math.ceil(rateLimit.remainingTime! / 60)} دقيقة.` 
        };
      }

      // Check if user already exists
      const existingUser = await this.checkUserExists(email);
      if (existingUser) {
        return { success: false, message: 'المستخدم موجود بالفعل.' };
      }

      // Create user with Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create user document in Firestore
      const userData: UserData = {
        id: user.uid,
        name: SecurityUtils.sanitizeHTML(name),
        email: email.toLowerCase(),
        provider: 'email',
        isActive: true,
        isBanned: false,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        role: 'user'
      };

      await setDoc(doc(db, 'users', user.uid), userData);

      // Set session
      SessionManager.setUserSession(user.uid, userData);
      SecurityUtils.resetRateLimit(email);

      return { success: true, message: 'تم إنشاء الحساب بنجاح.', user: userData };
    } catch (error: any) {
      console.error('Registration error:', error);
      return { success: false, message: this.getErrorMessage(error.code) };
    }
  }

  // User Login
  static async loginUser(email: string, password: string): Promise<{ success: boolean; message: string; user?: UserData }> {
    try {
      // Validate inputs
      if (!SecurityUtils.validateEmail(email)) {
        return { success: false, message: 'بريد إلكتروني غير صالح.' };
      }

      // Check rate limiting
      const rateLimit = SecurityUtils.checkRateLimit(email);
      if (!rateLimit.allowed) {
        return { 
          success: false, 
          message: `تم تجاوز عدد المحاولات المسموح. حاول مرة أخرى بعد ${Math.ceil(rateLimit.remainingTime! / 60)} دقيقة.` 
        };
      }

      // Sign in with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Get user data from Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        return { success: false, message: 'بيانات المستخدم غير موجودة.' };
      }

      const userData = userDoc.data() as UserData;

      // Check if user is banned
      if (userData.isBanned) {
        await signOut(auth);
        return { success: false, message: 'تم حظر هذا الحساب.' };
      }

      // Update last login
      await updateDoc(doc(db, 'users', user.uid), {
        lastLogin: serverTimestamp()
      });

      // Set session
      SessionManager.setUserSession(user.uid, userData);
      SecurityUtils.resetRateLimit(email);

      return { success: true, message: 'تم تسجيل الدخول بنجاح.', user: userData };
    } catch (error: any) {
      console.error('Login error:', error);
      return { success: false, message: this.getErrorMessage(error.code) };
    }
  }

  // Google Login
  static async loginWithGoogle(): Promise<{ success: boolean; message: string; user?: UserData }> {
    try {
      const result = await signInWithPopup(auth, this.googleProvider);
      const user = result.user;

      // Check if user document exists
      let userDoc = await getDoc(doc(db, 'users', user.uid));
      let userData: UserData;

      if (!userDoc.exists()) {
        // Create new user document
        userData = {
          id: user.uid,
          name: user.displayName || 'مستخدم جوجل',
          email: user.email!,
          provider: 'google',
          avatar: user.photoURL || undefined,
          isActive: true,
          isBanned: false,
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
          role: 'user'
        };

        await setDoc(doc(db, 'users', user.uid), userData);
      } else {
        userData = userDoc.data() as UserData;

        // Check if user is banned
        if (userData.isBanned) {
          await signOut(auth);
          return { success: false, message: 'تم حظر هذا الحساب.' };
        }

        // Update last login
        await updateDoc(doc(db, 'users', user.uid), {
          lastLogin: serverTimestamp()
        });
      }

      // Set session
      SessionManager.setUserSession(user.uid, userData);

      return { success: true, message: 'تم تسجيل الدخول بنجاح.', user: userData };
    } catch (error: any) {
      console.error('Google login error:', error);
      return { success: false, message: 'فشل في تسجيل الدخول عبر جوجل.' };
    }
  }

  // Admin Login
  static async loginAdmin(email: string, password: string): Promise<{ success: boolean; message: string; admin?: AdminData }> {
    try {
      // Validate inputs
      if (!SecurityUtils.validateEmail(email)) {
        return { success: false, message: 'بريد إلكتروني غير صالح.' };
      }

      // Check rate limiting with stricter limits for admin
      const rateLimit = SecurityUtils.checkRateLimit(`admin_${email}`);
      if (!rateLimit.allowed) {
        return { 
          success: false, 
          message: `تم تجاوز عدد المحاولات المسموح. حاول مرة أخرى بعد ${Math.ceil(rateLimit.remainingTime! / 60)} دقيقة.` 
        };
      }

      // Query admin collection
      const adminQuery = query(
        collection(db, 'admins'),
        where('email', '==', email.toLowerCase()),
        where('isActive', '==', true)
      );

      const adminSnapshot = await getDocs(adminQuery);
      if (adminSnapshot.empty) {
        return { success: false, message: 'بيانات الدخول غير صحيحة.' };
      }

      const adminDoc = adminSnapshot.docs[0];
      const adminData = adminDoc.data();

      // Verify password
      const isValidPassword = await bcrypt.compare(password, adminData.password);
      if (!isValidPassword) {
        return { success: false, message: 'بيانات الدخول غير صحيحة.' };
      }

      // Update last login
      await updateDoc(doc(db, 'admins', adminDoc.id), {
        lastLogin: serverTimestamp()
      });

      const admin: AdminData = {
        id: adminDoc.id,
        name: adminData.name,
        email: adminData.email,
        role: 'admin',
        isActive: adminData.isActive,
        createdAt: adminData.createdAt,
        lastLogin: serverTimestamp()
      };

      // Set admin session
      SessionManager.setAdminSession(adminDoc.id, admin);
      SecurityUtils.resetRateLimit(`admin_${email}`);

      return { success: true, message: 'تم تسجيل دخول الإدارة بنجاح.', admin };
    } catch (error: any) {
      console.error('Admin login error:', error);
      return { success: false, message: 'خطأ في تسجيل دخول الإدارة.' };
    }
  }

  // Logout
  static async logout(): Promise<void> {
    try {
      await signOut(auth);
      SessionManager.clearUserSession();
      SessionManager.clearAdminSession();
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  // Check if user exists
  private static async checkUserExists(email: string): Promise<boolean> {
    try {
      const userQuery = query(
        collection(db, 'users'),
        where('email', '==', email.toLowerCase())
      );
      const snapshot = await getDocs(userQuery);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error checking user existence:', error);
      return false;
    }
  }

  // Get current user
  static getCurrentUser(): UserData | null {
    const session = SessionManager.getUserSession();
    return session ? session.userData : null;
  }

  // Get current admin
  static getCurrentAdmin(): AdminData | null {
    const session = SessionManager.getAdminSession();
    return session ? session.adminData : null;
  }

  // Check if user is authenticated
  static isAuthenticated(): boolean {
    return SessionManager.isValidSession();
  }

  // Check if admin is authenticated
  static isAdminAuthenticated(): boolean {
    return SessionManager.isValidAdminSession();
  }

  // Error message mapping
  private static getErrorMessage(errorCode: string): string {
    const errorMessages: { [key: string]: string } = {
      'auth/email-already-in-use': 'البريد الإلكتروني مستخدم بالفعل.',
      'auth/weak-password': 'كلمة المرور ضعيفة جداً.',
      'auth/invalid-email': 'بريد إلكتروني غير صالح.',
      'auth/user-not-found': 'المستخدم غير موجود.',
      'auth/wrong-password': 'كلمة المرور غير صحيحة.',
      'auth/too-many-requests': 'تم تجاوز عدد المحاولات المسموح. حاول لاحقاً.',
      'auth/network-request-failed': 'خطأ في الاتصال بالشبكة.',
      'auth/invalid-credential': 'بيانات الدخول غير صحيحة.'
    };

    return errorMessages[errorCode] || 'حدث خطأ غير متوقع.';
  }
}

// Initialize admin account (run once)
export async function initializeAdmin(): Promise<void> {
  try {
    // Check if admin already exists
    const adminQuery = query(collection(db, 'admins'));
    const adminSnapshot = await getDocs(adminQuery);
    
    if (adminSnapshot.empty) {
      // Create default admin account
      const hashedPassword = await bcrypt.hash('DeepBug@2024', 12);
      
      const adminData = {
        name: 'DeepBug Admin',
        email: 'admin@deepbug.com',
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        createdAt: serverTimestamp(),
        lastLogin: null
      };

      await setDoc(doc(collection(db, 'admins')), adminData);
      console.log('Default admin account created');
    }
  } catch (error) {
    console.error('Error initializing admin:', error);
  }
}
