import { query, getDbStatus } from '../db';
import fs from 'fs';
import path from 'path';

let firestoreDbGetter: (() => any) | null = null;

export function setSupportDbGetter(getter: () => any) {
  firestoreDbGetter = getter;
}

function getFirestore() {
  if (firestoreDbGetter) {
    try {
      const db = firestoreDbGetter();
      if (db) return db;
    } catch (e) {
      console.warn("⚠️ [Support Service] Could not get Firestore instance:", e);
    }
  }
  return null;
}

function getDocRef(fDb: any, colName: string, docId: string) {
  if (!fDb) return null;
  if (typeof fDb.doc === 'function') {
    return fDb.doc(colName, docId);
  }
  if (typeof fDb.collection === 'function') {
    const col = fDb.collection(colName);
    if (col && typeof col.doc === 'function') {
      return col.doc(docId);
    }
  }
  return null;
}

function getColRef(fDb: any, colName: string) {
  if (!fDb) return null;
  if (typeof fDb.collection === 'function') {
    return fDb.collection(colName);
  }
  return null;
}

const LOCAL_CONVERSATIONS_FILE = path.join(process.cwd(), 'support_conversations.json');
const KNOWLEDGE_FILE = path.join(process.cwd(), 'support_knowledge.json');
const LOGS_FILE = path.join(process.cwd(), 'support_operations_logs.json');

// Helper to load fallback local conversations
function loadLocalConversations() {
  if (fs.existsSync(LOCAL_CONVERSATIONS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOCAL_CONVERSATIONS_FILE, 'utf8'));
    } catch (e) {
      console.error("Error reading local support conversations:", e);
    }
  }
  return {};
}

