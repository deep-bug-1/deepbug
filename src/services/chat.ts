import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  where, 
  limit, 
  onSnapshot,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { SecurityUtils } from '../utils/security';

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  message: string;
  timestamp: any;
  isDeleted: boolean;
  deletedBy?: string;
  type: 'text' | 'image' | 'file';
  isAdmin?: boolean;
}

export interface ChatSession {
  id: string;
  isOpen: boolean;
  openedBy?: string;
  closedBy?: string;
  openedAt?: any;
  closedAt?: any;
  participants: string[];
  messageCount: number;
}

export interface BannedUser {
  id: string;
  userId: string;
  bannedBy: string;
  reason: string;
  bannedAt: any;
  expiresAt?: any;
  isActive: boolean;
}

export class ChatService {
  private static chatListeners: { [key: string]: () => void } = {};

  // Check if chat is open
  static async isChatOpen(): Promise<boolean> {
    try {
      const sessionQuery = query(
        collection(db, 'chatSessions'),
        where('isOpen', '==', true),
        limit(1)
      );

      const snapshot = await getDocs(sessionQuery);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error checking chat status:', error);
      return false;
    }
  }

  // Open chat session (admin only)
  static async openChat(adminId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Check if chat is already open
      const isOpen = await this.isChatOpen();
      if (isOpen) {
        return { success: false, message: 'الدردشة مفتوحة بالفعل.' };
      }

      const sessionData: Omit<ChatSession, 'id'> = {
        isOpen: true,
        openedBy: adminId,
        openedAt: serverTimestamp(),
        participants: [],
        messageCount: 0
      };

      const sessionRef = doc(collection(db, 'chatSessions'));
      await setDoc(sessionRef, sessionData);

      return { success: true, message: 'تم فتح الدردشة بنجاح.' };
    } catch (error) {
      console.error('Error opening chat:', error);
      return { success: false, message: 'خطأ في فتح الدردشة.' };
    }
  }

  // Close chat session (admin only)
  static async closeChat(adminId: string): Promise<{ success: boolean; message: string }> {
    try {
      const sessionQuery = query(
        collection(db, 'chatSessions'),
        where('isOpen', '==', true),
        limit(1)
      );

      const snapshot = await getDocs(sessionQuery);
      if (snapshot.empty) {
        return { success: false, message: 'لا توجد جلسة دردشة مفتوحة.' };
      }

      const sessionDoc = snapshot.docs[0];
      await updateDoc(doc(db, 'chatSessions', sessionDoc.id), {
        isOpen: false,
        closedBy: adminId,
        closedAt: serverTimestamp()
      });

      return { success: true, message: 'تم إغلاق الدردشة بنجاح.' };
    } catch (error) {
      console.error('Error closing chat:', error);
      return { success: false, message: 'خطأ في إغلاق الدردشة.' };
    }
  }

  // Send message
  static async sendMessage(userId: string, userName: string, message: string, userAvatar?: string, isAdmin: boolean = false): Promise<{ success: boolean; message: string }> {
    try {
      // Validate message
      if (!SecurityUtils.validateMessage(message)) {
        return { success: false, message: 'الرسالة غير صالحة أو طويلة جداً.' };
      }

      // Check if user is banned
      const isBanned = await this.isUserBanned(userId);
      if (isBanned) {
        return { success: false, message: 'تم حظرك من الدردشة.' };
      }

      // Check if chat is open
      const chatOpen = await this.isChatOpen();
      if (!chatOpen) {
        return { success: false, message: 'الدردشة مغلقة حالياً.' };
      }

      // Sanitize message
      const sanitizedMessage = SecurityUtils.sanitizeHTML(message);

      const messageData: Omit<ChatMessage, 'id'> = {
        userId,
        userName: SecurityUtils.sanitizeHTML(userName),
        userAvatar,
        message: sanitizedMessage,
        timestamp: serverTimestamp(),
        isDeleted: false,
        type: 'text',
        isAdmin
      };

      // Create message document
      const messageRef = doc(collection(db, 'chat'));
      await setDoc(messageRef, messageData);

      // Update session participant list and message count
      await this.updateSessionParticipants(userId);

      return { success: true, message: 'تم إرسال الرسالة بنجاح.' };
    } catch (error) {
      console.error('Error sending message:', error);
      return { success: false, message: 'خطأ في إرسال الرسالة.' };
    }
  }

  // Delete message (admin only)
  static async deleteMessage(messageId: string, adminId: string): Promise<{ success: boolean; message: string }> {
    try {
      const messageRef = doc(db, 'chat', messageId);
      const messageDoc = await getDoc(messageRef);

      if (!messageDoc.exists()) {
        return { success: false, message: 'الرسالة غير موجودة.' };
      }

      await updateDoc(messageRef, {
        isDeleted: true,
        deletedBy: adminId
      });

      return { success: true, message: 'تم حذف الرسالة بنجاح.' };
    } catch (error) {
      console.error('Error deleting message:', error);
      return { success: false, message: 'خطأ في حذف الرسالة.' };
    }
  }

  // Ban user (admin only)
  static async banUser(userId: string, adminId: string, reason: string, duration?: number): Promise<{ success: boolean; message: string }> {
    try {
      // Check if user is already banned
      const existingBan = await this.isUserBanned(userId);
      if (existingBan) {
        return { success: false, message: 'المستخدم محظور بالفعل.' };
      }

      const banData: Omit<BannedUser, 'id'> = {
        userId,
        bannedBy: adminId,
        reason: SecurityUtils.sanitizeHTML(reason),
        bannedAt: serverTimestamp(),
        expiresAt: duration ? new Date(Date.now() + duration) : undefined,
        isActive: true
      };

      const banRef = doc(collection(db, 'bannedUsers'));
      await setDoc(banRef, banData);

      return { success: true, message: 'تم حظر المستخدم بنجاح.' };
    } catch (error) {
      console.error('Error banning user:', error);
      return { success: false, message: 'خطأ في حظر المستخدم.' };
    }
  }

  // Unban user (admin only)
  static async unbanUser(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const banQuery = query(
        collection(db, 'bannedUsers'),
        where('userId', '==', userId),
        where('isActive', '==', true)
      );

      const snapshot = await getDocs(banQuery);
      if (snapshot.empty) {
        return { success: false, message: 'المستخدم غير محظور.' };
      }

      const banDoc = snapshot.docs[0];
      await updateDoc(doc(db, 'bannedUsers', banDoc.id), {
        isActive: false
      });

      return { success: true, message: 'تم إلغاء حظر المستخدم بنجاح.' };
    } catch (error) {
      console.error('Error unbanning user:', error);
      return { success: false, message: 'خطأ في إلغاء حظر المستخدم.' };
    }
  }

  // Check if user is banned
  static async isUserBanned(userId: string): Promise<boolean> {
    try {
      const banQuery = query(
        collection(db, 'bannedUsers'),
        where('userId', '==', userId),
        where('isActive', '==', true)
      );

      const snapshot = await getDocs(banQuery);
      if (snapshot.empty) {
        return false;
      }

      const banDoc = snapshot.docs[0];
      const banData = banDoc.data();

      // Check if ban has expired
      if (banData.expiresAt && banData.expiresAt.toDate() < new Date()) {
        // Automatically deactivate expired ban
        await updateDoc(doc(db, 'bannedUsers', banDoc.id), {
          isActive: false
        });
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error checking ban status:', error);
      return false;
    }
  }

  // Get chat messages
  static async getMessages(limitCount: number = 50): Promise<ChatMessage[]> {
    try {
      const messagesQuery = query(
        collection(db, 'chat'),
        where('isDeleted', '==', false),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(messagesQuery);
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      
      // Return in chronological order (oldest first)
      return messages.reverse();
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }

  // Listen to chat messages in real-time
  static listenToMessages(callback: (messages: ChatMessage[]) => void, limitCount: number = 50): () => void {
    try {
      const messagesQuery = query(
        collection(db, 'chat'),
        where('isDeleted', '==', false),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );

      const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
        // Return in chronological order (oldest first)
        callback(messages.reverse());
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error listening to messages:', error);
      return () => {};
    }
  }

  // Listen to chat status
  static listenToChatStatus(callback: (isOpen: boolean) => void): () => void {
    try {
      const sessionQuery = query(
        collection(db, 'chatSessions'),
        where('isOpen', '==', true),
        limit(1)
      );

      const unsubscribe = onSnapshot(sessionQuery, (snapshot) => {
        callback(!snapshot.empty);
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error listening to chat status:', error);
      return () => {};
    }
  }

  // Update session participants
  private static async updateSessionParticipants(userId: string): Promise<void> {
    try {
      const sessionQuery = query(
        collection(db, 'chatSessions'),
        where('isOpen', '==', true),
        limit(1)
      );

      const snapshot = await getDocs(sessionQuery);
      if (!snapshot.empty) {
        const sessionDoc = snapshot.docs[0];
        const sessionData = sessionDoc.data();
        
        if (!sessionData.participants.includes(userId)) {
          await updateDoc(doc(db, 'chatSessions', sessionDoc.id), {
            participants: [...sessionData.participants, userId],
            messageCount: sessionData.messageCount + 1
          });
        } else {
          await updateDoc(doc(db, 'chatSessions', sessionDoc.id), {
            messageCount: sessionData.messageCount + 1
          });
        }
      }
    } catch (error) {
      console.error('Error updating session participants:', error);
    }
  }

  // Get banned users (admin only)
  static async getBannedUsers(): Promise<BannedUser[]> {
    try {
      const banQuery = query(
        collection(db, 'bannedUsers'),
        where('isActive', '==', true),
        orderBy('bannedAt', 'desc')
      );

      const snapshot = await getDocs(banQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BannedUser));
    } catch (error) {
      console.error('Error getting banned users:', error);
      return [];
    }
  }

  // Clear all messages (admin only)
  static async clearAllMessages(adminId: string): Promise<{ success: boolean; message: string }> {
    try {
      const messagesQuery = query(collection(db, 'chat'));
      const snapshot = await getDocs(messagesQuery);

      const deletePromises = snapshot.docs.map(doc => 
        updateDoc(doc.ref, {
          isDeleted: true,
          deletedBy: adminId
        })
      );

      await Promise.all(deletePromises);

      return { success: true, message: 'تم مسح جميع الرسائل بنجاح.' };
    } catch (error) {
      console.error('Error clearing messages:', error);
      return { success: false, message: 'خطأ في مسح الرسائل.' };
    }
  }
}
