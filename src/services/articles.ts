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
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { SecurityUtils } from '../utils/security';

export interface Article {
  id: string;
  title: string;
  description: string;
  content: string;
  cardImage?: string;
  externalImages: string[];
  category: 'programming' | 'cybersecurity' | 'news' | 'projects';
  status: 'draft' | 'published';
  authorId: string;
  authorName: string;
  views: number;
  likes: number;
  createdAt: any;
  updatedAt: any;
  publishedAt?: any;
  tags: string[];
  featured: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  link: string;
  image: string;
  category: string;
  status: 'active' | 'inactive';
  technologies: string[];
  createdAt: any;
  updatedAt: any;
  featured: boolean;
}

export class ArticleService {
  // Create new article
  static async createArticle(articleData: Omit<Article, 'id' | 'views' | 'likes' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; message: string; articleId?: string }> {
    try {
      // Validate inputs
      if (!articleData.title || articleData.title.length < 5 || articleData.title.length > 200) {
        return { success: false, message: 'عنوان المقال يجب أن يكون بين 5-200 حرف.' };
      }

      if (!articleData.description || articleData.description.length < 10) {
        return { success: false, message: 'وصف المقال يجب أن يكون 10 أحرف على الأقل.' };
      }

      if (!articleData.content || articleData.content.length < 50) {
        return { success: false, message: 'محتوى المقال يجب أن يكون 50 حرف على الأقل.' };
      }

      // Validate external images URLs
      for (const imageUrl of articleData.externalImages) {
        if (!SecurityUtils.validateURL(imageUrl)) {
          return { success: false, message: 'رابط صورة غير صالح.' };
        }
      }

      // Validate card image URL if provided
      if (articleData.cardImage && !SecurityUtils.validateURL(articleData.cardImage)) {
        return { success: false, message: 'رابط صورة البطاقة غير صالح.' };
      }

      // Sanitize content
      const sanitizedArticle = {
        ...articleData,
        title: SecurityUtils.sanitizeHTML(articleData.title),
        description: SecurityUtils.sanitizeHTML(articleData.description),
        content: SecurityUtils.sanitizeHTML(articleData.content),
        views: 0,
        likes: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        publishedAt: articleData.status === 'published' ? serverTimestamp() : null
      };

      // Create article document
      const articleRef = doc(collection(db, 'articles'));
      await setDoc(articleRef, sanitizedArticle);

      return { success: true, message: 'تم إنشاء المقال بنجاح.', articleId: articleRef.id };
    } catch (error) {
      console.error('Error creating article:', error);
      return { success: false, message: 'خطأ في إنشاء المقال.' };
    }
  }

  // Update article
  static async updateArticle(articleId: string, updateData: Partial<Article>): Promise<{ success: boolean; message: string }> {
    try {
      // Validate article exists
      const articleRef = doc(db, 'articles', articleId);
      const articleDoc = await getDoc(articleRef);
      
      if (!articleDoc.exists()) {
        return { success: false, message: 'المقال غير موجود.' };
      }

      // Sanitize update data
      const sanitizedUpdate: any = {
        ...updateData,
        updatedAt: serverTimestamp()
      };

      if (updateData.title) {
        sanitizedUpdate.title = SecurityUtils.sanitizeHTML(updateData.title);
      }
      if (updateData.description) {
        sanitizedUpdate.description = SecurityUtils.sanitizeHTML(updateData.description);
      }
      if (updateData.content) {
        sanitizedUpdate.content = SecurityUtils.sanitizeHTML(updateData.content);
      }

      // If publishing for the first time
      if (updateData.status === 'published' && articleDoc.data().status !== 'published') {
        sanitizedUpdate.publishedAt = serverTimestamp();
      }

      await updateDoc(articleRef, sanitizedUpdate);

      return { success: true, message: 'تم تحديث المقال بنجاح.' };
    } catch (error) {
      console.error('Error updating article:', error);
      return { success: false, message: 'خطأ في تحديث المقال.' };
    }
  }

  // Delete article
  static async deleteArticle(articleId: string): Promise<{ success: boolean; message: string }> {
    try {
      const articleRef = doc(db, 'articles', articleId);
      const articleDoc = await getDoc(articleRef);
      
      if (!articleDoc.exists()) {
        return { success: false, message: 'المقال غير موجود.' };
      }

      await deleteDoc(articleRef);

      return { success: true, message: 'تم حذف المقال بنجاح.' };
    } catch (error) {
      console.error('Error deleting article:', error);
      return { success: false, message: 'خطأ في حذف المقال.' };
    }
  }

  // Get article by ID
  static async getArticle(articleId: string): Promise<Article | null> {
    try {
      const articleDoc = await getDoc(doc(db, 'articles', articleId));
      if (!articleDoc.exists()) {
        return null;
      }

      return { id: articleDoc.id, ...articleDoc.data() } as Article;
    } catch (error) {
      console.error('Error getting article:', error);
      return null;
    }
  }

