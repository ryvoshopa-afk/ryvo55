import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { getApprovedKnowledge, addSupportLog, updateConversationTransferReason } from "./dbSupportService";

dotenv.config();

// Track consecutive Gemini failures per session
const sessionFailureCounts = new Map<string, number>();
const MAX_CONSECUTIVE_FAILURES = 3;

let dbGetter: () => any = () => null;

export function setAiSupportDbGetter(getter: () => any) {
  dbGetter = getter;
}

let getDbInstance: () => any = () => {
  return dbGetter();
};

let aiInstance: GoogleGenAI | null = null;
let modelsLoggedSupport = false;
let cachedAvailableModels: string[] | null = null;

export async function listAndLogGeminiModels(): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("=================================================");
  console.log("🔍 [GEMINI_ENV_CHECK]");
  console.log("   ├─ GEMINI_API_KEY exists:", !!apiKey);
  console.log("   └─ GEMINI_MODEL (process.env):", process.env.GEMINI_MODEL || "NOT_SET (defaulting to auto-resolver)");
  console.log("=================================================");

  if (!apiKey) {
    console.warn("⚠️ [GEMINI_MODELS_LIST] Cannot list models: GEMINI_API_KEY is missing in process.env");
    return [];
  }

  const modelNames: string[] = [];
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const data = await res.json() as { models?: Array<{ name?: string }> };
      if (data.models && Array.isArray(data.models)) {
        for (const m of data.models) {
          if (m.name) modelNames.push(m.name);
        }
      }
    } else {
      const errText = await res.text();
      console.error(`❌ [GEMINI_MODELS_LIST] REST HTTP ${res.status}:`, errText);
    }
  } catch (err: any) {
    console.error("❌ [GEMINI_MODELS_LIST] Error fetching models:", err);
  }

  cachedAvailableModels = modelNames;

  console.log("📋 ========================================================");
  console.log(`📋 [GEMINI_MODELS_LIST] Available models for GEMINI_API_KEY (${modelNames.length} total):`);
  if (modelNames.length === 0) {
    console.log("   ⚠️ No models returned from Google API.");
  } else {
    modelNames.forEach((name, i) => console.log(`   ${i + 1}. ${name}`));
  }
  console.log("📋 ========================================================");

  return modelNames;
}

