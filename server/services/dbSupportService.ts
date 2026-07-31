import { query, getDbStatus } from '../db';
import fs from 'fs';
import path from 'path';

const LOCAL_CONVERSATIONS_FILE = path.join(process.cwd(), 'support_conversations.json');

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

// Map PostgreSQL message to frontend compatible message
function mapMessage(msg: any) {
  return {
    id: msg.id,
    sender: msg.sender_type === 'customer' ? 'user' : 'support',
    sender_type: msg.sender_type,
    text: msg.content,
    time: new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timestamp: new Date(msg.created_at).getTime(),
    isInternal: msg.is_internal,
    attachment: msg.message_type !== 'text' ? {
      name: msg.content.split('/').pop() || 'file',
      url: msg.content,
      type: msg.message_type
    } : undefined
  };
}

// Helper to normalize and sanitize conversation status
const LEGACY_INVALID_STATUSES = ['waiting_for_human', 'queued', 'pending', 'human_support', 'escalated', 'waiting', 'active_ai', 'ai', 'queued_for_human'];

function sanitizeStatus(status: string): string {
  if (!status || LEGACY_INVALID_STATUSES.includes(status.toLowerCase())) {
    return 'AI_HANDLING';
  }
  return status;
}

// Get active conversation for a user session
export async function getOrCreateConversation(sessionId: string, clientMetadata: any = {}) {
  const sessionKey = sessionId.toLowerCase().trim();
  const dbStatus = getDbStatus();

  if (!dbStatus.connected) {
    // Fallback mode
    const localData = loadLocalConversations();
    if (localData[sessionKey]) {
      const sanitized = sanitizeStatus(localData[sessionKey].status);
      if (sanitized !== localData[sessionKey].status) {
        console.log(`🧹 [LOCAL_CLEANUP] Cleaned legacy status "${localData[sessionKey].status}" -> "AI_HANDLING" for ${sessionKey}`);
        localData[sessionKey].status = 'AI_HANDLING';
        saveLocalConversation(sessionKey, localData[sessionKey]);
      }
      return localData[sessionKey];
    }
    // Create new local conversation
    const newConv = {
      id: sessionKey,
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
      messages: []
    };
    saveLocalConversation(sessionKey, newConv);
    return newConv;
  }

  try {
    // Find active (non-closed) conversation for this user session
    const selectRes = await query(
      `SELECT * FROM conversations WHERE user_id = $1 AND status != 'CLOSED' ORDER BY created_at DESC LIMIT 1`,
      [sessionKey]
    );

    let dbConv;
    if (selectRes.rows.length > 0) {
      dbConv = selectRes.rows[0];
      const sanitized = sanitizeStatus(dbConv.status);
      if (sanitized !== dbConv.status) {
        console.log(`🧹 [DB_CLEANUP] Cleaned legacy status "${dbConv.status}" -> "AI_HANDLING" for conversation ${dbConv.id}`);
        await query(`UPDATE conversations SET status = 'AI_HANDLING', updated_at = NOW() WHERE id = $1`, [dbConv.id]);
        dbConv.status = 'AI_HANDLING';
      }
    } else {
      // Create new conversation
      const insertRes = await query(
        `INSERT INTO conversations (user_id, status, metadata) VALUES ($1, 'AI_HANDLING', $2) RETURNING *`,
        [sessionKey, JSON.stringify(clientMetadata)]
      );
      dbConv = insertRes.rows[0];
    }

    // Fetch messages for this conversation
    const msgRes = await query(
      `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [dbConv.id]
    );

    const messages = msgRes.rows.map(mapMessage);

    // Map to frontend expected object format
    return {
      id: dbConv.id, // UUID
      sessionId: sessionKey, // email/guest ID
      clientEmail: sessionKey.includes('@') ? sessionKey : 'guest@ryvo.co',
      clientName: sessionKey.split('@')[0] || 'زائر',
      clientPhone: clientMetadata.phone || '',
      country: dbConv.metadata.country || 'SA',
      language: dbConv.metadata.language || 'ar',
      device: dbConv.metadata.device || 'Desktop',
      os: dbConv.metadata.os || 'Windows',
      browser: dbConv.metadata.browser || 'Chrome',
      ip: dbConv.metadata.ip || '127.0.0.1',
      createdAt: dbConv.created_at,
      lastActive: new Date(dbConv.updated_at).getTime(),
      status: sanitizeStatus(dbConv.status),
      ai_summary: dbConv.ai_summary,
      messages: messages
    };
  } catch (err: any) {
    console.error("Error in getOrCreateConversation:", err.message);
    // Fall back to local file if SQL errors out
    const localData = loadLocalConversations();
    return localData[sessionKey] || null;
  }
}

function isUuid(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

// Get a single conversation by UUID or local session ID
export async function getConversationById(id: string) {
  const dbStatus = getDbStatus();
  if (!dbStatus.connected) {
    const localData = loadLocalConversations();
    const conv = localData[id.toLowerCase().trim()] || null;
    if (conv) {
      conv.status = sanitizeStatus(conv.status);
    }
    return conv;
  }

  try {
    let selectRes: any = { rows: [] };
    if (isUuid(id)) {
      selectRes = await query(`SELECT * FROM conversations WHERE id = $1`, [id]);
    }
    if (selectRes.rows.length === 0) {
      // Check if it's user_id instead of UUID
      const selectUserRes = await query(
        `SELECT * FROM conversations WHERE user_id = $1 AND status != 'CLOSED' ORDER BY created_at DESC LIMIT 1`,
        [id.toLowerCase().trim()]
      );
      if (selectUserRes.rows.length === 0) return null;
      selectRes = selectUserRes;
    }

    const dbConv = selectRes.rows[0];
    const sanitized = sanitizeStatus(dbConv.status);
    if (sanitized !== dbConv.status) {
      console.log(`🧹 [DB_CLEANUP] Cleaned legacy status "${dbConv.status}" -> "AI_HANDLING" for conversation ${dbConv.id}`);
      await query(`UPDATE conversations SET status = 'AI_HANDLING', updated_at = NOW() WHERE id = $1`, [dbConv.id]);
      dbConv.status = 'AI_HANDLING';
    }

    const msgRes = await query(`SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`, [dbConv.id]);
    const messages = msgRes.rows.map(mapMessage);

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
      status: sanitized,
      ai_summary: dbConv.ai_summary || '',
      transfer_reason: dbConv.transfer_reason || dbConv.metadata?.transfer_reason || '',
      messages: messages
    };
  } catch (err: any) {
    console.error("Error in getConversationById:", err.message);
    const localData = loadLocalConversations();
    return localData[id.toLowerCase().trim()] || null;
  }
}

// Fetch only conversations that are QUEUED_FOR_HUMAN or HUMAN_HANDLING for the Agent Panel
export async function getConversationsForAgent() {
  const dbStatus = getDbStatus();
  if (!dbStatus.connected) {
    // Fallback: filter local conversations by status
    const localData = loadLocalConversations();
    return Object.values(localData).filter((conv: any) => 
      conv.status === 'QUEUED_FOR_HUMAN' || conv.status === 'HUMAN_HANDLING'
    );
  }

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
      const messages = msgRes.rows.map(mapMessage);
      
      conversations.push({
        id: row.id,
        sessionId: row.user_id,
        clientEmail: row.user_id.includes('@') ? row.user_id : 'guest@ryvo.co',
        clientName: row.user_id.split('@')[0] || 'زائر',
        country: row.metadata.country || 'SA',
        language: row.metadata.language || 'ar',
        device: row.metadata.device || 'Desktop',
        os: row.metadata.os || 'Windows',
        browser: row.metadata.browser || 'Chrome',
        ip: row.metadata.ip || '127.0.0.1',
        createdAt: row.created_at,
        lastActive: new Date(row.updated_at).getTime(),
        status: row.status,
        ai_summary: row.ai_summary,
        transfer_reason: row.transfer_reason || row.metadata?.transfer_reason || '',
        messages: messages
      });
    }
    return conversations;
  } catch (err: any) {
    console.error("Error in getConversationsForAgent:", err.message);
    const localData = loadLocalConversations();
    return Object.values(localData).filter((conv: any) => 
      conv.status === 'QUEUED_FOR_HUMAN' || conv.status === 'HUMAN_HANDLING'
    );
  }
}

// Update conversation status
export async function updateConversationStatus(id: string, status: string) {
  const cleanStatus = sanitizeStatus(status);
  const dbStatus = getDbStatus();
  if (!dbStatus.connected) {
    const localData = loadLocalConversations();
    const sessionKey = id.toLowerCase().trim();
    if (localData[sessionKey]) {
      localData[sessionKey].status = cleanStatus;
      localData[sessionKey].lastActive = Date.now();
      saveLocalConversation(sessionKey, localData[sessionKey]);
      return localData[sessionKey];
    }
    return null;
  }

  try {
    let res: any = { rows: [] };
    if (isUuid(id)) {
      res = await query(
        `UPDATE conversations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
        [cleanStatus, id]
      );
    }
    if (res.rows.length === 0) {
      // Check if ID is user_id session key
      const resUser = await query(
        `UPDATE conversations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND status != 'CLOSED' RETURNING *`,
        [cleanStatus, id.toLowerCase().trim()]
      );
      return resUser.rows[0] || null;
    }
    return res.rows[0];
  } catch (err: any) {
    console.error("Error in updateConversationStatus:", err.message);
    return null;
  }
}

