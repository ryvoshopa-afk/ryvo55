import { Server, Socket } from 'socket.io';
import * as path from 'path';
import * as fs from 'fs';
import { 
  getOrCreateConversation, 
  addMessage, 
  updateConversationStatus, 
  updateConversationSummary,
  addSupportLog
} from './services/dbSupportService';
import { 
  generateAIResponse, 
  generateSmartSummary,
  transcribeAudio
} from './services/aiSupportService';
import { sendAdminSupportRequestNotification } from './services/emailService';

export const connectedAdmins = new Set<string>();

import { doc, setDoc, logFirestoreError } from "./services/firestoreLayer";

export function isAnyAdminOnline(): boolean {
  return connectedAdmins.size > 0;
}

let globalDb: any = null;
let globalSettingsProvider: (() => any) | null = null;

export function setSocketDbAndSettings(db: any, settingsProvider?: () => any) {
  globalDb = db;
  if (settingsProvider) globalSettingsProvider = settingsProvider;
}

export function initSockets(io: Server, dbInstance?: any, settingsProvider?: () => any) {
  if (dbInstance) globalDb = dbInstance;
  if (settingsProvider) globalSettingsProvider = settingsProvider;
  console.log("🔌 Initializing Socket.io Event Listeners...");

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Join a support conversation room
    socket.on('join_conversation', async ({ sessionId, isAdmin }) => {
      if (!sessionId) return;
      const cleanSessionId = sessionId.toLowerCase().trim();
      const roomName = `conversation_${cleanSessionId}`;
      socket.join(roomName);
      console.log(`👤 Client ${socket.id} joined room ${roomName} (isAdmin: ${isAdmin})`);

      // Determine if the connecting client is an admin
      const isActuallyAdmin = !!isAdmin || cleanSessionId === 'ryvo.shopa@gmail.com';

      if (isActuallyAdmin) {
        socket.join('agents_room');
        socket.data.isAdmin = true;
        connectedAdmins.add(socket.id);
        console.log(`🔑 Admin ${socket.id} joined agents_room. Total connected admins: ${connectedAdmins.size}`);

        // Broadcast to everyone that an admin is online
        io.emit('support:online');
        io.emit('support_status', { isAgentOnline: true });
      }
    });

    // Handle incoming messages
    socket.on('send_message', async (payload) => {
      let { sessionId, sender, text, attachment, isInternal } = payload;
      if (!sessionId) return;

      const cleanSessionId = sessionId.toLowerCase().trim();
      const clientRoom = `conversation_${cleanSessionId}`;

      // 1. Fetch current conversation status
      let conversation = await getOrCreateConversation(cleanSessionId);
      if (!conversation) {
        console.error(`Could not find or create conversation for ${cleanSessionId}`);
        return;
      }

      let msgType: 'text' | 'image' | 'audio' | 'file' = 'text';
      if (attachment?.type?.startsWith('image/')) {
        msgType = 'image';
      } else if (attachment?.type?.startsWith('audio/')) {
        msgType = 'audio';
      } else if (attachment) {
        msgType = 'file';
      }

      // Handle Voice Transcription
      if (msgType === 'audio' && attachment?.url) {
        try {
          const filePath = path.join(process.cwd(), 'public', attachment.url);
          if (fs.existsSync(filePath)) {
            const fileBuffer = fs.readFileSync(filePath);
            const mimeType = attachment.type;
            const transcription = await transcribeAudio(fileBuffer, mimeType);
            
            // Set transciption as the text representation
            text = transcription;
            payload.text = transcription;
            console.log(`🎙️ Voice transcibed successfully: "${transcription}"`);
          }
        } catch (err: any) {
          console.error("Failed to transcribe voice clip:", err.message);
        }
      }

      const content = attachment ? attachment.url : text;

      // 2. AI Gateway Guard checking
      if (sender === 'user') {
        console.log(`[STEP 1] Message received: "${text || ''}" from session ${cleanSessionId}`);
        console.log(`Before sanitize:\nconversation.status = "${conversation.status}"`);

        // If conversation is in legacy or queued state (and not HUMAN_HANDLING), auto-reset to AI_HANDLING when user sends a message
        if (conversation.status !== 'HUMAN_HANDLING' && conversation.status !== 'PENDING_CUSTOMER_APPROVAL') {
          if (conversation.status !== 'AI_HANDLING') {
            await updateConversationStatus(conversation.id, 'AI_HANDLING');
            conversation.status = 'AI_HANDLING';
          }
        }

        console.log(`After sanitize:\nconversation.status = "${conversation.status}"`);
        console.log(`[STEP 2] Check conversation status: "${conversation.status}"`);

        if (conversation.status === 'AI_HANDLING' || conversation.status === 'PENDING_CUSTOMER_APPROVAL') {
          // Save and broadcast customer message to client only
          const savedUserMsg = await addMessage(conversation.id, 'customer', msgType, content, false);
          if (savedUserMsg) {
            io.to(clientRoom).emit('message_received', savedUserMsg);
          }

          // Update conversation object with the new user message locally so Gemini has it in context
          conversation.messages.push({
            id: savedUserMsg?.id || `temp-${Date.now()}`,
            sender: 'user',
            text: text,
            attachment: attachment
          });

          // Show typing indicator for AI
          io.to(clientRoom).emit('typing_status', { sender: 'support', isTyping: true });

          console.log(`[STEP 3] Check if user requested human support`);
          console.log(`[STEP 4] Call Gemini`);

          const aiReply = await generateAIResponse(conversation, text || '', attachment);
          
          console.log(`[STEP 5] Gemini response received`);

          // Stop typing indicator
          io.to(clientRoom).emit('typing_status', { sender: 'support', isTyping: false });

          let cleanAiReply = aiReply;
          let shouldTransfer = false;

          if (aiReply.includes('[TRANSFER_TO_AGENT]')) {
            shouldTransfer = true;
            cleanAiReply = aiReply.replace('[TRANSFER_TO_AGENT]', '').trim();
          }

          // Save AI message to DB
          const savedAiMsg = await addMessage(conversation.id, 'ai', 'text', cleanAiReply, false);
          if (savedAiMsg) {
            console.log(`[STEP 6] Send AI response`);
            io.to(clientRoom).emit('message_received', savedAiMsg);
          }

          if (shouldTransfer) {
            const reason = conversation.transfer_reason || "استدعت حالة المحادثة تحويلاً للدعم البشري";
            console.log("Escalating to human support. Reason:", reason);
            console.log("[STEP X] Escalating to human support. Reason:", reason);

            // Transition to PENDING_CUSTOMER_APPROVAL
            await updateConversationStatus(conversation.id, 'PENDING_CUSTOMER_APPROVAL');
            
            // Add AI message to conversation for summary context
            conversation.messages.push({
              id: savedAiMsg?.id || `temp-ai-${Date.now()}`,
              sender: 'support',
              text: cleanAiReply
            });

            // Generate smart summary
            const summary = await generateSmartSummary(conversation, reason);
            await updateConversationSummary(conversation.id, summary);

            // Emit status update to customer room only
            io.to(clientRoom).emit('status_updated', { status: 'PENDING_CUSTOMER_APPROVAL', ai_summary: summary });
          } else {
            if (conversation.status !== 'AI_HANDLING') {
              await updateConversationStatus(conversation.id, 'AI_HANDLING');
              io.to(clientRoom).emit('status_updated', { status: 'AI_HANDLING' });
            }
          }
          console.log(`[STEP 7] Return`);

        } else {
          // Conversation is handled by a human or queued for human
          const savedUserMsg = await addMessage(conversation.id, 'customer', msgType, content, false);
          if (savedUserMsg) {
            io.to(clientRoom).emit('message_received', savedUserMsg);
            
            // Only send to agents if queued or active human handling
            if (conversation.status !== 'PENDING_CUSTOMER_APPROVAL') {
              io.to('agents_room').emit('agent_message_received', { sessionId: cleanSessionId, message: savedUserMsg });
            }
          }
        }
      } 
      else if (sender === 'support') {
        // Agent sending message
        const isNote = !!isInternal;
        const savedAgentMsg = await addMessage(conversation.id, 'agent', msgType, content, isNote);
        
        if (savedAgentMsg) {
          if (isNote) {
            // Internal note: ONLY emit to agent screen, NOT customer screen!
            io.to('agents_room').emit('agent_message_received', { sessionId: cleanSessionId, message: savedAgentMsg });
          } else {
            // Normal message: emit to both customer and agent
            io.to(clientRoom).emit('message_received', savedAgentMsg);
            io.to('agents_room').emit('agent_message_received', { sessionId: cleanSessionId, message: savedAgentMsg });
          }
          
          // Log operations
          await addSupportLog(`Agent sent a message of type ${msgType} (isNote: ${isNote})`, 'Agent');
        }

        // If status was QUEUED_FOR_HUMAN, change to HUMAN_HANDLING when agent replies
        if (conversation.status === 'QUEUED_FOR_HUMAN') {
          await updateConversationStatus(conversation.id, 'HUMAN_HANDLING');
          io.to(clientRoom).emit('status_updated', { status: 'HUMAN_HANDLING' });
          io.to('agents_room').emit('agent_status_updated', { sessionId: cleanSessionId, status: 'HUMAN_HANDLING' });
          await addSupportLog(`Conversation status updated to HUMAN_HANDLING upon agent reply`, 'System');
        }
      }
    });

    // Helper function to process support request escalation
    const processSupportRequest = async (payload: {
      sessionId: string;
      userName?: string;
      userEmail?: string;
      userPhone?: string;
      reason?: string;
      message?: string;
      aiSummary?: string;
      metadata?: any;
    }) => {
      const cleanSessionId = payload.sessionId.toLowerCase().trim();
      const clientRoom = `conversation_${cleanSessionId}`;
      
      let conversation = await getOrCreateConversation(cleanSessionId);
      if (!conversation) return null;

      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const clientName = payload.userName || conversation.clientName || 'عميل المتجر';
      const clientEmail = payload.userEmail || conversation.clientEmail || cleanSessionId;
      const clientPhone = payload.userPhone || conversation.clientPhone || '';
      const summary = payload.aiSummary || conversation.ai_summary || '';
      const reason = payload.reason || 'طلب التحدث مع موظف دعم بشري';
      const lastMessage = payload.message || (conversation.messages && conversation.messages.length > 0 ? conversation.messages[conversation.messages.length - 1].text : '');

      const supportRequestDoc = {
        id: requestId,
        conversationId: cleanSessionId,
        userName: clientName,
        userEmail: clientEmail,
        userPhone: clientPhone,
        status: 'pending',
        priority: 'high',
        requestType: 'human_support',
        source: 'support_chat',
        reason: reason,
        message: lastMessage,
        aiSummary: summary,
        createdAt: new Date().toISOString(),
        timestamp: Date.now(),
        unread: true,
        metadata: payload.metadata || {}
      };

      // 1. Push document to 'support_requests' Firestore collection
      if (globalDb) {
        try {
          const docRef = doc(globalDb, 'support_requests', requestId);
          await setDoc(docRef, supportRequestDoc);
          console.log(`✅ [FIRESTORE] Document written to 'support_requests' collection with ID: ${requestId}`);
        } catch (dbErr: any) {
          logFirestoreError("support_requests.write", "support_requests", requestId, dbErr);
        }
      }

      // 2. Update conversation status to QUEUED_FOR_HUMAN
      await updateConversationStatus(conversation.id, 'QUEUED_FOR_HUMAN');
      
      // 3. Save a system message to indicate customer transferred to human support
      const systemMsg = await addMessage(
        conversation.id, 
        'system', 
        'text', 
        'تم تسجيل طلب التحدث مع الدعم البشري بنجاح وتم إشعار مسؤولي الدعم بالمتجر عبر البريد الإلكتروني والإشعارات الفورية.', 
        false
      );
      if (systemMsg) {
        io.to(clientRoom).emit('message_received', systemMsg);
      }
      
      // 4. Notify both customer and agents room
      io.to(clientRoom).emit('status_updated', { status: 'QUEUED_FOR_HUMAN' });
      io.to('agents_room').emit('agent_status_updated', { sessionId: cleanSessionId, status: 'QUEUED_FOR_HUMAN' });
      
      // 5. Display real-time notification to all logged-in admins in agents_room
      io.to('agents_room').emit('new_support_request', supportRequestDoc);
      io.to('agents_room').emit('new_conversation_queued', {
        sessionId: cleanSessionId,
        clientName: clientName,
        clientEmail: clientEmail,
        ai_summary: summary,
        requestId: requestId,
        reason: reason,
        createdAt: supportRequestDoc.createdAt
      });
      io.to('agents_room').emit('admin_notification', {
        id: requestId,
        title: 'طلب دعم فني بشري 🚨',
        body: `${clientName} (${clientEmail}): ${reason}`,
        icon: '👨‍💼',
        timestamp: Date.now(),
        type: 'support_request',
        conversationId: cleanSessionId,
        priority: 'high',
        requestId: requestId
      });

      // 6. Trigger email notification to admin via Resend API
      sendAdminSupportRequestNotification(
        clientEmail,
        clientName,
        lastMessage || reason,
        cleanSessionId,
        globalDb,
        globalSettingsProvider || undefined,
        {
          phone: clientPhone,
          reason: reason,
          aiSummary: summary,
          requestId: requestId,
          device: payload.metadata?.device
        }
      ).then((res) => {
        console.log(`📧 [RESEND] Admin notification email triggered for support request ${requestId}: ${res.success ? 'SUCCESS' : 'FAILED'}`);
      }).catch(err => {
        console.error("❌ [RESEND] Admin support email notify error:", err);
      });

      await addSupportLog(`Human support requested (Ticket #${requestId}). Pushed to support_requests and notified admins.`, 'Customer');

      return supportRequestDoc;
    };

    // Handle customer approving transfer to human agent
    socket.on('approve_transfer', async (data) => {
      const sessionId = typeof data === 'string' ? data : data?.sessionId;
      if (!sessionId) return;
      await processSupportRequest({
        sessionId,
        userName: data?.userName,
        userEmail: data?.userEmail,
        userPhone: data?.userPhone,
        reason: data?.reason || 'طلب التحدث مع موظف دعم بشري',
        message: data?.message,
        aiSummary: data?.aiSummary,
        metadata: data?.metadata
      });
    });

    // Dedicated event: request_human_support
    socket.on('request_human_support', async (data) => {
      const sessionId = typeof data === 'string' ? data : data?.sessionId;
      if (!sessionId) return;
      await processSupportRequest({
        sessionId,
        userName: data?.userName,
        userEmail: data?.userEmail,
        userPhone: data?.userPhone,
        reason: data?.reason || 'طلب التحدث مع موظف دعم بشري',
        message: data?.message,
        aiSummary: data?.aiSummary,
        metadata: data?.metadata
      });
    });

    // Handle customer declining transfer, remaining with AI
    socket.on('decline_transfer', async ({ sessionId }) => {
      if (!sessionId) return;
      const cleanSessionId = sessionId.toLowerCase().trim();
      const clientRoom = `conversation_${cleanSessionId}`;
      
      let conversation = await getOrCreateConversation(cleanSessionId);
      if (conversation) {
        await updateConversationStatus(conversation.id, 'AI_HANDLING');
        
        // Save a system message
        const systemMsg = await addMessage(conversation.id, 'system', 'text', 'اختار العميل مواصلة الحديث مع المساعد الذكي.', false);
        if (systemMsg) {
          io.to(clientRoom).emit('message_received', systemMsg);
        }
        
        io.to(clientRoom).emit('status_updated', { status: 'AI_HANDLING' });
        io.to('agents_room').emit('agent_status_updated', { sessionId: cleanSessionId, status: 'AI_HANDLING' });
        
        await addSupportLog(`User declined transfer. Resetting to AI_HANDLING.`, 'Customer');
      }
    });

    // Handle typing indicator
    socket.on('typing', ({ sessionId, sender, isTyping }) => {
      if (!sessionId) return;
      const cleanSessionId = sessionId.toLowerCase().trim();
      socket.to(`conversation_${cleanSessionId}`).emit('typing_status', { sender, isTyping });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
      if (socket.data?.isAdmin || connectedAdmins.has(socket.id)) {
        connectedAdmins.delete(socket.id);
        console.log(`🔑 Admin ${socket.id} disconnected. Total remaining admins: ${connectedAdmins.size}`);

        if (connectedAdmins.size === 0) {
          io.emit('support:offline');
          io.emit('support_status', { isAgentOnline: false });
        }
      }
    });
  });
}