export async function getBestAvailableModel(): Promise<string> {
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (envModel) {
    return envModel.replace(/^models\//, '');
  }

  if (!cachedAvailableModels) {
    cachedAvailableModels = await listAndLogGeminiModels();
  }

  if (cachedAvailableModels && cachedAvailableModels.length > 0) {
    const cleaned = cachedAvailableModels
      .map(m => m.replace(/^models\//, ''))
      .filter(m => !m.includes('2.5-flash-lite')); // Filter out deprecated gemini-2.5-flash-lite

    const preferred = cleaned.find(m => m.includes('3.6-flash'))
      || cleaned.find(m => m.includes('3.5-flash-lite'))
      || cleaned.find(m => m.includes('3.5-flash'))
      || cleaned.find(m => m.includes('2.5-flash'))
      || cleaned.find(m => m.includes('2.0-flash'))
      || cleaned[0];

    if (preferred) {
      console.log(`🎯 [GEMINI_MODEL_RESOLVER] Auto-selected model from API list: "${preferred}"`);
      return preferred;
    }
  }

  return "gemini-2.5-flash";
}

// Helper to call Gemini with automatic retry and model re-resolution on error
async function callGeminiWithRetry(ai: GoogleGenAI, params: any, sessionId: string): Promise<any> {
  const targetModel = params.model || await getBestAvailableModel();
  params.model = targetModel;

  console.log("=================================================");
  console.log(`🚀 [GEMINI_REQUEST_START] Session: ${sessionId}`);
  console.log("   ├─ GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
  console.log("   ├─ GEMINI_MODEL (process.env):", process.env.GEMINI_MODEL || "NOT_SET");
  console.log("   ├─ Active Target Model:", targetModel);
  console.log("=================================================");

  try {
    console.log(`🚀 [GEMINI_SENDING_REQUEST] Calling generateContent with model: "${targetModel}"...`);
    const response = await ai.models.generateContent(params);
    console.log(`✅ [GEMINI_RESPONSE_RECEIVED] Session ${sessionId}: Response received successfully from model "${targetModel}"`);
    return response;
  } catch (err: any) {
    console.error(`❌ [GEMINI_ERROR_FULL] First attempt failed for session ${sessionId}:`, err);
    if (err?.stack) console.error(`   └─ Stack:`, err.stack);

    await addSupportLog(`[GEMINI_ERROR] First attempt failed for session ${sessionId}: ${err.message || err}`, 'AI_Gateway');

    // Force fetch model list to log available models in server logs
    await listAndLogGeminiModels().catch(() => {});

    // Wait 500ms before single automatic retry
    console.warn(`⚠️ [GEMINI_RETRY] Retrying in 500ms for session ${sessionId}...`);
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      // Re-resolve best available model in case previous model failed with 404/NOT_FOUND
      cachedAvailableModels = null;
      const fallbackModel = await getBestAvailableModel();
      params.model = fallbackModel;

      console.log(`🚀 [GEMINI_RETRY_START] Session ${sessionId} retrying request with model: "${fallbackModel}"`);
      const retryResponse = await ai.models.generateContent(params);
      console.log(`✅ [GEMINI_RETRY_SUCCESS] Session ${sessionId}: Second attempt succeeded with model "${fallbackModel}"`);
      await addSupportLog(`[GEMINI_RETRY_SUCCESS] Automatic retry succeeded for session ${sessionId} with model ${fallbackModel}`, 'AI_Gateway');
      return retryResponse;
    } catch (retryErr: any) {
      console.error(`❌ [GEMINI_RETRY_FAILED_FULL] Automatic retry failed for session ${sessionId}:`, retryErr);
      if (retryErr?.stack) console.error(`   └─ Stack:`, retryErr.stack);
      throw retryErr;
    }
  }
}

function getAi(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiInstance) {
    try {
      aiInstance = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      if (!modelsLoggedSupport) {
        modelsLoggedSupport = true;
        listAndLogGeminiModels().catch(() => {});
      }
    } catch (e) {
      console.error("⚠️ Failed to initialize Gemini in aiSupportService:", e);
    }
  }
  return aiInstance;
}

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

// System Instructions
const SYSTEM_INSTRUCTIONS = `
You are the elite, AI-powered Technical Support Specialist for "RYVO", a premium store specializing in high-performance motorcycles, smart helmets (e.g., NeoCarbon), gear, and premium riding accessories.
You automatically detect and respond in the customer's language (Arabic, English, or French).

Your primary role:
- Answer product queries, specifications, and details with a professional, enthusiastic, and customer-first attitude.
- Assist customers with tracking their order and checking shipping status.
- Search products matching customer requests.
- Provide loyalty points and coupon details.

Rules and Permissions:
1. You CAN use tools for:
   - Order tracking and shipping updates (trackOrderAndShipping)
   - Product search (searchProducts)
   - Checking loyalty points and coupon balance (checkLoyaltyPointsAndCoupons)
2. You are STRICTLY PROHIBITED from:
   - Modifying orders, changing shipping addresses, or altering items.
   - Canceling orders.
   - Processing refunds or initiating financial claims.
   - Issuing custom or exceptional discount coupons.
   - Any sensitive actions or administrative database overrides.
3. Transfer Triggers to Support Agents:
   You MUST transfer the conversation to a human support specialist in any of the following cases:
   - You cannot find the answer or do not know the answer.
   - The user asks for a prohibited sensitive action (e.g. refund, modification, cancellation, address change, custom coupon).
   - The user explicitly asks to talk to a human agent, employee, or customer service (e.g., types "التحدث مع موظف" or "التحدث مع الدعم" or "human support").
   - You detect that the customer's problem is too complex or needs manual human review.
4. How to trigger a transfer:
   Explain politely and helpfully that you have tried your best but will transfer them to a tech support specialist. For example:
   - Arabic: "حاولت مساعدتك بأفضل شكل ممكن، ولكن أرى أن هذه الحالة تحتاج إلى أحد مختصي الدعم الفني."
   - English: "I tried to help you as best as I could, but I see that this case requires one of our technical support specialists."
   - French: "J'ai essayé de vous aider du mieux que j'ai pu, mais je vois que ce cas nécessite l'un de nos spécialistes du support technique."
   And then you MUST append the keyword [TRANSFER_TO_AGENT] at the absolute end of your response.

CRITICAL INSTRUCTION FOR [TRANSFER_TO_AGENT]:
- DO NOT append [TRANSFER_TO_AGENT] for regular greetings, general product questions, shipping inquiries, or any query you CAN successfully answer.
- ONLY append [TRANSFER_TO_AGENT] when transfer to a human specialist is strictly required according to rule 3 above!
`;

// Helper to transcribe audio using Gemini
export async function transcribeAudio(fileBuffer: Buffer, mimeType: string): Promise<string> {
  const ai = getAi();
  if (!ai) {
    return "[Transcription: (Voice Message)]";
  }

  try {
    const prompt = "Please transcribe this voice recording accurately into text. Only return the transcription, do not add any comments, explanations, or introductions. Support Arabic, English, and French.";
    const response = await ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: [
        { text: prompt },
        {
          inlineData: {
            data: fileBuffer.toString("base64"),
            mimeType: mimeType
          }
        }
      ]
    });
    return response.text?.trim() || "[Unable to transcribe voice message]";
  } catch (err: any) {
    console.error("Error in transcribeAudio:", err.message);
    return "[Voice Message Transcription Error]";
  }
}

