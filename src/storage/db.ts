/**
 * In-House IndexedDB Storage Adapter with Automatic LocalStorage Fallback (Phase 10).
 * Safe against private browsing, quota exhaustion, and missing storage APIs.
 * Zero unhandled exceptions.
 */

import { ProjectData, migrateProjectData } from './schema';

const DB_NAME = 'life_of_a_request_db';
const DB_VERSION = 1;
const AUTOSAVE_KEY = 'life_of_a_request_autosave_v2';
const PROJECTS_LOCAL_PREFIX = 'life_of_a_request_proj_';

class StorageAdapter {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private isIndexedDbAvailable = true;

  private async getDB(): Promise<IDBDatabase | null> {
    if (!this.isIndexedDbAvailable) return null;
    if (typeof window === 'undefined' || !window.indexedDB) {
      this.isIndexedDbAvailable = false;
      return null;
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const req = window.indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('projects')) {
              db.createObjectStore('projects', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('autosave')) {
              db.createObjectStore('autosave', { keyPath: 'key' });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => {
            this.isIndexedDbAvailable = false;
            resolve(null);
          };
        } catch {
          this.isIndexedDbAvailable = false;
          resolve(null);
        }
      });
    }

    return this.dbPromise;
  }

  // --- Autosave API ---
  async saveAutosave(data: ProjectData): Promise<void> {
    try {
      const db = await this.getDB();
      if (db) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('autosave', 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore('autosave').put({ key: 'current', data, updatedAt: Date.now() });
        });
        return;
      }
    } catch {
      // Fallback below
    }

    // LocalStorage Fallback
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
      }
    } catch {
      // Storage completely unavailable or quota exceeded; safe silent ignore
    }
  }

  async loadAutosave(): Promise<ProjectData | null> {
    try {
      const db = await this.getDB();
      if (db) {
        const result = await new Promise<any>((resolve) => {
          const tx = db.transaction('autosave', 'readonly');
          const req = tx.objectStore('autosave').get('current');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (result && result.data) {
          return migrateProjectData(result.data);
        }
      }
    } catch {
      // Fallback below
    }

    // LocalStorage Fallback
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(AUTOSAVE_KEY);
        if (raw) {
          return migrateProjectData(JSON.parse(raw));
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  // --- Named Projects API ---
  async saveProject(project: ProjectData): Promise<void> {
    try {
      const db = await this.getDB();
      if (db) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('projects', 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore('projects').put(project);
        });
        return;
      }
    } catch {
      // Fallback below
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(`${PROJECTS_LOCAL_PREFIX}${project.id}`, JSON.stringify(project));
      }
    } catch {
      // Ignore quota error
    }
  }

  async getProject(id: string): Promise<ProjectData | null> {
    try {
      const db = await this.getDB();
      if (db) {
        const item = await new Promise<any>((resolve) => {
          const tx = db.transaction('projects', 'readonly');
          const req = tx.objectStore('projects').get(id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (item) return migrateProjectData(item);
      }
    } catch {
      // Fallback below
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(`${PROJECTS_LOCAL_PREFIX}${id}`);
        if (raw) return migrateProjectData(JSON.parse(raw));
      }
    } catch {
      return null;
    }
    return null;
  }

  async listProjects(): Promise<ProjectData[]> {
    const list: ProjectData[] = [];
    try {
      const db = await this.getDB();
      if (db) {
        const items = await new Promise<any[]>((resolve) => {
          const tx = db.transaction('projects', 'readonly');
          const req = tx.objectStore('projects').getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
        for (const item of items) {
          try {
            list.push(migrateProjectData(item));
          } catch {
            // Skip corrupt entries
          }
        }
        return list;
      }
    } catch {
      // Fallback below
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(PROJECTS_LOCAL_PREFIX)) {
            try {
              const raw = window.localStorage.getItem(k);
              if (raw) list.push(migrateProjectData(JSON.parse(raw)));
            } catch {
              // Ignore
            }
          }
        }
      }
    } catch {
      return [];
    }
    return list;
  }

  async deleteProject(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      if (db) {
        await new Promise<void>((resolve) => {
          const tx = db.transaction('projects', 'readwrite');
          tx.objectStore('projects').delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
        return;
      }
    } catch {
      // Fallback below
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(`${PROJECTS_LOCAL_PREFIX}${id}`);
      }
    } catch {
      // Ignore
    }
  }

  async clearAllData(): Promise<void> {
    try {
      const db = await this.getDB();
      if (db) {
        await new Promise<void>((resolve) => {
          const tx = db.transaction(['projects', 'autosave'], 'readwrite');
          tx.objectStore('projects').clear();
          tx.objectStore('autosave').clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      }
    } catch {
      // Ignore
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && (k === AUTOSAVE_KEY || k.startsWith(PROJECTS_LOCAL_PREFIX))) {
            keysToRemove.push(k);
          }
        }
        for (const k of keysToRemove) {
          window.localStorage.removeItem(k);
        }
      }
    } catch {
      // Ignore
    }
  }
}

export const storage = new StorageAdapter();