// Update conversation AI summary
export async function updateConversationSummary(id: string, summary: string) {
  const dbStatus = getDbStatus();
  if (!dbStatus.connected) {
    const localData = loadLocalConversations();
    const sessionKey = id.toLowerCase().trim();
    if (localData[sessionKey]) {
      localData[sessionKey].ai_summary = summary;
      localData[sessionKey].lastActive = Date.now();
      saveLocalConversation(sessionKey, localData[sessionKey]);
      return localData[sessionKey];
    }
    return null;
  }

  try {
    let res: any = { rows: [] };
    if (isUuid(id)) {
      res = await query(
        `UPDATE conversations SET ai_summary = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
        [summary, id]
      );
    }
    if (res.rows.length === 0) {
      const resUser = await query(
        `UPDATE conversations SET ai_summary = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND status != 'CLOSED' RETURNING *`,
        [summary, id.toLowerCase().trim()]
      );
      return resUser.rows[0] || null;
    }
    return res.rows[0];
  } catch (err: any) {
    console.error("Error in updateConversationSummary:", err.message);
    return null;
  }
}

// Update conversation transfer reason
export async function updateConversationTransferReason(id: string, reason: string) {
  const dbStatus = getDbStatus();
  const sessionKey = id.toLowerCase().trim();

  if (!dbStatus.connected) {
    const localData = loadLocalConversations();
    if (localData[sessionKey]) {
      localData[sessionKey].transfer_reason = reason;
      localData[sessionKey].lastActive = Date.now();
      saveLocalConversation(sessionKey, localData[sessionKey]);
      return localData[sessionKey];
    }
    return null;
  }

  try {
    // Ensure column exists in conversations table if PostgreSQL is connected
    try {
      await query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS transfer_reason TEXT`);
    } catch (e: any) {
      // Ignore if column exists or schema altered
    }

    let res: any = { rows: [] };
    if (isUuid(id)) {
      res = await query(
        `UPDATE conversations SET transfer_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
        [reason, id]
      );
    }
    if (res.rows.length === 0) {
      const resUser = await query(
        `UPDATE conversations SET transfer_reason = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND status != 'CLOSED' RETURNING *`,
        [reason, sessionKey]
      );
      return resUser.rows[0] || null;
    }
    return res.rows[0];
  } catch (err: any) {
    console.error("Error in updateConversationTransferReason:", err.message);
    return null;
  }
}

// Add a new message to a conversation
export async function addMessage(
  conversationId: string,
  senderType: 'customer' | 'ai' | 'agent' | 'system',
  messageType: 'text' | 'image' | 'audio' | 'file',
  content: string,
  isInternal: boolean = false
) {
  const dbStatus = getDbStatus();

  if (!dbStatus.connected) {
    const localData = loadLocalConversations();
    const sessionKey = conversationId.toLowerCase().trim();
    const conversation = localData[sessionKey];
    if (conversation) {
      const newMsg = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        sender: senderType === 'customer' ? 'user' : 'support',
        sender_type: senderType,
        text: content,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        isInternal: isInternal,
        attachment: messageType !== 'text' ? {
          name: content.split('/').pop() || 'file',
          url: content,
          type: messageType
        } : undefined
      };
      conversation.messages.push(newMsg);
      conversation.lastActive = Date.now();
      saveLocalConversation(sessionKey, conversation);
      return newMsg;
    }
    return null;
  }

  try {
    // Resolve conversation ID if it's user_id session key
    let actualConvId = conversationId;
    if (!isUuid(conversationId)) {
      const convRes = await query(
        `SELECT id FROM conversations WHERE user_id = $1 AND status != 'CLOSED' LIMIT 1`,
        [conversationId.toLowerCase().trim()]
      );
      if (convRes.rows.length > 0) {
        actualConvId = convRes.rows[0].id;
      } else {
        // Create conversation first if not exists
        const newConv = await getOrCreateConversation(conversationId);
        actualConvId = newConv.id;
      }
    }

    const res = await query(
      `INSERT INTO messages (conversation_id, sender_type, message_type, content, is_internal) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [actualConvId, senderType, messageType, content, isInternal]
    );

    // Update conversation's updated_at
    await query(
      `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [actualConvId]
    );

    return mapMessage(res.rows[0]);
  } catch (err: any) {
    console.error("Error in addMessage:", err.message);
    return null;
  }
}

// --- Continuous Learning & Support Log Helpers ---
const KNOWLEDGE_FILE = path.join(process.cwd(), 'support_knowledge.json');
const LOGS_FILE = path.join(process.cwd(), 'support_operations_logs.json');

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

// Support Operations Logging
export async function addSupportLog(action: string, operator: string) {
  const dbStatus = getDbStatus();
  const timestamp = new Date().toISOString();
  
  if (!dbStatus.connected) {
    const logs = loadLocalLogs();
    logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      action,
      operator,
      created_at: timestamp
    });
    saveLocalLogs(logs.slice(0, 500)); // limit to last 500 logs
    return;
  }
  
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
  } catch (err: any) {
    console.error("Error in addSupportLog DB:", err.message);
    const logs = loadLocalLogs();
    logs.unshift({
      id: `log-${Date.now()}`,
      action,
      operator,
      created_at: timestamp
    });
    saveLocalLogs(logs);
  }
}

export async function getSupportLogs() {
  const dbStatus = getDbStatus();
  if (!dbStatus.connected) {
    return loadLocalLogs();
  }
  
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
    console.error("Error in getSupportLogs DB:", err.message);
    return loadLocalLogs();
  }
}

// Continuous Learning (Knowledge suggestions)
export async function addKnowledgeSuggestion(question: string, answer: string) {
  const dbStatus = getDbStatus();
  const timestamp = new Date().toISOString();
  
  if (!dbStatus.connected) {
    const suggestions = loadLocalKnowledge();
    const exists = suggestions.some((s: any) => s.question.toLowerCase().trim() === question.toLowerCase().trim());
    if (exists) return;
    
    suggestions.push({
      id: `know-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      question,
      answer,
      status: 'PENDING',
      created_at: timestamp
    });
    saveLocalKnowledge(suggestions);
    return;
  }
  
  try {
    await query(`CREATE TABLE IF NOT EXISTS knowledge_suggestions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`);
    const check = await query(`SELECT id FROM knowledge_suggestions WHERE LOWER(question) = LOWER($1)`, [question.trim()]);
    if (check.rows.length > 0) return;
    
    await query(
      `INSERT INTO knowledge_suggestions (question, answer, status) VALUES ($1, $2, 'PENDING')`,
      [question.trim(), answer.trim()]
    );
  } catch (err: any) {
    console.error("Error in addKnowledgeSuggestion DB:", err.message);
    const suggestions = loadLocalKnowledge();
    suggestions.push({
      id: `know-${Date.now()}`,
      question,
      answer,
      status: 'PENDING',
      created_at: timestamp
    });
    saveLocalKnowledge(suggestions);
  }
}