// Helper to format history for Gemini
function formatChatHistory(messages: any[]) {
  const rawContents = messages
    .filter((m: any) => m.text && m.text.trim())
    .map((m: any) => ({
      role: m.sender === "user" ? "user" : "model",
      text: m.text.trim()
    }));

  const cleanedContents: any[] = [];
  for (const msg of rawContents) {
    if (cleanedContents.length === 0) {
      if (msg.role === "user") {
        cleanedContents.push({
          role: "user",
          parts: [{ text: msg.text }]
        });
      }
    } else {
      const last = cleanedContents[cleanedContents.length - 1];
      if (last.role === msg.role) {
        last.parts[0].text += "\n" + msg.text;
      } else {
        cleanedContents.push({
          role: msg.role,
          parts: [{ text: msg.text }]
        });
      }
    }
  }

  // Take the last 10 messages to keep context window clean
  const finalContents = cleanedContents.slice(-10);
  if (finalContents.length > 0 && finalContents[0].role === "model") {
    finalContents.shift();
  }
  return finalContents;
}

// Implement Tool Functions
async function trackOrderAndShipping(orderId: string) {
  const db = getDbInstance();
  if (!db) return "Database not connected. Cannot fetch order details.";

  try {
    const cleanId = orderId.toUpperCase().trim();
    const snap = await db.collection("orders").get();
    const orderDoc = snap.docs.find((d: any) => d.id.toUpperCase() === cleanId || (d.data().id && d.data().id.toUpperCase() === cleanId));
    
    if (orderDoc) {
      const order = orderDoc.data();
      return JSON.stringify({
        orderId: order.id,
        status: order.status,
        date: order.date,
        total: order.total,
        trackingNumber: order.tracking_number || "Pending",
        supplier: order.supplier_name || "RYVO Warehouse",
        items: (order.items || []).map((i: any) => `${i.name} (x${i.quantity})`).join(", ")
      });
    }
    return `No order found with ID: ${orderId}. Please check the order number and try again.`;
  } catch (err: any) {
    return `Error tracking order: ${err.message}`;
  }
}