// Helper to save fallback local conversation
function saveLocalConversation(sessionId: string, conversation: any) {
  try {
    const data = loadLocalConversations();
    data[sessionId.toLowerCase().trim()] = conversation;
    fs.writeFileSync(LOCAL_CONVERSATIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error("Error saving local support conversation:", e);
  }
}

function loadLocalKnowledge() {
  if (fs.existsSync(KNOWLEDGE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf8'));
    } catch (e) {
      console.error("Error reading local knowledge:", e);
    }
  }
  return [];
}

function saveLocalKnowledge(data: any[]) {
  try {
    fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error("Error saving local knowledge:", e);
  }
}

function loadLocalLogs() {
  if (fs.existsSync(LOGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
    } catch (e) {
      console.error("Error reading local logs:", e);
    }
  }
  return [];
}

function saveLocalLogs(data: any[]) {
  try {
    fs.writeFileSync(LOGS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error("Error saving local logs:", e);
  }
}

// Helper to normalize and sanitize conversation status
const LEGACY_INVALID_STATUSES = ['waiting_for_human', 'queued', 'pending', 'human_support', 'escalated', 'waiting', 'active_ai', 'ai', 'queued_for_human'];

function sanitizeStatus(status: string): string {
  if (!status || LEGACY_INVALID_STATUSES.includes(status.toLowerCase())) {
    return 'AI_HANDLING';
  }
  return status;
}

// Map database/raw message to frontend format
function mapMessage(msg: any) {
  return {
    id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    sender: msg.sender || (msg.sender_type === 'customer' ? 'user' : 'support'),
    sender_type: msg.sender_type || (msg.sender === 'user' ? 'customer' : 'agent'),
    text: msg.text !== undefined ? msg.text : (msg.content || ''),
    time: msg.time || (msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
    timestamp: msg.timestamp || (msg.created_at ? new Date(msg.created_at).getTime() : Date.now()),
    isInternal: !!msg.isInternal || !!msg.is_internal,
    attachment: msg.attachment || (msg.message_type && msg.message_type !== 'text' ? {
      name: (msg.content || '').split('/').pop() || 'file',
      url: msg.content || '',
      type: msg.message_type
    } : undefined)
  };
}

function isUuid(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

function isSnapExisting(snap: any): boolean {
  if (!snap) return false;
  if (typeof snap.exists === 'function') {
    return Boolean(snap.exists());
  }
  return Boolean(snap.exists);
}

function getSnapData(snap: any): any {
  if (!snap) return undefined;
  if (typeof snap.data === 'function') {
    return snap.data();
  }
  return snap.data || undefined;
}

// Get active conversation for a user session
export async function getOrCreateConversation(sessionId: string, clientMetadata: any = {}) {
  const sessionKey = (sessionId || 'guest@ryvo.co').toLowerCase().trim();
  const fDb = getFirestore();

  // 1. Primary: Firestore Database
  if (fDb) {
    try {
      const docRef = getDocRef(fDb, "support_conversations", sessionKey);
      if (docRef) {
        const snap = await docRef.get();
        const exists = isSnapExisting(snap);
        const data = getSnapData(snap);

        if (exists && data) {
          const sanitized = sanitizeStatus(data.status);
          if (sanitized !== data.status) {
            data.status = sanitized;
            await docRef.set({ status: sanitized, updatedAt: new Date().toISOString() }, { merge: true });
          }
          return {
            id: data.id || sessionKey,
            sessionId: sessionKey,
            clientEmail: data.clientEmail || (sessionKey.includes('@') ? sessionKey : 'guest@ryvo.co'),
            clientName: data.clientName || sessionKey.split('@')[0] || 'عميل المتجر',
            clientPhone: data.clientPhone || clientMetadata.phone || '',
            country: data.country || clientMetadata.country || 'SA',
            language: data.language || clientMetadata.language || 'ar',
            device: data.device || clientMetadata.device || 'Desktop',
            os: data.os || clientMetadata.os || 'Windows',
            browser: data.browser || clientMetadata.browser || 'Chrome',
            ip: data.ip || clientMetadata.ip || '127.0.0.1',
            createdAt: data.createdAt || new Date().toISOString(),
            lastActive: data.lastActive || Date.now(),
            status: sanitized,
            ai_summary: data.ai_summary || '',
            transfer_reason: data.transfer_reason || '',
            messages: (data.messages || []).map(mapMessage)
          };
        } else {
          const newConv = {
            id: sessionKey,
            sessionId: sessionKey,
            clientEmail: sessionKey.includes('@') ? sessionKey : 'guest@ryvo.co',
            clientName: sessionKey.split('@')[0] || 'عميل رايفو',
            clientPhone: clientMetadata.phone || '',
            country: clientMetadata.country || 'SA',
            language: clientMetadata.language || 'ar',
            device: clientMetadata.device || 'Desktop',
            os: clientMetadata.os || 'Windows',
            browser: clientMetadata.browser || 'Chrome',
            ip: clientMetadata.ip || '127.0.0.1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastActive: Date.now(),
            status: 'AI_HANDLING',
            ai_summary: '',
            transfer_reason: '',
            messages: []
          };
          await docRef.set(newConv);
          return newConv;
        }
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore getOrCreateConversation error:", fsErr?.message || fsErr);
    }
  }

  // 2. Secondary: PostgreSQL
  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      const selectRes = await query(
        `SELECT * FROM conversations WHERE user_id = $1 AND status != 'CLOSED' ORDER BY created_at DESC LIMIT 1`,
        [sessionKey]
      );

      let dbConv;
      if (selectRes.rows.length > 0) {
        dbConv = selectRes.rows[0];
        const sanitized = sanitizeStatus(dbConv.status);
        if (sanitized !== dbConv.status) {
          await query(`UPDATE conversations SET status = 'AI_HANDLING', updated_at = NOW() WHERE id = $1`, [dbConv.id]);
          dbConv.status = 'AI_HANDLING';
        }
      } else {
        const insertRes = await query(
          `INSERT INTO conversations (user_id, status, metadata) VALUES ($1, 'AI_HANDLING', $2) RETURNING *`,
          [sessionKey, JSON.stringify(clientMetadata)]
        );
        dbConv = insertRes.rows[0];
      }

      const msgRes = await query(
        `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [dbConv.id]
      );

      return {
        id: dbConv.id,
        sessionId: sessionKey,
        clientEmail: sessionKey.includes('@') ? sessionKey : 'guest@ryvo.co',
        clientName: sessionKey.split('@')[0] || 'زائر',
        clientPhone: clientMetadata.phone || '',
        country: dbConv.metadata?.country || 'SA',
        language: dbConv.metadata?.language || 'ar',
        device: dbConv.metadata?.device || 'Desktop',
        os: dbConv.metadata?.os || 'Windows',
        browser: dbConv.metadata?.browser || 'Chrome',
        ip: dbConv.metadata?.ip || '127.0.0.1',
        createdAt: dbConv.created_at,
        lastActive: new Date(dbConv.updated_at).getTime(),
        status: sanitizeStatus(dbConv.status),
        ai_summary: dbConv.ai_summary || '',
        transfer_reason: dbConv.transfer_reason || '',
        messages: msgRes.rows.map(mapMessage)
      };
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in getOrCreateConversation:", err.message);
    }
  }

  // 3. Fallback: Local JSON
  const localData = loadLocalConversations();
  if (localData[sessionKey]) {
    const sanitized = sanitizeStatus(localData[sessionKey].status);
    localData[sessionKey].status = sanitized;
    return localData[sessionKey];
  }
  const newConv = {
    id: sessionKey,
    sessionId: sessionKey,
    clientEmail: sessionKey.includes('@') ? sessionKey : 'guest@ryvo.co',
    clientName: sessionKey.split('@')[0] || 'زائر',
    clientPhone: clientMetadata.phone || '',
    country: clientMetadata.country || 'SA',
    language: clientMetadata.language || 'ar',
    device: clientMetadata.device || 'Desktop',
    os: clientMetadata.os || 'Windows',
    browser: clientMetadata.browser || 'Chrome',
    ip: clientMetadata.ip || '127.0.0.1',
    createdAt: new Date().toISOString(),
    lastActive: Date.now(),
    status: 'AI_HANDLING',
    ai_summary: '',
    transfer_reason: '',
    messages: []
  };
  saveLocalConversation(sessionKey, newConv);
  return newConv;
}

// Get a single conversation by ID / session key
export async function getConversationById(id: string) {
  const sessionKey = (id || '').toLowerCase().trim();
  const fDb = getFirestore();

  if (fDb) {
    try {
      const docRef = getDocRef(fDb, "support_conversations", sessionKey);
      if (docRef) {
        const snap = await docRef.get();
        const exists = isSnapExisting(snap);
        const data = getSnapData(snap);

        if (exists && data) {
          return {
            id: data.id || sessionKey,
            sessionId: sessionKey,
            clientEmail: data.clientEmail || (sessionKey.includes('@') ? sessionKey : 'guest@ryvo.co'),
            clientName: data.clientName || sessionKey.split('@')[0] || 'عميل المتجر',
            clientPhone: data.clientPhone || '',
            country: data.country || 'SA',
            language: data.language || 'ar',
            device: data.device || 'Desktop',
            os: data.os || 'Windows',
            browser: data.browser || 'Chrome',
            ip: data.ip || '127.0.0.1',
            createdAt: data.createdAt || new Date().toISOString(),
            lastActive: data.lastActive || Date.now(),
            status: sanitizeStatus(data.status),
            ai_summary: data.ai_summary || '',
            transfer_reason: data.transfer_reason || '',
            messages: (data.messages || []).map(mapMessage)
          };
        }
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore getConversationById error:", fsErr?.message || fsErr);
    }
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      let selectRes: any = { rows: [] };
      if (isUuid(id)) {
        selectRes = await query(`SELECT * FROM conversations WHERE id = $1`, [id]);
      }
      if (selectRes.rows.length === 0) {
        selectRes = await query(
          `SELECT * FROM conversations WHERE user_id = $1 AND status != 'CLOSED' ORDER BY created_at DESC LIMIT 1`,
          [sessionKey]
        );
      }
      if (selectRes.rows.length > 0) {
        const dbConv = selectRes.rows[0];
        const msgRes = await query(`SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`, [dbConv.id]);
        return {
          id: dbConv.id,
          sessionId: dbConv.user_id,
          clientEmail: dbConv.user_id.includes('@') ? dbConv.user_id : 'guest@ryvo.co',
          clientName: dbConv.user_id.split('@')[0] || 'زائر',
          country: dbConv.metadata?.country || 'SA',
          language: dbConv.metadata?.language || 'ar',
          device: dbConv.metadata?.device || 'Desktop',
          os: dbConv.metadata?.os || 'Windows',
          browser: dbConv.metadata?.browser || 'Chrome',
          ip: dbConv.metadata?.ip || '127.0.0.1',
          createdAt: dbConv.created_at,
          lastActive: new Date(dbConv.updated_at).getTime(),
          status: sanitizeStatus(dbConv.status),
          ai_summary: dbConv.ai_summary || '',
          transfer_reason: dbConv.transfer_reason || '',
          messages: msgRes.rows.map(mapMessage)
        };
      }
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in getConversationById:", err.message);
    }
  }

  const localData = loadLocalConversations();
  const conv = localData[sessionKey] || null;
  if (conv) {
    conv.status = sanitizeStatus(conv.status);
  }
  return conv;
}

// Fetch all active conversations for the Agent / Admin Panel
export async function getConversationsForAgent() {
  const fDb = getFirestore();

  if (fDb) {
    try {
      const colRef = getColRef(fDb, "support_conversations");
      if (colRef) {
        const snap = await colRef.get();
        if (snap && snap.docs) {
          const list = snap.docs.map((docSnap: any) => {
            const d = docSnap.data();
            return {
              id: d.id || docSnap.id,
              sessionId: d.sessionId || docSnap.id,
              clientEmail: d.clientEmail || (docSnap.id.includes('@') ? docSnap.id : 'guest@ryvo.co'),
              clientName: d.clientName || docSnap.id.split('@')[0] || 'عميل المتجر',
              clientPhone: d.clientPhone || '',
              country: d.country || 'SA',
              language: d.language || 'ar',
              device: d.device || 'Desktop',
              os: d.os || 'Windows',
              browser: d.browser || 'Chrome',
              ip: d.ip || '127.0.0.1',
              createdAt: d.createdAt || new Date().toISOString(),
              lastActive: d.lastActive || Date.now(),
              status: sanitizeStatus(d.status),
              ai_summary: d.ai_summary || '',
              transfer_reason: d.transfer_reason || '',
              messages: (d.messages || []).map(mapMessage)
            };
          });
          list.sort((a: any, b: any) => (b.lastActive || 0) - (a.lastActive || 0));
          return list;
        }
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore getConversationsForAgent error:", fsErr.message);
    }
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      const res = await query(
        `SELECT * FROM conversations WHERE status IN ('QUEUED_FOR_HUMAN', 'HUMAN_HANDLING') ORDER BY updated_at DESC`
      );
      const conversations = [];
      for (const row of res.rows) {
        const msgRes = await query(
          `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
          [row.id]
        );
        conversations.push({
          id: row.id,
          sessionId: row.user_id,
          clientEmail: row.user_id.includes('@') ? row.user_id : 'guest@ryvo.co',
          clientName: row.user_id.split('@')[0] || 'زائر',
          country: row.metadata?.country || 'SA',
          language: row.metadata?.language || 'ar',
          device: row.metadata?.device || 'Desktop',
          os: row.metadata?.os || 'Windows',
          browser: row.metadata?.browser || 'Chrome',
          ip: row.metadata?.ip || '127.0.0.1',
          createdAt: row.created_at,
          lastActive: new Date(row.updated_at).getTime(),
          status: row.status,
          ai_summary: row.ai_summary || '',
          transfer_reason: row.transfer_reason || '',
          messages: msgRes.rows.map(mapMessage)
        });
      }
      return conversations;
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in getConversationsForAgent:", err.message);
    }
  }

  const localData = loadLocalConversations();
  return Object.values(localData).filter((conv: any) => 
    conv.status === 'QUEUED_FOR_HUMAN' || conv.status === 'HUMAN_HANDLING'
  );
}

// Update conversation status
export async function updateConversationStatus(id: string, status: string) {
  const cleanStatus = sanitizeStatus(status);
  const sessionKey = (id || '').toLowerCase().trim();
  const fDb = getFirestore();

  if (fDb) {
    try {
      const docRef = getDocRef(fDb, "support_conversations", sessionKey);
      if (docRef) {
        await docRef.set({
          status: cleanStatus,
          lastActive: Date.now(),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        const snap = await docRef.get();
        return snap.data();
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore updateConversationStatus error:", fsErr.message);
    }
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      let res: any = { rows: [] };
      if (isUuid(id)) {
        res = await query(
          `UPDATE conversations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
          [cleanStatus, id]
        );
      }
      if (res.rows.length === 0) {
        res = await query(
          `UPDATE conversations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND status != 'CLOSED' RETURNING *`,
          [cleanStatus, sessionKey]
        );
      }
      return res.rows[0] || null;
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in updateConversationStatus:", err.message);
    }
  }

  const localData = loadLocalConversations();
  if (localData[sessionKey]) {
    localData[sessionKey].status = cleanStatus;
    localData[sessionKey].lastActive = Date.now();
    saveLocalConversation(sessionKey, localData[sessionKey]);
    return localData[sessionKey];
  }
  return null;
}

// Update conversation AI summary
export async function updateConversationSummary(id: string, summary: string) {
  const sessionKey = (id || '').toLowerCase().trim();
  const fDb = getFirestore();

  if (fDb) {
    try {
      const docRef = getDocRef(fDb, "support_conversations", sessionKey);
      if (docRef) {
        await docRef.set({
          ai_summary: summary,
          lastActive: Date.now(),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        const snap = await docRef.get();
        return snap.data();
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore updateConversationSummary error:", fsErr.message);
    }
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      let res: any = { rows: [] };
      if (isUuid(id)) {
        res = await query(
          `UPDATE conversations SET ai_summary = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
          [summary, id]
        );
      }
      if (res.rows.length === 0) {
        res = await query(
          `UPDATE conversations SET ai_summary = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND status != 'CLOSED' RETURNING *`,
          [summary, sessionKey]
        );
      }
      return res.rows[0] || null;
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in updateConversationSummary:", err.message);
    }
  }

  const localData = loadLocalConversations();
  if (localData[sessionKey]) {
    localData[sessionKey].ai_summary = summary;
    localData[sessionKey].lastActive = Date.now();
    saveLocalConversation(sessionKey, localData[sessionKey]);
    return localData[sessionKey];
  }
  return null;
}

// Update conversation transfer reason
export async function updateConversationTransferReason(id: string, reason: string) {
  const sessionKey = (id || '').toLowerCase().trim();
  const fDb = getFirestore();

  if (fDb) {
    try {
      const docRef = getDocRef(fDb, "support_conversations", sessionKey);
      if (docRef) {
        await docRef.set({
          transfer_reason: reason,
          lastActive: Date.now(),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        const snap = await docRef.get();
        return snap.data();
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore updateConversationTransferReason error:", fsErr.message);
    }
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      try {
        await query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS transfer_reason TEXT`);
      } catch (_) {}

      let res: any = { rows: [] };
      if (isUuid(id)) {
        res = await query(
          `UPDATE conversations SET transfer_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
          [reason, id]
        );
      }
      if (res.rows.length === 0) {
        res = await query(
          `UPDATE conversations SET transfer_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND status != 'CLOSED' RETURNING *`,
          [reason, sessionKey]
        );
      }
      return res.rows[0] || null;
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in updateConversationTransferReason:", err.message);
    }
  }

  const localData = loadLocalConversations();
  if (localData[sessionKey]) {
    localData[sessionKey].transfer_reason = reason;
    localData[sessionKey].lastActive = Date.now();
    saveLocalConversation(sessionKey, localData[sessionKey]);
    return localData[sessionKey];
  }
  return null;
}

// Add a new message to a conversation
export async function addMessage(
  conversationId: string,
  senderType: 'customer' | 'ai' | 'agent' | 'system',
  messageType: 'text' | 'image' | 'audio' | 'file',
  content: string,
  isInternal: boolean = false
) {
  const sessionKey = (conversationId || 'guest@ryvo.co').toLowerCase().trim();
  const timestamp = Date.now();
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const newMsg = {
    id: `msg-${timestamp}-${Math.random().toString(36).substr(2, 5)}`,
    sender: senderType === 'customer' ? 'user' : 'support',
    sender_type: senderType,
    text: content,
    time: time,
    timestamp: timestamp,
    isInternal: isInternal,
    attachment: messageType !== 'text' ? {
      name: content.split('/').pop() || 'file',
      url: content,
      type: messageType
    } : undefined
  };

  // 1. Save to Firestore
  const fDb = getFirestore();
  if (fDb) {
    try {
      const docRef = getDocRef(fDb, "support_conversations", sessionKey);
      if (docRef) {
        const snap = await docRef.get();
        const exists = isSnapExisting(snap);
        const data = getSnapData(snap);

        if (exists && data) {
          const existingMessages = data.messages || [];
          const updatedMessages = [...existingMessages, newMsg];
          await docRef.set({
            messages: updatedMessages,
            lastActive: timestamp,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } else {
          await docRef.set({
            id: sessionKey,
            sessionId: sessionKey,
            clientEmail: sessionKey.includes('@') ? sessionKey : 'guest@ryvo.co',
            clientName: sessionKey.split('@')[0] || 'عميل رايفو',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastActive: timestamp,
            status: 'AI_HANDLING',
            messages: [newMsg]
          });
        }
        return newMsg;
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore addMessage error:", fsErr?.message || fsErr);
    }
  }

  // 2. Save to PostgreSQL
  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      let actualConvId = conversationId;
      if (!isUuid(conversationId)) {
        const convRes = await query(
          `SELECT id FROM conversations WHERE user_id = $1 AND status != 'CLOSED' LIMIT 1`,
          [sessionKey]
        );
        if (convRes.rows.length > 0) {
          actualConvId = convRes.rows[0].id;
        } else {
          const newConv = await getOrCreateConversation(conversationId);
          actualConvId = newConv.id;
        }
      }

      const res = await query(
        `INSERT INTO messages (conversation_id, sender_type, message_type, content, is_internal) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [actualConvId, senderType, messageType, content, isInternal]
      );

      await query(
        `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [actualConvId]
      );

      return mapMessage(res.rows[0]);
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in addMessage:", err.message);
    }
  }

  // 3. Fallback Local JSON
  const localData = loadLocalConversations();
  const conversation = localData[sessionKey];
  if (conversation) {
    conversation.messages.push(newMsg);
    conversation.lastActive = timestamp;
    saveLocalConversation(sessionKey, conversation);
    return newMsg;
  }
  return newMsg;
}

// Support Operations Logging
export async function addSupportLog(action: string, operator: string) {
  const timestamp = new Date().toISOString();
  const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const logEntry = { id: logId, action, operator, created_at: timestamp, timestamp: Date.now() };

  const fDb = getFirestore();
  if (fDb) {
    try {
      const docRef = getDocRef(fDb, "support_operations_logs", logId);
      if (docRef) {
        await docRef.set(logEntry);
        return;
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore addSupportLog error:", fsErr.message);
    }
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      await query(`CREATE TABLE IF NOT EXISTS support_operations_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        action TEXT NOT NULL,
        operator VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`);
      await query(
        `INSERT INTO support_operations_logs (action, operator) VALUES ($1, $2)`,
        [action, operator]
      );
      return;
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in addSupportLog:", err.message);
    }
  }

  const logs = loadLocalLogs();
  logs.unshift(logEntry);
  saveLocalLogs(logs.slice(0, 500));
}

export async function getSupportLogs() {
  const fDb = getFirestore();
  if (fDb) {
    try {
      const colRef = getColRef(fDb, "support_operations_logs");
      if (colRef) {
        const snap = await colRef.get();
        if (snap && snap.docs) {
          const logs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
          logs.sort((a: any, b: any) => (b.timestamp || new Date(b.created_at).getTime() || 0) - (a.timestamp || new Date(a.created_at).getTime() || 0));
          return logs.slice(0, 200);
        }
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore getSupportLogs error:", fsErr.message);
    }
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      await query(`CREATE TABLE IF NOT EXISTS support_operations_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        action TEXT NOT NULL,
        operator VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`);
      const res = await query(
        `SELECT * FROM support_operations_logs ORDER BY created_at DESC LIMIT 200`
      );
      return res.rows;
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in getSupportLogs:", err.message);
    }
  }

  return loadLocalLogs();
}

// Continuous Learning (Knowledge suggestions)
export async function addKnowledgeSuggestion(question: string, answer: string) {
  const timestamp = new Date().toISOString();
  const sugId = `know_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const sugEntry = {
    id: sugId,
    question: question.trim(),
    answer: answer.trim(),
    status: 'PENDING',
    created_at: timestamp,
    timestamp: Date.now()
  };

  const fDb = getFirestore();
  if (fDb) {
    try {
      const docRef = getDocRef(fDb, "knowledge_suggestions", sugId);
      if (docRef) {
        await docRef.set(sugEntry);
        return;
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore addKnowledgeSuggestion error:", fsErr.message);
    }
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      await query(`CREATE TABLE IF NOT EXISTS knowledge_suggestions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`);
      const check = await query(`SELECT id FROM knowledge_suggestions WHERE LOWER(question) = LOWER($1)`, [question.trim()]);
      if (check.rows.length === 0) {
        await query(
          `INSERT INTO knowledge_suggestions (question, answer, status) VALUES ($1, $2, 'PENDING')`,
          [question.trim(), answer.trim()]
        );
      }
      return;
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in addKnowledgeSuggestion:", err.message);
    }
  }

  const suggestions = loadLocalKnowledge();
  const exists = suggestions.some((s: any) => s.question.toLowerCase().trim() === question.toLowerCase().trim());
  if (!exists) {
    suggestions.push(sugEntry);
    saveLocalKnowledge(suggestions);
  }
}

export async function approveKnowledgeSuggestion(id: string) {
  await addSupportLog(`Approved knowledge base suggestion #${id}`, 'Admin');
  const fDb = getFirestore();

  if (fDb) {
    try {
      const docRef = getDocRef(fDb, "knowledge_suggestions", id);
      if (docRef) {
        await docRef.update({
          status: 'APPROVED',
          updatedAt: new Date().toISOString()
        });
        return;
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore approveKnowledgeSuggestion error:", fsErr.message);
    }
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      await query(`UPDATE knowledge_suggestions SET status = 'APPROVED' WHERE id = $1`, [id]);
      return;
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in approveKnowledgeSuggestion:", err.message);
    }
  }

  const suggestions = loadLocalKnowledge();
  const item = suggestions.find((s: any) => s.id === id);
  if (item) {
    item.status = 'APPROVED';
    saveLocalKnowledge(suggestions);
  }
}

export async function rejectKnowledgeSuggestion(id: string) {
  await addSupportLog(`Rejected knowledge base suggestion #${id}`, 'Admin');
  const fDb = getFirestore();

  if (fDb) {
    try {
      const docRef = getDocRef(fDb, "knowledge_suggestions", id);
      if (docRef) {
        await docRef.update({
          status: 'REJECTED',
          updatedAt: new Date().toISOString()
        });
        return;
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore rejectKnowledgeSuggestion error:", fsErr.message);
    }
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      await query(`UPDATE knowledge_suggestions SET status = 'REJECTED' WHERE id = $1`, [id]);
      return;
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in rejectKnowledgeSuggestion:", err.message);
    }
  }

  const suggestions = loadLocalKnowledge();
  const item = suggestions.find((s: any) => s.id === id);
  if (item) {
    item.status = 'REJECTED';
    saveLocalKnowledge(suggestions);
  }
}

export async function getKnowledgeSuggestions() {
  const fDb = getFirestore();
  if (fDb) {
    try {
      const colRef = getColRef(fDb, "knowledge_suggestions");
      if (colRef) {
        const snap = await colRef.get();
        if (snap && snap.docs) {
          const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
          list.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
          return list;
        }
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore getKnowledgeSuggestions error:", fsErr.message);
    }
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      await query(`CREATE TABLE IF NOT EXISTS knowledge_suggestions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`);
      const res = await query(`SELECT * FROM knowledge_suggestions ORDER BY created_at DESC`);
      return res.rows;
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in getKnowledgeSuggestions:", err.message);
    }
  }

  return loadLocalKnowledge();
}

export async function getApprovedKnowledge() {
  const fDb = getFirestore();
  if (fDb) {
    try {
      const colRef = getColRef(fDb, "knowledge_suggestions");
      if (colRef) {
        const snap = await colRef.get();
        if (snap && snap.docs) {
          return snap.docs
            .map((d: any) => ({ id: d.id, ...d.data() }))
            .filter((s: any) => s.status === 'APPROVED');
        }
      }
    } catch (fsErr: any) {
      console.warn("⚠️ [Support Service] Firestore getApprovedKnowledge error:", fsErr.message);
    }
  }

  const dbStatus = getDbStatus();
  if (dbStatus.connected) {
    try {
      await query(`CREATE TABLE IF NOT EXISTS knowledge_suggestions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`);
      const res = await query(`SELECT * FROM knowledge_suggestions WHERE status = 'APPROVED'`);
      return res.rows;
    } catch (err: any) {
      console.warn("⚠️ PostgreSQL error in getApprovedKnowledge:", err.message);
    }
  }

  return loadLocalKnowledge().filter((s: any) => s.status === 'APPROVED');
}