export async function approveKnowledgeSuggestion(id: string) {
  const dbStatus = getDbStatus();
  await addSupportLog(`Approved knowledge base suggestion #${id}`, 'Admin');
  
  if (!dbStatus.connected) {
    const suggestions = loadLocalKnowledge();
    const item = suggestions.find((s: any) => s.id === id);
    if (item) {
      item.status = 'APPROVED';
      saveLocalKnowledge(suggestions);
    }
    return;
  }
  
  try {
    await query(
      `UPDATE knowledge_suggestions SET status = 'APPROVED' WHERE id = $1`,
      [id]
    );
  } catch (err: any) {
    console.error("Error in approveKnowledgeSuggestion DB:", err.message);
    const suggestions = loadLocalKnowledge();
    const item = suggestions.find((s: any) => s.id === id);
    if (item) {
      item.status = 'APPROVED';
      saveLocalKnowledge(suggestions);
    }
  }
}

export async function rejectKnowledgeSuggestion(id: string) {
  const dbStatus = getDbStatus();
  await addSupportLog(`Rejected knowledge base suggestion #${id}`, 'Admin');
  
  if (!dbStatus.connected) {
    const suggestions = loadLocalKnowledge();
    const item = suggestions.find((s: any) => s.id === id);
    if (item) {
      item.status = 'REJECTED';
      saveLocalKnowledge(suggestions);
    }
    return;
  }
  
  try {
    await query(
      `UPDATE knowledge_suggestions SET status = 'REJECTED' WHERE id = $1`,
      [id]
    );
  } catch (err: any) {
    console.error("Error in rejectKnowledgeSuggestion DB:", err.message);
    const suggestions = loadLocalKnowledge();
    const item = suggestions.find((s: any) => s.id === id);
    if (item) {
      item.status = 'REJECTED';
      saveLocalKnowledge(suggestions);
    }
  }
}

export async function getKnowledgeSuggestions() {
  const dbStatus = getDbStatus();
  if (!dbStatus.connected) {
    return loadLocalKnowledge();
  }
  
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
    console.error("Error in getKnowledgeSuggestions DB:", err.message);
    return loadLocalKnowledge();
  }
}

export async function getApprovedKnowledge() {
  const dbStatus = getDbStatus();
  if (!dbStatus.connected) {
    return loadLocalKnowledge().filter((s: any) => s.status === 'APPROVED');
  }
  
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
    console.error("Error in getApprovedKnowledge DB:", err.message);
    return loadLocalKnowledge().filter((s: any) => s.status === 'APPROVED');
  }
}