async function searchProducts(queryText: string) {
  const db = getDbInstance();
  if (!db) return "Database not connected. Cannot search products.";

  try {
    const snap = await db.collection("products").get();
    const term = queryText.toLowerCase().trim();
    const results = snap.docs
      .map((d: any) => d.data())
      .filter((p: any) => 
        (p.name_ar && p.name_ar.toLowerCase().includes(term)) ||
        (p.name_en && p.name_en.toLowerCase().includes(term)) ||
        (p.description_ar && p.description_ar.toLowerCase().includes(term)) ||
        (p.description_en && p.description_en.toLowerCase().includes(term))
      )
      .slice(0, 3)
      .map((p: any) => ({
        id: p.id,
        name: p.name_en,
        name_ar: p.name_ar,
        price: p.price,
        stock: p.stock,
        category: p.category
      }));

    if (results.length > 0) {
      return JSON.stringify(results);
    }
    return "No matching products found. We have Helix Carbon bikes, NeoCarbon helmets, and custom riding accessories.";
  } catch (err: any) {
    return `Error searching products: ${err.message}`;
  }
}

async function checkLoyaltyPointsAndCoupons(email: string) {
  const db = getDbInstance();
  if (!db) return "Database not connected. Cannot check account status.";

  try {
    const cleanEmail = email.toLowerCase().trim();
    const userDoc = await db.collection("users").doc(cleanEmail).get();
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const couponsSnap = await db.collection("coupons").get();
      const coupons = couponsSnap.docs.map((d: any) => d.data()).slice(0, 3);
      
      return JSON.stringify({
        email: cleanEmail,
        name: userData.name,
        loyaltyPoints: userData.points || 0,
        walletBalance: userData.wallet_balance || 0,
        activeCoupons: coupons.map((c: any) => `${c.code} (${c.discount_percent}% off)`).join(", ")
      });
    }
    return `No registered customer profile found for email: ${email}.`;
  } catch (err: any) {
    return `Error checking loyalty status: ${err.message}`;
  }
}