  // Get articles by category
  static async getArticlesByCategory(category: string, limitCount: number = 10): Promise<Article[]> {
    try {
      const articlesQuery = query(
        collection(db, 'articles'),
        where('category', '==', category),
        where('status', '==', 'published'),
        orderBy('publishedAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(articlesQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article));
    } catch (error) {
      console.error('Error getting articles by category:', error);
      return [];
    }
  }

  // Get all published articles
  static async getPublishedArticles(limitCount: number = 20): Promise<Article[]> {
    try {
      const articlesQuery = query(
        collection(db, 'articles'),
        where('status', '==', 'published'),
        orderBy('publishedAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(articlesQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article));
    } catch (error) {
      console.error('Error getting published articles:', error);
      return [];
    }
  }

  // Get featured articles
  static async getFeaturedArticles(limitCount: number = 5): Promise<Article[]> {
    try {
      const articlesQuery = query(
        collection(db, 'articles'),
        where('status', '==', 'published'),
        where('featured', '==', true),
        orderBy('publishedAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(articlesQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article));
    } catch (error) {
      console.error('Error getting featured articles:', error);
      return [];
    }
  }

  // Increment article views
  static async incrementViews(articleId: string): Promise<void> {
    try {
      const articleRef = doc(db, 'articles', articleId);
      await updateDoc(articleRef, {
        views: increment(1)
      });
    } catch (error) {
      console.error('Error incrementing views:', error);
    }
  }

  // Toggle article like
  static async toggleLike(articleId: string, shouldIncrement: boolean): Promise<void> {
    try {
      const articleRef = doc(db, 'articles', articleId);
      await updateDoc(articleRef, {
        likes: increment(shouldIncrement ? 1 : -1)
      });
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  }
}

export class ProjectService {
  // Create new project
  static async createProject(projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; message: string; projectId?: string }> {
    try {
      // Validate inputs
      if (!projectData.name || projectData.name.length < 3 || projectData.name.length > 100) {
        return { success: false, message: 'اسم المشروع يجب أن يكون بين 3-100 حرف.' };
      }

      if (!projectData.description || projectData.description.length < 10) {
        return { success: false, message: 'وصف المشروع يجب أن يكون 10 أحرف على الأقل.' };
      }

      if (!SecurityUtils.validateURL(projectData.link)) {
        return { success: false, message: 'رابط المشروع غير صالح.' };
      }

      if (!SecurityUtils.validateURL(projectData.image)) {
        return { success: false, message: 'رابط صورة المشروع غير صالح.' };
      }

      // Sanitize content
      const sanitizedProject = {
        ...projectData,
        name: SecurityUtils.sanitizeHTML(projectData.name),
        description: SecurityUtils.sanitizeHTML(projectData.description),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Create project document
      const projectRef = doc(collection(db, 'projects'));
      await setDoc(projectRef, sanitizedProject);

      return { success: true, message: 'تم إنشاء المشروع بنجاح.', projectId: projectRef.id };
    } catch (error) {
      console.error('Error creating project:', error);
      return { success: false, message: 'خطأ في إنشاء المشروع.' };
    }
  }

  // Update project
  static async updateProject(projectId: string, updateData: Partial<Project>): Promise<{ success: boolean; message: string }> {
    try {
      const projectRef = doc(db, 'projects', projectId);
      const projectDoc = await getDoc(projectRef);
      
      if (!projectDoc.exists()) {
        return { success: false, message: 'المشروع غير موجود.' };
      }

      // Sanitize update data
      const sanitizedUpdate: any = {
        ...updateData,
        updatedAt: serverTimestamp()
      };

      if (updateData.name) {
        sanitizedUpdate.name = SecurityUtils.sanitizeHTML(updateData.name);
      }
      if (updateData.description) {
        sanitizedUpdate.description = SecurityUtils.sanitizeHTML(updateData.description);
      }

      await updateDoc(projectRef, sanitizedUpdate);

      return { success: true, message: 'تم تحديث المشروع بنجاح.' };
    } catch (error) {
      console.error('Error updating project:', error);
      return { success: false, message: 'خطأ في تحديث المشروع.' };
    }
  }

  // Delete project
  static async deleteProject(projectId: string): Promise<{ success: boolean; message: string }> {
    try {
      const projectRef = doc(db, 'projects', projectId);
      const projectDoc = await getDoc(projectRef);
      
      if (!projectDoc.exists()) {
        return { success: false, message: 'المشروع غير موجود.' };
      }

      await deleteDoc(projectRef);

      return { success: true, message: 'تم حذف المشروع بنجاح.' };
    } catch (error) {
      console.error('Error deleting project:', error);
      return { success: false, message: 'خطأ في حذف المشروع.' };
    }
  }

  // Get all projects
  static async getProjects(limitCount: number = 20): Promise<Project[]> {
    try {
      const projectsQuery = query(
        collection(db, 'projects'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(projectsQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
    } catch (error) {
      console.error('Error getting projects:', error);
      return [];
    }
  }

  // Get featured projects
  static async getFeaturedProjects(limitCount: number = 6): Promise<Project[]> {
    try {
      const projectsQuery = query(
        collection(db, 'projects'),
        where('featured', '==', true),
        where('status', '==', 'active'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      const snapshot = await getDocs(projectsQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
    } catch (error) {
      console.error('Error getting featured projects:', error);
      return [];
    }
  }
}