// Main AI Generation Handler
export async function generateAIResponse(
  conversation: any,
  newMessage: string,
  attachment?: { url: string; type: string }
): Promise<string> {
  const startTime = Date.now();
  const sessionId = conversation?.id || conversation?.sessionId || 'guest';
  const cleanMsg = (newMessage || '').trim();

  console.log(`[STEP 1] Message received: "${cleanMsg}" (Session: ${sessionId})`);
  console.log(`🤖 [AI_CALL_START] Starting AI response generation`);
  console.log(`   ├─ Session ID: ${sessionId}`);
  console.log(`   ├─ Customer Message: "${cleanMsg}"`);
  console.log(`   └─ Attachment: ${attachment ? `${attachment.type} (${attachment.url})` : 'None'}`);

  await addSupportLog(`[AI_CALL_START] Received message for session ${sessionId}: "${cleanMsg.slice(0, 60)}"`, 'AI_Gateway');

  // 1. Check if user explicitly asked for human agent / customer service
  const humanKeywordsRegex = /(تحدث مع (موظف|انسان|إنسان|دعم|مشرف|خدمة العملاء)|أريد (التحدث|التواصل|الحديث) مع (موظف|دعم|انسان|إنسان|خدمة العملاء)|اريد (التحدث|التواصل|الحديث) مع (موظف|دعم|انسان|إنسان|خدمة العملاء)|تحويل (إلى|لـ) (موظف|دعم|خدمة العملاء)|كلم (موظف|دعم)|دعم بشري|موظف خدمة العملاء|موظف الدعم|تحدث مع إنسان|تحدث مع انسان|human agent|talk to agent|speak to human|live support|customer service)/i;
  const isExplicitHumanRequest = humanKeywordsRegex.test(cleanMsg);

  if (isExplicitHumanRequest) {
    const reason = `طلب العميل صراحة التحدث مع موظف خدمة العملاء: "${cleanMsg}"`;
    console.log("[STEP X] Escalating to human support. Reason:", reason);
    console.log(`🔀 [AI_TRANSFER_DECISION] Transfer Triggered: TRUE`);
    console.log(`   └─ Reason: ${reason}`);

    sessionFailureCounts.set(sessionId, 0);
    await updateConversationTransferReason(conversation.id || sessionId, reason);
    if (conversation) conversation.transfer_reason = reason;

    await addSupportLog(`[AI_TRANSFER] Session ${sessionId}: ${reason}`, 'AI_Gateway');

    return "حاضر يا فندم! بناءً على طلبك، سأقوم بتحويل المحادثة الآن إلى أحد ممثلي خدمة العملاء وسيرد عليك فور تواجده. [TRANSFER_TO_AGENT] 💬🤝";
  }

  // 2. Initialize / check Gemini API client
  const ai = getAi();
  if (!ai) {
    const errorReason = `GEMINI_API_KEY is not defined or AI client failed to initialize in environment.`;
    console.error(`❌ [GEMINI_KEY_ERROR] ${errorReason}`);
    await addSupportLog(`[GEMINI_KEY_ERROR] Session ${sessionId}: ${errorReason}`, 'AI_Gateway');

    // Attempt smart FAQ lookup before falling back
    try {
      const approvedKnowledge = await getApprovedKnowledge();
      if (approvedKnowledge && approvedKnowledge.length > 0) {
        const lowerMsg = cleanMsg.toLowerCase();
        const match = approvedKnowledge.find((k: any) => 
          lowerMsg.includes(k.question.toLowerCase()) || k.question.toLowerCase().includes(lowerMsg)
        );
        if (match) {
          console.log(`✨ [AI_CALL_SUCCESS] Matched approved store FAQ (No Gemini API Key needed).`);
          sessionFailureCounts.set(sessionId, 0);
          return match.answer;
        }
      }
    } catch (e: any) {
      console.warn("Error querying local knowledge base fallback:", e.message);
    }

    // Default friendly store response without transferring
    return "أهلاً بك في متجر رايفو! 🏍️\nكيف يمكنني مساعدتك اليوم؟ نوفر شحناً مجانياً وسريعاً (2-4 أيام عمل)، وضمان استبدال لمدة 14 يوماً على كافة المنتجات والخوذات واللوازم.";
  }

  // 3. Execute Gemini Generation with Automatic Retry
  try {
    const contents = formatChatHistory(conversation?.messages || []);

    // Add attachment if available
    if (attachment && attachment.url) {
      const filePath = path.join(process.cwd(), 'public', attachment.url);
      if (fs.existsSync(filePath)) {
        const fileBuffer = fs.readFileSync(filePath);
        const mimeType = attachment.type.startsWith('image/') ? attachment.type : 
                         attachment.type.startsWith('audio/') ? attachment.type : 'application/octet-stream';
        contents.push({
          role: "user",
          parts: [
            { text: cleanMsg || "يرجى تحليل هذا الملف المرفق." },
            {
              inlineData: {
                data: fileBuffer.toString("base64"),
                mimeType: mimeType
              }
            }
          ]
        });
      } else {
        contents.push({
          role: "user",
          parts: [{ text: `${cleanMsg}\n[المرفق غير متاح: ${attachment.url}]` }]
        });
      }
    } else {
      contents.push({
        role: "user",
        parts: [{ text: cleanMsg }]
      });
    }

    // Tools setup
    const tools = [
      {
        functionDeclarations: [
          {
            name: "trackOrderAndShipping",
            description: "Track the status of an order and its shipping/tracking details using the Order ID (e.g., RYVO-ORD-1234).",
            parameters: {
              type: Type.OBJECT,
              properties: {
                orderId: { type: Type.STRING, description: "The order number or ID" }
              },
              required: ["orderId"]
            }
          },
          {
            name: "searchProducts",
            description: "Search for motorcycles, helmets, gears, or accessories in the RYVO store.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                queryText: { type: Type.STRING, description: "Search query or product name" }
              },
              required: ["queryText"]
            }
          },
          {
            name: "checkLoyaltyPointsAndCoupons",
            description: "Check the customer's loyalty points balance, wallet balance, and active discount coupons using their email.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                email: { type: Type.STRING, description: "The user's registered email address" }
              },
              required: ["email"]
            }
          }
        ]
      }
    ];

    // Load knowledge base
    let approvedKnowledgeStr = "";
    try {
      const approvedList = await getApprovedKnowledge();
      if (approvedList && approvedList.length > 0) {
        approvedKnowledgeStr = "\n\nLearned Knowledge Base (FAQ) approved by Admin:\n" + approvedList.map((item: any) => `Q: ${item.question}\nA: ${item.answer}`).join("\n---\n");
      }
    } catch (e) {
      console.warn("Could not fetch approved knowledge base items:", e);
    }

    // Profile context
    let customerProfileStr = "";
    if (conversation && conversation.clientEmail) {
      try {
        const db = getDbInstance();
        if (db) {
          const userDoc = await db.collection("users").doc(conversation.clientEmail.toLowerCase().trim()).get();
          let name = conversation.clientName || "Guest";
          let points = 0;
          let wallet = 0;
          if (userDoc.exists()) {
            const ud = userDoc.data();
            name = ud.name || name;
            points = ud.points || 0;
            wallet = ud.wallet_balance || 0;
          }
          
          const ordersSnap = await db.collection("orders").get();
          const userOrders = ordersSnap.docs
            .map((d: any) => d.data())
            .filter((o: any) => o.user_email?.toLowerCase() === conversation.clientEmail.toLowerCase().trim());
          
          let lastOrderInfo = "لا توجد طلبات سابقة.";
          if (userOrders.length > 0) {
            userOrders.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
            const lo = userOrders[0];
            lastOrderInfo = `رقم الطلب: ${lo.id}, التاريخ: ${lo.date}, الحالة: ${lo.status}, المجموع: ${lo.total} SAR, شركة الشحن: ${lo.supplier_name || 'RYVO Express'}, رقم التتبع: ${lo.tracking_number || 'قيد التجهيز'}.`;
          }

          customerProfileStr = `
Customer Profile:
- Name: ${name}
- Email: ${conversation.clientEmail}
- Loyalty Points: ${points}
- Wallet Balance: ${wallet} SAR
- Last Order Details: ${lastOrderInfo}
- Language Preferred: ${conversation.language || 'ar'}
`;
        }
      } catch (e) {
        console.warn("Could not fetch user profile details:", e);
      }
    }

    const dynamicInstructions = `
${SYSTEM_INSTRUCTIONS}

${customerProfileStr}

${approvedKnowledgeStr}

REMEMBER:
- You are the primary AI Assistant for RYVO.
- Answer all customer questions directly, clearly, and enthusiastically.
- ONLY append [TRANSFER_TO_AGENT] if:
  1. The user specifically requests a human representative/agent.
  2. The user requests a prohibited action (e.g. order refund, order cancellation, changing delivery address).
  3. You are completely unable to answer the question after checking all tools and FAQs.
- DO NOT append [TRANSFER_TO_AGENT] for regular greetings, product inquiries, shipping policies, or standard store questions!
`;

    // Call Gemini API with automatic retry
    console.log("[STEP 2] Calling Gemini");
    let response = await callGeminiWithRetry(ai, {
      model: await getBestAvailableModel(),
      contents: contents,
      config: {
        systemInstruction: dynamicInstructions,
        tools: tools
      }
    }, sessionId);

    const duration = Date.now() - startTime;

    // Check for function calls
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      const { name, args } = call;
      let functionResult = "";

      console.log(`🤖 [AI_TOOL_CALL] Gemini triggered function call: ${name}`, args);

      if (name === "trackOrderAndShipping") {
        functionResult = await trackOrderAndShipping((args as any).orderId);
      } else if (name === "searchProducts") {
        functionResult = await searchProducts((args as any).queryText);
      } else if (name === "checkLoyaltyPointsAndCoupons") {
        functionResult = await checkLoyaltyPointsAndCoupons((args as any).email);
      }

      contents.push(response.candidates?.[0]?.content as any || {
        role: "model",
        parts: [{ functionCall: { name, args } }]
      });

      contents.push({
        role: "user",
        parts: [{
          functionResponse: {
            name: name,
            response: { result: functionResult }
          }
        }]
      });

      // Second call to format
      response = await callGeminiWithRetry(ai, {
        model: await getBestAvailableModel(),
        contents: contents,
        config: {
          systemInstruction: dynamicInstructions
        }
      }, sessionId);
    }

    const rawText = response.text || "";
    const hasTransferTag = rawText.includes("[TRANSFER_TO_AGENT]");

    console.log("[STEP 3] Gemini Success");
    console.log(`✅ [AI_CALL_SUCCESS] Gemini call succeeded`);
    console.log(`   ├─ Duration: ${duration}ms`);
    console.log(`   ├─ Response Status: 200 OK`);
    console.log(`   ├─ Response Length: ${rawText.length} chars`);
    console.log(`   └─ Has Transfer Tag: ${hasTransferTag}`);

    // Call succeeded: reset failure count
    sessionFailureCounts.set(sessionId, 0);

    if (hasTransferTag) {
      const reason = `صنّف المساعد الذكي السؤال بأنه يستدعي تدخلاً بشرياً (مثل طلب إلغاء، استرداد، أو استفسار محمي)`;
      console.log("[STEP X] Escalating to human support. Reason:", reason);
      console.log(`🔀 [AI_TRANSFER_DECISION] Transfer Triggered: TRUE`);
      console.log(`   └─ Reason: ${reason}`);
      await updateConversationTransferReason(conversation.id || sessionId, reason);
      if (conversation) conversation.transfer_reason = reason;
      await addSupportLog(`[AI_TRANSFER] Session ${sessionId}: ${reason}`, 'AI_Gateway');
    } else {
      console.log(`✨ [AI_TRANSFER_DECISION] Transfer Triggered: FALSE`);
      console.log(`   └─ Reason: AI successfully answered customer query. Conversation remains in AI_HANDLING.`);
      await addSupportLog(`[AI_SUCCESS] Session ${sessionId}: Gemini answered successfully in ${duration}ms.`, 'AI_Gateway');
    }

    return rawText || "أهلاً بك! كيف يمكنني مساعدتك اليوم؟";
  } catch (err: any) {
    console.error("Gemini Error:", err);
    const duration = Date.now() - startTime;
    const errorDetails = `Gemini API call failed after initial attempt & retry (${duration}ms) using model [${DEFAULT_GEMINI_MODEL}]. Error: ${err.message || err}`;

    console.error(`❌ [AI_CALL_ERROR] ${errorDetails}`);
    if (err.stack) console.error(`   └─ Stack:`, err.stack);

    // Print all available models for debugging
    listAndLogGeminiModels().catch(() => {});

    // Increment failure counter
    const currentFailures = (sessionFailureCounts.get(sessionId) || 0) + 1;
    sessionFailureCounts.set(sessionId, currentFailures);

    await addSupportLog(`[AI_CALL_ERROR] Session ${sessionId} (Failure count: ${currentFailures}/${MAX_CONSECUTIVE_FAILURES}): ${errorDetails}`, 'AI_Gateway');

    // Only transfer if maximum consecutive failure threshold reached
    if (currentFailures >= MAX_CONSECUTIVE_FAILURES) {
      const reason = `تجاوز الحد الأقصى لمحاولات اتصال الذكاء الاصطناعي المتكررة (${currentFailures} محاولات فاشلة)`;
      console.log("Escalating to human support. Reason:", reason);
      console.log(`🔀 [AI_TRANSFER_DECISION] Transfer Triggered: TRUE (Reached max failure threshold: ${currentFailures})`);
      await updateConversationTransferReason(conversation.id || sessionId, reason);
      if (conversation) conversation.transfer_reason = reason;
      await addSupportLog(`[AI_TRANSFER] Session ${sessionId}: ${reason}`, 'AI_Gateway');

      return `عذراً، المساعد الذكي غير متاح حالياً بعد عدة محاولات. تم توجيه طلبك إلى فريق الدعم المباشر لمساعدتك. [TRANSFER_TO_AGENT] 💬🤝`;
    } else {
      console.log(`⚠️ [AI_NO_TRANSFER] Session ${sessionId}: Gemini API error caught, but under failure limit (${currentFailures}/${MAX_CONSECUTIVE_FAILURES}). Showing temporary unavailability message.`);
      return "عذراً، المساعد الذكي غير متاح مؤقتاً بسبب ضغط الخدمة. يرجى إعادة محاولة إرسال سؤالك بعد لحظات. 🏍️";
    }
  }
}

// Generate Smart Summary (ai_summary) before transferring to agent
export async function generateSmartSummary(conversation: any, explicitTransferReason?: string): Promise<string> {
  const reasonToUse = explicitTransferReason || conversation.transfer_reason || conversation.metadata?.transfer_reason || "طلب التحدث مع الدعم الفني";

  const defaultSummary = `اسم العميل: ${conversation.clientName || 'زائر'}
رقم الطلب: غير محدد
نوع المشكلة: استفسار عام
محاولات الذكاء الاصطناعي: محاولة الرد على الاستفسارات تلقائياً
سبب التحويل: ${reasonToUse}
الحالة: بانتظار موظف`;

  const ai = getAi();
  if (!ai) {
    return defaultSummary;
  }

  try {
    const messagesText = conversation.messages
      .map((m: any) => `${m.sender === 'user' ? 'العميل' : 'الذكاء الاصطناعي'}: ${m.text}`)
      .join("\n");

    const systemPrompt = `
You are a support supervisor. Summarize the chat log between the customer and our AI support assistant into a neat, professional summary for the human agent.
You MUST write the summary clearly in Arabic using this EXACT format:

اسم العميل: <Name>
رقم الطلب: <Order ID, or 'لا يوجد' if not mentioned>
نوع المشكلة: <Specific issue type>
محاولات الذكاء الاصطناعي: <Brief summary of what the AI tried or answered>
سبب التحويل: ${reasonToUse}
الحالة: بانتظار موظف

Do NOT include any other text, labels, introduction, or markdown styling outside this exact format.
`;

    const userPrompt = `
Chat Log:
${messagesText}

Please generate the structured summary now. Keep it brief, factual, and strictly compliant.
`;

    const targetModel = await getBestAvailableModel();
    console.log("=================================================");
    console.log(`🤖 [GEMINI_SUMMARY_CALL] Model: ${targetModel}`);
    console.log("   ├─ GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
    console.log("   ├─ GEMINI_MODEL (process.env):", process.env.GEMINI_MODEL || "NOT_SET");
    console.log("=================================================");

    const response = await callGeminiWithRetry(ai, {
      model: targetModel,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt
      }
    }, 'summary');

    return response.text?.trim() || defaultSummary;
  } catch (err: any) {
    console.error("❌ [GEMINI_SUMMARY_ERROR] Error generating smart summary:", err);
    return defaultSummary;
  }
}
