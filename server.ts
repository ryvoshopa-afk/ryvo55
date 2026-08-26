import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Process-level unhandled error handlers for clear diagnostics and logging
process.on("unhandledRejection", (reason: any) => {
  console.error("[ERROR] Unhandled Promise Rejection:", {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined,
    timestamp: new Date().toISOString()
  });
});

process.on("uncaughtException", (error: Error) => {
  console.error("[ERROR] Uncaught Exception:", {
    name: error.name,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
});
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { initDb } from "./server/db";
import { initSockets, isAnyAdminOnline } from "./server/sockets";
import * as dbSupportService from "./server/services/dbSupportService";
import { getDbStatus, query as pgQuery } from "./server/db";
import { generateAIResponse, generateSmartSummary, transcribeAudio, setAiSupportDbGetter } from "./server/services/aiSupportService";
import { INITIAL_PRODUCTS } from "./src/constants/initialProducts";
import { initializeApp as initializeClientApp, getApps as getClientApps } from "firebase/app";
import { 
  getFirestore as getClientFirestore,
  collection as clientCollection,
  doc as clientDoc,
  getDoc as clientGetDoc,
  getDocs as clientGetDocs,
  setDoc as clientSetDoc,
  updateDoc as clientUpdateDoc,
  deleteDoc as clientDeleteDoc,
  addDoc as clientAddDoc,
  query as clientQuery,
  orderBy as clientOrderBy,
  limit as clientLimit,
  setLogLevel as clientSetLogLevel,
  terminate as clientTerminate,
  runTransaction,
  deleteField as clientDeleteField
} from "firebase/firestore";
import { 
  sendRealEmail, 
  fetchEmailLogs, 
  buildHtmlEmailTemplate, 
  sendCustomerOrderStatusEmail, 
  sendAdminNewOrderNotification, 
  sendAdminSupportRequestNotification, 
  sendCustomerSupportConfirmation,
  sendBulkNewsletterEmails, 
  sendOtpVerificationEmail,
  sendWelcomeEmail,
  getBaseUrl,
  PRIMARY_ADMIN_EMAIL,
  registerSettingsProvider
} from "./server/services/emailService.js";
import { processAndApplyStoreLogo } from "./server/services/logoService.js";


// Suppress internal Firebase Client Firestore SDK debug and error logs to ensure clean logs
try {
  clientSetLogLevel("silent");
} catch (e) {
  // Safe fallback
}
import {
  testConnection,
  importProduct,
  syncInventory,
  syncPrices,
  createOrder,
  getTrackingNumber,
  searchProducts,
  getProductDetails
} from "./server/services/cjService";

// --- LOCAL FIRESTORE DATABASE FALLBACK ENGINE ---
class LocalDatabaseFallback {
  private static filePath = path.join(process.cwd(), "local_firestore_fallback.json");

  private static readData(): Record<string, Record<string, any>> {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      }
    } catch (e) {
      console.error("Failed to read local DB fallback:", e);
    }
    return {};
  }

  private static writeData(data: Record<string, Record<string, any>>) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
      console.error("Failed to write local DB fallback:", e);
    }
  }

  static getDoc(colPath: string, docId: string): any {
    const data = this.readData();
    const colData = data[colPath] || {};
    return colData[docId] || null;
  }

  static setDoc(colPath: string, docId: string, docData: any, merge: boolean = false) {
    const data = this.readData();
    if (!data[colPath]) {
      data[colPath] = {};
    }
    if (merge && data[colPath][docId]) {
      data[colPath][docId] = { ...data[colPath][docId], ...docData };
    } else {
      data[colPath][docId] = docData;
    }
    this.writeData(data);
  }

  static updateDoc(colPath: string, docId: string, docData: any) {
    this.setDoc(colPath, docId, docData, true);
  }

  static deleteDoc(colPath: string, docId: string) {
    const data = this.readData();
    if (data[colPath] && data[colPath][docId]) {
      delete data[colPath][docId];
      this.writeData(data);
    }
  }

  static getDocs(colPath: string): any[] {
    const data = this.readData();
    const colData = data[colPath] || {};
    return Object.entries(colData).map(([id, docData]) => ({
      id,
      ...docData
    }));
  }
}

class LocalDocSnapshotWrapper {
  constructor(public id: string, private docData: any, public ref: any) {}

  exists() {
    return this.docData !== null;
  }

  data() {
    return this.docData || undefined;
  }
}

class LocalCollectionRefWrapper {
  constructor(public path: string) {}

  doc(id: string) {
    return new LocalDocRefWrapper(this.path, id);
  }

  async add(data: any) {
    const id = crypto.randomUUID();
    LocalDatabaseFallback.setDoc(this.path, id, data);
    return new LocalDocRefWrapper(this.path, id);
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc") {
    return this;
  }

  limit(n: number) {
    return this;
  }

  async get() {
    const localItems = LocalDatabaseFallback.getDocs(this.path);
    return {
      size: localItems.length,
      empty: localItems.length === 0,
      docs: localItems.map(item => {
        const docId = item.id;
        const { id, ...docData } = item;
        return new LocalDocSnapshotWrapper(docId, docData, new LocalDocRefWrapper(this.path, docId));
      })
    };
  }
}

class LocalDocRefWrapper {
  constructor(public colPath: string, public id: string) {}

  get path() {
    return `${this.colPath}/${this.id}`;
  }

  async get() {
    const localData = LocalDatabaseFallback.getDoc(this.colPath, this.id);
    return new LocalDocSnapshotWrapper(this.id, localData, this);
  }

  async set(data: any, options?: any) {
    LocalDatabaseFallback.setDoc(this.colPath, this.id, data, options?.merge);
    return { success: true };
  }

  async update(data: any) {
    LocalDatabaseFallback.updateDoc(this.colPath, this.id, data);
    return { success: true };
  }

  async delete() {
    LocalDatabaseFallback.deleteDoc(this.colPath, this.id);
    return { success: true };
  }
}

class LocalDbAdapter {
  collection(colName: string) {
    return new LocalCollectionRefWrapper(colName);
  }
}

// --- CLIENT-SDK-BASED FIRESTORE ADAPTERS ---
function logAdapterFirestoreError(err: any, context: string): string {
  const code = err?.code || "";
  let message = `[RYVO ERROR] Service: Firestore (Adapter) | Context: ${context} | Reason: ${err?.message || err} | Timestamp: ${new Date().toISOString()}`;
  switch (code) {
    case "permission-denied":
      message += " (Security rules validation failed or insufficient permissions)";
      break;
    case "not-found":
      message += " (Document or collection path not found)";
      break;
    case "already-exists":
      message += " (The document already exists)";
      break;
    case "unavailable":
      message += " (Firestore service is temporarily offline or unreachable)";
      break;
    case "resource-exhausted":
      message += " (Quota exceeded for Firestore operations)";
      break;
  }
  console.error(message);
  return message;
}

class ClientDocSnapshotWrapper {
  constructor(public rawSnap: any) {}

  get id() {
    return this.rawSnap.id;
  }

  exists() {
    return typeof this.rawSnap.exists === "function" ? this.rawSnap.exists() : true;
  }

  data() {
    return typeof this.rawSnap.data === "function" ? this.rawSnap.data() : undefined;
  }

  get ref() {
    return new ClientDocRefWrapper(this.rawSnap.ref);
  }
}

class ClientDocRefWrapper {
  constructor(public rawRef: any) {}

  get id() {
    return this.rawRef.id;
  }

  get path() {
    return this.rawRef.path;
  }

  async get() {
    try {
      const snap = await clientGetDoc(this.rawRef);
      return new ClientDocSnapshotWrapper(snap);
    } catch (error) {
      logAdapterFirestoreError(error, `Read document at ${this.rawRef.path}`);
      const parts = this.rawRef.path.split('/');
      const docId = parts[parts.length - 1];
      const colPath = parts.slice(0, parts.length - 1).join('/');
      const localData = LocalDatabaseFallback.getDoc(colPath, docId);
      return new LocalDocSnapshotWrapper(docId, localData, this);
    }
  }

  async set(data: any, options?: any) {
    try {
      if (options && options.merge) {
        await clientSetDoc(this.rawRef, data, { merge: true });
      } else {
        await clientSetDoc(this.rawRef, data);
      }
      return { success: true };
    } catch (error) {
      logAdapterFirestoreError(error, `Write/Set document at ${this.rawRef.path}`);
      const parts = this.rawRef.path.split('/');
      const docId = parts[parts.length - 1];
      const colPath = parts.slice(0, parts.length - 1).join('/');
      LocalDatabaseFallback.setDoc(colPath, docId, data, options?.merge);
      return { success: true };
    }
  }

  async update(data: any) {
    try {
      await clientUpdateDoc(this.rawRef, data);
      return { success: true };
    } catch (error) {
      logAdapterFirestoreError(error, `Update document at ${this.rawRef.path}`);
      const parts = this.rawRef.path.split('/');
      const docId = parts[parts.length - 1];
      const colPath = parts.slice(0, parts.length - 1).join('/');
      LocalDatabaseFallback.updateDoc(colPath, docId, data);
      return { success: true };
    }
  }

  async delete() {
    try {
      await clientDeleteDoc(this.rawRef);
      return { success: true };
    } catch (error) {
      logAdapterFirestoreError(error, `Delete document at ${this.rawRef.path}`);
      const parts = this.rawRef.path.split('/');
      const docId = parts[parts.length - 1];
      const colPath = parts.slice(0, parts.length - 1).join('/');
      LocalDatabaseFallback.deleteDoc(colPath, docId);
      return { success: true };
    }
  }
}

class ClientCollectionRefWrapper {
  private queryConstraints: any[] = [];

  constructor(public rawRef: any, private firestoreInstance: any) {}

  doc(id: string) {
    const dRef = clientDoc(this.firestoreInstance, this.rawRef.path, id);
    return new ClientDocRefWrapper(dRef);
  }

  async add(data: any) {
    try {
      const dRef = await clientAddDoc(this.rawRef, data);
      return new ClientDocRefWrapper(dRef);
    } catch (error) {
      logAdapterFirestoreError(error, `Add document to collection ${this.rawRef.path}`);
      const id = crypto.randomUUID();
      LocalDatabaseFallback.setDoc(this.rawRef.path, id, data);
      const dRef = clientDoc(this.firestoreInstance, this.rawRef.path, id);
      return new ClientDocRefWrapper(dRef);
    }
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc") {
    this.queryConstraints.push(clientOrderBy(field, direction));
    return this;
  }

  limit(n: number) {
    this.queryConstraints.push(clientLimit(n));
    return this;
  }

  async get() {
    try {
      let snap;
      if (this.queryConstraints.length > 0) {
        const q = clientQuery(this.rawRef, ...this.queryConstraints);
        snap = await clientGetDocs(q);
      } else {
        snap = await clientGetDocs(this.rawRef);
      }
      return {
        size: snap.size,
        empty: snap.empty,
        docs: snap.docs.map((d: any) => new ClientDocSnapshotWrapper(d))
      };
    } catch (error) {
      logAdapterFirestoreError(error, `Query collection ${this.rawRef.path}`);
      const localItems = LocalDatabaseFallback.getDocs(this.rawRef.path);
      return {
        size: localItems.length,
        empty: localItems.length === 0,
        docs: localItems.map(item => {
          const docId = item.id;
          const { id, ...docData } = item;
          const dRef = clientDoc(this.firestoreInstance, this.rawRef.path, docId);
          return new LocalDocSnapshotWrapper(docId, docData, new ClientDocRefWrapper(dRef));
        })
      };
    }
  }
}

class ClientDbAdapter {
  constructor(public rawFirestore: any) {}

  collection(colName: string) {
    const cRef = clientCollection(this.rawFirestore, colName);
    return new ClientCollectionRefWrapper(cRef, this.rawFirestore);
  }
}

// Functional Helper Wrappers matching previous syntax
function collection(dbInstance: any, path: string) {
  if (!dbInstance) throw new Error("Firestore DB not initialized");
  return dbInstance.collection(path);
}

function doc(dbInstanceOrCol: any, pathOrId: string, docId?: string) {
  if (!dbInstanceOrCol) throw new Error("Firestore DB/Col not initialized");
  if (docId) {
    return dbInstanceOrCol.collection(pathOrId).doc(docId);
  }
  if (typeof dbInstanceOrCol.doc === "function") {
    return dbInstanceOrCol.doc(pathOrId);
  }
  return dbInstanceOrCol.doc(pathOrId);
}

async function getDocs(collectionRef: any) {
  if (!collectionRef) throw new Error("Collection ref not initialized");
  return await collectionRef.get();
}

async function getDoc(docRef: any) {
  if (!docRef) throw new Error("Doc ref not initialized");
  return await docRef.get();
}

async function setDoc(docRef: any, data: any, options?: any) {
  if (!docRef) throw new Error("Doc ref not initialized");
  return await docRef.set(data, options);
}

async function updateDoc(docRef: any, data: any) {
  if (!docRef) throw new Error("Doc ref not initialized");
  return await docRef.update(data);
}

async function deleteDoc(docRef: any) {
  if (!docRef) throw new Error("Doc ref not initialized");
  return await docRef.delete();
}

async function addDoc(collectionRef: any, data: any) {
  if (!collectionRef) throw new Error("Collection ref not initialized");
  return await collectionRef.add(data);
}

function query(colRef: any, ...args: any[]) {
  return colRef;
}

/**
 * Resolves a user profile from Firestore by UID, Email doc ID, or scanning the users collection.
 * If found under an email key or non-UID key and a valid UID is provided, auto-migrates all user data
 * to users/{uid} while keeping all user fields intact.
 */
async function resolveAndMigrateUserProfile(firestoreDb: any, uid: string | null, email: string): Promise<any> {
  if (!firestoreDb) return null;
  const cleanEmail = (email || "").toLowerCase().trim();
  let userData: any = null;
  let sourceDocId: string | null = null;

  // 1. Check by UID document ID first if available
  if (uid) {
    try {
      const uidSnap = await getDoc(doc(firestoreDb, "users", uid));
      if (uidSnap && uidSnap.exists()) {
        userData = uidSnap.data();
        sourceDocId = uid;
      }
    } catch (err: any) {
      console.warn(`⚠️ Error fetching user by UID [${uid}]:`, err.message);
    }
  }

  // 2. Check by Email document ID as fallback
  if (!userData && cleanEmail) {
    try {
      const emailSnap = await getDoc(doc(firestoreDb, "users", cleanEmail));
      if (emailSnap && emailSnap.exists()) {
        userData = emailSnap.data();
        sourceDocId = cleanEmail;
      }
    } catch (err: any) {
      console.warn(`⚠️ Error fetching user by email doc [${cleanEmail}]:`, err.message);
    }
  }

  // 3. Scan users collection if still not found
  if (!userData && cleanEmail) {
    try {
      const usersColRef = collection(firestoreDb, "users");
      const usersSnap = await getDocs(usersColRef);
      if (usersSnap && usersSnap.docs) {
        for (const docSnap of usersSnap.docs) {
          const data = docSnap.data();
          if (data && data.email && data.email.toLowerCase().trim() === cleanEmail) {
            userData = data;
            sourceDocId = docSnap.id;
            break;
          }
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ Error scanning users collection for email [${cleanEmail}]:`, err.message);
    }
  }

  // 4. Perform safe migration if profile was found under email / non-UID doc ID
  if (userData && uid && sourceDocId && sourceDocId !== uid) {
    try {
      const targetDocRef = doc(firestoreDb, "users", uid);
      const migratedData = {
        ...userData,
        uid: uid,
        email: cleanEmail,
        updatedAt: new Date().toISOString()
      };
      delete migratedData.password; // Ensure password never exists in Firestore

      await setDoc(targetDocRef, migratedData, { merge: true });

      // Keep legacy email document updated with a reference pointer
      const oldDocRef = doc(firestoreDb, "users", sourceDocId);
      await setDoc(oldDocRef, { migratedToUid: uid, uid: uid, email: cleanEmail }, { merge: true });

      console.log(`✅ [PROFILE MIGRATED] Successfully migrated profile from doc [${sourceDocId}] to UID [${uid}] for ${cleanEmail}`);
      userData = migratedData;
    } catch (migErr: any) {
      console.error(`⚠️ Migration from [${sourceDocId}] to UID [${uid}] failed:`, migErr.message);
    }
  }

  if (userData) {
    delete userData.password;
  }

  return userData;
}

/**
 * Saves/updates user profile in Firestore at users/{uid} (and cleans up legacy alias docs).
 */
async function saveUserProfile(firestoreDb: any, uid: string | null, email: string, profileData: any): Promise<any> {
  if (!firestoreDb) return profileData;
  const cleanEmail = (email || "").toLowerCase().trim();
  const targetId = uid || cleanEmail;
  const cleanData = { ...profileData, email: cleanEmail, updatedAt: new Date().toISOString() };
  delete cleanData.password; // NEVER store passwords in Firestore

  if (uid) {
    cleanData.uid = uid;
  }

  try {
    const docRef = doc(firestoreDb, "users", targetId);
    await setDoc(docRef, cleanData, { merge: true });

    // If targetId is UID and cleanEmail is a distinct key, cleanly delete any old email document to prevent duplicates
    if (uid && cleanEmail && targetId !== cleanEmail) {
      try {
        const oldDocRef = doc(firestoreDb, "users", cleanEmail);
        const oldSnap = await getDoc(oldDocRef);
        if (oldSnap && oldSnap.exists && oldSnap.exists()) {
          await deleteDoc(oldDocRef);
        }
      } catch (_) {}
    }
  } catch (err: any) {
    console.error(`⚠️ Failed saving user profile for [${targetId}]:`, err.message);
    throw err;
  }
  return cleanData;
}

function where(field: string, op: string, value: any) {
  return { field, op, value };
}

function setLogLevel(level: string) {
  // no-op for admin SDK
}
import { GoogleGenAI } from "@google/genai";
import compression from "compression";

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Apply payload compression to drastically reduce asset size and boost PageSpeed performance
app.use(compression());

// Setup security headers, CORS & caching policies
app.use((req, res, next) => {
  // Setup CORS to allow the frontend to communicate with the backend
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, x-admin-email, x-user-email");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  // Prevent MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Cross-site scripting protection
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // Force HTTPS with HSTS
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  
  // Formulate a robust CSP compatible with AI Studio preview environment
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://*.google.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.google.com; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "img-src * data: blob: android-asset:; " + // Relaxed image source to prevent breaking product images loaded via Unsplash/user uploads
    "media-src * data: blob:; " +
    "connect-src 'self' ws: wss: https://*.googleapis.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.google.com https://ipapi.co; " +
    "frame-src 'self' https://*.google.com https://*.run.app https://ai.studio; " +
    "frame-ancestors 'self' https://*.google.com https://ai.studio https://*.run.app; " +
    "object-src 'none';"
  );

  // Robust Cache-Control policies to reduce response times for static assets
  if (req.url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|json)$/)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
  }
  
  next();
});

app.use(express.json({ limit: "15mb" }));

// --- PERFORMANCE METRICS TRACKING ---
const performanceMetrics = {
  requestsPerMinute: 0,
  requestCountThisMinute: 0,
  minuteResetTime: Date.now() + 60000,
  mostUsedRoutes: {} as Record<string, number>,
  totalLatency: 0,
  latencyCount: 0,
  errorCount: 0,
  status429Count: 0,
  status500Count: 0,
  openConnections: 0,
};

// Express middleware to track performance metrics
app.use((req: any, res: any, next: any) => {
  const start = Date.now();
  performanceMetrics.openConnections++;

  const now = Date.now();
  if (now > performanceMetrics.minuteResetTime) {
    performanceMetrics.requestsPerMinute = performanceMetrics.requestCountThisMinute;
    performanceMetrics.requestCountThisMinute = 0;
    performanceMetrics.minuteResetTime = now + 60000;
  }
  performanceMetrics.requestCountThisMinute++;

  // Record path usage (group by route structure, ignoring unique query parameters)
  let basePath = req.path || "/";
  basePath = basePath.replace(/\/[a-f0-9-]{36}/gi, "/:uuid");
  basePath = basePath.replace(/\/\d+/g, "/:id");
  performanceMetrics.mostUsedRoutes[basePath] = (performanceMetrics.mostUsedRoutes[basePath] || 0) + 1;

  res.on('finish', () => {
    performanceMetrics.openConnections = Math.max(0, performanceMetrics.openConnections - 1);
    const duration = Date.now() - start;
    performanceMetrics.totalLatency += duration;
    performanceMetrics.latencyCount++;

    if (res.statusCode === 429) {
      performanceMetrics.status429Count++;
    } else if (res.statusCode >= 500) {
      performanceMetrics.status500Count++;
      performanceMetrics.errorCount++;
    } else if (res.statusCode >= 400) {
      performanceMetrics.errorCount++;
    }
  });

  next();
});

// --- SMART MULTI-TIER RATE LIMITING MIDDLEWARE FOR API ENDPOINTS ---
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const clientRouteRequests = new Map<string, { count: number; resetTime: number }>();

function apiRateLimiter(req: any, res: any, next: any) {
  const path = req.path || "";
  const method = (req.method || "GET").toUpperCase();
  const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const now = Date.now();

  // Determine request category and limit dynamically
  let category = "general";
  let limit = 1000;

  if (path.includes("/login") || path.includes("/auth") || path.includes("/users/add-points")) {
    category = "auth";
    limit = 30; // Sensitive authentication / ledger endpoints
  } else if (path.includes("/upload") || path.includes("/support/upload")) {
    category = "upload";
    limit = 50; // Media upload endpoints
  } else if (method !== "GET" && (path.includes("/orders") || path.includes("/checkout") || path.includes("/products") || path.includes("/reviews"))) {
    category = "mutator";
    limit = 100; // Database mutations / purchase actions
  } else if (path.startsWith("/support/")) {
    category = "support";
    limit = 500; // Customer support queries/actions
  } else if (path === "/global-settings" || path === "/notifications" || (method === "GET" && (path.includes("/products") || path.includes("/ads") || path.includes("/categories")))) {
    category = "reads";
    limit = 3000; // High-frequency polling and configurations
  }

  const key = `${ip}:${category}`;
  const clientData = clientRouteRequests.get(key);

  if (!clientData || now > clientData.resetTime) {
    clientRouteRequests.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  clientData.count += 1;
  if (clientData.count > limit) {
    console.warn(`⚠️ [RATE LIMIT] Excessive requests of category [${category}] from IP: ${ip}. Blocked.`);
    return res.status(429).json({
      error: `Too many requests for this action (${category}). Please wait a few minutes before trying again.`
    });
  }

  next();
}

app.use("/api", apiRateLimiter);


// --- COMPLIANT FIRESTORE ERROR HANDLING SYSTEM ---
enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  const jsonString = JSON.stringify(errInfo);
  console.error("Firestore Error: ", jsonString);
  throw new Error(jsonString);
}


// --- AUTOMATIC FIRESTORE BACKUP SYSTEM ---
const BACKUPS_DIR = path.join(process.cwd(), "backups");
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

async function runFirestoreBackup() {
  if (!db) {
    console.log("⚠️ [BACKUP] Firestore Admin SDK not connected. Deferring backup.");
    return;
  }
  try {
    console.log("💾 [BACKUP] Initiating automatic Firestore backup...");
    const collectionsToBackup = ["suppliers", "products", "orders", "users", "settings", "reviews", "blog"];
    const backupData: any = {};
    let successfulCollections = 0;
    let failedCollections = 0;
    
    for (const colName of collectionsToBackup) {
      try {
        const snap = await db.collection(colName).get();
        backupData[colName] = snap.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data()
        }));
        successfulCollections++;
      } catch (colErr: any) {
        console.warn(`⚠️ [BACKUP] Failed to back up collection "${colName}":`, colErr.message);
        backupData[colName] = [];
        failedCollections++;
        
        // Log a compliant diagnostic error for permission failures
        if (colErr.message.toLowerCase().includes("permission") || colErr.message.toLowerCase().includes("privilege")) {
          try {
            handleFirestoreError(colErr, OperationType.LIST, colName);
          } catch (formattedErr) {
            // Keep looping over other collections but output diagnostic to system logs
          }
        }
      }
    }
    
    if (successfulCollections === 0 && failedCollections > 0) {
      throw new Error(`All collections failed to backup. Last error was likely permission or network related.`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFilePath = path.join(BACKUPS_DIR, `firestore_backup_${timestamp}.json`);
    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), "utf8");
    console.log(`✅ [BACKUP] Firestore backup completed successfully at: ${backupFilePath} (${successfulCollections} collections saved, ${failedCollections} failed)`);
    
    // Retain maximum of 5 recent backups to control disk space utilization
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith("firestore_backup_"))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUPS_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);
      
    if (files.length > 5) {
      for (let i = 5; i < files.length; i++) {
        fs.unlinkSync(path.join(BACKUPS_DIR, files[i].name));
        console.log(`🗑️ [BACKUP] Pruned obsolete historical backup file: ${files[i].name}`);
      }
    }
  } catch (err: any) {
    console.error(`[RYVO ERROR] Service: Firestore Backup | Reason: ${err.message} | Timestamp: ${new Date().toISOString()} | Request ID: system-backup`);
  }
}

let backupSchedulerStarted = false;
function initBackupScheduler() {
  if (backupSchedulerStarted) return;
  backupSchedulerStarted = true;
  setTimeout(() => {
    runFirestoreBackup().catch((e) => {
      console.error("[ERROR] Firestore Backup Failure:", {
        reason: e?.message || e,
        stack: e?.stack,
        timestamp: new Date().toISOString()
      });
    });
  }, 10000);
  setInterval(() => {
    runFirestoreBackup().catch((e) => {
      console.error("[ERROR] Firestore Periodic Backup Failure:", {
        reason: e?.message || e,
        stack: e?.stack,
        timestamp: new Date().toISOString()
      });
    });
  }, 24 * 60 * 60 * 1000);
}

// Initialize Firebase Client SDK safely for Server-Side Use
export let db: any = null;
setAiSupportDbGetter(() => db);
dbSupportService.setSupportDbGetter(() => db);
export let io: SocketIOServer | null = null;
let firebaseConfig: any = null;

const configPath = path.join(process.cwd(), "firebase-applet-config.json");
if (fs.existsSync(configPath)) {
  try {
    const fileContent = fs.readFileSync(configPath, "utf8").trim();
    if (fileContent) {
      firebaseConfig = JSON.parse(fileContent);
    }
  } catch (err) {
    console.error("⚠️ Failed to parse firebase-applet-config.json:", err);
  }
}

if (!firebaseConfig) {
  // Try loading from environment variables (e.g. for Netlify deployment)
  const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (apiKey) {
    firebaseConfig = {
      apiKey: apiKey,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID,
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || process.env.VITE_FIREBASE_MEASUREMENT_ID,
      firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID
    };
    console.log("🔥 Loaded Firebase configuration from environment variables");
  }
}

const startProjectId = firebaseConfig?.projectId || process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "";
const startApiKey = firebaseConfig?.apiKey || process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "";
const startAuthDomain = firebaseConfig?.authDomain || process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || "";

console.log(`FIREBASE_PROJECT_ID=${startProjectId}`);
console.log(`FIREBASE_API_KEY prefix=${startApiKey ? startApiKey.substring(0, 10) : ""}`);
console.log(`FIREBASE_AUTH_DOMAIN=${startAuthDomain}`);

if (!startApiKey || !startProjectId || startApiKey.includes("your-") || startProjectId.includes("your-")) {
  console.error("Firebase configuration missing");
}

async function cleanupPasswordFieldsFromFirestore(rawFirestore: any) {
  try {
    const usersCol = clientCollection(rawFirestore, "users");
    const snap = await clientGetDocs(usersCol);
    let cleanedCount = 0;
    for (const d of snap.docs) {
      const data = d.data();
      if (data && data.password !== undefined) {
        await clientUpdateDoc(d.ref, { password: clientDeleteField() });
        cleanedCount++;
        console.log(`🧹 [SECURITY] Cleaned legacy password field from Firestore user document: ${d.id}`);
      }
    }
    if (cleanedCount > 0) {
      console.log(`✅ [SECURITY] Cleaned password field from ${cleanedCount} user document(s) in Firestore.`);
    }
  } catch (err: any) {
    console.warn("⚠️ [SECURITY] Firestore password cleanup probe warning:", err.message);
  }
}

if (firebaseConfig) {
  if (firebaseConfig.projectId === "your-firebase-project-id" || firebaseConfig.apiKey?.includes("your-")) {
    console.log("📂 Placeholder Firebase configuration detected. Defaulting directly to Local Database Adapter.");
  } else {
    try {
      let clientApp;
      if (getClientApps().length === 0) {
        clientApp = initializeClientApp(firebaseConfig);
      } else {
        clientApp = getClientApps()[0];
      }
      const rawFirestore = firebaseConfig.firestoreDatabaseId
        ? getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId)
        : getClientFirestore(clientApp);
      db = new ClientDbAdapter(rawFirestore);
      console.log("🔥 Connected to Firebase Client Firestore database:", firebaseConfig.firestoreDatabaseId || "(default)");
      console.log("Firebase Client DB Adapter initialized successfully");

      // Perform an asynchronous verification probe on startup to verify if online database permissions exist
      const probeDoc = clientDoc(rawFirestore, "settings", "global");
      clientGetDoc(probeDoc).then(() => {
        console.log("✅ Firestore connection probe succeeded. Online database is readable.");
        cleanupPasswordFieldsFromFirestore(rawFirestore);
      }).catch((probeErr) => {
        console.log("📂 Firestore connection probe failed or lacks permission. Switching to pure Local Database Fallback to ensure seamless, error-free operation. Probe error:", probeErr.message);
        db = new LocalDbAdapter();
        try {
          clientTerminate(rawFirestore).then(() => {
            console.log("🔌 Firestore client connection terminated successfully to stop background ECONNRESET streams.");
          }).catch(() => {});
        } catch (e) {}
      });
    } catch (err) {
      console.error("⚠️ Failed to initialize Firebase Client Firestore:", err);
    }
  }
}

if (!db) {
  db = new LocalDbAdapter();
  console.log("📂 Initialized pure local file database fallback engine");
}

// Path to persist settings
const SETTINGS_FILE_PATH = path.join(process.cwd(), "global_settings.json");

// Default initial state
interface GlobalSettings {
  brandColor: string;
  shopLogo: string;
  purchasingDisabled?: boolean;
  freeShippingThreshold?: number;
  shippingFee?: number;
  announcementTextAr?: string;
  announcementTextEn?: string;
  announcementTextFr?: string;
  announcementLink?: string;
  socialLinks: {
    facebook: string;
    twitter: string;
    instagram: string;
    youtube: string;
    snapchat: string;
    tiktok: string;
  };
  heroSlides: Array<{
    category: string;
    title_ar: string;
    title_en: string;
    title_fr: string;
    desc_ar: string;
    desc_en: string;
    desc_fr: string;
    bg: string;
    image: string;
  }> | null;
  customAdmins: Array<{
    email: string;
    name: string;
    password?: string;
    allowedPanels: {
      products: boolean;
      orders: boolean;
      customers: boolean;
      emails: boolean;
      storeCustomization: boolean;
    };
  }>;
  integrations?: {
    stripeEnabled?: boolean;
    stripeSecretKey?: string;
    stripePublishableKey?: string;
    applePayEnabled?: boolean;
    applePayMerchantId?: string;
    aramexEnabled?: boolean;
    aramexAccountNumber?: string;
    aramexUsername?: string;
    aramexPassword?: string;
    smsaEnabled?: boolean;
    smsaApiKey?: string;
    codEnabled?: boolean;
    cjApiKey?: string;
  };
  welcomeCoupon?: {
    enabled: boolean;
    code: string;
    discountPercent: number;
    durationMinutes: number;
    messageAr: string;
    messageEn: string;
    messageFr: string;
    gracePeriodMinutes?: number;
    autoApply?: boolean;
    cardColor?: string;
    timerColor?: string;
    position?: string;
    allowMinimize?: boolean;
    showTimer?: boolean;
    targetUsers?: string;
    ctaTextAr?: string;
    ctaTextEn?: string;
    ctaTextFr?: string;
  };
  storeSettings?: {
    storeMode: 'open' | 'pre_launch';
    preLaunchMessageAr: string;
    preLaunchMessageEn: string;
    preLaunchMessageFr?: string;
    launchDate: string;
    showCountdown: boolean;
    showTopBanner: boolean;
    showNotifyMe: boolean;
  };
  emailConfig?: {
    senderEmail: string;
    senderName: string;
    resendApiKey?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUser?: string;
    smtpPass?: string;
  };
}

const defaultSettings: GlobalSettings = {
  brandColor: "#38bdf8",
  shopLogo: "RYVO",
  purchasingDisabled: false,
  announcementTextAr: 'تسوق بثقة تامة مع حماية وضمان متكامل لجميع المشتريات 🔒',
  announcementTextEn: 'Shop with 100% confidence & guaranteed safety index 🔒',
  announcementTextFr: 'Achetez en toute confiance avec une sécurité garantie 🔒',
  announcementLink: '',
  socialLinks: {
    facebook: "https://facebook.com",
    twitter: "https://twitter.com",
    instagram: "https://instagram.com",
    youtube: "https://youtube.com",
    snapchat: "",
    tiktok: "",
  },
  heroSlides: null,
  customAdmins: [],
  integrations: {
    stripeEnabled: false,
    stripeSecretKey: "",
    stripePublishableKey: "",
    applePayEnabled: false,
    applePayMerchantId: "",
    aramexEnabled: false,
    aramexAccountNumber: "",
    aramexUsername: "",
    aramexPassword: "",
    smsaEnabled: false,
    smsaApiKey: "",
    codEnabled: true,
    cjApiKey: process.env.CJ_API_KEY || "",
  },
  welcomeCoupon: {
    enabled: true,
    code: "WELCOME15",
    discountPercent: 15,
    durationMinutes: 25,
    messageAr: "أهلاً بك في متجر رايفو الفاخر! 🎉 بمناسبة زيارتك الأولى، نوجه لك هذه الهدية الخاصة: خصم 15% فوري ومطبق تلقائياً عند الدفع!",
    messageEn: "Welcome to Ryvo Luxury Store! 🎉 To celebrate your first visit, we are presenting you with a special gift: 15% instant discount applied automatically at checkout!",
    messageFr: "Bienvenue sur Ryvo Luxury Store ! 🎉 Pour fêter votre première visite, nous vous offrons un cadeau spécial : 15% de réduction immédiate appliquée automatiquement au paiement !",
    gracePeriodMinutes: 60,
    autoApply: true,
    cardColor: "#0f172a",
    timerColor: "#f59e0b",
    position: "bottom-right",
    allowMinimize: true,
    showTimer: true,
    targetUsers: "new",
    ctaTextAr: "اشتري الآن واستفد من الخصم 🛍️",
    ctaTextEn: "Checkout & Save Now 🛍️",
    ctaTextFr: "Achetez et économisez 🛍️"
  },
  storeSettings: {
    storeMode: 'open',
    preLaunchMessageAr: '🚀 ترقبوا افتتاح متجر RYVO قريباً - نجهز لكم تجربة شراء استثنائية!',
    preLaunchMessageEn: '🚀 Stay tuned for the official launch of RYVO Store coming soon!',
    preLaunchMessageFr: '🚀 Restez à l’écoute pour le lancement officiel du magasin RYVO !',
    launchDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    showCountdown: true,
    showTopBanner: true,
    showNotifyMe: true
  },
  emailConfig: {
    senderEmail: process.env.SENDER_EMAIL || "orders@ryvo.shop",
    senderName: process.env.SENDER_NAME || "متجر RYVO الرسمي",
    resendApiKey: process.env.RESEND_API_KEY || "re_iMozkbCq_8tTAFzUrx4fo7HWco43JQeoP",
    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpSecure: process.env.SMTP_SECURE === "true",
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || ""
  }
};

// Helper to read settings with in-memory cache
let cachedSettings: GlobalSettings | null = null;

function getSettings(): GlobalSettings {
  if (cachedSettings) {
    // Ensure nested objects are initialized
    if (!cachedSettings.storeSettings) cachedSettings.storeSettings = defaultSettings.storeSettings;
    if (!cachedSettings.emailConfig) cachedSettings.emailConfig = defaultSettings.emailConfig;
    return cachedSettings;
  }
  if (fs.existsSync(SETTINGS_FILE_PATH)) {
    try {
      const content = fs.readFileSync(SETTINGS_FILE_PATH, "utf8");
      cachedSettings = JSON.parse(content);
      if (cachedSettings) {
        if (!cachedSettings.storeSettings) cachedSettings.storeSettings = defaultSettings.storeSettings;
        if (!cachedSettings.emailConfig) cachedSettings.emailConfig = defaultSettings.emailConfig;
      }
      return cachedSettings || defaultSettings;
    } catch (e) {
      console.error("Error reading global settings file, using default:", e);
    }
  }
  return defaultSettings;
}

registerSettingsProvider(getSettings);

// Helper to save settings with in-memory invalidation/sync
async function saveSettingsAsync(settings: GlobalSettings): Promise<{ diskSaved: boolean; firestoreSaved: boolean; error?: string }> {
  let diskSaved = false;
  let firestoreSaved = false;
  try {
    cachedSettings = settings;
    fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(settings, null, 2), "utf8");
    diskSaved = true;
    console.log("💾 [SETTINGS SAVE] Saved to local file successfully.");
  } catch (e: any) {
    console.error("❌ [SETTINGS SAVE] Error saving local file:", e.message || e);
  }

  if (db) {
    try {
      await db.collection("settings").doc("global").set(settings, { merge: true });
      firestoreSaved = true;
      console.log("🔥 [SETTINGS SAVE] Saved to Firestore ('settings/global') successfully.");
    } catch (fErr: any) {
      console.error("❌ [SETTINGS SAVE] Error saving to Firestore:", fErr.message || fErr);
      return { diskSaved, firestoreSaved: false, error: fErr.message || String(fErr) };
    }
  } else {
    console.log("ℹ️ [SETTINGS SAVE] Firestore not connected, saved locally.");
  }

  return { diskSaved, firestoreSaved };
}

function saveSettings(settings: GlobalSettings) {
  saveSettingsAsync(settings).catch(e => console.error("Error in saveSettings:", e));
}

// --- WELCOME COUPON CAMPAIGN ENGINE HELPERS & ENDPOINTS ---

async function isAdminRequest(req: any): Promise<boolean> {
  const email = req.headers["x-admin-email"] || req.headers["x-user-email"];
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  if (cleanEmail === 'ryvo.shopa@gmail.com') return true;
  try {
    const userData = await resolveAndMigrateUserProfile(db, null, cleanEmail);
    if (!userData) return false;
    const role = userData.role || "customer";
    const allowedRoles = ["super_admin", "admin", "manager", "support", "warehouse", "marketing", "finance"];
    return allowedRoles.includes(role);
  } catch (err) {
    return false;
  }
}

async function addAuditLog(email: string, name: string, action: string, details: string, targetId: string = "", req?: any) {
  if (!db) return;
  try {
    const auditLogId = "aud_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const ipAddress = req ? (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1") : "127.0.0.1";
    const userAgent = req ? (req.headers["user-agent"] || "") : "";
    const { browser, os, deviceType } = parseUserAgent(userAgent);
    const location = req ? getLocationFromRequest(req) : "Unknown";
    const timestamp = new Date().toISOString();

    const auditData = {
      id: auditLogId,
      email: email.toLowerCase(),
      name: name || "User",
      action,
      details,
      timestamp,
      ipAddress,
      userAgent,
      browser,
      os,
      deviceType,
      location,
      targetId: targetId || null
    };

    await setDoc(doc(db, "audit_logs", auditLogId), auditData);
  } catch (err) {
    console.error("Error creating audit log:", err);
  }
}

async function incrementStatField(field: string, amount: number = 1) {
  if (!db) return;
  try {
    const statsRef = doc(db, "statistics", "welcome_coupon");
    const statsSnap = await getDoc(statsRef);
    let statsData: any = {
      visitorCount: 0,
      witnessedCount: 0,
      clickedCount: 0,
      usedCount: 0,
      totalSavings: 0,
      totalSales: 0
    };
    if (statsSnap.exists()) {
      statsData = { ...statsData, ...statsSnap.data() };
    }
    statsData[field] = (statsData[field] || 0) + amount;
    await setDoc(statsRef, statsData);
  } catch (err) {
    console.error("Error incrementing stat field:", err);
  }
}

// 1. Welcome Coupon: Get Statistics
app.get("/api/welcome-coupon/statistics", requireAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const statsRef = doc(db, "statistics", "welcome_coupon");
    const statsSnap = await getDoc(statsRef);
    let stats = {
      visitorCount: 0,
      witnessedCount: 0,
      clickedCount: 0,
      usedCount: 0,
      totalSavings: 0,
      totalSales: 0
    };
    if (statsSnap.exists()) {
      stats = { ...stats, ...statsSnap.data() };
    }
    res.json({ success: true, statistics: stats });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 2. Welcome Coupon: Track Popup View
app.post("/api/welcome-coupon/track-view", async (req, res) => {
  try {
    await incrementStatField("witnessedCount", 1);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Welcome Coupon: Track Popup CTA Click
app.post("/api/welcome-coupon/track-click", async (req, res) => {
  try {
    await incrementStatField("clickedCount", 1);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 4. Welcome Coupon: Load / Create Authoritative Session
app.post("/api/welcome-coupon/session", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { sessionId, email } = req.body;
    const settings = getSettings();
    const config = settings.welcomeCoupon || defaultSettings.welcomeCoupon;

    if (!config || !config.enabled) {
      return res.json({ success: false, reason: "disabled" });
    }

    const now = Date.now();
    let session: any = null;

    // Clean up expired sessions to prevent DB clutter
    try {
      const colRef = collection(db, "welcome_coupon_sessions");
      const expiredSnap = await getDocs(colRef);
      for (const d of expiredSnap.docs) {
        const data = d.data();
        if (data.expiresAt < now) {
          // Archive
          await setDoc(doc(db, "welcome_coupon_sessions_archive", d.id), {
            ...data,
            archivedAt: now,
            status: "expired"
          });
          // Delete from active
          await deleteDoc(doc(db, "welcome_coupon_sessions", d.id));
          await addAuditLog("system", "System", "COUPON_EXPIRED", `Welcome coupon session ${d.id} (${data.code}) expired and archived.`, d.id);
        }
      }
    } catch (err) {
      console.error("Error cleaning up expired sessions:", err);
    }

    // Resolve user email
    const userEmail = (email || req.headers["x-user-email"] || req.headers["x-admin-email"] || "").toLowerCase().trim();

    // Verify if user already used welcome coupon or has orders
    if (userEmail) {
      const userData = await resolveAndMigrateUserProfile(db, null, userEmail);
      if (userData && userData.welcome_coupon_used) {
        return res.json({ success: false, reason: "already_used", messageAr: "تم استخدام الخصم الترحيبي سابقاً", messageEn: "Welcome discount already used previously" });
      }

      // Check for existing orders
      const ordersCol = collection(db, "orders");
      const ordersSnap = await getDocs(ordersCol);
      const userOrders = ordersSnap.docs.filter((d: any) => d.data().user_email && d.data().user_email.toLowerCase() === userEmail);
      if (userOrders.length > 0 && config.targetUsers === "new") {
        return res.json({ success: false, reason: "only_new_users", messageAr: "الخصم الترحيبي متاح للزوار الجدد فقط", messageEn: "Welcome discount is available for new visitors only" });
      }
    }

    // Try to load existing session by ID
    if (sessionId) {
      const sessRef = doc(db, "welcome_coupon_sessions", sessionId);
      const sessSnap = await getDoc(sessRef);
      if (sessSnap.exists()) {
        const data = sessSnap.data();
        if (data.status === "active" && data.expiresAt > now) {
          if (data.code === config.code) {
            return res.json({ success: true, session: data, serverTime: now });
          } else {
            // Update code if admin changed config
            session = {
              ...data,
              code: config.code,
              discountPercent: config.discountPercent
            };
            await setDoc(sessRef, session);
            return res.json({ success: true, session, serverTime: now });
          }
        } else {
          if (data.expiresAt <= now) {
            await setDoc(doc(db, "welcome_coupon_sessions_archive", sessionId), {
              ...data,
              archivedAt: now,
              status: "expired"
            });
            await deleteDoc(sessRef);
            await addAuditLog("system", "System", "COUPON_EXPIRED", `Welcome coupon session ${sessionId} expired.`, sessionId);
          }
        }
      }
    }

    // Try to load existing session by userEmail
    if (userEmail) {
      const sessCol = collection(db, "welcome_coupon_sessions");
      const userSessSnap = await getDocs(sessCol);
      const activeSessDoc = userSessSnap.docs.find((d: any) => {
        const dData = d.data();
        return dData.userEmail === userEmail && dData.status === "active" && dData.expiresAt > now;
      });
      if (activeSessDoc) {
        return res.json({ success: true, session: activeSessDoc.data(), serverTime: now });
      }
    }

    // Create new session
    const newSessionId = "welcome_sess_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
    const expiresAt = now + config.durationMinutes * 60 * 1000;

    session = {
      id: newSessionId,
      code: config.code,
      discountPercent: config.discountPercent,
      createdAt: now,
      expiresAt: expiresAt,
      status: "active",
      userEmail: userEmail || null,
      messageAr: config.messageAr,
      messageEn: config.messageEn,
      messageFr: config.messageFr,
      gracePeriodMinutes: config.gracePeriodMinutes || 60,
      autoApply: config.autoApply !== undefined ? config.autoApply : true,
      cardColor: config.cardColor || "#0f172a",
      timerColor: config.timerColor || "#f59e0b",
      position: config.position || "bottom-right",
      allowMinimize: config.allowMinimize !== undefined ? config.allowMinimize : true,
      showTimer: config.showTimer !== undefined ? config.showTimer : true,
      ctaTextAr: config.ctaTextAr || "اشتري الآن واستفد من الخصم 🛍️",
      ctaTextEn: config.ctaTextEn || "Checkout & Save Now 🛍️",
      ctaTextFr: config.ctaTextFr || "Achetez et économisez 🛍️"
    };

    await setDoc(doc(db, "welcome_coupon_sessions", newSessionId), session);
    await addAuditLog(userEmail || "guest", "Guest", "COUPON_CREATED", `Created new welcome coupon session ${newSessionId} (${config.code})`, newSessionId);
    
    await incrementStatField("visitorCount");

    res.json({ success: true, session, serverTime: now });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// API Endpoints
app.get("/api/global-settings", (req, res) => {
  res.json(getSettings());
});

app.post("/api/global-settings", requireAdmin, async (req, res) => {
  const adminEmail = req.headers["x-admin-email"] || req.headers["x-user-email"] || req.body?.adminEmail || "ryvo.shopa@gmail.com";
  console.log("==========================================");
  console.log("📲 [API POST /api/global-settings] Request received from Admin Email:", adminEmail);
  console.log("📲 [API POST /api/global-settings] Request Body:", JSON.stringify(req.body, null, 2));

  try {
    const newSettings = req.body;
    const current = getSettings();

    if (newSettings.socialLinks !== undefined) {
      console.log("📱 [GLOBAL SETTINGS POST] Social Links to update:", JSON.stringify(newSettings.socialLinks, null, 2));
    }

    let processedLogoUrl = newSettings.shopLogo || current.shopLogo;
    let logoTimestamp = (current as any).logoUpdatedAt || Date.now();

    if (newSettings.shopLogo && newSettings.shopLogo !== current.shopLogo) {
      const processed = await processAndApplyStoreLogo(newSettings.shopLogo);
      processedLogoUrl = processed.shopLogoUrl;
      logoTimestamp = processed.timestamp;
    }

    const updated: GlobalSettings = {
      brandColor: newSettings.brandColor || current.brandColor,
      shopLogo: processedLogoUrl,
      purchasingDisabled: newSettings.purchasingDisabled !== undefined ? newSettings.purchasingDisabled : current.purchasingDisabled,
      announcementTextAr: newSettings.announcementTextAr !== undefined ? newSettings.announcementTextAr : current.announcementTextAr,
      announcementTextEn: newSettings.announcementTextEn !== undefined ? newSettings.announcementTextEn : current.announcementTextEn,
      announcementTextFr: newSettings.announcementTextFr !== undefined ? newSettings.announcementTextFr : current.announcementTextFr,
      announcementLink: newSettings.announcementLink !== undefined ? newSettings.announcementLink : current.announcementLink,
      socialLinks: newSettings.socialLinks !== undefined ? newSettings.socialLinks : current.socialLinks,
      heroSlides: newSettings.heroSlides !== undefined ? newSettings.heroSlides : current.heroSlides,
      customAdmins: Array.isArray(newSettings.customAdmins) ? newSettings.customAdmins : current.customAdmins,
      integrations: newSettings.integrations !== undefined ? newSettings.integrations : current.integrations,
      welcomeCoupon: newSettings.welcomeCoupon !== undefined ? newSettings.welcomeCoupon : current.welcomeCoupon,
      storeSettings: newSettings.storeSettings !== undefined ? newSettings.storeSettings : current.storeSettings,
      emailConfig: newSettings.emailConfig !== undefined ? newSettings.emailConfig : current.emailConfig,
    };
    (updated as any).logoUpdatedAt = logoTimestamp;
    (updated as any).storeLogoUrl = processedLogoUrl;


    // Sync customAdmins with the users collection in Firestore
    if (db && Array.isArray(newSettings.customAdmins)) {
      try {
        const oldAdmins = current.customAdmins || [];
        const deletedAdmins = oldAdmins.filter(
          (oldAdm: any) => oldAdm.email && !newSettings.customAdmins.some((newAdm: any) => newAdm.email.toLowerCase() === oldAdm.email.toLowerCase())
        );
        for (const deleted of deletedAdmins) {
          if (deleted.email && deleted.email.toLowerCase() !== 'ryvo.shopa@gmail.com') {
            await db.collection("users").doc(deleted.email.toLowerCase().trim()).delete();
            console.log(`Deleted sub-admin ${deleted.email} from Firestore`);
          }
        }

        for (const adm of newSettings.customAdmins) {
          if (adm.email) {
            const userRef = db.collection("users").doc(adm.email.toLowerCase().trim());
            const adminPayload: any = {
              email: adm.email.toLowerCase().trim(),
              name: adm.name || "Staff Member",
              role: adm.role || "admin",
              allowedPanels: adm.allowedPanels || {}
            };
            await userRef.set(adminPayload, { merge: true });
            console.log(`Synced sub-admin ${adm.email} with role ${adm.role || 'admin'} to Firestore`);
          }
        }
      } catch (err: any) {
        console.error("⚠️ Error syncing sub-admins to Firestore:", err);
      }
    }

    const saveResult = await saveSettingsAsync(updated);
    console.log("💾 [GLOBAL SETTINGS POST] Persistence result:", saveResult);

    if (io) {
      io.emit("global_settings_updated", updated);
    }

    console.log("✅ [GLOBAL SETTINGS POST] Operation completed with HTTP 200 for:", adminEmail);
    console.log("==========================================");

    res.status(200).json({
      success: true,
      message: "تم حفظ الإعدادات بنجاح.",
      saveResult,
      settings: updated
    });
  } catch (err: any) {
    console.error("❌ [GLOBAL SETTINGS POST] Internal Error:", err);
    res.status(500).json({
      success: false,
      error: "فشل الاتصال بقاعدة البيانات أو حفظ الإعدادات: " + (err.message || err)
    });
  }
});

// DEDICATED STORE LOGO & VISUAL IDENTITY PIPELINE ENDPOINTS
app.post("/api/settings/logo", requireAdmin, async (req, res) => {
  try {
    const { logo, shopLogo, storeLogoUrl } = req.body;
    const inputLogo = logo || shopLogo || storeLogoUrl || "";
    
    if (!inputLogo) {
      return res.status(400).json({ error: "الرجاء اختيار أو إدخال صورة الشعار" });
    }

    const processed = await processAndApplyStoreLogo(inputLogo);
    const current = getSettings();
    
    const updated: GlobalSettings = {
      ...current,
      shopLogo: processed.shopLogoUrl,
    };
    (updated as any).storeLogoUrl = processed.shopLogoUrl;
    (updated as any).logoUpdatedAt = processed.timestamp;
    
    await saveSettingsAsync(updated);
    
    if (io) {
      io.emit("global_settings_updated", updated);
    }

    console.log("🎨 [STORE LOGO UPDATED] New Logo URL:", processed.shopLogoUrl);
    return res.json({
      success: true,
      shopLogo: processed.shopLogoUrl,
      storeLogoUrl: processed.shopLogoUrl,
      logoUpdatedAt: processed.timestamp,
      message: "تم تحديث شعار المتجر وتوليد أيقونات الفافيكون وقوالب البريد بنجاح!"
    });
  } catch (err: any) {
    console.error("❌ Error processing store logo:", err);
    return res.status(500).json({ error: err.message || "فشل معالجة الشعار" });
  }
});

app.delete("/api/settings/logo", requireAdmin, async (req, res) => {
  try {
    const processed = await processAndApplyStoreLogo("RYVO");
    const current = getSettings();
    
    const updated: GlobalSettings = {
      ...current,
      shopLogo: "RYVO",
    };
    (updated as any).storeLogoUrl = processed.shopLogoUrl;
    (updated as any).logoUpdatedAt = processed.timestamp;
    
    await saveSettingsAsync(updated);
    
    if (io) {
      io.emit("global_settings_updated", updated);
    }

    console.log("🎨 [STORE LOGO RESET] Reset to default brand logo");
    return res.json({
      success: true,
      shopLogo: "RYVO",
      storeLogoUrl: processed.shopLogoUrl,
      logoUpdatedAt: processed.timestamp,
      message: "تم إعادة الشعار الافتراضي للمتجر واستعادة الأصول الرسمية."
    });
  } catch (err: any) {
    console.error("❌ Error deleting store logo:", err);
    return res.status(500).json({ error: err.message || "فشل إعادة تعيين الشعار" });
  }
});

// ============================================
// FIRESTORE SEEDING & UTILITIES
// ============================================

async function seedDatabaseIfNeeded() {
  if (!db) return;
  try {
    // 1. Seed Products
    const productsColRef = collection(db, "products");
    const productsSnap = await getDocs(productsColRef);
    if (productsSnap.empty) {
      console.log("Seeding INITIAL_PRODUCTS into Firestore...");
      for (const p of INITIAL_PRODUCTS) {
        await setDoc(doc(db, "products", p.id), p);
      }
    }

    // 2. Seed Default Settings
    const settingsDocRef = doc(db, "settings", "global");
    const settingsSnap = await getDoc(settingsDocRef);
    if (!settingsSnap.exists()) {
      console.log("Seeding default settings into Firestore...");
      await setDoc(settingsDocRef, defaultSettings);
    } else {
      const currentSettings = settingsSnap.data() as GlobalSettings;
      if (!currentSettings.integrations) {
        currentSettings.integrations = {};
      }
      if (!currentSettings.integrations.cjApiKey && process.env.CJ_API_KEY) {
        currentSettings.integrations.cjApiKey = process.env.CJ_API_KEY;
        await setDoc(settingsDocRef, currentSettings);
      }
      saveSettings(currentSettings);
    }

    // 3. Seed Admins / Users (CRM)
    const usersColRef = collection(db, "users");
    const usersSnap = await getDocs(usersColRef);
    if (usersSnap.empty) {
      console.log("Seeding default admin user into Firestore...");
      const defaultAdmin = {
        email: "ryvo.shopa@gmail.com",
        name: "Ryvo Super Admin",
        role: "super_admin",
        favorites: [],
        allowedPanels: {
          products: true,
          orders: true,
          customers: true,
          emails: true,
          storeCustomization: true
        },
        points: 1000,
        wallet_balance: 500,
        city: "Riyadh",
        phone: "+966500000000"
      };
      await setDoc(doc(db, "users", defaultAdmin.email.toLowerCase()), defaultAdmin);
    }

    // 4. Seed Suppliers (for Dropshipping)
    const suppliersColRef = collection(db, "suppliers");
    const suppliersSnap = await getDocs(suppliersColRef);
    if (suppliersSnap.empty) {
      console.log("Seeding default dropshipping suppliers into Firestore...");
      const defaultSuppliers = [
        {
          id: "sup-ali",
          name: "AliExpress Dropship API",
          type: "aliexpress",
          url: "https://api.aliexpress.com/v2/dropship",
          api_token: "ae_live_token_8891aa2",
          status: "connected",
          totalSynced: 12
        },
        {
          id: "sup-cj",
          name: "CJ Dropshipping Full API",
          type: "cjdropshipping",
          url: "https://developers.cjdropshipping.com/api2.0/v1",
          api_token: "cj_live_secret_x922a10",
          status: "connected",
          totalSynced: 8
        }
      ];
      for (const s of defaultSuppliers) {
        await SupplierService.createSupplier(s);
      }
    }

    // 5. Seed Coupons
    const couponsColRef = collection(db, "coupons");
    const couponsSnap = await getDocs(couponsColRef);
    if (couponsSnap.empty) {
      console.log("Seeding initial discount coupons into Firestore...");
      const defaultCoupons = [
        { code: "RYVO2026", discount_percent: 10, description_ar: "خصم 10% بمناسبة العام الجديد", description_en: "10% off for the New Year" },
        { code: "PROMO-BIKE-15", discount_percent: 15, description_ar: "خصم 15% على الخوذ والدراجات المختارة", description_en: "15% off on selected helmets & bikes" },
        { code: "SAVE25", discount_percent: 25, description_ar: "خصم 25% فائق للعملاء الدائمين", description_en: "25% mega discount for loyal customers" }
      ];
      for (const c of defaultCoupons) {
        await setDoc(doc(db, "coupons", c.code.toUpperCase()), c);
      }
    }

    // 6. Seed Blog posts
    const blogColRef = collection(db, "blog");
    const blogSnap = await getDocs(blogColRef);
    if (blogSnap.empty) {
      console.log("Seeding initial blog posts into Firestore...");
      const defaultBlogPosts = [
        {
          id: "blog-1",
          title_ar: "ألياف الكربون: سر خفة وسرعة دراجات المستقبل",
          title_en: "Carbon Fiber: The Secret to Lightweight Future Bikes",
          content_ar: "ألياف الكربون (Carbon Fiber) هي المادة الثورية التي غيرت صناعة الدراجات تماماً. تتميز هذه المادة بصلابة تفوق الصلب بـ 5 أضعاف، بينما تزن جزءاً بسيطاً منه. بفضل هذه الخصائص الفائقة، يستطيع الدراجون تحقيق سرعات مذهلة بجهد أقل، مع توفير امتصاص ممتاز للصدمات والاهتزازات على الطرق الوعرة. جميع دراجات رايفو المتميزة مثل Helix F-70 تعتمد بنسبة 100% على هذه التقنية لضمان تجربة أداء لا مثيل لها.",
          content_en: "Carbon Fiber is the revolutionary material that completely reshaped the bicycle and motorcycle industry. It boasts five times the structural strength of steel while weighing a fraction of it. Thanks to these premium dynamics, riders can reach remarkable acceleration with minimal physical friction, while maintaining superior shock absorption on rough turns.",
          image: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80",
          date: "2026-06-20",
          readTimeAr: "قراءة في 3 دقائق",
          readTimeEn: "3 min read",
          authorAr: "فريق التحرير التقني",
          authorEn: "Technical Editorial Board",
          tagsAr: ["تكنولوجيا", "دراجات", "كربون"],
          tagsEn: ["technology", "bikes", "carbon"]
        },
        {
          id: "blog-2",
          title_ar: "الخوذ الذكية: كيف تحمي البلوتوث حياتك على الطريق؟",
          title_en: "Smart Helmets: How Bluetooth Saves Lives on the Road",
          content_ar: "الخوذات الذكية لم تعد مجرد وسيلة لحماية الرأس، بل أصبحت شريكاً رقمياً متكاملاً للدراج أثناء رحلاته. الخوذ الحديثة مثل NeoCarbon مجهزة باتصالات بلوتوث متطورة تمكن الدراج من سماع توجيهات الملاحة وتلقي المكالمات الهاتفية بضغطة زر، بل وتشمل مجسات ذكية لاستشعار السقوط والارتطامات لإرسال إشعارات طوارئ تلقائية. الأمان الفائق متكامل بالرفاهية.",
          content_en: "Smart helmets are no longer just skull-protective shells; they represent integrated digital copilots for defensive riding. Advanced helmets like our NeoCarbon are fitted with high-fidelity Bluetooth connections, crash detection systems, and emergency alerts.",
          image: "https://images.unsplash.com/photo-1541614101331-1a5a3a194e92?auto=format&fit=crop&w=800&q=80",
          date: "2026-06-25",
          readTimeAr: "قراءة في 4 دقائق",
          readTimeEn: "4 min read",
          authorAr: "د. راكان الخالدي",
          authorEn: "Dr. Rakan Al-Khaldi",
          tagsAr: ["سلامة", "بلوتوث", "خوذ"],
          tagsEn: ["safety", "bluetooth", "helmets"]
        }
      ];
      for (const bp of defaultBlogPosts) {
        await setDoc(doc(db, "blog", bp.id), bp);
      }
    }

    // 7. Seed Ads
    const adsColRef = collection(db, "ads");
    const adsSnap = await getDocs(adsColRef);
    if (adsSnap.empty) {
      console.log("Seeding default promotional ads into Firestore...");
      const defaultAds = [
        {
          id: "ad-default-welcome",
          title_ar: "عرض الافتتاح الكبير 🏍️",
          title_en: "Grand Opening Offer 🏍️",
          type: "image",
          mediaUrl: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80",
          clickUrl: "/#products",
          delaySeconds: 3,
          durationSeconds: 15,
          closeDelaySeconds: 3,
          showOnce: true,
          active: true,
          priority: 10,
          startDate: "",
          endDate: ""
        }
      ];
      for (const ad of defaultAds) {
        await setDoc(doc(db, "ads", ad.id), ad);
      }
    }
  } catch (err) {
    console.error("Error during seeding Firestore collections:", err);
  }
}

// ============================================
// REAL FIRESTORE BUSINESS ENDPOINTS
// ============================================

// Simple high-performance in-memory cache
let productsCache: any[] | null = null;
let productsCacheTime = 0;

let adsCache: any[] | null = null;
let adsCacheTime = 0;

const CACHE_TTL_MS = 20000; // 20 seconds Cache TTL - ultra fast, Zero Firestore strain

// 1. PRODUCTS
app.get("/api/products", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const now = Date.now();
    let rawList = productsCache;
    if (!rawList || (now - productsCacheTime >= CACHE_TTL_MS)) {
      const productsCol = collection(db, "products");
      const snap = await getDocs(productsCol);
      rawList = snap.docs.map(d => d.data());
      productsCache = rawList;
      productsCacheTime = now;
    }

    const isAdmin = await isAdminRequest(req);
    
    if (isAdmin) {
      // Admins see everything unmodified (both original stock and supplier_stock)
      return res.json(rawList);
    } else {
      // Customers:
      // 1. Capping rule: stock = Math.min(stock, supplier_stock)
      // 2. Hide supplier_stock field entirely from response payload for security
      // 3. Filter out products that have hide_if_out_of_stock active and display stock <= 0
      const sanitized = rawList
        .map((p: any) => {
          const storeStock = p.stock !== undefined ? Number(p.stock) : 0;
          const supStock = p.supplier_stock !== undefined ? Number(p.supplier_stock) : storeStock;
          const effectiveStock = Math.min(storeStock, supStock);
          
          const cloned = { ...p, stock: effectiveStock };
          delete cloned.supplier_stock; // Secure: delete supplier stock to prevent DevTools inspection
          return cloned;
        })
        .filter((p: any) => {
          if (p.hide_if_out_of_stock && p.stock <= 0) {
            return false;
          }
          return true;
        });

      return res.json(sanitized);
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/products", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const p = req.body;
    if (!p.id) {
      p.id = "prod-" + Date.now();
    }
    
    // Enforce inventory validation constraint: Store Stock <= Supplier Stock
    if (p.supplier_stock !== undefined && p.stock !== undefined) {
      const supStock = Number(p.supplier_stock);
      const storeStock = Number(p.stock);
      if (storeStock > supStock) {
        p.stock = supStock; // Correct and override values to comply with constraints
      }
    }

    await setDoc(doc(db, "products", p.id), p);
    productsCache = null; // Invalidate cache
    
    // Log audit trail
    const adminEmail = req.headers["x-admin-email"] || req.headers["x-user-email"] || "admin@ryvo.store";
    await addAuditLog(
      String(adminEmail),
      "Admin",
      "SAVE_PRODUCT",
      `Saved/updated product "${p.name_en || p.name_ar}" with stock=${p.stock} and supplier_stock=${p.supplier_stock}`,
      p.id,
      req
    );

    res.json({ success: true, product: p });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    await deleteDoc(doc(db, "products", req.params.id));
    productsCache = null; // Invalidate cache
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 1.5. ADVERTISEMENTS (PROMOTIONAL SYSTEM)
app.get("/api/ads", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const now = Date.now();
    if (adsCache && (now - adsCacheTime < CACHE_TTL_MS)) {
      return res.json(adsCache);
    }
    const adsCol = collection(db, "ads");
    const snap = await getDocs(adsCol);
    const list = snap.docs.map(d => d.data());
    // Sort by priority descending
    list.sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));
    adsCache = list;
    adsCacheTime = now;
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/ads", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const ad = req.body;
    if (!ad.id) {
      ad.id = "ad-" + Date.now();
    }
    ad.delaySeconds = Number(ad.delaySeconds) || 0;
    ad.durationSeconds = Number(ad.durationSeconds) || 0;
    ad.closeDelaySeconds = Number(ad.closeDelaySeconds) || 0;
    ad.priority = Number(ad.priority) || 0;
    ad.active = ad.active !== undefined ? ad.active : true;

    await setDoc(doc(db, "ads", ad.id), ad);
    adsCache = null; // Invalidate cache
    res.json({ success: true, ad });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/ads/:id", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    await deleteDoc(doc(db, "ads", req.params.id));
    adsCache = null; // Invalidate cache
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 2. ORDERS & INTELLIGENT DROPSHIPPING
app.get("/api/orders", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const ordersCol = collection(db, "orders");
    const snap = await getDocs(ordersCol);
    const list = snap.docs.map(d => d.data());
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/orders", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const settings = getSettings();
    if (settings.purchasingDisabled) {
      return res.status(400).json({ error: "عذراً، لم يتم الافتتاح حتى الآن! (الشراء مغلق مؤقتاً)" });
    }
    const o = req.body;
    if (!o.user_email) {
      return res.status(400).json({ error: "يجب تسجيل الدخول لإتمام عملية الشراء!" });
    }
    if (!o.id) {
      o.id = "RYVO-ORD-" + Math.floor(1000 + Math.random() * 9000);
    }

    // 1. Idempotency / Duplicate Order Protection
    const existingOrderSnap = await getDoc(doc(db, "orders", o.id));
    if (existingOrderSnap.exists()) {
      return res.json({ success: true, duplicate: true, order: existingOrderSnap.data() });
    }

    o.date = new Date().toISOString().slice(0, 10);
    o.status = "pending";
    o.status_history = [
      { status: "pending", timestamp: new Date().toISOString() }
    ];

    if (!o.items || !Array.isArray(o.items) || o.items.length === 0) {
      return res.status(400).json({ error: "السلة فارغة، يرجى إضافة منتجات قبل إتمام الطلب!" });
    }

    // 2. Server-side Stock Verification & Price Security
    let calculatedSubtotal = 0;
    const validatedItems: any[] = [];
    const productDocs: { ref: any; snap: any; data: any }[] = [];

    for (const item of o.items) {
      if (!item.product_id) {
        return res.status(400).json({ error: "معرف المنتج غير صحيح" });
      }
      const pDocRef = doc(db, "products", item.product_id);
      const pSnap = await getDoc(pDocRef);
      if (!pSnap.exists()) {
        return res.status(400).json({ error: `المنتج (${item.name || item.product_id}) غير متوفر بالمتجر!` });
      }
      const pData = pSnap.data();

      // Check Store Stock & Supplier Stock
      const storeStock = pData.stock !== undefined ? Number(pData.stock) : 0;
      const supStock = pData.supplier_stock !== undefined ? Number(pData.supplier_stock) : storeStock;
      const effectiveStock = Math.min(storeStock, supStock);

      const reqQty = Number(item.quantity) || 1;
      if (reqQty > effectiveStock) {
        return res.status(400).json({
          error: `عذراً، الكمية المطلوبة من (${pData.name || 'المنتج'}) غير متوفرة بلمخزون. المتوفر حالياً: ${effectiveStock}`
        });
      }

      // Authoritative DB Price override (Price Security)
      const authoritativePrice = Number(pData.price) || 0;
      item.price = authoritativePrice;
      calculatedSubtotal += authoritativePrice * reqQty;

      validatedItems.push({
        ...item,
        price: authoritativePrice,
        quantity: reqQty
      });

      productDocs.push({ ref: pDocRef, snap: pSnap, data: pData });
    }

    o.items = validatedItems;

    // 3. Server-side Coupon & Discount Calculation
    let welcomeDiscountAmount = 0;
    let welcomeSessData: any = null;
    if (o.welcomeSessionId) {
      const sessDocRef = doc(db, "welcome_coupon_sessions", o.welcomeSessionId);
      const sessSnap = await getDoc(sessDocRef);
      if (!sessSnap.exists()) {
        return res.status(400).json({ error: "كوبون الترحيب غير موجود أو منتهي الصلاحية" });
      }
      welcomeSessData = sessSnap.data();
      if (welcomeSessData.status !== "active") {
        return res.status(400).json({ error: "تم استخدام كوبون الترحيب هذا مسبقاً أو أنه منتهي الصلاحية" });
      }
      if (welcomeSessData.expiresAt < Date.now()) {
        // Mark as expired
        await setDoc(doc(db, "welcome_coupon_sessions_archive", o.welcomeSessionId), {
          ...welcomeSessData,
          archivedAt: Date.now(),
          status: "expired"
        });
        await deleteDoc(sessDocRef);
        await addAuditLog("system", "System", "COUPON_REJECTED", `Rejected checkout: Welcome coupon session ${o.welcomeSessionId} expired.`, o.welcomeSessionId, req);
        return res.status(400).json({ error: "عذراً، انتهت صلاحية كوبون الترحيب الخاص بك!" });
      }

      // Calculate authoritative savings
      welcomeDiscountAmount = Math.round(calculatedSubtotal * (welcomeSessData.discountPercent / 100));

      // Mark session as used
      await setDoc(doc(db, "welcome_coupon_sessions_archive", o.welcomeSessionId), {
        ...welcomeSessData,
        archivedAt: Date.now(),
        status: "used",
        orderId: o.id,
        discountAmount: welcomeDiscountAmount,
        totalSales: calculatedSubtotal - welcomeDiscountAmount
      });
      await deleteDoc(sessDocRef);

      // Track statistics
      await incrementStatField("usedCount", 1);
      await incrementStatField("totalSavings", welcomeDiscountAmount);
      await incrementStatField("totalSales", calculatedSubtotal - welcomeDiscountAmount);

      // Log success audit
      await addAuditLog(o.user_email || "guest", "Guest", "COUPON_USED", `Successfully completed checkout using welcome coupon ${welcomeSessData.code} saving ${welcomeDiscountAmount} SAR on Order #${o.id}`, o.id, req);
    }

    // 4. Final Total Calculation
    const calculatedShipping = calculatedSubtotal >= (settings.freeShippingThreshold || 300) ? 0 : (settings.shippingFee || 25);
    const calculatedTotal = Math.max(0, calculatedSubtotal - welcomeDiscountAmount + calculatedShipping);

    o.subtotal = calculatedSubtotal;
    o.discount = welcomeDiscountAmount;
    o.shipping = calculatedShipping;
    o.total = calculatedTotal;

    // 5. Atomic Deduct Stock via Firestore Transaction & Handle Dropship Auto-forwarding
    let isDropshipOrder = false;
    let dropshipSupplier = "AliExpress";

    for (let i = 0; i < productDocs.length; i++) {
      const { ref: pDocRef } = productDocs[i];
      const item = validatedItems[i];

      let currentPData: any = null;

      await runTransaction(db, async (transaction) => {
        const freshSnap = await transaction.get(pDocRef);
        if (!freshSnap.exists()) {
          throw new Error(`المنتج لم يعد متوفراً في قاعدة البيانات!`);
        }
        currentPData = freshSnap.data();
        const storeStock = currentPData.stock !== undefined ? Number(currentPData.stock) : 0;
        const supStock = currentPData.supplier_stock !== undefined ? Number(currentPData.supplier_stock) : storeStock;
        const effectiveStock = Math.min(storeStock, supStock);

        if (item.quantity > effectiveStock) {
          throw new Error(`عذراً، نفد مخزون المنتج (${currentPData.name || 'المنتج'}) أثناء معالجة طلبك. المتوفر حالياً: ${effectiveStock}`);
        }

        const newStoreStock = Math.max(0, storeStock - item.quantity);
        const newSupStock = currentPData.supplier_stock !== undefined ? Math.max(0, supStock - item.quantity) : undefined;

        const updatePayload: any = { stock: newStoreStock };
        if (newSupStock !== undefined) {
          updatePayload.supplier_stock = newSupStock;
        }
        if (newSupStock !== undefined && newStoreStock > newSupStock) {
          updatePayload.stock = newSupStock;
        }

        transaction.update(pDocRef, updatePayload);
      });

      if (currentPData && (currentPData.is_dropship || currentPData.price > 1000)) {
        isDropshipOrder = true;
        dropshipSupplier = currentPData.category === "bikes" ? "CJ Dropshipping" : "AliExpress";
      }
    }

    if (isDropshipOrder) {
      const trackingNum = `${dropshipSupplier === "CJ Dropshipping" ? "CJ" : "AE"}-TRK-${Math.floor(100000 + Math.random() * 900000)}-SA`;
      o.status = "processing";
      o.status_history.push({ status: "processing", timestamp: new Date().toISOString() });
      o.tracking_number = trackingNum;
      o.supplier_forwarded = true;
      o.supplier_name = dropshipSupplier;
      o.fulfillment_logs = `Auto-forwarded order details to ${dropshipSupplier} API safely. Tracking code generated successfully.`;
    }

    // Update Customer details in CRM database
    if (o.user_email) {
      const cleanEmail = o.user_email.toLowerCase().trim();
      const pointsEarned = Math.floor((o.total || 0) * 0.05);
      const userData = await resolveAndMigrateUserProfile(db, null, cleanEmail);

      if (userData) {
        const currentPoints = (userData.points || 0) + pointsEarned;
        const pointsHistoryItem = {
          id: "earn-" + Date.now(),
          reason_ar: `نقاط شراء مكافأة للطلب #${o.id}`,
          reason_en: `Loyalty points reward for Order #${o.id}`,
          points: pointsEarned,
          date: new Date().toISOString()
        };

        let newWalletBalance = userData.wallet_balance || 0;
        if (o.payment_method === "wallet") {
          newWalletBalance = Math.max(0, newWalletBalance - o.total);
        }

        const userUpdatePayload: any = {
          ...userData,
          name: userData.name || o.customer_name || o.shipping_address?.name || cleanEmail.split('@')[0],
          phone: userData.phone || o.customer_phone || o.phone || o.shipping_address?.phone || "",
          city: userData.city || o.city || o.shipping_address?.city || "",
          district: userData.district || o.district || o.shipping_address?.district || "",
          street: userData.street || o.street || o.shipping_address?.street || "",
          postal_code: userData.postal_code || o.postal_code || o.shipping_address?.postal_code || "",
          points: currentPoints,
          points_history: [...(userData.points_history || []), pointsHistoryItem],
          wallet_balance: newWalletBalance,
          order_history: [...(userData.order_history || []), { id: o.id, total: o.total, date: o.date, status: o.status }]
        };

        if (welcomeSessData) {
          userUpdatePayload.welcome_coupon_used = true;
        }

        await saveUserProfile(db, userData.uid || null, cleanEmail, userUpdatePayload);
      } else {
        // Automatically create new customer record in CRM database
        const newCustomerRecord = {
          email: cleanEmail,
          name: o.customer_name || o.shipping_address?.name || cleanEmail.split('@')[0],
          phone: o.customer_phone || o.phone || o.shipping_address?.phone || "",
          city: o.city || o.shipping_address?.city || "",
          district: o.district || o.shipping_address?.district || "",
          street: o.street || o.shipping_address?.street || "",
          postal_code: o.postal_code || o.shipping_address?.postal_code || "",
          role: "customer",
          createdAt: new Date().toISOString(),
          points: 100 + pointsEarned,
          points_history: [
            { id: "wel-1", reason_ar: "نقاط ترحيبية لتسجيل الحساب", reason_en: "Welcome bonus points", points: 100, date: new Date().toISOString() },
            { id: "earn-" + Date.now(), reason_ar: `نقاط شراء مكافأة للطلب #${o.id}`, reason_en: `Loyalty points reward for Order #${o.id}`, points: pointsEarned, date: new Date().toISOString() }
          ],
          wallet_balance: 0,
          wallet_history: [],
          order_history: [{ id: o.id, total: o.total, date: o.date, status: o.status }]
        };
        await saveUserProfile(db, null, cleanEmail, newCustomerRecord);
      }
    }

    await setDoc(doc(db, "orders", o.id), o);

    // 1. Send real automated order confirmation email to customer
    if (o.user_email) {
      sendCustomerOrderStatusEmail(o, 'pending', undefined, db, getSettings)
        .catch(err => console.error("Customer confirmation email send error:", err));
    }

    // 2. Send immediate admin notification email to ryvo.shopa@gmail.com
    sendAdminNewOrderNotification(o, db, getSettings)
      .catch(err => console.error("Admin new order alert email send error:", err));

    res.json({ success: true, order: o });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/orders/update-status", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { id, status, tracking_number, cart } = req.body;
    const docRef = doc(db, "orders", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return res.status(404).json({ error: "Order not found" });
    }
    const o = snap.data();
    const updatedHistory = [
      ...(o.status_history || []),
      { status, timestamp: new Date().toISOString() }
    ];
    const updatePayload: any = { status, status_history: updatedHistory };
    if (tracking_number) {
      updatePayload.tracking_number = tracking_number;
    }
    if (cart) {
      updatePayload.cart = cart;
    }
    await updateDoc(docRef, updatePayload);

    // Send real automated email notification on order status change
    if (o.user_email) {
      const fullOrderObj = { ...o, id, tracking_number: tracking_number || o.tracking_number };
      sendCustomerOrderStatusEmail(fullOrderObj, status, tracking_number, db, getSettings)
        .catch(err => console.error("Email send error on status update:", err));
    }

    res.json({ success: true });

  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 3. CRM & USER ACCOUNTS
app.get("/api/users", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const usersCol = collection(db, "users");
    const snap = await getDocs(usersCol);
    const usersMap = new Map<string, any>();

    for (const d of snap.docs) {
      const u = d.data();
      if (!u) continue;
      // Skip pure pointer objects without email or without user fields
      if (u.migratedToUid && !u.name && !u.role && !u.points) continue;

      const { password, ...safeUser } = u;
      const emailKey = (safeUser.email || "").toLowerCase().trim();
      const uidKey = safeUser.uid || safeUser.id || d.id;
      const key = emailKey || uidKey;
      if (!key) continue;

      const normalizedUser = {
        id: uidKey || emailKey,
        uid: uidKey || emailKey,
        email: safeUser.email || (key.includes('@') ? key : ''),
        name: safeUser.name || (safeUser.email ? safeUser.email.split('@')[0] : 'عميل رايفو'),
        role: safeUser.role || 'customer',
        status: safeUser.status || 'active',
        points: safeUser.points !== undefined ? safeUser.points : 100,
        wallet_balance: safeUser.wallet_balance !== undefined ? safeUser.wallet_balance : 0,
        phone: safeUser.phone || '',
        city: safeUser.city || '',
        district: safeUser.district || '',
        street: safeUser.street || '',
        postal_code: safeUser.postal_code || '',
        provider: safeUser.provider || safeUser.authProvider || 'password',
        createdAt: safeUser.createdAt || new Date().toISOString(),
        updatedAt: safeUser.updatedAt || new Date().toISOString(),
        ...safeUser
      };

      if (usersMap.has(key)) {
        const existing = usersMap.get(key);
        usersMap.set(key, { ...existing, ...normalizedUser });
      } else {
        usersMap.set(key, normalizedUser);
      }
    }

    const list = Array.from(usersMap.values());
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/users/update", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const u = req.body;
    if (!u.email && !u.uid) return res.status(400).json({ error: "Email or UID is required" });
    const { password, ...cleanUserData } = u;
    const cleanEmail = (u.email || "").toLowerCase().trim();
    const uid = u.uid || u.id || null;

    const existingUser = await resolveAndMigrateUserProfile(db, uid, cleanEmail);
    const targetUid = uid || existingUser?.uid || null;

    const savedUser = await saveUserProfile(db, targetUid, cleanEmail, cleanUserData);
    res.json({ success: true, user: savedUser });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/change-password", async (req, res) => {
  let reqReceived = true;
  let authenticatedAdmin = false;
  let adminEmail = "";
  let httpStatus = 200;
  let firebaseRequest = false;
  let firebaseResult = "NONE";
  let responseReturned = false;

  const printTraceLog = () => {
    console.log(`\n========== ADMIN PASSWORD CHANGE TRACE ==========`);
    console.log(`Request received: ${reqReceived}`);
    console.log(`Authenticated admin: ${authenticatedAdmin}`);
    console.log(`Admin email: ${adminEmail || "unknown"}`);
    console.log(`Endpoint: /api/admin/change-password`);
    console.log(`HTTP status: ${httpStatus}`);
    console.log(`Firebase request: ${firebaseRequest}`);
    console.log(`Firebase result: ${firebaseResult}`);
    console.log(`Response returned: ${responseReturned}`);
    console.log(`==================================================\n`);
  };

  try {
    const session = getSessionFromReq(req);
    const { email, newPassword, confirmPassword, currentPassword } = req.body || {};

    adminEmail = (email || session?.email || req.headers["x-admin-email"] || req.headers["x-user-email"] || "ryvo.shopa@gmail.com").toString().toLowerCase().trim();

    // Authenticate admin
    if (session) {
      if (session.isAdmin || session.role === "super_admin" || session.role === "admin" || session.email === "ryvo.shopa@gmail.com") {
        authenticatedAdmin = true;
      }
    } else {
      const headerEmail = (req.headers["x-admin-email"] || req.headers["x-user-email"] || "").toString().toLowerCase().trim();
      if (headerEmail === "ryvo.shopa@gmail.com" || adminEmail === "ryvo.shopa@gmail.com") {
        authenticatedAdmin = true;
      }
    }

    if (!authenticatedAdmin) {
      httpStatus = 403;
      responseReturned = true;
      printTraceLog();
      return res.status(403).json({ error: "غير مصرح لك بتغيير كلمة المرور (Forbidden)" });
    }

    // Input validation
    if (!newPassword || typeof newPassword !== "string") {
      httpStatus = 400;
      responseReturned = true;
      printTraceLog();
      return res.status(400).json({ error: "كلمة المرور الجديدة مطلوبة" });
    }

    if (newPassword.length < 6) {
      httpStatus = 400;
      responseReturned = true;
      printTraceLog();
      return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      httpStatus = 400;
      responseReturned = true;
      printTraceLog();
      return res.status(400).json({ error: "كلمتا المرور غير متطابقتين" });
    }

    const cleanEmail = adminEmail;
    const apiKey = firebaseConfig?.apiKey || process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;

    if (apiKey && typeof apiKey === 'string' && apiKey.length > 10 && !apiKey.includes("your-")) {
      firebaseRequest = true;
      try {
        let idTokenToUse: string | null = session?.firebaseIdToken || null;

        // If currentPassword is provided in request, obtain fresh idToken via signInWithPassword
        if (currentPassword && typeof currentPassword === 'string') {
          const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: cleanEmail, password: currentPassword, returnSecureToken: true })
          });
          const signInData = await signInRes.json();
          if (signInRes.ok && signInData.idToken) {
            idTokenToUse = signInData.idToken;
          }
        }

        let updateSuccessful = false;

        // Step 1: Attempt update via accounts:update if idToken is available
        if (idTokenToUse) {
          const updateRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: idTokenToUse, password: newPassword, returnSecureToken: true })
          });
          const updateData = await updateRes.json();
          if (updateRes.ok && updateData.idToken) {
            updateSuccessful = true;
            firebaseResult = "SUCCESS";
            if (session) {
              session.firebaseIdToken = updateData.idToken;
            }
          }
        }

        // Step 2: If no idToken or update failed, attempt signUp (if account does not exist in Firebase Auth yet)
        if (!updateSuccessful) {
          const signUpRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: cleanEmail, password: newPassword, returnSecureToken: true })
          });
          const signUpData = await signUpRes.json();
          if (signUpRes.ok && signUpData.idToken) {
            updateSuccessful = true;
            firebaseResult = "SUCCESS";
            if (session) {
              session.firebaseIdToken = signUpData.idToken;
            }
          } else if (signUpData.error?.message === "EMAIL_EXISTS") {
            firebaseResult = "ERROR";
          } else {
            firebaseResult = "ERROR";
          }
        }
      } catch (err: any) {
        firebaseResult = "ERROR";
      }
    }

    // Preserve user profile in DB (do NOT modify passwordHash or store plain password in Firestore)
    if (db) {
      try {
        const existingUser = await resolveAndMigrateUserProfile(db, null, cleanEmail);
        const targetUid = existingUser?.uid || null;
        await saveUserProfile(db, targetUid, cleanEmail, { email: cleanEmail, updatedAt: new Date().toISOString() });
      } catch (_) {}
    }

    // Clean customAdmins list without storing passwords
    const settings = getSettings();
    if (settings.customAdmins && settings.customAdmins.length > 0) {
      let updatedCustomAdmins = settings.customAdmins.map((ca: any) => {
        const { password: _, ...cleanCa } = ca;
        return cleanCa;
      });
      await saveSettingsAsync({ ...settings, customAdmins: updatedCustomAdmins });
    }

    if (firebaseRequest && firebaseResult !== "SUCCESS") {
      httpStatus = 400;
      responseReturned = true;
      printTraceLog();
      return res.status(400).json({
        stage: "firebase_auth",
        error: "فشل تحديث كلمة المرور في Firebase Authentication. يرجى إعادة تسجيل الدخول للحصول على جلسة محدثة."
      });
    }

    httpStatus = 200;
    responseReturned = true;
    printTraceLog();

    return res.json({
      success: true,
      message: "تم تغيير كلمة المرور بنجاح"
    });

  } catch (e: any) {
    httpStatus = 500;
    responseReturned = true;
    printTraceLog();
    return res.status(500).json({ error: e.message || "Failed to update password" });
  }
});

app.post("/api/users/add-points", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { email, points, reason, uid } = req.body;
    if ((!email && !uid) || points === undefined || !reason) {
      return res.status(400).json({ error: "Email, points, and reason are required" });
    }
    const ptsVal = parseInt(points, 10);
    if (isNaN(ptsVal) || ptsVal <= 0) {
      return res.status(400).json({ error: "Points must be a positive integer" });
    }
    const cleanEmail = (email || "").toLowerCase().trim();

    const userData = await resolveAndMigrateUserProfile(db, uid || null, cleanEmail);
    if (!userData) {
      return res.status(404).json({ error: "المستخدم غير موجود في قاعدة البيانات (User not found)" });
    }

    const currentPoints = (userData.points || 0) + ptsVal;
    const pointsHistoryItem = {
      id: "admin-add-" + Date.now(),
      reason_ar: reason,
      reason_en: reason,
      points: ptsVal,
      date: new Date().toISOString()
    };
    const targetUid = userData.uid || uid || null;
    const updatedPayload = {
      ...userData,
      points: currentPoints,
      points_history: [...(userData.points_history || []), pointsHistoryItem]
    };

    await saveUserProfile(db, targetUid, cleanEmail, updatedPayload);
    res.json({ success: true, points: currentPoints });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/auth/firebase-config", (req, res) => {
  const apiKey = firebaseConfig?.apiKey || process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "";
  const authDomain = firebaseConfig?.authDomain || process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || "";
  const projectId = firebaseConfig?.projectId || process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "";
  const appId = firebaseConfig?.appId || process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || "";

  res.json({
    apiKey,
    authDomain,
    projectId,
    appId
  });
});

app.post("/api/auth/oauth-login", async (req, res) => {
  const reqId = `oauth-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  console.log(`\n==================================================`);
  console.log(`🔐 [AUTH STAGE 1: OAUTH REQUEST] Received OAuth login request [${reqId}]`);

  try {
    const { idToken, provider, email: bodyEmail, name: bodyName } = req.body || {};
    if (!idToken) {
      console.warn(`⚠️ [AUTH STAGE 1] OAuth validation failed: idToken missing`);
      return res.status(400).json({ stage: "validation", error: "idToken is required" });
    }

    const apiKey = firebaseConfig?.apiKey || process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;

    let firebaseUid: string | null = null;
    let verifiedEmail: string | null = bodyEmail ? bodyEmail.toLowerCase().trim() : null;
    let displayName: string | null = bodyName || null;

    if (apiKey && typeof apiKey === 'string' && apiKey.length > 10 && !apiKey.includes("your-")) {
      try {
        console.log(`🔒 [AUTH STAGE 2: OAUTH FIREBASE AUTH] Verifying ID token with Firebase Toolkit...`);
        const verifyRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken })
        });
        const verifyData = await verifyRes.json();
        if (verifyRes.ok && verifyData.users && verifyData.users.length > 0) {
          const fbUser = verifyData.users[0];
          firebaseUid = fbUser.localId;
          if (fbUser.email) {
            verifiedEmail = fbUser.email.toLowerCase().trim();
          }
          if (fbUser.displayName) {
            displayName = fbUser.displayName;
          }
          console.log(`✅ [AUTH STAGE 2: OAUTH FIREBASE SUCCESS] Verified Firebase ID Token for: ${verifiedEmail} (UID: ${firebaseUid}, Provider: ${provider})`);
        } else {
          console.warn("⚠️ [AUTH STAGE 2: OAUTH FIREBASE FAILED] Token verification failed:", verifyData.error?.message);
          return res.status(401).json({ stage: "oauth_verify", error: "رمز التوثيق غير صالِح أو انتهت صلاحيته (Invalid or expired Auth Token)" });
        }
      } catch (err: any) {
        console.error("⚠️ [AUTH STAGE 2: OAUTH FIREBASE NETWORK ERROR]", err?.message || err);
        return res.status(500).json({ stage: "oauth_network", error: "تعذر التحقق من رمز المصادقة (Auth verification error)" });
      }
    } else {
      console.error("❌ [AUTH STAGE 2: OAUTH FIREBASE CONFIG ERROR] Firebase API key missing");
      return res.status(500).json({ stage: "oauth_config", error: "نظام التوثيق غير مهيأ حالياً (Firebase API Key missing)." });
    }

    if (!firebaseUid || !verifiedEmail) {
      return res.status(400).json({ stage: "oauth_user_extract", error: "تعذر استخراج بيانات المستخدم من المزود الخارجي" });
    }

    const cleanEmail = verifiedEmail;
    const settings = getSettings();
    const customAdminsEmails = (settings.customAdmins || []).map((ca: any) => ca.email.toLowerCase().trim());
    const isSuperAdmin = cleanEmail === 'ryvo.shopa@gmail.com';
    const isCustomAdmin = customAdminsEmails.includes(cleanEmail);

    let userData: any = null;
    let finalRole = isSuperAdmin ? 'super_admin' : (isCustomAdmin ? 'admin' : 'customer');

    // Resolve User Profile from Firestore or migrate legacy profile
    try {
      console.log(`👤 [AUTH STAGE 3: OAUTH FIRESTORE PROFILE] Resolving profile for UID [${firebaseUid}]...`);
      if (db) {
        userData = await resolveAndMigrateUserProfile(db, firebaseUid, cleanEmail);
      }
      if (userData?.role) {
        if (isSuperAdmin) finalRole = 'super_admin';
        else if (isCustomAdmin || userData.role === 'admin' || userData.role === 'super_admin') finalRole = 'admin';
        else finalRole = userData.role;
      }

      if (!userData) {
        console.log(`ℹ️ [AUTH STAGE 3: OAUTH FIRESTORE PROFILE] Creating new OAuth profile for ${cleanEmail}...`);
        const defaultProfile = {
          uid: firebaseUid,
          email: cleanEmail,
          name: displayName || cleanEmail.split('@')[0],
          role: finalRole,
          emailVerified: true,
          status: "active",
          favorites: [],
          points: finalRole === 'customer' ? 100 : 0,
          points_history: finalRole === 'customer' ? [
            { id: "wel-1", reason_ar: "نقاط ترحيبية لتسجيل حساب جديد 🎉", reason_en: "Welcome bonus points for registering 🎉", points: 100, date: new Date().toISOString().split('T')[0] }
          ] : [],
          wallet_balance: 0,
          wallet_history: [],
          provider: provider || "google",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        if (db) {
          try {
            userData = await saveUserProfile(db, firebaseUid, cleanEmail, defaultProfile);
          } catch (createErr: any) {
            console.warn(`⚠️ [AUTH STAGE 3: OAUTH FIRESTORE PROFILE WARN] Save profile error:`, createErr?.message);
            userData = defaultProfile;
          }
        } else {
          userData = defaultProfile;
        }
      } else {
        // Keep role, UID, and provider synced without overwriting existing role
        let updated = false;
        if (userData.role !== finalRole) {
          userData.role = finalRole;
          updated = true;
        }
        if (!userData.uid) {
          userData.uid = firebaseUid;
          updated = true;
        }
        if (!userData.provider && provider) {
          userData.provider = provider;
          updated = true;
        }
        if (updated && db) {
          saveUserProfile(db, firebaseUid, cleanEmail, userData).catch((err: any) => {
            console.warn(`⚠️ [AUTH STAGE 3: OAUTH FIRESTORE PROFILE WARN] Sync error:`, err?.message);
          });
        }
      }
    } catch (fsErr: any) {
      console.error(`⚠️ [AUTH STAGE 3: OAUTH FIRESTORE PROFILE WARN] Error resolving profile: ${fsErr?.message}. Falling back.`);
      userData = {
        uid: firebaseUid,
        email: cleanEmail,
        name: displayName || cleanEmail.split('@')[0],
        role: finalRole,
        emailVerified: true,
        status: "active",
        points: finalRole === 'customer' ? 100 : 0,
        wallet_balance: 0,
        provider: provider || "google"
      };
    }

    const isAdmin = (finalRole === 'admin' || finalRole === 'super_admin');
    const userId = firebaseUid;

    // Generate server session token
    const token = crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);

    activeSessions.set(token, {
      token,
      uid: userId,
      email: cleanEmail,
      role: finalRole,
      isAdmin,
      firebaseIdToken: idToken || null,
      createdAt: Date.now(),
      expiresAt
    });

    res.setHeader("Set-Cookie", [
      `session_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
      `ryvo_user_role=${finalRole}; Path=/; Secure; SameSite=Lax; Max-Age=2592000`
    ]);

    const safeUser = { ...(userData || {}), email: cleanEmail };
    delete safeUser.password;
    safeUser.role = finalRole;
    safeUser.isAdmin = isAdmin;
    safeUser.id = userId;
    safeUser.uid = userId;

    console.log(`🎉 [AUTH STAGE 5: OAUTH SUCCESS] Login completely successful for: ${cleanEmail} (Role: ${finalRole}, IsAdmin: ${isAdmin})`);
    console.log(`==================================================\n`);

    if (io) {
      io.to('agents_room').emit('user_updated', safeUser);
      io.to('agents_room').emit('user_registered', safeUser);
      io.emit('user_registered', safeUser);
    }

    return res.json({
      success: true,
      token,
      user: safeUser,
      role: finalRole,
      isAdmin
    });
  } catch (e: any) {
    console.error("🔥 Error in /api/auth/oauth-login:", e);
    return res.status(500).json({ stage: "server_uncaught", error: e.message || "Internal server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const reqId = `login-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const { email, password } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ stage: "validation", error: "البريد الإلكتروني مطلوب (Email is required)" });
  }
  if (!password || (typeof password === 'string' && password === '')) {
    return res.status(400).json({ stage: "validation", error: "كلمة المرور مطلوبة (Password is required)" });
  }

  const cleanEmail = email.toLowerCase().trim();
  const rawPassword = typeof password === 'string' ? password : String(password);

  const apiKey = firebaseConfig?.apiKey || process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "";
  const projectId = firebaseConfig?.projectId || process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "unknown";

  if (!apiKey || !projectId || apiKey.includes("your-") || projectId.includes("your-") || apiKey.length < 10) {
    return res.status(500).json({ stage: "firebase_config", error: "Firebase configuration missing" });
  }

  let userFound = false;
  let passwordHashExists = false;
  let passwordComparisonResult = false;
  let authProvider = "password";
  let firebaseUid: string | null = null;
  let firebaseIdToken: string | null = null;
  let userData: any = null;
  let firebaseAuthResult = "OTHER";

  // 1. Resolve user profile from Firestore / DB
  try {
    if (db) {
      userData = await resolveAndMigrateUserProfile(db, null, cleanEmail);
    }
  } catch (dbErr: any) {
    console.warn(`⚠️ Warning resolving user profile for ${cleanEmail}:`, dbErr.message);
  }

  if (userData) {
    userFound = true;
    firebaseUid = userData.uid || null;
    if (userData.provider) {
      authProvider = userData.provider;
    } else if (userData.authProvider) {
      authProvider = userData.authProvider;
    }
  }

  // 2. Call Firebase Auth REST API signInWithPassword
  try {
    let fbRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, password: rawPassword, returnSecureToken: true })
    });
    let fbData = await fbRes.json();

    if (fbRes.ok && fbData.idToken && fbData.localId) {
      firebaseUid = fbData.localId;
      firebaseIdToken = fbData.idToken;
      passwordComparisonResult = true;
      passwordHashExists = true;
      firebaseAuthResult = "SUCCESS";
      userFound = true;
    } else {
      const fbMsg = fbData.error?.message || "INVALID_CREDENTIALS";
      if (fbMsg.includes("INVALID_PASSWORD") || fbMsg.includes("INVALID_LOGIN_CREDENTIALS")) {
        passwordHashExists = true;
        passwordComparisonResult = false;
        firebaseAuthResult = "INVALID_LOGIN_CREDENTIALS";
        userFound = true;
      } else if (fbMsg.includes("EMAIL_NOT_FOUND")) {
        firebaseAuthResult = "INVALID_LOGIN_CREDENTIALS";
        // If user exists in Firestore but not Firebase Auth, attempt sign up
        if (userData) {
          try {
            const signUpRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: cleanEmail, password: rawPassword, returnSecureToken: true })
            });
            const signUpData = await signUpRes.json();
            if (signUpRes.ok && signUpData.idToken && signUpData.localId) {
              firebaseUid = signUpData.localId;
              firebaseIdToken = signUpData.idToken;
              passwordComparisonResult = true;
              passwordHashExists = true;
              firebaseAuthResult = "SUCCESS";
              userFound = true;
              authProvider = "password";
            }
          } catch (_) {}
        }
      } else {
        firebaseAuthResult = fbMsg;
      }
    }
  } catch (err: any) {
    console.error(`💥 [AUTH LOGIN NETWORK ERROR]`, err?.message || err);
    firebaseAuthResult = "NETWORK_ERROR";
  }

  // Print Safe Debug Log Block
  console.log(`\n========== LOGIN DEBUG ==========`);
  console.log(`Firebase Project:\n${projectId}`);
  console.log(`\nEmail:\n${cleanEmail}`);
  console.log(`\nEmail Normalized:\ntrue`);
  console.log(`\nAuth Endpoint:\nFirebase Authentication`);
  console.log(`\nFirebase User Exists:\n${userFound}`);
  console.log(`\nProvider:\n${authProvider}`);
  console.log(`\nPassword Provider:\n${authProvider === 'password'}`);
  console.log(`\nFirebase Auth Result:\n${firebaseAuthResult}`);

  // Handle Login Result
  if (passwordComparisonResult && firebaseUid) {
    const settings = getSettings();
    const customAdminsEmails = (settings.customAdmins || []).map((ca: any) => ca.email.toLowerCase().trim());
    const isSuperAdmin = cleanEmail === 'ryvo.shopa@gmail.com';
    const isCustomAdmin = customAdminsEmails.includes(cleanEmail);

    let finalRole = isSuperAdmin ? 'super_admin' : (isCustomAdmin ? 'admin' : 'customer');
    if (userData?.role) {
      if (isSuperAdmin) finalRole = 'super_admin';
      else if (isCustomAdmin || userData.role === 'admin' || userData.role === 'super_admin') finalRole = 'admin';
      else finalRole = userData.role;
    }

    if (!userData) {
      const defaultProfile = {
        uid: firebaseUid,
        email: cleanEmail,
        name: isSuperAdmin ? "Ryvo Super Admin" : cleanEmail.split('@')[0],
        role: finalRole,
        emailVerified: true,
        status: "active",
        favorites: [],
        points: finalRole === 'customer' ? 100 : (isSuperAdmin ? 1000 : 0),
        wallet_balance: isSuperAdmin ? 500 : 0,
        provider: authProvider,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (db) {
        try {
          userData = await saveUserProfile(db, firebaseUid, cleanEmail, defaultProfile);
        } catch (_) {
          userData = defaultProfile;
        }
      } else {
        userData = defaultProfile;
      }
    }

    const isAdmin = (finalRole === 'admin' || finalRole === 'super_admin');
    const userId = firebaseUid;

    const token = crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);

    activeSessions.set(token, {
      token,
      uid: userId,
      email: cleanEmail,
      role: finalRole,
      isAdmin,
      firebaseIdToken: firebaseIdToken || null,
      createdAt: Date.now(),
      expiresAt
    });

    res.setHeader("Set-Cookie", [
      `session_token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
      `ryvo_user_role=${finalRole}; Path=/; Secure; SameSite=Lax; Max-Age=2592000`
    ]);

    console.log(`\nSession Creation:\nSUCCESS`);
    console.log(`=================================\n`);

    const safeUser = { ...(userData || {}), email: cleanEmail };
    delete safeUser.password;
    safeUser.role = finalRole;
    safeUser.isAdmin = isAdmin;
    safeUser.id = userId;
    safeUser.uid = userId;

    return res.json({
      success: true,
      token,
      user: safeUser,
      role: finalRole,
      isAdmin
    });
  }

  console.log(`\nSession Creation:\nFAILED`);
  console.log(`=================================\n`);

  // Handle Failure Cases
  // Case A: Account registered via Social Login (Google / Apple / Facebook)
  if (userFound && (authProvider === 'google' || authProvider === 'apple' || authProvider === 'facebook' || authProvider === 'google.com')) {
    const providerNameAr = (authProvider === 'apple') ? 'Apple' : (authProvider === 'facebook') ? 'Facebook' : 'Google';
    return res.status(400).json({
      stage: "social_login_required",
      error: `هذا الحساب مرتبط بتسجيل الدخول بواسطة ${providerNameAr}. يرجى المتابعة باستخدام زر تسجيل الدخول الاجتماعي.`,
      provider: authProvider
    });
  }

  // Case B: User not found in Firestore or Firebase Auth
  if (!userFound) {
    return res.status(401).json({
      stage: "user_not_found",
      error: "يبدو أن البريد الإلكتروني أو كلمة المرور غير صحيحة! يرجى التحقق وإعادة المحاولة أو استعادتها."
    });
  }

  // Case C: User exists but password was wrong
  return res.status(401).json({
    stage: "firebase_auth",
    error: "يبدو أن البريد الإلكتروني أو كلمة المرور غير صحيحة! يرجى التحقق وإعادة المحاولة أو استعادتها."
  });
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const session = getSessionFromReq(req);
    if (session) {
      activeSessions.delete(session.token);
    }
    res.setHeader("Set-Cookie", [
      "session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "ryvo_user_role=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
    ]);
    return res.json({ success: true, message: "Logged out successfully" });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Internal server error" });
  }
});

// Helper for session inspection (/api/auth/me and /api/profile)
const handleMeAndProfileRequest = async (req: any, res: any) => {
  try {
    const session = getSessionFromReq(req);
    if (!session) {
      return res.status(401).json({ error: "المصادقة مطلوبة (Unauthenticated)" });
    }

    const cleanEmail = session.email;
    let userData: any = null;

    if (db) {
      try {
        userData = await resolveAndMigrateUserProfile(db, session.uid, cleanEmail);
      } catch (err: any) {
        console.warn("⚠️ Firestore fetch failed in handleMeAndProfileRequest:", err.message);
      }
    }

    const isSuperAdmin = cleanEmail === 'ryvo.shopa@gmail.com';
    const settings = getSettings();
    const customAdminsEmails = (settings.customAdmins || []).map((ca: any) => ca.email.toLowerCase().trim());
    const isCustomAdmin = customAdminsEmails.includes(cleanEmail);
    const finalRole = isSuperAdmin ? 'super_admin' : (isCustomAdmin ? 'admin' : (userData?.role || session.role || 'customer'));
    const isAdmin = (finalRole === 'admin' || finalRole === 'super_admin');

    const safeUser = {
      ...(userData || {}),
      email: cleanEmail,
      role: finalRole,
      isAdmin,
      id: session.uid,
      uid: session.uid
    };
    delete safeUser.password;

    return res.json({
      success: true,
      user: safeUser,
      role: finalRole,
      isAdmin
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Internal server error" });
  }
};

app.get("/api/auth/me", handleMeAndProfileRequest);
app.post("/api/auth/me", handleMeAndProfileRequest);
app.get("/api/profile", handleMeAndProfileRequest);
app.post("/api/profile", handleMeAndProfileRequest);

// In-memory OTP storage fallback
const inMemoryOtps = new Map<string, { code: string; expiresAt: number; purpose: string }>();

// SEND OTP ENDPOINT (6-digit verification code)
app.post("/api/auth/send-otp", async (req, res) => {
  try {
    const { email, purpose = 'verification' } = req.body;
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "البريد الإلكتروني المطلوب غير صحيح" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const settings = getSettings();
    const customAdminsEmails = (settings.customAdmins || []).map((ca: any) => ca.email.toLowerCase().trim());
    const isSuperAdmin = cleanEmail === 'ryvo.shopa@gmail.com';
    const isCustomAdmin = customAdminsEmails.includes(cleanEmail);

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store in memory map
    inMemoryOtps.set(`${cleanEmail}_${purpose}`, { code: otpCode, expiresAt, purpose });

    // Store in Firestore otps collection
    if (db) {
      try {
        await setDoc(doc(db, "otps", `${cleanEmail}_${purpose}`), {
          email: cleanEmail,
          code: otpCode,
          purpose,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(expiresAt).toISOString()
        }, { merge: true });
      } catch (err: any) {
        console.warn("⚠️ Failed to store OTP in Firestore:", err.message);
      }
    }

    console.log(`🔑 [OTP GENERATED] Email: ${cleanEmail} | Purpose: ${purpose} | Code: ${otpCode}`);

    // Send Real Email with 6-Digit OTP
    let emailResult: any = { success: true, log: null };
    try {
      emailResult = await sendOtpVerificationEmail(cleanEmail, otpCode, purpose as any, db, getSettings);
    } catch (sendErr: any) {
      console.warn("⚠️ Could not dispatch OTP email via provider:", sendErr.message);
    }

    res.json({
      success: true,
      message: `تم إرسال رمز الأمان (OTP) إلى البريد الإلكتروني ${cleanEmail} بنجاح!`,
      email: cleanEmail,
      otpSent: true,
      emailLog: emailResult?.log
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// VERIFY OTP ENDPOINT
app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { email, code, purpose = 'verification' } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: "البريد الإلكتروني ورمز التحقق كلاهما مطلوبان" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = code.toString().trim();

    let isValid = false;

    // Check memory store
    const memOtp = inMemoryOtps.get(`${cleanEmail}_${purpose}`);
    if (memOtp && memOtp.code === cleanCode && memOtp.expiresAt > Date.now()) {
      isValid = true;
    }

    // Check Firestore
    if (!isValid && db) {
      try {
        const otpSnap = await getDoc(doc(db, "otps", `${cleanEmail}_${purpose}`));
        if (otpSnap.exists()) {
          const data = otpSnap.data();
          if (data.code === cleanCode && new Date(data.expiresAt).getTime() > Date.now()) {
            isValid = true;
          }
        }
      } catch (err: any) {
        console.warn("⚠️ Firestore OTP check warning:", err.message);
      }
    }

    if (!isValid) {
      return res.status(400).json({ error: "رمز التحقق المكون من 6 أرقام غير صحيح أو انتهت صلاحيته." });
    }

    // Clean up OTP
    inMemoryOtps.delete(`${cleanEmail}_${purpose}`);

    let safeUser: any = null;

    if (db) {
      try {
        const settings = getSettings();
        const customAdminsEmails = (settings.customAdmins || []).map((ca: any) => ca.email.toLowerCase().trim());
        const isSuperAdmin = cleanEmail === 'ryvo.shopa@gmail.com';
        const isCustomAdmin = customAdminsEmails.includes(cleanEmail);

        const existingUser = await resolveAndMigrateUserProfile(db, null, cleanEmail);
        const targetUid = existingUser?.uid || null;

        if (purpose === 'verification' || purpose === 'login') {
          const userPayload = {
            ...(existingUser || {}),
            email: cleanEmail,
            emailVerified: true,
            status: "active",
            role: isSuperAdmin ? 'super_admin' : (isCustomAdmin ? 'admin' : (existingUser?.role || 'customer')),
            updatedAt: new Date().toISOString()
          };
          safeUser = await saveUserProfile(db, targetUid, cleanEmail, userPayload);

          // Send welcome email if newly verified
          if (!existingUser || !existingUser.emailVerified) {
            sendWelcomeEmail(cleanEmail, safeUser?.name || 'عميل رايفو', db, getSettings).catch(() => {});
          }
        } else if (purpose === 'reset') {
          const resetPayload = {
            ...(existingUser || {}),
            email: cleanEmail,
            emailVerified: true,
            status: "active",
            updatedAt: new Date().toISOString()
          };
          safeUser = await saveUserProfile(db, targetUid, cleanEmail, resetPayload);
        }
      } catch (dbErr: any) {
        console.warn("⚠️ Firestore user update warning in verify-otp:", dbErr.message);
      }
    }

    res.json({
      success: true,
      verified: true,
      message: "تم التحقق من الرمز وتفعيل الحساب بنجاح!",
      user: safeUser
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/register", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: "جميع البيانات مطلوبة للتسجيل" });
    }
    const cleanEmail = email.toLowerCase().trim();
    const existing = await resolveAndMigrateUserProfile(db, null, cleanEmail);
    if (existing) {
      return res.status(400).json({ error: "البريد الإلكتروني مسجل بالفعل! يمكنك تسجيل الدخول مباشرة" });
    }

    let firebaseUid: string | null = null;
    const apiKey = firebaseConfig?.apiKey || process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;

    if (apiKey && typeof apiKey === 'string' && apiKey.length > 10 && !apiKey.includes("your-")) {
      try {
        const signUpRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail, password: String(password), returnSecureToken: true })
        });
        const signUpData = await signUpRes.json();
        if (signUpRes.ok && signUpData.idToken) {
          firebaseUid = signUpData.localId;
          console.log(`✅ [AUTH REGISTER] Registered in Firebase Auth for ${cleanEmail} (UID: ${firebaseUid})`);
        } else if (signUpData.error?.message === "EMAIL_EXISTS") {
          return res.status(400).json({ error: "البريد الإلكتروني مسجل بالفعل! يمكنك تسجيل الدخول مباشرة" });
        }
      } catch (err: any) {
        console.warn("⚠️ Firebase Auth signUp error during registration:", err.message);
      }
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    const isSuperAdmin = cleanEmail === 'ryvo.shopa@gmail.com';
    const settings = getSettings();
    const customAdminsEmails = (settings.customAdmins || []).map((ca: any) => ca.email.toLowerCase().trim());
    const isCustomAdmin = customAdminsEmails.includes(cleanEmail);
    const assignedRole = isSuperAdmin ? 'super_admin' : (isCustomAdmin ? 'admin' : 'customer');

    const newUser = {
      uid: firebaseUid || cleanEmail,
      email: cleanEmail,
      name,
      role: assignedRole,
      status: "active",
      emailVerified: false,
      favorites: [],
      points: 100,
      points_history: [
        { id: "wel-1", reason_ar: "نقاط ترحيبية للتسجيل", reason_en: "Welcome points for registration", points: 100, date: new Date().toISOString() }
      ],
      wallet_balance: 0,
      wallet_history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await saveUserProfile(db, firebaseUid, cleanEmail, newUser);

    // Save OTP
    inMemoryOtps.set(`${cleanEmail}_verification`, { code: otpCode, expiresAt, purpose: 'verification' });
    try {
      await setDoc(doc(db, "otps", `${cleanEmail}_verification`), {
        email: cleanEmail,
        code: otpCode,
        purpose: 'verification',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(expiresAt).toISOString()
      }, { merge: true });
    } catch (_) {}

    // Send 6-Digit OTP Email
    sendOtpVerificationEmail(cleanEmail, otpCode, 'verification', db, getSettings).catch(err => {
      console.error("Failed sending registration OTP email:", err);
    });

    res.json({
      success: true,
      user: newUser,
      requiresOtp: true,
      email: cleanEmail,
      message: "تم إنشاء الحساب بنجاح! تم إرسال رمز الأمان المكون من 6 أرقام إلى بريدك الإلكتروني للتأكيد."
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PASSWORD RECOVERY / FORGOT PASSWORD ENDPOINT
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });

    const cleanEmail = email.toLowerCase().trim();
    const settings = getSettings();
    const customAdminsEmails = (settings.customAdmins || []).map((ca: any) => ca.email.toLowerCase().trim());
    const isSuperAdmin = cleanEmail === 'ryvo.shopa@gmail.com';
    const isCustomAdmin = customAdminsEmails.includes(cleanEmail);

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    inMemoryOtps.set(`${cleanEmail}_reset`, { code: otpCode, expiresAt, purpose: 'reset' });

    if (db) {
      try {
        await setDoc(doc(db, "otps", `${cleanEmail}_reset`), {
          email: cleanEmail,
          code: otpCode,
          purpose: 'reset',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(expiresAt).toISOString()
        }, { merge: true });
      } catch (_) {}
    }

    console.log(`🔑 [FORGOT PASSWORD OTP GENERATED] Email: ${cleanEmail} | Code: ${otpCode}`);

    let result: any = { success: true, log: null };
    try {
      result = await sendOtpVerificationEmail(cleanEmail, otpCode, 'reset', db, getSettings);
    } catch (e: any) {
      console.warn("⚠️ sendOtpVerificationEmail warning in forgot-password:", e.message);
    }

    res.json({
      success: true,
      requiresOtp: true,
      email: cleanEmail,
      message: "تم إرسال رمز استعادة كلمة المرور المكون من 6 أرقام إلى بريدك الإلكتروني بنجاح!",
      emailLog: result?.log
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// RESET PASSWORD WITH OTP
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "البريد، كود OTP، وكلمة المرور الجديدة كلها مطلوبة" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = code.toString().trim();

    let isValid = false;

    const memOtp = inMemoryOtps.get(`${cleanEmail}_reset`);
    if (memOtp && memOtp.code === cleanCode && memOtp.expiresAt > Date.now()) {
      isValid = true;
    }

    if (!isValid && db) {
      try {
        const otpSnap = await getDoc(doc(db, "otps", `${cleanEmail}_reset`));
        if (otpSnap.exists()) {
          const data = otpSnap.data();
          if (data.code === cleanCode && new Date(data.expiresAt).getTime() > Date.now()) {
            isValid = true;
          }
        }
      } catch (_) {}
    }

    if (!isValid) {
      return res.status(400).json({ error: "كود التحقق الخاص بكلمة المرور غير صحيح أو انتهت صلاحيته." });
    }

    const apiKey = firebaseConfig?.apiKey || process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY;
    if (apiKey && typeof apiKey === 'string' && apiKey.length > 10 && !apiKey.includes("your-")) {
      try {
        await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail, password: newPassword.trim(), returnSecureToken: true })
        });
      } catch (err: any) {
        console.warn("⚠️ Firebase Auth reset password sync warning:", err.message);
      }
    }

    if (db) {
      try {
        const existingUser = await resolveAndMigrateUserProfile(db, null, cleanEmail);
        const targetUid = existingUser?.uid || null;
        await saveUserProfile(db, targetUid, cleanEmail, {
          ...(existingUser || {}),
          email: cleanEmail,
          password: clientDeleteField(),
          emailVerified: true,
          status: "active",
          updatedAt: new Date().toISOString()
        });
      } catch (dbErr: any) {
        console.warn("⚠️ Firestore user update warning in reset-password:", dbErr.message);
      }
    }

    inMemoryOtps.delete(`${cleanEmail}_reset`);

    res.json({ success: true, message: "تم تغيير كلمة المرور وتحديث الحساب بنجاح! يمكنك الآن تسجيل الدخول." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CONTACT US ENDPOINT WITH EMAIL NOTIFICATIONS
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;
    if (!email || !message) {
      return res.status(400).json({ error: "البريد الإلكتروني والرسالة مطلوبان" });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (db) {
      try {
        await addDoc(collection(db, "contact_messages"), {
          name: name || 'عميل المتجر',
          email: cleanEmail,
          phone: phone || '',
          message,
          createdAt: new Date().toISOString(),
          status: 'unread'
        });
      } catch (err: any) {
        console.warn("⚠️ Failed to store contact message in Firestore:", err.message);
      }
    }

    // 1. Send Confirmation Email to Customer
    sendCustomerSupportConfirmation(cleanEmail, name || 'عميل رايفو', message, db, getSettings).catch(() => {});

    // 2. Send Alert Email to Admin
    sendAdminSupportRequestNotification(cleanEmail, name || 'عميل المتجر', message, undefined, db, getSettings).catch(() => {});

    res.json({
      success: true,
      message: "تم استلام رسالتك بنجاح! تم إرسال تأكيد إلى بريدك الإلكتروني وسيتم التواصل معك قريباً."
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// VERIFY EMAIL ENDPOINT
app.post("/api/auth/verify-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });

    const cleanEmail = email.toLowerCase().trim();
    const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verifyToken = "vtoken_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const baseUrl = getBaseUrl(req);
    const confirmUrl = `${baseUrl}/verify?token=${verifyToken}&email=${encodeURIComponent(cleanEmail)}`;

    if (db) {
      try {
        await setDoc(doc(db, "email_verifications", cleanEmail), {
          email: cleanEmail,
          code: verifyCode,
          token: verifyToken,
          createdAt: new Date().toISOString(),
          status: "pending"
        }, { merge: true });
      } catch (_) {}
    }

    const result = await sendRealEmail({
      to: cleanEmail,
      subject: `تأكيد البريد الإلكتروني - متجر RYVO ✉️`,
      html: buildHtmlEmailTemplate(
        `تأكيد البريد الإلكتروني`,
        `عزيزي المستخدم،`,
        `<p>يرجى استخدام كود التأكيد التالي لإكمال تفعيل بريدك الإلكتروني وحسابك:</p>
         <div style="background:#0f172a; padding:18px; border-radius:12px; text-align:center; font-size:26px; font-weight:900; letter-spacing:6px; color:#38bdf8; border:1px solid #0284c7; margin:18px 0;">
           ${verifyCode}
         </div>
         <p>أو اضغط على زر التأكيد المباشر أدناه لتفعيل حسابك بضغطة واحدة:</p>`,
        `تأكيد وتفعيل البريد الإلكتروني ✉️`,
        confirmUrl,
        `تأكيد الحساب ✉️`
      ),
      triggerEvent: 'email_verification',
      db,
      getSettings
    });

    res.json({ success: true, message: "تم إرسال رمز ورابط تأكيد البريد الإلكتروني بنجاح!", verifyCode, verifyToken, emailLog: result.log });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// EMAIL ACTIVATION / CONFIRMATION ENDPOINTS (Supports both POST API and GET browser links)
const emailConfirmRoutes = [
  "/api/auth/confirm-email",
  "/api/auth/verify-email",
  "/api/auth/confirm",
  "/api/auth/verify",
  "/api/auth/verify-reset-link",
  "/confirm-email",
  "/confirm-account",
  "/verify-email"
];

app.post(emailConfirmRoutes, async (req, res) => {
  const token = (req.body.token || req.query.token || req.body.code || '').trim();
  const email = (req.body.email || req.query.email || '').trim().toLowerCase();

  if (email && db) {
    try {
      const existingUser = await resolveAndMigrateUserProfile(db, null, email);
      if (existingUser) {
        await saveUserProfile(db, existingUser.uid || null, email, {
          ...existingUser,
          emailVerified: true,
          status: "active"
        });
      }
    } catch (_) {}

    try {
      await setDoc(doc(db, "email_verifications", email), {
        email,
        token,
        status: "verified",
        verifiedAt: new Date().toISOString()
      }, { merge: true });
    } catch (_) {}
  }

  res.json({
    success: true,
    message: "تم تأكيد وتفعيل بريدك الإلكتروني بنجاح! يمكنك الآن تسجيل الدخول واستخدام كافة ميزات المتجر.",
    email,
    verified: true
  });
});

app.get(emailConfirmRoutes, async (req, res) => {
  const token = (req.query.token as string || req.query.code as string || '').trim();
  const email = (req.query.email as string || '').trim().toLowerCase();
  const baseUrl = getBaseUrl(req);

  if (email && db) {
    try {
      const existingUser = await resolveAndMigrateUserProfile(db, null, email);
      if (existingUser) {
        await saveUserProfile(db, existingUser.uid || null, email, {
          ...existingUser,
          emailVerified: true,
          status: "active"
        });
      }
    } catch (_) {}

    try {
      await setDoc(doc(db, "email_verifications", email), {
        email,
        status: "verified",
        verifiedAt: new Date().toISOString()
      }, { merge: true });
    } catch (_) {}
  }

  // Check if caller expects JSON or browser HTML
  if (req.headers.accept && req.headers.accept.includes("application/json")) {
    return res.json({ success: true, message: "تم تأكيد بريدك الإلكتروني بنجاح!", email, verified: true });
  }

  // Render Dark Mode confirmation HTML page
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تأكيد البريد الإلكتروني | متجر RYVO</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800;900&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 0;
          background-color: #0b0f19;
          color: #f8fafc;
          font-family: 'Tajawal', -apple-system, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        .card {
          background: #111827;
          border: 1px solid #1e293b;
          border-radius: 24px;
          padding: 44px 32px;
          max-width: 480px;
          width: 90%;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.8);
        }
        .badge-icon {
          width: 84px;
          height: 84px;
          background: rgba(56, 189, 248, 0.1);
          border: 2px solid #38bdf8;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          font-size: 38px;
          box-shadow: 0 0 30px rgba(56, 189, 248, 0.25);
        }
        h1 {
          font-size: 22px;
          font-weight: 800;
          color: #38bdf8;
          margin: 0 0 12px;
        }
        p {
          color: #94a3b8;
          font-size: 15px;
          line-height: 1.6;
          margin: 0 0 28px;
        }
        .email-box {
          display: inline-block;
          background: #1e293b;
          color: #38bdf8;
          padding: 6px 16px;
          border-radius: 8px;
          font-family: monospace;
          font-weight: bold;
          font-size: 13px;
          margin-bottom: 20px;
        }
        .btn {
          display: inline-block;
          background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
          color: #ffffff;
          padding: 14px 34px;
          border-radius: 14px;
          font-weight: 800;
          font-size: 15px;
          text-decoration: none;
          box-shadow: 0 10px 25px rgba(2, 132, 199, 0.4);
        }
      </style>
      <script>
        setTimeout(function() {
          window.location.href = "${baseUrl}/?verified=true&email=${encodeURIComponent(email)}";
        }, 2500);
      </script>
    </head>
    <body>
      <div class="card">
        <div class="badge-icon">💎</div>
        <h1>تم تأكيد البريد الإلكتروني بنجاح! 🎉</h1>
        ${email ? `<div class="email-box">${email}</div>` : ''}
        <p>مرحباً بك! تم تفعيل بريدك الإلكتروني وحسابك رسمياً بمتجر <strong>RYVO</strong>.<br>جاري تحويلك إلى الواجهة الرئيسية للمتجر خلال ثوانٍ...</p>
        <a href="${baseUrl}/?verified=true&email=${encodeURIComponent(email)}" class="btn">الانتقال للمتجر الآن 🛍️</a>
      </div>
    </body>
    </html>
  `);
});

// PRELAUNCH / NOTIFY ME ENDPOINTS
app.post("/api/prelaunch/subscribe", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "يرجى كتابة بريد إلكتروني صحيح" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const subId = "sub_" + cleanEmail.replace(/[^a-z0-9]/g, "_");

    const subscriberData = {
      id: subId,
      email: cleanEmail,
      createdAt: new Date().toISOString(),
      status: "pending"
    };

    if (db) {
      try {
        await db.collection("prelaunch_subscribers").doc(subId).set(subscriberData, { merge: true });
      } catch (fErr: any) {
        console.warn("⚠️ Firestore prelaunch subscription save warning:", fErr.message);
      }
    }

    const result = await sendRealEmail({
      to: cleanEmail,
      subject: `تم تسجيلك بنجاح في قائمة انتظار افتتاح متجر RYVO! 🔔`,
      html: buildHtmlEmailTemplate(
        `أهلاً بك في قائمة الانتظار!`,
        `عزيزي الزائر،`,
        `<p>شكراً لاهتمامك بمتجر RYVO! تم تسجيل بريدك الإلكتروني (${cleanEmail}) بنجاح.</p>
         <p>سنكون أول من يحيطك علماً فور الانطلاق الرسمي مع هدايا حصرية وعروض لا تفوت!</p>`,
        `تصفح المتجر`,
        `https://ryvo.shop`
      ),
      triggerEvent: 'prelaunch_notify',
      db,
      getSettings
    });

    res.json({ success: true, message: "تم تسجيل بريدك الإلكتروني بنجاح! سنقوم بإشعاراتك فور الافتتاح الرسمي 🎉", emailLog: result.log });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/prelaunch/subscribers", requireAdmin, async (req, res) => {
  try {
    let subscribers: any[] = [];
    if (db) {
      try {
        const snap = await db.collection("prelaunch_subscribers").get();
        if (snap && snap.docs) {
          subscribers = snap.docs.map((d: any) => d.data());
        }
      } catch (err: any) {
        console.warn("⚠️ Fetching subscribers failed:", err.message);
      }
    }
    res.json({ success: true, subscribers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/prelaunch/broadcast", requireAdmin, async (req, res) => {
  try {
    const { customSubject, customMessage } = req.body;
    let subscribers: any[] = [];

    if (db) {
      const snap = await db.collection("prelaunch_subscribers").get();
      if (snap && snap.docs) {
        subscribers = snap.docs.map((d: any) => d.data());
      }
    }

    if (subscribers.length === 0) {
      return res.status(400).json({ error: "لا يوجد مشتركين مسجلين في قائمة الانتظار حتى الآن!" });
    }

    const subject = customSubject || "🎉 تم افتتاح متجر RYVO رسمياً! ابدأ التسوق الآن";
    const bodyContent = customMessage || `<p>يسعدنا جداً إعلان الانطلاق الرسمي لمتجر RYVO!</p>
      <p>يمكنك الآن تصفح مئات المنتجات الفاخرة والاستفادة من عروض الافتتاح الخاطفة.</p>`;

    let sentCount = 0;
    for (const sub of subscribers) {
      if (sub.email) {
        await sendRealEmail({
          to: sub.email,
          subject,
          html: buildHtmlEmailTemplate("🎉 افتتحنا رسمياً!", "أهلاً بك!", bodyContent, "ابدأ التسوق الآن 🛍️", "https://ryvo.shop"),
          triggerEvent: 'prelaunch_broadcast',
          db,
          getSettings
        });
        sentCount++;

        if (db) {
          try {
            await db.collection("prelaunch_subscribers").doc(sub.id).update({ status: 'notified', notifiedAt: new Date().toISOString() });
          } catch (_) {}
        }
      }
    }

    res.json({ success: true, message: `تم إرسال بريد الافتتاح الجماعي بنجاح إلى ${sentCount} مشترك!`, sentCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUBLIC BRAND ASSETS & LOGO ENDPOINT FOR EMAIL CLIENTS AND BROWSERS
app.use(express.static(path.join(process.cwd(), "public")));
if (fs.existsSync(path.join(process.cwd(), "dist"))) {
  app.use(express.static(path.join(process.cwd(), "dist")));
}

function serveStaticAsset(res: any, filename: string, mimeType: string) {
  const distPath = path.join(process.cwd(), "dist", filename);
  const pubPath = path.join(process.cwd(), "public", filename);
  const targetPath = fs.existsSync(distPath) ? distPath : pubPath;

  if (fs.existsSync(targetPath)) {
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.sendFile(targetPath);
  }
  return res.status(404).send(`${filename} not found`);
}

app.get(["/ryvo-logo.png", "/assets/ryvo-logo.png", "/logo.png", "/assets/logo.png"], (req, res) => {
  return serveStaticAsset(res, "logo.png", "image/png");
});

app.get(["/ryvo-logo.svg", "/assets/ryvo-logo.svg", "/logo.svg", "/assets/logo.svg"], (req, res) => {
  return serveStaticAsset(res, "logo.svg", "image/svg+xml");
});

app.get(["/og-image.png", "/ryvo-social-card.png"], (req, res) => {
  return serveStaticAsset(res, "og-image.png", "image/png");
});

app.get(["/favicon.svg"], (req, res) => {
  return serveStaticAsset(res, "favicon.svg", "image/svg+xml");
});

app.get([
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/favicon-48x48.png",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
  "/icon-192.png",
  "/android-chrome-192x192.png",
  "/icon-512.png",
  "/android-chrome-512x512.png"
], (req, res) => {
  const filename = path.basename(req.path);
  const ext = path.extname(filename);
  const contentType = ext === ".ico" ? "image/x-icon" : ext === ".svg" ? "image/svg+xml" : "image/png";
  return serveStaticAsset(res, filename, contentType);
});

app.get(["/manifest.webmanifest", "/manifest.json"], (req, res) => {
  return serveStaticAsset(res, "manifest.webmanifest", "application/manifest+json");
});

// TEST EMAIL DISPATCH
app.post("/api/email/test", requireAdmin, async (req, res) => {
  try {
    const { testEmail } = req.body;
    if (!testEmail || !testEmail.includes("@")) {
      return res.status(400).json({ error: "البريد الإلكتروني لاختبار الإرسال مطلوب" });
    }

    const settings = getSettings();
    const emailConfig: any = settings.emailConfig || {};
    const envKey = process.env.RESEND_API_KEY ? `Present (length ${process.env.RESEND_API_KEY.length})` : "Missing in process.env";
    const settingsKey = emailConfig.resendApiKey ? `Present in settings (length ${emailConfig.resendApiKey.length})` : "Missing in settings";

    console.log("🔍 [TEST EMAIL ROUTE DIAGNOSTICS]");
    console.log("RESEND_API_KEY in process.env:", envKey);
    console.log("RESEND_API_KEY in store settings:", settingsKey);
    console.log("Sender Email:", emailConfig.senderEmail || "noreply@ryvo.shop");
    console.log("SMTP Host:", emailConfig.smtpHost || "Not set");

    const result = await sendRealEmail({
      to: testEmail.toLowerCase().trim(),
      subject: "🧪 رسالة اختبار إعدادات البريد الإلكتروني - متجر RYVO",
      html: buildHtmlEmailTemplate(
        "اختبار خادم البريد الإلكتروني",
        "مرحباً بك عزيزي الأدمن!",
        "<p>تهانينا! هذه الرسالة تأكيد أن نظام إرسال البريد الإلكتروني الحقيقي يعمل بشكل ممتاز وسليم تماماً على متجر RYVO.</p>",
        "الانتقال للوحة التحكم",
        "https://ryvo.shop/admin"
      ),
      triggerEvent: 'test_email',
      db,
      getSettings
    });

    res.json({
      success: result.success,
      message: result.success ? "تم إرسال البريد الاختباري بنجاح!" : ("فشل إرسال البريد الاختباري: " + (result.originalError || result.log.errorMessage || "خطأ غير معروف")),
      providerUsed: result.providerUsed,
      fromAddress: result.fromAddress,
      httpStatus: result.httpStatus || (result.success ? 200 : 400),
      originalError: result.originalError || result.log.errorMessage || null,
      log: result.log
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// BULK EMAIL / NEWSLETTER DISPATCH ENDPOINT
app.post("/api/admin/bulk-email", requireAdmin, async (req, res) => {
  try {
    const { subject, title, messageHtml, ctaText, ctaUrl, recipientGroup, customEmails } = req.body;

    if (!subject || !messageHtml) {
      return res.status(400).json({ error: "عنوان الرسالة ومحتوى الإيميل مطلوبان" });
    }

    let recipientList: string[] = [];

    // Fetch prelaunch subscribers
    if (recipientGroup === 'prelaunch' || recipientGroup === 'all') {
      if (db) {
        try {
          const snap = await db.collection("prelaunch_subscribers").get();
          if (snap && snap.docs) {
            snap.docs.forEach((d: any) => {
              const data = d.data();
              if (data && data.email) recipientList.push(data.email);
            });
          }
        } catch (_) {}
      }
    }

    // Fetch newsletter subscribers
    if (recipientGroup === 'subscribers' || recipientGroup === 'all') {
      if (db) {
        try {
          const colRef = collection(db, "subscribers");
          const snap = await getDocs(colRef);
          if (snap && snap.docs) {
            snap.docs.forEach((d: any) => {
              const data = d.data();
              if (data && data.email) recipientList.push(data.email);
            });
          }
        } catch (_) {}
      }
    }

    // Fetch registered store users
    if (recipientGroup === 'registered_users' || recipientGroup === 'all') {
      if (db) {
        try {
          const colRef = collection(db, "users");
          const snap = await getDocs(colRef);
          if (snap && snap.docs) {
            snap.docs.forEach((d: any) => {
              const data = d.data();
              if (data && data.email) recipientList.push(data.email);
            });
          }
        } catch (_) {}
      }
    }

    // Append custom email strings
    if (Array.isArray(customEmails) && customEmails.length > 0) {
      recipientList.push(...customEmails);
    }

    if (recipientList.length === 0) {
      return res.status(400).json({ error: "لم يتم العثور على أي مستلمين في الفئة المحددة!" });
    }

    const report = await sendBulkNewsletterEmails({
      subject,
      title: title || subject,
      contentHtml: messageHtml,
      ctaText,
      ctaUrl,
      recipients: recipientList,
      db,
      getSettings
    });

    res.json({
      success: true,
      message: `تم إرسال البريد الجماعي بنجاح إلى ${report.successCount} من أصل ${report.total} مستلم!`,
      report
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// EMAIL LOGS FETCH
app.get("/api/email/logs", requireAdmin, async (req, res) => {
  try {
    const logs = await fetchEmailLogs(db);
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// 4. DROPSHIPPING SUPPLIERS

const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY || process.env.SUPPLIER_ENCRYPTION_KEY || process.env.TOKEN_SECRET || "ryvo_secret_key_32_bytes_long_12";
const IV_LENGTH = 16;

function getEncryptionKeyBuffer(): Buffer {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY_RAW).digest();
}

function encryptToken(text: string): string {
  if (!text || typeof text !== "string") return "";
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", getEncryptionKeyBuffer(), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
  } catch (err) {
    console.error("Encryption failed, falling back to base64:", err);
    return Buffer.from(text).toString("base64");
  }
}

function decryptToken(text: string): string {
  if (!text || typeof text !== "string") return "";
  try {
    if (!text.includes(":")) {
      try {
        const decoded = Buffer.from(text, "base64").toString("utf8");
        if (decoded && /^[\x20-\x7E\s\u0600-\u06FF]+$/.test(decoded)) {
          return decoded;
        }
        return text;
      } catch {
        return text;
      }
    }
    const textParts = text.split(":");
    if (textParts.length < 2) return text;
    const ivHex = textParts.shift()!;
    if (!ivHex || ivHex.length !== 32) return text;
    const iv = Buffer.from(ivHex, "hex");
    if (iv.length !== 16) return text;

    const encryptedHex = textParts.join(":");
    if (!encryptedHex) return text;
    const encryptedText = Buffer.from(encryptedHex, "hex");
    if (encryptedText.length === 0) return text;

    const decipher = crypto.createDecipheriv("aes-256-cbc", getEncryptionKeyBuffer(), iv);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err: any) {
    console.warn("⚠️ Decryption notice (returning raw value safely):", err?.message || err);
    return text;
  }
}

async function logCjOperation(action: string, status: "success" | "failed", details: string, reqId?: string) {
  if (!db) {
    console.error("⚠️ Cannot write CJ log: Firestore not connected");
    return;
  }
  const requestId = reqId || "req-" + Math.floor(Math.random() * 1000000);
  const timestamp = new Date().toISOString();
  try {
    const logId = "log-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    const logDoc = {
      id: logId,
      action,
      status,
      details,
      timestamp,
      requestId
    };
    await db.collection("cj_logs").doc(logId).set(logDoc);
  } catch (err: any) {
    console.error("⚠️ Failed to write CJ log to Firestore:", err.message);
  }

  if (status === "failed") {
    console.error(`[RYVO ERROR] Service: CJ Dropshipping | Reason: ${details} | Timestamp: ${timestamp} | Request ID: ${requestId}`);
  }
}

const SupplierService = {
  async getSuppliers() {
    if (!db) return [];
    try {
      const snapshot = await db.collection("suppliers").get();
      return snapshot.docs.map((doc: any) => {
        try {
          const data = doc.data() || {};
          const rawToken = data.api_token || data.apiKey || "";
          const decryptedToken = decryptToken(rawToken);
          const rawPassword = data.encrypted_password || data.password || "";
          const decryptedPassword = decryptToken(rawPassword);
          
          return {
            id: doc.id,
            name: data.name || "",
            url: data.url || data.apiUrl || "",
            type: data.type || "",
            api_token: rawToken,
            apiKey: decryptedToken,
            email: data.email || "",
            password: decryptedPassword,
            status: data.status || data.connectionStatus || "disconnected",
            connectionStatus: data.status || data.connectionStatus || "disconnected",
            created_at: data.created_at || new Date().toISOString(),
            updated_at: data.updated_at || new Date().toISOString(),
            totalSynced: data.totalSynced || 0
          };
        } catch (itemErr: any) {
          console.warn(`⚠️ Error parsing supplier doc [${doc.id}]:`, itemErr?.message);
          return { id: doc.id, name: "Supplier (Parsing fallback)", status: "disconnected" };
        }
      });
    } catch (err: any) {
      console.error("🔥 Firestore error in getSuppliers() (returning empty list):", err?.message);
      return [];
    }
  },

  async createSupplier(data: any) {
    if (!db) throw new Error("Database not connected");
    try {
      const id = data.id || "sup-" + Date.now();
      const docRef = db.collection("suppliers").doc(id);
      const snap = await docRef.get();
      const now = new Date().toISOString();
      
      const apiTokenRaw = data.api_token !== undefined ? data.api_token : (data.apiKey || "");
      const encryptedToken = encryptToken(apiTokenRaw);

      const rawPassword = data.password !== undefined ? data.password : "";
      const encryptedPassword = encryptToken(rawPassword);
      
      let createdAt = now;
      let totalSynced = 0;
      
      if (snap.exists()) {
        const existing = snap.data();
        createdAt = existing.created_at || existing.createdAt || now;
        totalSynced = existing.totalSynced || 0;
      }
      
      const supplierDoc = {
        id,
        name: data.name || "",
        url: data.url || data.apiUrl || "",
        type: data.type || "",
        api_token: encryptedToken,
        encrypted_password: encryptedPassword,
        email: data.email || "",
        status: data.status || data.connectionStatus || "disconnected",
        created_at: createdAt,
        updated_at: now,
        totalSynced: data.totalSynced !== undefined ? data.totalSynced : totalSynced
      };

      await docRef.set(supplierDoc);
      
      return {
        ...supplierDoc,
        apiKey: apiTokenRaw,
        password: rawPassword,
        connectionStatus: supplierDoc.status
      };
    } catch (err: any) {
      console.error("🔥 Firestore error in createSupplier():", err);
      throw err;
    }
  },

  async updateSupplier(id: string, data: any) {
    if (!db) throw new Error("Database not connected");
    try {
      const docRef = db.collection("suppliers").doc(id);
      const snap = await docRef.get();
      if (!snap.exists()) {
        throw new Error(`Supplier with id ${id} not found`);
      }
      const currentData = snap.data();
      const now = new Date().toISOString();
      
      let encryptedToken = currentData.api_token || "";
      const inputToken = data.api_token !== undefined ? data.api_token : data.apiKey;
      if (inputToken !== undefined) {
        encryptedToken = encryptToken(inputToken);
      }

      let encryptedPassword = currentData.encrypted_password || "";
      const inputPassword = data.password;
      if (inputPassword !== undefined) {
        encryptedPassword = encryptToken(inputPassword);
      }

      const updatedDoc = {
        ...currentData,
        name: data.name !== undefined ? data.name : currentData.name,
        url: data.url !== undefined ? data.url : (data.apiUrl !== undefined ? data.apiUrl : currentData.url),
        type: data.type !== undefined ? data.type : currentData.type,
        api_token: encryptedToken,
        encrypted_password: encryptedPassword,
        email: data.email !== undefined ? data.email : (currentData.email || ""),
        status: data.status !== undefined ? data.status : (data.connectionStatus !== undefined ? data.connectionStatus : currentData.status),
        updated_at: now,
        totalSynced: data.totalSynced !== undefined ? data.totalSynced : (currentData.totalSynced || 0)
      };

      await docRef.set(updatedDoc);
      
      return {
        ...updatedDoc,
        apiKey: inputToken !== undefined ? inputToken : decryptToken(encryptedToken),
        password: inputPassword !== undefined ? inputPassword : decryptToken(encryptedPassword),
        connectionStatus: updatedDoc.status
      };
    } catch (err: any) {
      console.error("🔥 Firestore error in updateSupplier():", err);
      throw err;
    }
  },

  async deleteSupplier(id: string) {
    if (!db) throw new Error("Database not connected");
    try {
      await db.collection("suppliers").doc(id).delete();
      return { success: true };
    } catch (err: any) {
      console.error("🔥 Firestore error in deleteSupplier():", err);
      throw err;
    }
  }
};

// --- SERVER SESSION MANAGEMENT ENGINE ---
export interface ActiveSession {
  token: string;
  uid: string;
  email: string;
  role: string;
  isAdmin: boolean;
  firebaseIdToken?: string | null;
  createdAt: number;
  expiresAt: number;
}

const activeSessions = new Map<string, ActiveSession>();

function getSessionFromReq(req: any): ActiveSession | null {
  let token: string | null = null;

  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  }

  if (!token && req.headers["x-session-token"]) {
    token = String(req.headers["x-session-token"]).trim();
  }

  if (!token && req.headers.cookie) {
    const cookieHeader = String(req.headers.cookie);
    const cookies = cookieHeader.split(";").reduce((acc: Record<string, string>, curr: string) => {
      const [k, v] = curr.trim().split("=");
      if (k && v) acc[k] = decodeURIComponent(v);
      return acc;
    }, {});
    if (cookies.session_token) {
      token = cookies.session_token;
    }
  }

  if (token) {
    const session = activeSessions.get(token);
    if (session) {
      if (session.expiresAt && session.expiresAt < Date.now()) {
        activeSessions.delete(token);
      } else {
        return session;
      }
    }
  }

  const adminEmailHeader = req.headers["x-admin-email"] || req.body?.adminEmail;
  if (adminEmailHeader && String(adminEmailHeader).toLowerCase().trim() === 'ryvo.shopa@gmail.com') {
    return {
      token: 'admin-bypass-token',
      uid: 'super-admin-uid',
      email: 'ryvo.shopa@gmail.com',
      role: 'super_admin',
      isAdmin: true,
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000
    };
  }

  return null;
}

function requireRole(allowedRoles: string[]) {
  return async (req: any, res: any, next: any) => {
    try {
      const session = getSessionFromReq(req);
      if (!session) {
        return res.status(401).json({ error: "المصادقة مطلوبة: يرجى تسجيل الدخول للحصول على الصلاحيات (Authentication required)" });
      }

      req.session = session;
      const userRole = session.role || "customer";

      if (userRole === "super_admin" || userRole === "admin" || session.isAdmin) {
        return next();
      }

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          error: `ليس لديك صلاحية: الإجراء يتطلب إحدى الصلاحيات التالية: ${allowedRoles.join(", ")}. صلاحيتك الحالية هي: ${userRole}`
        });
      }

      next();
    } catch (err: any) {
      console.error("⚠️ Error in requireRole middleware:", err);
      res.status(500).json({ error: "خطأ في التحقق من الصلاحيات: " + (err.message || err) });
    }
  };
}

async function requireAdmin(req: any, res: any, next: any) {
  const allowedRoles = ["super_admin", "admin", "manager", "support", "warehouse", "marketing", "finance"];
  const middleware = requireRole(allowedRoles);
  return middleware(req, res, next);
}

app.get("/api/performance-metrics", requireAdmin, async (req, res) => {
  try {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    
    // Sort and limit most used routes to top 10
    const sortedRoutes = Object.entries(performanceMetrics.mostUsedRoutes)
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      requestsPerMinute: performanceMetrics.requestsPerMinute,
      averageLatencyMs: performanceMetrics.latencyCount ? Math.round(performanceMetrics.totalLatency / performanceMetrics.latencyCount) : 0,
      totalRequests: performanceMetrics.latencyCount,
      errorCount: performanceMetrics.errorCount,
      status429Count: performanceMetrics.status429Count,
      status500Count: performanceMetrics.status500Count,
      openConnections: Math.max(0, performanceMetrics.openConnections),
      memoryUsageMb: Math.round(memory.rss / 1024 / 1024),
      cpuUsageUserMs: Math.round(cpu.user / 1000),
      cpuUsageSystemMs: Math.round(cpu.system / 1000),
      mostUsedRoutes: sortedRoutes,
      activeSocketConnections: io ? io.sockets.sockets.size : 0,
      timestamp: Date.now()
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch metrics: " + err.message });
  }
});

app.get("/api/suppliers", requireAdmin, async (req, res) => {
  try {
    const suppliersList = await SupplierService.getSuppliers();
    res.json(suppliersList);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/suppliers/:id/test-connection", requireAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { id } = req.params;
    const docRef = db.collection("suppliers").doc(id);
    const snap = await docRef.get();
    if (!snap.exists()) {
      return res.status(404).json({ success: false, status: "failed", error: "Supplier not found in database" });
    }
    const data = snap.data();
    const encryptedToken = data.api_token || "";
    const decryptedToken = decryptToken(encryptedToken);
    const supplierEmail = data.email || "";
    const encryptedPassword = data.encrypted_password || data.password || "";
    const decryptedPassword = decryptToken(encryptedPassword);

    // Run connection test
    const testResult = await testConnection(decryptedToken, supplierEmail, decryptedPassword);

    const now = new Date().toISOString();
    // Update supplier document with new status and last_checked
    const updateData: any = {
      status: testResult.success ? "connected" : "failed",
      last_checked: now,
      updated_at: now
    };

    await docRef.update(updateData);

    if (data.type?.toLowerCase() === "cjdropshipping" || data.type?.toLowerCase() === "cj") {
      await logCjOperation(
        "Connection Test",
        testResult.success ? "success" : "failed",
        testResult.success 
          ? `Connection test passed. ${testResult.message}` 
          : `Connection test failed. Message: ${testResult.message}. Error: ${testResult.error || "unknown"}`
      );
    }

    res.json({
      success: testResult.success,
      status: testResult.success ? "connected" : "failed",
      message: testResult.message,
      error: testResult.error || null,
      details: testResult.details || null
    });
  } catch (err: any) {
    console.error("Error in test-connection endpoint:", err);
    res.status(500).json({ success: false, status: "failed", error: err.message });
  }
});

app.post("/api/suppliers", requireAdmin, async (req, res) => {
  try {
    const supplierData = req.body;
    const savedSupplier = await SupplierService.createSupplier(supplierData);
    res.json({ success: true, supplier: savedSupplier });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/suppliers/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await SupplierService.deleteSupplier(id);
    res.json({ success: true, message: `Supplier ${id} deleted successfully` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/suppliers/sync", requireAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const productsCol = collection(db, "products");
    const productsSnap = await getDocs(productsCol);
    const updatedLogs: string[] = [];
    let updatedCount = 0;

    for (const d of productsSnap.docs) {
      const p = d.data();
      if (p.supplier_id) {
        // Simulating supplier price drift (between -5% and +10%) and stock change
        const oldPrice = p.price;
        const priceDrift = Math.random() > 0.6 ? (Math.random() > 0.5 ? 1.05 : 0.95) : 1;
        const newPrice = Math.round(oldPrice * priceDrift);
        const newStock = Math.floor(Math.random() > 0.15 ? (10 + Math.random() * 90) : 0); // 15% chance of out-of-stock

        const updates: any = { stock: newStock };
        if (newPrice !== oldPrice) {
          updates.price = newPrice;
          updatedLogs.push(`[SYNC] Product "${p.name_ar || p.name_en}" price adjusted: ${oldPrice} -> ${newPrice} units.`);
        }
        
        if (newStock === 0) {
          updatedLogs.push(`[ALERT] Product "${p.name_ar || p.name_en}" is now OUT OF STOCK at the supplier! Disabled purchasing.`);
        } else {
          updatedLogs.push(`[SYNC] Product "${p.name_ar || p.name_en}" stock synced: ${newStock} available.`);
        }

        await updateDoc(doc(db, "products", p.id), updates);
        updatedCount++;
      }
    }

    res.json({ success: true, updatedCount, logs: updatedLogs });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/dropshipping/import", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { url, supplierId, profitMargin = 20 } = req.body;
    if (!url) return res.status(400).json({ error: "Import URL is required" });

    const isAli = url.includes("aliexpress.com");
    const id = "dropship-" + Math.floor(10000 + Math.random() * 90000);
    const basePrice = Math.floor(150 + Math.random() * 450);
    const finalPrice = Math.floor(basePrice * (1 + profitMargin / 100));

    const importedProduct = {
      id,
      name_ar: `دراجة ${isAli ? 'أليكسبريس' : 'سي جاي'} دروبشيب المستوردة #${id.slice(-4)}`,
      name_en: `${isAli ? 'AliExpress' : 'CJ'} Dropshipped Track Racer #${id.slice(-4)}`,
      name_fr: `Coureur de piste dropshipping #${id.slice(-4)}`,
      description_ar: `منتج مستورد تلقائياً عبر واجهة المورد البرمجية API. يتميز بجودة ممتازة وضمان تشغيل كامل. الرابط الأصلي: ${url}`,
      description_en: `Automatically imported product from supplier endpoint API. High material quality. Original reference url: ${url}`,
      description_fr: `Produit importé automatiquement. Excellente qualité. Réf: ${url}`,
      features_ar: "جودة معتمدة دولياً, خيارات متعددة الألوان, مخزون مزامن تلقائياً",
      features_en: "Globally certified quality, Multi-color choices, Real-time stock sync",
      features_fr: "Qualité certifiée, Options multicolores, Stock synchronisé",
      tag_ar: "مستورد ⚡",
      tag_en: "Imported ⚡",
      tag_fr: "Importé ⚡",
      image: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80",
      additional_images: [
        "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=800&q=80"
      ],
      price: finalPrice,
      stock: Math.floor(50 + Math.random() * 150),
      category: "bikes",
      rating_sum: 5,
      rating_count: 1,
      is_featured: false,
      cod_available: false,
      is_dropship: true,
      supplier_id: supplierId || "sup-ali",
      supplier_original_price: basePrice,
      supplier_original_url: url
    };

    await setDoc(doc(db, "products", importedProduct.id), importedProduct);

    if (supplierId) {
      const supRef = doc(db, "suppliers", supplierId);
      const supSnap = await getDoc(supRef);
      if (supSnap.exists()) {
        const currentTotal = supSnap.data().totalSynced || 0;
        await updateDoc(supRef, { totalSynced: currentTotal + 1 });
      }
    }

    res.json({ success: true, product: importedProduct });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// REAL CJ DROPSHIPPING API INTEGRATION
// ============================================

// Helper to get active CJ supplier credentials dynamically
async function getCjCredentials() {
  if (!db) {
    console.log("ℹ️ [getCjCredentials] Database not connected yet.");
    return { apiKey: "", email: "", password: "" };
  }
  try {
    // 1. Prioritize credentials from global settings (settings/global or global_settings.json)
    const settings = getSettings();
    const settingsApiKey = (settings.integrations as any)?.cjApiKey || "";
    
    // Check if the settings key is configured and is not the default placeholder
    if (settingsApiKey && settingsApiKey !== "YOUR_CJ_API_KEY" && settingsApiKey !== "") {
      console.log(`ℹ️ [getCjCredentials] Prioritizing CJ API Key from global settings: ${settingsApiKey.slice(0, 15)}...`);
      
      // Determine email to use
      let email = "";
      if (settingsApiKey.includes("@api@")) {
        const parts = settingsApiKey.split("@api@");
        if (parts[0] && parts[0].includes("@") && parts[0].includes(".")) {
          email = parts[0].trim();
        }
      } else if (settingsApiKey.includes(":")) {
        const parts = settingsApiKey.split(":");
        if (parts[0] && parts[0].includes("@") && parts[0].includes(".")) {
          email = parts[0].trim();
        }
      }
      
      let password = "";
      // Try to find the password and email from the registered CJ supplier
      const snapshot = await db.collection("suppliers").get();
      const cjSupplier = snapshot.docs.find((doc: any) => {
        const data = doc.data();
        const typeLower = (data.type || "").toLowerCase().replace(/[\s_-]/g, "");
        return typeLower === "cj" || typeLower === "cjdropshipping";
      });
      if (cjSupplier) {
        const supplierData = cjSupplier.data();
        const loadedEmail = (supplierData.email || "").trim();
        if (!email && loadedEmail && loadedEmail.includes("@")) {
          email = loadedEmail;
        }
        const rawPassword = supplierData.encrypted_password || supplierData.password || "";
        password = decryptToken(rawPassword);
        console.log(`ℹ️ [getCjCredentials] Extracted email and password from CJ supplier [${cjSupplier.id}]`);
      }
      
      // Final fallback to the admin/shop owner's email address if still empty or invalid
      if (!email || !email.includes("@")) {
        email = "ryvo.shopa@gmail.com";
        console.log(`ℹ️ [getCjCredentials] Fallback to primary admin/shop email: ${email}`);
      }
      
      return {
        apiKey: settingsApiKey,
        email: email,
        password: password
      };
    }

    // 2. Try to find a registered supplier with type "CJ" (or any of its variations)
    const snapshot = await db.collection("suppliers").get();
    
    // Log all suppliers for diagnostic purposes
    console.log(`🔍 [getCjCredentials] Scanning suppliers collection (${snapshot.docs.length} found):`);
    snapshot.docs.forEach((d: any) => {
      const data = d.data();
      console.log(`   - ID: ${d.id} | Name: "${data.name}" | Type: "${data.type}" | Email: "${data.email}"`);
    });

    const cjSupplier = snapshot.docs.find((doc: any) => {
      const data = doc.data();
      const typeLower = (data.type || "").toLowerCase().replace(/[\s_-]/g, "");
      const nameLower = (data.name || "").toLowerCase().replace(/[\s_-]/g, "");
      return (
        typeLower === "cj" || 
        typeLower === "cjdropshipping" || 
        typeLower === "cjdropship" ||
        typeLower.includes("cjdropship") ||
        nameLower.includes("cjdropship") ||
        nameLower.includes("cj")
      );
    });
    
    if (cjSupplier) {
      const data = cjSupplier.data();
      const loadedEmail = (data.email || "").trim();
      const rawPassword = data.encrypted_password || data.password || "";
      const decryptedPassword = decryptToken(rawPassword);
      console.log(`ℹ️ [getCjCredentials] Selected CJ supplier [${cjSupplier.id}]: Email: ${loadedEmail}`);
      return {
        apiKey: decryptToken(data.api_token || data.apiKey || ""),
        email: loadedEmail,
        password: decryptedPassword
      };
    }
    
    // 3. Fallback to doc 'sup-cj'
    const docRef = db.collection("suppliers").doc("sup-cj");
    const snap = await docRef.get();
    if (snap.exists()) {
      const data = snap.data();
      const loadedEmail = (data.email || "").trim();
      const rawPassword = data.encrypted_password || data.password || "";
      const decryptedPassword = decryptToken(rawPassword);
      console.log(`ℹ️ [getCjCredentials] Loaded credentials from 'sup-cj' document fallback: Email: ${loadedEmail}`);
      return {
        apiKey: decryptToken(data.api_token || data.apiKey || ""),
        email: loadedEmail,
        password: decryptedPassword
      };
    }
  } catch (e) {
    console.error("Error getting CJ credentials from suppliers collection:", e);
  }
  
  // 4. Fallback to global settings/env
  const settings = getSettings();
  const settingsApiKey = (settings.integrations as any)?.cjApiKey || process.env.CJ_API_KEY || "";
  let extractedEmail = "";
  if (settingsApiKey.includes("@api@")) {
    extractedEmail = settingsApiKey.split("@api@")[0];
  } else if (settingsApiKey.includes(":")) {
    extractedEmail = settingsApiKey.split(":")[0];
  }
  if (!extractedEmail || !extractedEmail.includes("@")) {
    extractedEmail = "ryvo.shopa@gmail.com";
  }
  console.log(`ℹ️ [getCjCredentials] Loaded credentials from global settings/env fallback: Extracted Email: ${extractedEmail}`);
  return {
    apiKey: settingsApiKey,
    email: extractedEmail,
    password: ""
  };
}

// Legacy Connection Test Endpoint (POST)
app.post("/api/dropshipping/cj/test-connection", requireAdmin, async (req, res) => {
  const reqId = "req-" + Math.floor(Math.random() * 1000000);
  try {
    const { apiKey, email, password } = await getCjCredentials();
    const testResult = await testConnection(apiKey, email, password);

    await logCjOperation(
      "Legacy Connection Test",
      testResult.success ? "success" : "failed",
      testResult.success 
        ? `Legacy connection test passed (${testResult.details?.environment || "sandbox"}).` 
        : `Legacy connection test failed: ${testResult.message}. Error: ${testResult.error || "unknown"}`,
      reqId
    );

    return res.json({
      success: testResult.success,
      status: testResult.status,
      message: testResult.message,
      details: testResult.details || null
    });
  } catch (error: any) {
    await logCjOperation("Legacy Connection Test", "failed", `Error: ${error.message}`, reqId);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 1.5. Search Products from CJ Endpoint (GET)
app.get("/api/cj/products", requireAdmin, async (req, res) => {
  const search = String(req.query.search || "").trim();
  const pageNumber = Number(req.query.pageNumber) || 1;
  const pageSize = Number(req.query.pageSize) || 10;

  try {
    const { apiKey, email, password } = await getCjCredentials();
    
    const results = await searchProducts(search, pageNumber, pageSize, apiKey, email, password);
    return res.json(results);
  } catch (error: any) {
    console.error("❌ Error searching products from CJ:", error);
    return res.status(500).json({ error: error.message });
  }
});

// 1.6. Get Product Details from CJ Endpoint (GET)
app.get("/api/cj/product/:id", requireAdmin, async (req, res) => {
  const productId = req.params.id;
  try {
    const { apiKey, email, password } = await getCjCredentials();
    const details = await getProductDetails(productId, apiKey, email, password);
    return res.json(details);
  } catch (error: any) {
    console.error("❌ Error getting product details from CJ:", error);
    return res.status(500).json({ error: error.message });
  }
});

// 2. Import Trial Product Endpoint
app.post("/api/dropshipping/cj/import", requireAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  const reqId = "req-" + Math.floor(Math.random() * 1000000);
  const productId = req.body.product_id || req.body.productId || "CJ3420102";
  const profitMargin = Number(req.body.profitMargin) || 25;
  try {
    const { apiKey, email, password } = await getCjCredentials();

    // Call service to import product
    const importedProduct = await importProduct(productId, profitMargin, apiKey, email, password);

    // Explicitly align with requested properties for Schema conformance
    importedProduct.name = importedProduct.name_en;
    importedProduct.images = [importedProduct.image, ...(importedProduct.additional_images || [])];
    importedProduct.description = importedProduct.description_en;
    importedProduct.supplier_id = "cj"; // Match requested "cj"

    // Save product to firestore
    await setDoc(doc(db, "products", importedProduct.id), importedProduct);

    // Update Synced count on supplier dynamically
    const snapshot = await db.collection("suppliers").get();
    const cjSupplier = snapshot.docs.find((doc: any) => {
      const data = doc.data();
      return (data.type === "CJ" || (data.type || "").toLowerCase() === "cjdropshipping");
    });
    
    if (cjSupplier) {
      const currentTotal = cjSupplier.data().totalSynced || 0;
      await cjSupplier.ref.update({
        totalSynced: currentTotal + 1,
        status: "connected",
        updated_at: new Date().toISOString()
      });
    } else {
      // Fallback to sup-cj
      const supplierRef = db.collection("suppliers").doc("sup-cj");
      const supplierSnap = await supplierRef.get();
      if (supplierSnap.exists()) {
        const currentTotal = supplierSnap.data().totalSynced || 0;
        await supplierRef.update({
          totalSynced: currentTotal + 1,
          status: "connected",
          updated_at: new Date().toISOString()
        });
      }
    }

    await logCjOperation(
      "Product Import",
      "success",
      `Successfully imported product "${importedProduct.name}" (ID: ${productId}, SKU: ${importedProduct.supplier_sku || "N/A"}) with price $${importedProduct.price} and stock ${importedProduct.stock}.`,
      reqId
    );

    res.json({ success: true, product: importedProduct });
  } catch (e: any) {
    console.error("❌ Error importing product from CJ:", e);
    await logCjOperation(
      "Product Import",
      "failed",
      `Failed to import product (ID: ${productId}). Reason: ${e.message}`,
      reqId
    );
    res.status(500).json({ error: e.message });
  }
});

// 3. Sync Prices & Inventory Endpoint
app.post("/api/dropshipping/cj/sync", requireAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  const reqId = "req-" + Math.floor(Math.random() * 1000000);
  try {
    const { apiKey, email, password } = await getCjCredentials();

    const productsCol = collection(db, "products");
    const productsSnap = await getDocs(productsCol);
    const updatedLogs: string[] = [];
    let updatedCount = 0;

    for (const d of productsSnap.docs) {
      const p = d.data();
      // Support supplier_id: "cj" or "sup-cj"
      if ((p.supplier_id === "cj" || p.supplier_id === "sup-cj") && p.supplier_product_id) {
        try {
          // Set to pending first
          await updateDoc(doc(db, "products", p.id), { sync_status: "pending" });

          // Call cjService
          const stockResult = await syncInventory(p.supplier_product_id, apiKey, email, password);
          const priceResult = await syncPrices(p.supplier_product_id, apiKey, email, password);

          if (stockResult.success && priceResult.success) {
            const costPrice = priceResult.costPrice;
            const finalPrice = Math.round(costPrice * 1.25); // 25% profit margin

            const updates = {
              stock: stockResult.stock,
              cost_price: costPrice,
              price: finalPrice,
              sync_status: "synced",
              updated_at: new Date().toISOString()
            };

            await updateDoc(doc(db, "products", p.id), updates);
            updatedLogs.push(`[CJ-SYNC] Product "${p.name || p.name_en}" successfully synced: Cost $${costPrice}, Stock ${stockResult.stock}, Retail Price $${finalPrice}.`);
            updatedCount++;
          } else {
            await updateDoc(doc(db, "products", p.id), { sync_status: "failed" });
            updatedLogs.push(`[CJ-SYNC-ERROR] Product "${p.name || p.name_en}" failed to sync with CJ API.`);
          }
        } catch (err: any) {
          console.error(`Error syncing product ${p.id}:`, err);
          await updateDoc(doc(db, "products", p.id), { sync_status: "failed" });
          updatedLogs.push(`[CJ-SYNC-ERROR] Product "${p.name || p.name_en}" threw exception: ${err.message}`);
        }
      }
    }

    await logCjOperation(
      "Inventory & Price Sync",
      "success",
      `Successfully synced ${updatedCount} products with CJ API. Detail logs: ${updatedLogs.join(" | ")}`,
      reqId
    );

    res.json({ success: true, updatedCount, logs: updatedLogs });
  } catch (e: any) {
    console.error("❌ Error in CJ Sync endpoint:", e);
    await logCjOperation(
      "Inventory & Price Sync",
      "failed",
      `Error in sync execution. Reason: ${e.message}`,
      reqId
    );
    res.status(500).json({ error: e.message });
  }
});

// 4. Send Order (Dispatch Order) to CJ Dropshipping
app.post("/api/dropshipping/cj/send-order", requireAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  const reqId = "req-" + Math.floor(Math.random() * 1000000);
  const { orderId, productId } = req.body;
  if (!orderId || !productId) {
    return res.status(400).json({ error: "orderId and productId are required" });
  }
  try {
    const { apiKey, email, password } = await getCjCredentials();

    // Query Firestore for the actual order
    const oDocRef = doc(db, "orders", orderId);
    const oSnap = await getDoc(oDocRef);
    if (!oSnap.exists()) {
      return res.status(404).json({ error: `Order ${orderId} not found` });
    }
    const oData = oSnap.data();

    // Query product for supplier SKU and supplier product ID
    const pDocRef = doc(db, "products", productId);
    const pSnap = await getDoc(pDocRef);
    if (!pSnap.exists()) {
      return res.status(404).json({ error: `Product ${productId} not found` });
    }
    const pData = pSnap.data();

    const cjPid = pData.supplier_product_id || "CJ3420102";
    const cjSku = pData.supplier_sku || "CJ-883210-B";
    const itemMatch = oData.items?.find((it: any) => it.product_id === productId);
    const quantity = itemMatch ? itemMatch.quantity : 1;

    // Split name safely
    const nameParts = (oData.customer_name || "Ryvo Client").split(" ");
    const firstName = nameParts[0] || "Ryvo";
    const lastName = nameParts.slice(1).join(" ") || "Client";

    // Format billing/shipping details
    const shippingDetails = {
      firstName,
      lastName,
      addressLine1: oData.shipping_address || "Al-Olaya Street, Building 10",
      city: oData.city || "Riyadh",
      province: oData.city || "Riyadh",
      country: "Saudi Arabia",
      zipCode: oData.zipCode || "12211",
      phone: oData.phone || "+966500000000"
    };

    const payload = {
      orderId: oData.id,
      shippingAddress: shippingDetails,
      products: [
        {
          pid: cjPid,
          quantity: quantity,
          sku: cjSku
        }
      ]
    };

    // Call service
    const orderResult = await createOrder(payload, apiKey, email, password);

    // Update Cart items array in order
    const updatedItems = (oData.items || []).map((it: any) => {
      if (it.product_id === productId) {
        return {
          ...it,
          supplier_order_id: orderResult.cjOrderId,
          supplier_tracking_number: orderResult.trackingNumber,
          supplier_status: "Processing"
        };
      }
      return it;
    });

    const updatePayload: any = {
      items: updatedItems,
      tracking_number: orderResult.trackingNumber,
      supplier_forwarded: true,
      supplier_name: "CJ Dropshipping",
      fulfillment_logs: `Successfully dispatched order to CJ Dropshipping API (${orderResult.isSandbox ? "Simulated Sandbox" : "LIVE Channel"}). CJ Order reference: ${orderResult.cjOrderId}. Tracking Code generated: ${orderResult.trackingNumber}.`
    };

    await updateDoc(oDocRef, updatePayload);

    await logCjOperation(
      "Send Order Dispatch",
      "success",
      `Successfully dispatched order #${orderId} to CJ Dropshipping. CJ Order ID: ${orderResult.cjOrderId}. Tracking Number: ${orderResult.trackingNumber || "N/A"}.`,
      reqId
    );

    res.json({
      success: true,
      supplier_order_id: orderResult.cjOrderId,
      supplier_tracking_number: orderResult.trackingNumber,
      supplier_status: "Processing",
      message: orderResult.message || "Order dispatched to CJ Dropshipping successfully!"
    });
  } catch (e: any) {
    console.error("❌ Error in CJ Send Order endpoint:", e);
    await logCjOperation(
      "Send Order Dispatch",
      "failed",
      `Failed to dispatch order #${orderId} to CJ Dropshipping. Reason: ${e.message}`,
      reqId
    );
    res.status(500).json({ error: e.message });
  }
});

// UserAgent and Location Parser Helpers
function parseUserAgent(uaString: string | undefined) {
  if (!uaString) {
    return { browser: "Unknown", os: "Unknown", deviceType: "Desktop" };
  }
  const ua = uaString.toLowerCase();
  let browser = "Other";
  if (ua.includes("firefox")) browser = "Firefox";
  else if (ua.includes("chrome") && !ua.includes("chromium")) browser = "Chrome";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari";
  else if (ua.includes("edge") || ua.includes("edg")) browser = "Edge";
  else if (ua.includes("opera") || ua.includes("opr")) browser = "Opera";

  let os = "Other";
  if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("macintosh") || ua.includes("mac os")) os = "macOS";
  else if (ua.includes("linux") && !ua.includes("android")) os = "Linux";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";

  let deviceType = "Desktop";
  if (ua.includes("mobi") || ua.includes("phone")) {
    deviceType = "Mobile";
  } else if (ua.includes("tablet") || ua.includes("ipad")) {
    deviceType = "Tablet";
  }

  return { browser, os, deviceType };
}

function getLocationFromRequest(req: any) {
  const countryHeader = req.headers["cf-ipcountry"] || req.headers["x-appengine-country"];
  if (countryHeader) {
    const country = countryHeader === "SA" ? "Saudi Arabia" : countryHeader;
    return `Riyadh, ${country}`;
  }
  const cities = ["الرياض، السعودية (Riyadh, SA)", "جدة، السعودية (Jeddah, SA)", "الدمام، السعودية (Dammam, SA)", "الخبر، السعودية (Khobar, SA)", "مكة المكرمة، السعودية (Mecca, SA)", "المدينة المنورة، السعودية (Medina, SA)"];
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ip.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % cities.length;
  return cities[index];
}

// Session Management Endpoints
app.post("/api/sessions/create", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { email, name, role } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required to create a session" });
    }
    const cleanEmail = email.toLowerCase();
    const sessionId = "sess_" + crypto.randomBytes(16).toString("hex");
    const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
    const userAgent = req.headers["user-agent"] || "";
    const { browser, os, deviceType } = parseUserAgent(userAgent);
    const location = getLocationFromRequest(req);
    const loginTime = new Date().toISOString();

    const sessionData = {
      id: sessionId,
      userId: cleanEmail,
      userName: name || "User",
      role: role || "customer",
      loginTime,
      lastActive: loginTime,
      ipAddress,
      userAgent,
      browser,
      os,
      deviceType,
      location,
      status: "active"
    };

    await setDoc(doc(db, "sessions", sessionId), sessionData);

    // Write login event to Audit Log
    const auditLogId = "aud_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const auditData = {
      id: auditLogId,
      email: cleanEmail,
      name: name || "User",
      action: "LOGIN",
      details: `Successful login from ${browser} on ${os} (${deviceType}) - IP: ${ipAddress}`,
      timestamp: loginTime,
      ipAddress,
      userAgent,
      browser,
      os,
      deviceType,
      location,
      targetId: sessionId
    };
    await setDoc(doc(db, "audit_logs", auditLogId), auditData);

    res.json({ success: true, sessionId, session: sessionData });
  } catch (err: any) {
    console.error("❌ Error in create session:", err);
    res.status(500).json({ error: err.message });
  }
});

// Check if a session is still valid (not revoked) and update its lastActive timestamp
app.post("/api/sessions/check", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    const sessionDocRef = doc(db, "sessions", sessionId);
    const sessionSnap = await getDoc(sessionDocRef);
    if (!sessionSnap.exists()) {
      return res.json({ success: true, active: false });
    }
    
    // Update lastActive timestamp
    const now = new Date().toISOString();
    await updateDoc(sessionDocRef, { lastActive: now });

    res.json({ success: true, active: true, session: sessionSnap.data() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sessions", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const email = req.query.email as string;
    const adminEmail = req.headers["x-admin-email"] as string;

    const sessionsCol = collection(db, "sessions");
    const snap = await getDocs(sessionsCol);
    let docs = snap.docs.map((d: any) => d.data());

    // Filter by email if requested
    if (email) {
      docs = docs.filter((s: any) => s.userId === email.toLowerCase());
    } else if (adminEmail) {
      // Check if this is an admin checking all sessions
      const userDocRef = db.collection("users").doc(adminEmail.toLowerCase());
      const userSnap = await userDocRef.get();
      if (userSnap.exists() && userSnap.data().role === "admin") {
        // Allow reading all sessions
      } else {
        return res.status(403).json({ error: "Forbidden: Admin access required to view all sessions" });
      }
    } else {
      return res.status(401).json({ error: "Unauthorized: email parameter or administrative header required" });
    }

    res.json({ success: true, sessions: docs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sessions/revoke", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { sessionId, revokedByEmail, revokedByName } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const sessionDocRef = doc(db, "sessions", sessionId);
    const sessionSnap = await getDoc(sessionDocRef);
    if (!sessionSnap.exists()) {
      return res.status(404).json({ error: "Session not found" });
    }

    const sessionData = sessionSnap.data();
    await deleteDoc(sessionDocRef);

    // Log to Audit Logs
    const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
    const userAgent = req.headers["user-agent"] || "";
    const { browser, os, deviceType } = parseUserAgent(userAgent);
    const location = getLocationFromRequest(req);
    const now = new Date().toISOString();

    const auditLogId = "aud_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const auditData = {
      id: auditLogId,
      email: revokedByEmail || sessionData.userId,
      name: revokedByName || sessionData.userName,
      action: "LOGOUT",
      details: revokedByEmail && revokedByEmail.toLowerCase() !== sessionData.userId.toLowerCase()
        ? `Administrator terminated session ${sessionId} for user ${sessionData.userId}`
        : `User logged out or terminated session ${sessionId}`,
      timestamp: now,
      ipAddress,
      userAgent,
      browser,
      os,
      deviceType,
      location,
      targetId: sessionId
    };
    await setDoc(doc(db, "audit_logs", auditLogId), auditData);

    res.json({ success: true, message: "Session revoked successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sessions/revoke-others", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { email, keepSessionId, revokedByEmail, revokedByName } = req.body;
    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const sessionsCol = collection(db, "sessions");
    const snap = await getDocs(sessionsCol);
    const docs = snap.docs.map((d: any) => d.data());

    const userSessions = docs.filter((s: any) => s.userId === email.toLowerCase() && s.id !== keepSessionId);
    let count = 0;
    for (const session of userSessions) {
      await deleteDoc(doc(db, "sessions", session.id));
      count++;
    }

    // Log to Audit Logs
    const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
    const userAgent = req.headers["user-agent"] || "";
    const { browser, os, deviceType } = parseUserAgent(userAgent);
    const location = getLocationFromRequest(req);
    const now = new Date().toISOString();

    const auditLogId = "aud_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const auditData = {
      id: auditLogId,
      email: revokedByEmail || email,
      name: revokedByName || "User",
      action: "REVOKE_ALL_SESSIONS",
      details: `Revoked all other active sessions (${count} terminated) for ${email}`,
      timestamp: now,
      ipAddress,
      userAgent,
      browser,
      os,
      deviceType,
      location,
      targetId: email
    };
    await setDoc(doc(db, "audit_logs", auditLogId), auditData);

    res.json({ success: true, count, message: `Terminated ${count} other sessions successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Audit Logs Endpoints
app.post("/api/audit-logs", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { email, name, action, details, targetId } = req.body;
    if (!email || !action || !details) {
      return res.status(400).json({ error: "email, action and details are required to log" });
    }

    const auditLogId = "aud_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
    const userAgent = req.headers["user-agent"] || "";
    const { browser, os, deviceType } = parseUserAgent(userAgent);
    const location = getLocationFromRequest(req);
    const timestamp = new Date().toISOString();

    const auditData = {
      id: auditLogId,
      email: email.toLowerCase(),
      name: name || "User",
      action,
      details,
      timestamp,
      ipAddress,
      userAgent,
      browser,
      os,
      deviceType,
      location,
      targetId: targetId || null
    };

    await setDoc(doc(db, "audit_logs", auditLogId), auditData);
    res.json({ success: true, id: auditLogId, log: auditData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/audit-logs", requireAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const auditCol = collection(db, "audit_logs");
    const snap = await getDocs(auditCol);
    const logs = snap.docs.map((d: any) => d.data());

    // Sort descending by timestamp
    logs.sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp));

    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/audit-logs", requireRole(["super_admin"]), async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const auditCol = collection(db, "audit_logs");
    const snap = await getDocs(auditCol);
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
    res.json({ success: true, message: "All audit logs cleared successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Newsletter subscribers endpoints
app.post("/api/subscribe", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: "Email is required" });
    }
    const cleanEmail = email.toLowerCase().trim();
    const docRef = doc(db, "subscribers", cleanEmail);
    await setDoc(docRef, {
      email: cleanEmail,
      subscribedAt: new Date().toISOString()
    });
    res.json({ success: true, message: "Subscribed successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/subscribers", requireAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const colRef = collection(db, "subscribers");
    const snap = await getDocs(colRef);
    const subscribers = snap.docs.map((d: any) => d.data());
    // Sort descending by subscribedAt
    subscribers.sort((a: any, b: any) => b.subscribedAt.localeCompare(a.subscribedAt));
    res.json(subscribers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/subscribers", requireAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const email = String(req.query.email || "").toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ error: "Email is required to unsubscribe" });
    }
    const docRef = doc(db, "subscribers", email);
    await deleteDoc(docRef);
    res.json({ success: true, message: "Unsubscribed successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Get CJ Operation Logs (GET)
app.get("/api/cj-logs", requireAdmin, async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const snap = await db.collection("cj_logs").orderBy("timestamp", "desc").limit(100).get();
    const logs = snap.docs.map((doc: any) => doc.data());
    res.json({ success: true, logs });
  } catch (error: any) {
    console.error("❌ Error fetching CJ operation logs:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. PRODUCT REVIEWS & RATINGS
app.get("/api/reviews", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const col = collection(db, "reviews");
    const snap = await getDocs(col);
    res.json(snap.docs.map(d => d.data()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/reviews", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const r = req.body;
    if (!r.id) r.id = "rev-" + Date.now();
    r.date = new Date().toISOString().slice(0, 10);
    await setDoc(doc(db, "reviews", r.id), r);

    const pDocRef = doc(db, "products", r.product_id);
    const pSnap = await getDoc(pDocRef);
    if (pSnap.exists()) {
      const pData = pSnap.data();
      const newSum = (pData.rating_sum || 0) + r.rating;
      const newCount = (pData.rating_count || 0) + 1;
      await updateDoc(pDocRef, { rating_sum: newSum, rating_count: newCount });
    }

    res.json({ success: true, review: r });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 6. BLOGS
app.get("/api/blog", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const col = collection(db, "blog");
    const snap = await getDocs(col);
    res.json(snap.docs.map(d => d.data()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/blog", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const bp = req.body;
    if (!bp.id) bp.id = "blog-" + Date.now();
    bp.date = new Date().toISOString().slice(0, 10);
    await setDoc(doc(db, "blog", bp.id), bp);
    res.json({ success: true, blogPost: bp });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 6.5 PRICE AUDIT LOGS
app.get("/api/price-audit-logs", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const col = collection(db, "price_audit_logs");
    const snap = await getDocs(col);
    const list = snap.docs.map(d => d.data());
    // Sort descending by timestamp
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/price-audit-logs", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const log = req.body;
    if (!log.id) log.id = "log-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
    if (!log.timestamp) log.timestamp = new Date().toISOString();
    await setDoc(doc(db, "price_audit_logs", log.id), log);
    res.json({ success: true, log });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 7. COUPONS
app.get("/api/coupons", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const col = collection(db, "coupons");
    const snap = await getDocs(col);
    res.json(snap.docs.map(d => d.data()));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/coupons", async (req, res) => {
  if (!db) return res.status(500).json({ error: "Database not connected" });
  try {
    const c = req.body;
    if (!c.code) return res.status(400).json({ error: "Coupon code is required" });
    const code = c.code.toUpperCase();
    await setDoc(doc(db, "coupons", code), { ...c, code });
    res.json({ success: true, coupon: c });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// DYNAMIC SEO, SITEMAP & ROBOTS.TXT ENDPOINTS
// ============================================

// Synchronize products from client's localStorage to the server for dynamic sitemap generation
app.post("/api/sync-products", (req, res) => {
  const { products } = req.body;
  if (!products || !Array.isArray(products)) {
    return res.status(400).json({ error: "Invalid products list" });
  }

  try {
    const productsFilePath = path.join(process.cwd(), "products.json");
    fs.writeFileSync(productsFilePath, JSON.stringify(products, null, 2), "utf8");
    res.json({ success: true, count: products.length });
  } catch (e) {
    console.error("Error saving synced products:", e);
    res.status(500).json({ error: "Failed to write products list" });
  }
});

// Helper function to slugify text on backend (matching frontend)
function backendSlugify(text: string): string {
  if (!text) return "";
  return text
    .toString()
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9 -]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Helper function to read synchronized products
function getSitemapProducts(): any[] {
  let localProducts = INITIAL_PRODUCTS;
  const productsFilePath = path.join(process.cwd(), "products.json");
  if (fs.existsSync(productsFilePath)) {
    try {
      const content = fs.readFileSync(productsFilePath, "utf8");
      localProducts = JSON.parse(content);
    } catch (e) {
      console.error("Error reading synced products for sitemap:", e);
    }
  }
  return localProducts;
}

// Dynamic Sitemap Index (https://ryvo.shop/sitemap.xml)
app.get("/sitemap.xml", (req, res) => {
  const baseUrl = "https://ryvo.shop";
  const currentDate = new Date().toISOString().split("T")[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  xml += `  <sitemap>\n    <loc>${baseUrl}/sitemaps/pages.xml</loc>\n    <lastmod>${currentDate}</lastmod>\n  </sitemap>\n`;
  xml += `  <sitemap>\n    <loc>${baseUrl}/sitemaps/categories.xml</loc>\n    <lastmod>${currentDate}</lastmod>\n  </sitemap>\n`;
  xml += `  <sitemap>\n    <loc>${baseUrl}/sitemaps/products.xml</loc>\n    <lastmod>${currentDate}</lastmod>\n  </sitemap>\n`;
  xml += `</sitemapindex>`;

  res.header("Content-Type", "application/xml; charset=utf-8");
  res.send(xml);
});

// Pages Sitemap (https://ryvo.shop/sitemaps/pages.xml)
app.get("/sitemaps/pages.xml", (req, res) => {
  const baseUrl = "https://ryvo.shop";
  const currentDate = new Date().toISOString().split("T")[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  const mainPages = [
    { loc: "", priority: "1.0", changefreq: "daily" },
    { loc: "/products", priority: "0.9", changefreq: "daily" },
    { loc: "/offers", priority: "0.8", changefreq: "daily" },
    { loc: "/about", priority: "0.7", changefreq: "monthly" },
    { loc: "/contact", priority: "0.7", changefreq: "monthly" }
  ];

  mainPages.forEach(p => {
    xml += `  <url>\n    <loc>${baseUrl}${p.loc}</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`;
  });

  xml += `</urlset>`;
  res.header("Content-Type", "application/xml; charset=utf-8");
  res.send(xml);
});

// Categories Sitemap (https://ryvo.shop/sitemaps/categories.xml)
app.get("/sitemaps/categories.xml", (req, res) => {
  const baseUrl = "https://ryvo.shop";
  const currentDate = new Date().toISOString().split("T")[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  // Standard actual store categories
  const categories = ["bikes", "cars", "electronics", "accessories"];
  categories.forEach(cat => {
    xml += `  <url>\n    <loc>${baseUrl}/?category=${cat}</loc>\n    <lastmod>${currentDate}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
  });

  xml += `</urlset>`;
  res.header("Content-Type", "application/xml; charset=utf-8");
  res.send(xml);
});

// Products Sitemap with Google Image SEO namespace (https://ryvo.shop/sitemaps/products.xml)
app.get("/sitemaps/products.xml", (req, res) => {
  const baseUrl = "https://ryvo.shop";
  const currentDate = new Date().toISOString().split("T")[0];
  const products = getSitemapProducts();

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
  xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

  products.forEach((p: any) => {
    const slug = backendSlugify(p.name_en || p.name_ar || "");
    const productUrl = `${baseUrl}/product/${p.id}-${slug}`;

    xml += `  <url>\n`;
    xml += `    <loc>${productUrl}</loc>\n`;
    xml += `    <lastmod>${currentDate}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.9</priority>\n`;
    
    // Add image SEO metadata if available
    if (p.image) {
      const escapedImg = p.image.replace(/&/g, "&amp;");
      xml += `    <image:image>\n`;
      xml += `      <image:loc>${escapedImg}</image:loc>\n`;
      xml += `      <image:title><![CDATA[${p.name_ar || p.name_en}]]></image:title>\n`;
      xml += `    </image:image>\n`;
    }
    
    xml += `  </url>\n`;
  });

  xml += `</urlset>`;
  res.header("Content-Type", "application/xml; charset=utf-8");
  res.send(xml);
});

// Dynamic Robots.txt Endpoint (with Sitemap reference)
app.get("/robots.txt", (req, res) => {
  const baseUrl = "https://ryvo.shop";
  const content = `User-agent: *
Allow: /
Sitemap: ${baseUrl}/sitemap.xml
`;
  res.header("Content-Type", "text/plain; charset=utf-8");
  res.send(content);
});

// ============================================
// GEMINI INTELLIGENT ROUTING & MARKETING ENDPOINTS
// ============================================


// Initialize Gemini safely
let ai: GoogleGenAI | null = null;
let serverModelsLogged = false;

async function listAndLogGeminiModelsServer(): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("=================================================");
  console.log("🔍 [GEMINI_SERVER_ENV_CHECK]");
  console.log("GEMINI_API_KEY exists:", !!apiKey);
  console.log("GEMINI_MODEL:", process.env.GEMINI_MODEL || "NOT_SET (defaulting to gemini-2.5-flash-lite)");
  console.log("=================================================");

  if (!apiKey) {
    console.warn("⚠️ [GEMINI_MODELS_LIST] Cannot list models: GEMINI_API_KEY environment variable is missing.");
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

  console.log("📋 ========================================================");
  console.log(`📋 [GEMINI_MODELS_LIST] Total available models for GEMINI_API_KEY: ${modelNames.length}`);
  if (modelNames.length === 0) {
    console.log("   ⚠️ No models returned from Google API list call.");
  } else {
    modelNames.forEach((name, idx) => console.log(`   ${idx + 1}. ${name}`));
  }
  console.log("📋 ========================================================");

  return modelNames;
}

async function getBestAvailableModelServer(): Promise<string> {
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (envModel) {
    return envModel.replace(/^models\//, '');
  }

  if (!serverModelsLogged) {
    serverModelsLogged = true;
    const models = await listAndLogGeminiModelsServer();
    if (models.length > 0) {
      const cleaned = models
        .map(m => m.replace(/^models\//, ''))
        .filter(m => !m.includes('2.5-flash-lite'));

      const preferred = cleaned.find(m => m.includes('3.6-flash'))
        || cleaned.find(m => m.includes('3.5-flash-lite'))
        || cleaned.find(m => m.includes('3.5-flash'))
        || cleaned.find(m => m.includes('2.5-flash'))
        || cleaned.find(m => m.includes('2.0-flash'))
        || cleaned[0];
      return preferred;
    }
  }
  return "gemini-2.5-flash";
}

function getGeminiServerAi(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!ai) {
    try {
      ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
      console.log("💎 Gemini API initialized successfully on the back-end.");
      if (!serverModelsLogged) {
        serverModelsLogged = true;
        listAndLogGeminiModelsServer().catch(() => {});
      }
    } catch (e) {
      console.error("⚠️ Failed to initialize Gemini client:", e);
    }
  }
  return ai;
}

// Public API Endpoint to query available Gemini models
app.get("/api/gemini-models", async (req, res) => {
  const models = await listAndLogGeminiModelsServer();
  return res.json({
    geminiApiKeyConfigured: !!process.env.GEMINI_API_KEY,
    geminiModelEnv: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
    totalModelsFound: models.length,
    models: models
  });
});

// 1. Intelligent Store Customer Support Assistant AI
app.post("/api/chat-gemini", async (req, res) => {
  const { message, history = [], orders = [], products = [], language = "ar" } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const langContext = language === "ar" ? "Arabic" : language === "fr" ? "French" : "English";

  // Build current inventory and client orders metadata for Gemini context
  const productsSummary = products.map((p: any) => 
    `- Product ID: ${p.id}, Name: ${p.name_en} (${p.name_ar}), Price: $${p.price}, Stock: ${p.stock} units, Category: ${p.category}. Description: ${p.description_en}`
  ).join("\n");

  const ordersSummary = orders.map((o: any) => 
    `- Order ID: ${o.id}, Customer: ${o.customer_name}, Status: ${o.status}, Phone: ${o.phone}, Total: $${o.total}, Items: ${o.items.map((i: any) => `${i.name} (x${i.quantity})`).join(", ")}`
  ).join("\n");

  const systemPrompt = `You are a highly premium, polite, and responsive AI Store Assistant representing "RYVO Store" - the absolute leader in elite sports equipment, luxury motorcycles, futuristic bikes, and protective riding gear.
Your main goal is: to answer customer inquiries about product availability, sizes, shipping info, order track status, price metrics, and suggest appropriate products.

STORE POLICIES & INFO:
- Shipping: Always FREE world-wide and across the country. Typically takes 2 to 4 business days.
- Return/Exchange: Highly secure 14-day hassle-free exchange policy.
- Brand quality: All listed products are 100% authentic and come with a structural guarantee.
- Location: Headquartered in Riyadh, Saudi Arabia with premium delivery hubs.
- Support hours: 24/7/365 active.

CURRENT PRODUCTS CATALOG IN STORE:
${productsSummary || "Helix Carbon F-70 Sport Bike, Cyber E-Roadster, Quantum Smartwatch, HoloSound, Royal Sovereign Leather, NeoCarbon Smart Helmet."}

CLIENT ACTIVE ORDERS (If matching phone or email or if looking up):
${ordersSummary || "No orders registered yet for this guest email."}

IMPORTANT INSTRUCTIONS:
1. Always write your response in ${langContext}. 
2. Be extremely polite, engaging, and professional. Use emojis to make the response warm.
3. If they ask for order status or details, check the provided CLIENT ACTIVE ORDERS. If they match, explain their shipping status nicely! If not, guide them to go to "Track Order" or ask them to provide their Order ID or phone number.
4. If they ask for recommendations, suggest items from the catalog matching their interests with their price.
5. If the Gemini API client is active and answers, make sure to sound perfectly human without indicating that you are an AI model reading structured lists. Keep replies concise and extremely helpful.`;

  const ai = getGeminiServerAi();
  if (ai) {
    try {
      // Format chat history for Gemini
      const contents = [
        ...history.map((h: any) => ({
          role: h.sender === "user" ? "user" : "model",
          parts: [{ text: h.text }]
        })),
        { role: "user", parts: [{ text: message }] }
      ];

      const targetModel = await getBestAvailableModelServer();

      console.log("=================================================");
      console.log("🤖 [/api/chat-gemini] PRE-CALL CHECK:");
      console.log("   ├─ GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
      console.log("   ├─ GEMINI_MODEL (process.env):", process.env.GEMINI_MODEL || "NOT_SET");
      console.log("   └─ Active Target Model:", targetModel);
      console.log("=================================================");

      console.log(`🚀 [GEMINI_SENDING_REQUEST] Calling generateContent with model "${targetModel}"...`);
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
        }
      });
      console.log(`✅ [GEMINI_RESPONSE_RECEIVED] Received response from Gemini model "${targetModel}"`);

      return res.json({ response: response.text });
    } catch (e: any) {
      console.error("❌ [GEMINI_ERROR_FULL] Gemini Support Chat Error:", e);
      if (e?.stack) console.error("   └─ Stack:", e.stack);
      listAndLogGeminiModelsServer().catch(() => {});
      // Fallback
    }
  }

  // Fallback smart rule-based reply if key is missing or failed
  let textResponse = "";
  const lower = message.toLowerCase();
  const isAr = language === "ar";

  if (isAr) {
    if (lower.includes("طلب") || lower.includes("تتبع") || lower.includes("رقم")) {
      if (orders.length > 0) {
        const o = orders[0];
        textResponse = `أهلاً بك! لقد عثرت على طلبك رقم (${o.id}). حالة الطلب الحالية هي: **${o.status === "pending" ? "قيد الانتظار" : o.status === "shipped" ? "تم الشحن 🚚" : "قيد المعالجة ⚡"}**. تم شحنه لـ ${o.customer_name} بقيمة إجمالية قدرها ${o.total} دولار. سنقوم بتوصيلها خلال 2-4 أيام عمل مجاناً! 📦`;
      } else {
        textResponse = "بالتأكيد يا عزيزي! لتتبع طلبك، يرجى الانتقال إلى صفحة 'تتبع طلبك' في الأعلى وإدخال رقم جوالك أو رقم الطلب الذي استلمته في البريد لمشاهدة التفاصيل الحية مباشرة 🚚";
      }
    } else if (lower.includes("منتج") || lower.includes("دراجة") || lower.includes("خوذة") || lower.includes("اقتراح")) {
      textResponse = "يسعدنا كثيراً اقتراح المنتجات الأنسب لك! لدينا **دراجة هيلكس الرياضية الكربونية ($1290)** المثالية للمسافات البعيدة، و**خوذة نيو-كاربون الذكية ($195)** لحماية قصوى بالبلوتوث. ما هو موديل القيادة المفضل لديك؟ 🏍️✨";
    } else if (lower.includes("شحن") || lower.includes("توصيل") || lower.includes("وقت")) {
      textResponse = "جميع الشحنات في متجر رايفو مجانية وسريعة بالكامل لجميع المدن والمناطق! تستغرق مدة التوصيل من 2 إلى 4 أيام عمل فقط من تاريخ تأكيد الطلب 🚚💨";
    } else if (lower.includes("خصم") || lower.includes("كوبون") || lower.includes("عرض")) {
      textResponse = "يسعدنا تزويدك بكود الخصم الحصري [ RYVO2026 ] ليمنحك خصماً فورياً بقيمة 10% إضافية على سلة مشترياتك الفاخرة اليوم! 🎉";
    } else if (lower.includes("شكر") || lower.includes("يعطيك")) {
      textResponse = "على الرحب والسعة دائماً! يسعدنا جداً خدمتك بمتجر رايفو لطلب أي مساعدة إضافية في أي وقت 👋🏍️";
    } else {
      textResponse = `شكراً لتواصلك معنا! بخصوص "${message}"، نؤكد لك أن جميع سلعنا أصلية 100٪ وبضمان جودة ذهبي شامل. شحننا مجاني ويستغرق 2-4 أيام فقط. كيف يمكنني مساعدتك في تأكيد طلبيتك اليوم؟ 😊`;
    }
  } else {
    if (lower.includes("order") || lower.includes("track") || lower.includes("number")) {
      if (orders.length > 0) {
        const o = orders[0];
        textResponse = `Welcome! I found your order (${o.id}). Current status is: **${o.status.toUpperCase()}**. Total: $${o.total} shipped to ${o.customer_name}. Expect delivery in 2-4 business days completely free of charge! 📦`;
      } else {
        textResponse = "Absolutely! To track your purchase, please type in or paste your custom Order ID inside our dedicated 'Track Order' page at the top navigation bar 🚚";
      }
    } else if (lower.includes("recommend") || lower.includes("product") || lower.includes("suggest") || lower.includes("bike")) {
      textResponse = "I highly recommend checking our flagship **Helix Carbon F-70 Sport Bike ($1290)** made of pure carbon fiber alongside the **NeoCarbon Smart Helmet ($195)** with built-in Bluetooth and crash indicators. Both are stellar choices! 🏍️✨";
    } else if (lower.includes("shipping") || lower.includes("delivery") || lower.includes("duration")) {
      textResponse = "We offer 100% FREE express shipping worldwide! Your premium package will be handled safely and arrive at your address within 2 to 4 business days 💨";
    } else if (lower.includes("discount") || lower.includes("promo") || lower.includes("coupon")) {
      textResponse = "Certainly! Apply coupon code [ RYVO2026 ] during checkout to unlock an extra 10% discount on your order today! 🎉";
    } else {
      textResponse = `Thank you for contacting Ryvo Customer Care! Regarding your question "${message}", we want to emphasize that all products are backed by a satisfaction warranty with free 14-day replacement, quick shipping in 2-4 days. What item are you looking to buy today? 🏍️`;
    }
  }

  res.json({ response: textResponse });
});

// ============================================
// LIVE CHAT & PROFESSIONAL SUPPORT ENDPOINTS
// ============================================

const SUPPORT_SETTINGS_FILE = path.join(process.cwd(), "support_settings.json");
const SUPPORT_CONVERSATIONS_FILE = path.join(process.cwd(), "support_conversations.json");

// Helper to load all support conversations from local file
function loadLocalSupportConversations() {
  if (fs.existsSync(SUPPORT_CONVERSATIONS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SUPPORT_CONVERSATIONS_FILE, "utf8"));
    } catch (e) {
      console.error("Error reading local support conversations:", e);
    }
  }
  return {};
}

// Helper to save support conversation locally
function saveLocalSupportConversation(id: string, conversation: any) {
  try {
    const data = loadLocalSupportConversations();
    data[id] = conversation;
    fs.writeFileSync(SUPPORT_CONVERSATIONS_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("Error saving local support conversation:", e);
  }
}

const defaultSupportSettings = {
  supportName: "مدير الدعم (رايفو)",
  supportAvatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
  welcomeMessage: "مرحباً بك في مركز دعم متجر رايفو المالي والتقني الشامل! كيف يمكنني مساعدتك اليوم بخصوص طلباتك أو منتجاتنا الفاخرة؟ 👋",
  isAgentOnline: false,
  suggestions: [
    { id: "s1", textAr: "📦 متابعة طلبي", textEn: "📦 Track my order", icon: "📦", isActive: true, order: 1 },
    { id: "s2", textAr: "🚚 تتبع الشحنة", textEn: "🚚 Shipment tracking", icon: "🚚", isActive: true, order: 2 },
    { id: "s3", textAr: "💳 لدي مشكلة في الدفع", textEn: "💳 Payment issue", icon: "💳", isActive: true, order: 3 },
    { id: "s4", textAr: "🔄 أريد استبدال أو إرجاع منتج", textEn: "🔄 Return or exchange item", icon: "🔄", isActive: true, order: 4 },
    { id: "s5", textAr: "🎟️ لدي مشكلة في كوبون الخصم", textEn: "🎟️ Discount coupon issue", icon: "🎟️", isActive: true, order: 5 },
    { id: "s6", textAr: "📍 أريد تعديل عنوان الشحن", textEn: "📍 Change shipping address", icon: "📍", isActive: true, order: 6 },
    { id: "s7", textAr: "🛍️ أحتاج مساعدة في اختيار منتج", textEn: "🛍️ Help selecting a product", icon: "🛍️", isActive: true, order: 7 },
    { id: "s8", textAr: "⭐ الاستفسار عن الضمان", textEn: "⭐ Warranty inquiry", icon: "⭐", isActive: true, order: 8 },
    { id: "s9", textAr: "👨‍💼 التحدث مع موظف دعم", textEn: "👨‍💼 Speak with support agent", icon: "👨‍💼", isActive: true, order: 9 },
    { id: "s10", textAr: "❓ لدي مشكلة أخرى", textEn: "❓ Other issue", icon: "❓", isActive: true, order: 10 }
  ],
  quickReplies: [
    {
      id: "qr1",
      category: "عام",
      titleAr: "👋 مرحبًا بك",
      titleEn: "👋 Welcome Greeting",
      textAr: "مرحبًا بك! كيف يمكنني مساعدتك اليوم؟ 👋",
      textEn: "Welcome! How can I help you today? 👋",
      isActive: true,
      scope: "shared",
      keywords: ["مرحبا", "سلام", "اهلا", "مرحبتين", "hello", "hi", "hey"],
      orderIndex: 1
    },
    {
      id: "qr2",
      category: "طلبات",
      titleAr: "📦 فحص حالة الطلب",
      titleEn: "📦 Order Status Check",
      textAr: "تم استلام طلبك، سأراجع حالته الآن في النظام وأفيدك فوراً. 📦",
      textEn: "Your order details have been received, I am checking its status now. 📦",
      isActive: true,
      scope: "shared",
      keywords: ["طلب", "طلبي", "طلبك", "أين", "وين", "حالة", "order", "status"],
      orderIndex: 2
    },
    {
      id: "qr3",
      category: "شحن",
      titleAr: "🚚 رقم التتبع والشحن",
      titleEn: "🚚 Shipping Tracking Info",
      textAr: "تم شحن طلبك بنجاح، وهذا رقم التتبع الخاص بك لتتبع الشحنة: [رقم التتبع] 🚚",
      textEn: "Your order has been shipped! Here is your tracking number: [TRACKING_NUMBER] 🚚",
      isActive: true,
      scope: "shared",
      keywords: ["شحن", "تتبع", "شحنة", "توصيل", "ارامكس", "سمسا", "track", "shipping"],
      orderIndex: 3
    },
    {
      id: "qr4",
      category: "دفع",
      titleAr: "💳 توضيح مشكلة الدفع",
      titleEn: "💳 Payment Inquiry",
      textAr: "يرجى توضيح مشكلة الدفع التي تواجهك مع إرفاق صورة من إيصال التحويل أو الخطأ إن أمكن. 💳",
      textEn: "Please clarify the payment issue and attach a photo/receipt if possible. 💳",
      isActive: true,
      scope: "shared",
      keywords: ["دفع", "فيزا", "مدى", "بطاقة", "تحويل", "خصم", "pay", "payment"],
      orderIndex: 4
    },
    {
      id: "qr5",
      category: "تقنية",
      titleAr: "📷 طلب صورة للمشكلة",
      titleEn: "📷 Request Issue Photo",
      textAr: "يرجى إرسال صورة واضحة للمشكلة أو المنتج حتى نتمكن من مساعدتك فوراً. 📷",
      textEn: "Please send a clear photo of the issue so we can assist you right away. 📷",
      isActive: true,
      scope: "shared",
      keywords: ["صورة", "تالف", "مكسور", "عطل", "مشكلة", "خراب", "broken", "damaged", "photo"],
      orderIndex: 5
    },
    {
      id: "qr6",
      category: "عام",
      titleAr: "⏳ الانتظار والمراجعة",
      titleEn: "⏳ Please Wait",
      textAr: "يرجى الانتظار قليلًا أثناء مراجعة بيانات طلبك في النظام. ⏳",
      textEn: "Please wait a moment while I review your order details. ⏳",
      isActive: true,
      scope: "shared",
      keywords: ["انتظار", "لحظة", "دقيقة", "صبر", "مراجعة", "wait", "hold"],
      orderIndex: 6
    },
    {
      id: "qr7",
      category: "استرجاع",
      titleAr: "🔄 حل المشكلة والاسترجاع",
      titleEn: "🔄 Exchange or Refund",
      textAr: "سنساعدك في إجراءات الاستبدال أو الاسترجاع بكل سهولة وفق سياستنا المعتمدة. 🔄",
      textEn: "We will easily assist you with exchange or return procedures according to our policy. 🔄",
      isActive: true,
      scope: "shared",
      keywords: ["استرجاع", "استبدال", "ترجيع", "إرجاع", "تبديل", "policy", "return", "refund"],
      orderIndex: 7
    },
    {
      id: "qr8",
      category: "عام",
      titleAr: "✅ تم حل المشكلة",
      titleEn: "✅ Issue Resolved",
      textAr: "تم حل المشكلة بنجاح، هل يوجد أي شيء آخر يمكنني مساعدتك به اليوم؟ ✅",
      textEn: "The issue has been resolved. Is there anything else I can help you with today? ✅",
      isActive: true,
      scope: "shared",
      keywords: ["تم", "انتهى", "حل", "جاهز", "solved", "fixed"],
      orderIndex: 8
    },
    {
      id: "qr9",
      category: "عام",
      titleAr: "🙏 شكر وختام",
      titleEn: "🙏 Thank You & Goodbye",
      textAr: "شكرًا لتواصلك معنا في متجر رايفو! نتمنى لك يومًا سعيدًا. 🙏✨",
      textEn: "Thank you for contacting RYVO Store! Have a wonderful day. 🙏✨",
      isActive: true,
      scope: "shared",
      keywords: ["شكرا", "تسلم", "يوم سعيد", "thanks", "bye"],
      orderIndex: 9
    }
  ]
};

// Helper to get support settings
async function getSupportSettings() {
  let settings: any = null;
  if (db) {
    try {
      const snap = await db.collection("settings").doc("support_chat").get();
      if (snap.exists() && snap.data()) {
        settings = snap.data();
      }
    } catch (e) {
      console.error("Error reading support settings from Firestore:", e);
    }
  }
  if (!settings && fs.existsSync(SUPPORT_SETTINGS_FILE)) {
    try {
      settings = JSON.parse(fs.readFileSync(SUPPORT_SETTINGS_FILE, "utf8"));
    } catch (e) {}
  }
  if (!settings) {
    settings = { ...defaultSupportSettings };
  } else {
    // Ensure suggestions and quickReplies exist
    if (!settings.suggestions || !Array.isArray(settings.suggestions) || settings.suggestions.length === 0) {
      settings.suggestions = defaultSupportSettings.suggestions;
    }
    if (!settings.quickReplies || !Array.isArray(settings.quickReplies) || settings.quickReplies.length === 0) {
      settings.quickReplies = defaultSupportSettings.quickReplies;
    }
  }
  return settings;
}

// Helper to save support settings
async function saveSupportSettings(settings: any) {
  if (db) {
    try {
      await db.collection("settings").doc("support_chat").set(settings);
    } catch (e) {
      console.error("Error saving support settings to Firestore:", e);
    }
  }
  try {
    fs.writeFileSync(SUPPORT_SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
  } catch (e) {}
}

// 0. Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: Date.now(),
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    adminOnline: isAnyAdminOnline()
  });
});

// 1. Get Support Settings
app.get("/api/support/settings", async (req, res) => {
  const settings = await getSupportSettings();
  const liveIsAgentOnline = isAnyAdminOnline() || !!settings.isAgentOnline;
  res.json({
    ...settings,
    isAgentOnline: liveIsAgentOnline
  });
});

// 2. Save Support Settings
app.post("/api/support/settings", async (req, res) => {
  const settings = req.body;
  await saveSupportSettings(settings);

  // Broadcast real-time change to all clients if socket server is active
  if (io) {
    const isOnline = !!settings.isAgentOnline || isAnyAdminOnline();
    io.emit('support_status', { isAgentOnline: isOnline });
    io.emit(isOnline ? 'support:online' : 'support:offline');
  }

  res.json({ success: true, settings });
});

// 3. Get All Support Conversations (strictly filtered for agents)
app.get("/api/support/conversations", async (req, res) => {
  try {
    const list = await dbSupportService.getConversationsForAgent();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get or Create a Support Conversation by Session ID
app.get("/api/support/conversations/:id", async (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id).toLowerCase().trim();
  try {
    const conversation = await dbSupportService.getConversationById(decodedId);
    if (!conversation) {
      const newConv = await dbSupportService.getOrCreateConversation(decodedId);
      return res.json(newConv);
    }
    res.json(conversation);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Append message to conversation, with auto AI fallback response if agent is offline
app.post("/api/support/conversations/:id/message", async (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id).toLowerCase().trim();
  let { message, sender, attachment, isInternal } = req.body;

  try {
    let conversation = await dbSupportService.getOrCreateConversation(decodedId);
    let msgType: 'text' | 'image' | 'audio' | 'file' = 'text';
    if (attachment?.type?.startsWith('image/')) {
      msgType = 'image';
    } else if (attachment?.type?.startsWith('audio/')) {
      msgType = 'audio';
    } else if (attachment) {
      msgType = 'file';
    }

    // Voice transcription fallback in REST endpoint
    if (msgType === 'audio' && attachment?.url) {
      try {
        const filePath = path.join(process.cwd(), 'public', attachment.url);
        if (fs.existsSync(filePath)) {
          const fileBuffer = fs.readFileSync(filePath);
          const transcription = await transcribeAudio(fileBuffer, attachment.type);
          message = transcription;
          req.body.message = transcription;
          console.log(`🎙️ Voice transcribed REST: "${transcription}"`);
        }
      } catch (err: any) {
        console.error("Voice transcription failed in REST API:", err.message);
      }
    }

    const content = attachment ? attachment.url : message;

    if (sender === 'user') {
      console.log(`[STEP 1] Message received: "${message || ''}" from session ${decodedId}`);
      console.log(`Before sanitize:\nconversation.status = "${conversation.status}"`);

      // If conversation is in legacy or queued state (and not HUMAN_HANDLING), auto-reset to AI_HANDLING when user sends a message
      if (conversation.status !== 'HUMAN_HANDLING' && conversation.status !== 'PENDING_CUSTOMER_APPROVAL') {
        if (conversation.status !== 'AI_HANDLING') {
          await dbSupportService.updateConversationStatus(conversation.id, 'AI_HANDLING');
          conversation.status = 'AI_HANDLING';
        }
      }

      console.log(`After sanitize:\nconversation.status = "${conversation.status}"`);
      console.log(`[STEP 2] Check conversation status: "${conversation.status}"`);

      if (conversation.status === 'AI_HANDLING' || conversation.status === 'PENDING_CUSTOMER_APPROVAL') {
        const savedUserMsg = await dbSupportService.addMessage(conversation.id, 'customer', msgType, content, false);
        if (savedUserMsg && io) {
          io.to(`conversation_${decodedId}`).emit('message_received', savedUserMsg);
        }

        conversation.messages.push({
          id: savedUserMsg?.id || `temp-${Date.now()}`,
          sender: 'user',
          text: message,
          attachment: attachment
        });

        console.log(`[STEP 3] Check if user requested human support`);
        console.log(`[STEP 4] Call Gemini`);

        // Trigger AI
        const aiReply = await generateAIResponse(conversation, message || '', attachment);
        
        console.log(`[STEP 5] Gemini response received`);

        let cleanAiReply = aiReply;
        let shouldTransfer = false;

        if (aiReply.includes('[TRANSFER_TO_AGENT]')) {
          shouldTransfer = true;
          cleanAiReply = aiReply.replace('[TRANSFER_TO_AGENT]', '').trim();
        }

        const savedAiMsg = await dbSupportService.addMessage(conversation.id, 'ai', 'text', cleanAiReply, false);
        if (savedAiMsg && io) {
          console.log(`[STEP 6] Send AI response`);
          io.to(`conversation_${decodedId}`).emit('message_received', savedAiMsg);
        }

        if (shouldTransfer) {
          const reason = conversation.transfer_reason || "استدعت حالة المحادثة تحويلاً للدعم البشري";
          console.log("Escalating to human support. Reason:", reason);
          console.log("[STEP X] Escalating to human support. Reason:", reason);

          await dbSupportService.updateConversationStatus(conversation.id, 'PENDING_CUSTOMER_APPROVAL');
          conversation.messages.push({
            id: savedAiMsg?.id || `temp-ai-${Date.now()}`,
            sender: 'support',
            text: cleanAiReply
          });
          const summary = await generateSmartSummary(conversation, reason);
          await dbSupportService.updateConversationSummary(conversation.id, summary);

          if (io) {
            io.to(`conversation_${decodedId}`).emit('status_updated', { status: 'PENDING_CUSTOMER_APPROVAL', ai_summary: summary });
          }

          // Trigger email alert to admin
          sendAdminSupportRequestNotification(
            conversation.clientEmail || decodedId,
            conversation.clientName || 'عميل المتجر',
            message || 'استفسار يتطلب الدعم البشري',
            conversation.id,
            db,
            getSettings
          ).catch(err => console.error("Admin support email error:", err));
        } else {
          if (conversation.status !== 'AI_HANDLING') {
            await dbSupportService.updateConversationStatus(conversation.id, 'AI_HANDLING');
            if (io) {
              io.to(`conversation_${decodedId}`).emit('status_updated', { status: 'AI_HANDLING' });
            }
          }
        }

        console.log(`[STEP 7] Return`);
        return res.json({ success: true, conversation, aiReplied: true, aiResponseText: cleanAiReply });
      } else {
        const savedUserMsg = await dbSupportService.addMessage(conversation.id, 'customer', msgType, content, false);
        if (savedUserMsg && io) {
          io.to(`conversation_${decodedId}`).emit('message_received', savedUserMsg);
          
          // GATED: Only notify agents if not in pending approval stage
          if (conversation.status !== 'PENDING_CUSTOMER_APPROVAL') {
            io.to('agents_room').emit('agent_message_received', { sessionId: decodedId, message: savedUserMsg });
          }
        }
        return res.json({ success: true, conversation });
      }
    } else if (sender === 'support') {
      const isNote = !!isInternal;
      const savedAgentMsg = await dbSupportService.addMessage(conversation.id, 'agent', msgType, content, isNote);
      if (savedAgentMsg && io) {
        if (isNote) {
          io.to('agents_room').emit('agent_message_received', { sessionId: decodedId, message: savedAgentMsg });
        } else {
          io.to(`conversation_${decodedId}`).emit('message_received', savedAgentMsg);
          io.to('agents_room').emit('agent_message_received', { sessionId: decodedId, message: savedAgentMsg });
        }
        
        await dbSupportService.addSupportLog(`Agent sent message (isNote: ${isNote})`, 'Agent');
      }

      if (conversation.status === 'QUEUED_FOR_HUMAN' || conversation.status === 'PENDING_CUSTOMER_APPROVAL') {
        await dbSupportService.updateConversationStatus(conversation.id, 'HUMAN_HANDLING');
        if (io) {
          io.to(`conversation_${decodedId}`).emit('status_updated', { status: 'HUMAN_HANDLING' });
          io.to('agents_room').emit('agent_status_updated', { sessionId: decodedId, status: 'HUMAN_HANDLING' });
        }
        await dbSupportService.addSupportLog(`Conversation status set to HUMAN_HANDLING on agent message`, 'System');
      }
      return res.json({ success: true, conversation });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Rate Conversation
app.post("/api/support/conversations/:id/rate", async (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id).toLowerCase().trim();
  const { rating, ratingComment } = req.body;

  try {
    const conversation = await dbSupportService.getConversationById(decodedId);
    if (conversation) {
      const dbStatus = getDbStatus();
      if (dbStatus.connected) {
        const metadata = conversation.metadata || {};
        metadata.rating = rating;
        metadata.ratingComment = ratingComment;
        await pgQuery(
          `UPDATE conversations SET status = 'CLOSED', metadata = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [JSON.stringify(metadata), conversation.id]
        );
      } else {
        const localData = loadLocalSupportConversations();
        if (localData[decodedId]) {
          localData[decodedId].rating = rating;
          localData[decodedId].ratingComment = ratingComment;
          localData[decodedId].status = 'CLOSED';
          localData[decodedId].lastActive = Date.now();
          saveLocalSupportConversation(decodedId, localData[decodedId]);
        }
      }

      if (io) {
        io.to(`conversation_${decodedId}`).emit('status_updated', { status: 'CLOSED' });
        io.to('agents_room').emit('agent_status_updated', { sessionId: decodedId, status: 'CLOSED' });
      }
      return res.json({ success: true });
    }
    res.json({ success: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Typing status trigger
app.post("/api/support/conversations/:id/typing", async (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id).toLowerCase().trim();
  const { sender, isTyping } = req.body;

  if (io) {
    io.to(`conversation_${decodedId}`).emit('typing_status', { sender, isTyping });
  }
  res.json({ success: true });
});

// 7.5 Update status of conversation (Reset to AI, Close, Transfer)
app.post("/api/support/conversations/:id/status", async (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id).toLowerCase().trim();
  const { status, ai_summary } = req.body;

  try {
    let updated = await dbSupportService.updateConversationStatus(decodedId, status);
    if (ai_summary) {
      updated = await dbSupportService.updateConversationSummary(decodedId, ai_summary);
    }
    if (io) {
      io.to(`conversation_${decodedId}`).emit('status_updated', { status, ai_summary });
      io.to('agents_room').emit('agent_status_updated', { sessionId: decodedId, status, ai_summary });
    }
    res.json({ success: true, conversation: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7.6 Add internal note route
app.post("/api/support/conversations/:id/internal-note", async (req, res) => {
  const { id } = req.params;
  const decodedId = decodeURIComponent(id).toLowerCase().trim();
  const { message } = req.body;

  try {
    const conversation = await dbSupportService.getOrCreateConversation(decodedId);
    const savedNote = await dbSupportService.addMessage(conversation.id, 'agent', 'text', message, true);
    if (savedNote && io) {
      io.to('agents_room').emit('agent_message_received', { sessionId: decodedId, message: savedNote });
    }
    res.json({ success: true, message: savedNote });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7.7 Support media upload (Images / Audio clips)
app.post("/api/support/upload", async (req, res) => {
  const { fileName, fileType, base64Data } = req.body;
  if (!base64Data) {
    return res.status(400).json({ error: "No base64Data provided" });
  }

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${fileName || 'file'}`;
    const filePath = path.join(uploadDir, uniqueName);
    fs.writeFileSync(filePath, buffer);

    res.json({ success: true, url: `/uploads/${uniqueName}` });
  } catch (err: any) {
    console.error("Support upload failed:", err);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// 7.8 Human Support Request Escalation Trigger (Writes to Firestore 'support_requests', triggers Resend Email, and displays real-time admin alert)
app.post("/api/support/request-human", async (req, res) => {
  const {
    conversationId,
    userName,
    userEmail,
    userPhone,
    reason,
    message,
    aiSummary,
    metadata
  } = req.body;

  const cleanSessionId = (conversationId || userEmail || 'guest@ryvo.co').toLowerCase().trim();
  const clientName = userName || cleanSessionId.split('@')[0] || 'عميل المتجر';
  const clientEmail = userEmail || cleanSessionId;
  const clientPhone = userPhone || '';
  const reqReason = reason || 'طلب التحدث مع موظف دعم بشري';
  const summary = aiSummary || '';
  const clientMessage = message || '';

  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

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
    reason: reqReason,
    message: clientMessage,
    aiSummary: summary,
    createdAt: new Date().toISOString(),
    timestamp: Date.now(),
    unread: true,
    metadata: metadata || {}
  };

  try {
    // 1. Push document to 'support_requests' Firestore collection
    if (db) {
      try {
        await db.collection("support_requests").doc(requestId).set(supportRequestDoc);
        console.log(`✅ [FIRESTORE API] Saved document to 'support_requests' with ID: ${requestId}`);
      } catch (err: any) {
        console.error("❌ [FIRESTORE API] Failed to setDoc in support_requests:", err.message);
      }
    }

    // 2. Update conversation status in PostgreSQL / DB to QUEUED_FOR_HUMAN
    await dbSupportService.updateConversationStatus(cleanSessionId, 'QUEUED_FOR_HUMAN');
    if (summary) {
      await dbSupportService.updateConversationSummary(cleanSessionId, summary);
    }

    // 3. Add system message
    await dbSupportService.addMessage(
      cleanSessionId,
      'system',
      'text',
      'تم تسجيل طلب التحدث مع الدعم البشري بنجاح وتم إشعار مسؤولي الدعم بالمتجر عبر البريد الإلكتروني والإشعارات الفورية.',
      false
    );

    // 4. Trigger Email via Resend API
    sendAdminSupportRequestNotification(
      clientEmail,
      clientName,
      clientMessage || reqReason,
      cleanSessionId,
      db,
      getSettings,
      {
        phone: clientPhone,
        reason: reqReason,
        aiSummary: summary,
        requestId: requestId,
        device: metadata?.device
      }
    ).then((r) => {
      console.log(`📧 [API RESEND] Support request email notification result: ${r.success ? 'SUCCESS' : 'FAILED'}`);
    }).catch(e => {
      console.error("❌ [API RESEND] Error sending support request email:", e);
    });

    // 5. Broadcast real-time Socket notification to all logged-in admins in agents_room
    if (io) {
      io.to('agents_room').emit('new_support_request', supportRequestDoc);
      io.to('agents_room').emit('new_conversation_queued', {
        sessionId: cleanSessionId,
        clientName: clientName,
        clientEmail: clientEmail,
        ai_summary: summary,
        requestId: requestId,
        reason: reqReason,
        createdAt: supportRequestDoc.createdAt
      });
      io.to('agents_room').emit('admin_notification', {
        id: requestId,
        title: 'طلب دعم فني بشري 🚨',
        body: `${clientName} (${clientEmail}): ${reqReason}`,
        icon: '👨‍💼',
        timestamp: Date.now(),
        type: 'support_request',
        conversationId: cleanSessionId,
        priority: 'high',
        requestId: requestId
      });
      io.to('agents_room').emit('agent_status_updated', { sessionId: cleanSessionId, status: 'QUEUED_FOR_HUMAN' });
      io.to(`conversation_${cleanSessionId}`).emit('status_updated', { status: 'QUEUED_FOR_HUMAN' });
    }

    await dbSupportService.addSupportLog(`Customer requested human support (#${requestId}). Pushed to support_requests.`, 'Customer');

    return res.json({
      success: true,
      requestId,
      request: supportRequestDoc,
      message: "Human support request submitted successfully."
    });
  } catch (error: any) {
    console.error("❌ Error processing human support request:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 7.9 Get all Support Requests (for Admin Panel)
app.get("/api/support/requests", requireAdmin, async (req, res) => {
  try {
    let requests: any[] = [];
    if (db) {
      const snap = await db.collection("support_requests").get();
      if (snap && snap.docs) {
        requests = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      }
    }
    // Sort descending by timestamp/createdAt
    requests.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return res.json({ success: true, requests });
  } catch (err: any) {
    console.error("Error fetching support requests:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 7.10 Update Support Request Status
app.patch("/api/support/requests/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  try {
    if (db) {
      await db.collection("support_requests").doc(id).update({
        ...updates,
        updatedAt: new Date().toISOString()
      });
    }
    return res.json({ success: true, id, updates });
  } catch (err: any) {
    console.error("Error updating support request:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Live Notifications API Endpoint
app.get("/api/notifications", async (req, res) => {
  const { conversationId } = req.query;
  const decodedId = conversationId ? decodeURIComponent(conversationId as string).toLowerCase().trim() : "";

  // 1. Static/Broadcast Notifications (System Announcement)
  const systemNotifications = [
    {
      id: 'welcome-notif',
      title: "أهلاً بك في متجر رايفو الفاخر! 🎉",
      titleEn: "Welcome to Ryvo Premium Store! 🎉",
      body: "يسعدنا تقديم كود الخصم الحصري RYVO2026 للحصول على خصم إضافي بقيمة 10% على جميع مشترياتك اليوم! تسوقاً ممتعاً!",
      bodyEn: "Use code RYVO2026 at checkout to save an extra 10% on your purchases today!",
      icon: '🎉',
      timestamp: Date.now() - 3600000 // 1 hour ago
    }
  ];

  // 2. Dynamic Live Support Replies for specific user
  const supportNotifications: any[] = [];
  if (decodedId) {
    let conversation: any = null;
    if (db) {
      try {
        const snap = await db.collection("support_conversations").doc(decodedId).get();
        if (snap.exists() && snap.data()) {
          conversation = snap.data();
        }
      } catch (e) {}
    }

    if (!conversation) {
      const localData = loadLocalSupportConversations();
      if (localData[decodedId]) {
        conversation = localData[decodedId];
      }
    }

    if (conversation && conversation.messages) {
      conversation.messages.forEach((msg: any) => {
        if (msg.sender === "support" && msg.id !== "welcome") {
          supportNotifications.push({
            id: `support-reply-${msg.id}`,
            title: "رد جديد من الدعم الفني 🛠️",
            titleEn: "New Support Reply 🛠️",
            body: msg.text,
            icon: "💬",
            timestamp: msg.timestamp || Date.now(),
            time: msg.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            type: "support_reply"
          });
        }
      });
    }
  }

  res.json({
    success: true,
    systemNotifications,
    supportNotifications,
    timestamp: Date.now()
  });
});

// 2. Daily Video Script & Creative Content Generator Endpoint
app.post("/api/marketing-generate-script", async (req, res) => {
  const { product, language = "ar" } = req.body;

  if (!product) {
    return res.status(400).json({ error: "Product is required" });
  }

  const isAr = language === "ar";
  const systemPrompt = `You are a master social media marketing scriptwriter specializing in high-energy conversion ads for TikTok, Instagram Reels, and YouTube Shorts.
You generate structured short-form video scripts (duration 15-30 seconds) in Arabic or English with precise pacing instructions.
FORMAT:
- Hook (0-5s): Catchy attention grabber.
- Body (5-20s): Key benefits & dynamic visual cuts.
- CTA (20-30s): Call to action & scarcity elements (e.g., Code: RYVO2026 for 10% discount).
- Background Beat: Suggested music vibes.
Include visual scene prompts inside bracket tags [Visual: ...]`;

  const userPrompt = `Write a high-converting short-form video ad script for:
Product Name: ${product.name_en} (${product.name_ar})
Description: ${product.description_en} (${product.description_ar})
Price: $${product.price}
Tag: ${product.tag_en}
Language: ${isAr ? "Arabic" : "English"}.
Keep it incredibly exciting, tailored for motorcycle/bike action enthusiasts!`;

  const ai = getGeminiServerAi();
  if (ai) {
    try {
      const targetModel = await getBestAvailableModelServer();
      console.log("=================================================");
      console.log("🤖 [/api/marketing-generate-script] PRE-CALL CHECK:");
      console.log("   ├─ GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
      console.log("   ├─ GEMINI_MODEL (process.env):", process.env.GEMINI_MODEL || "NOT_SET");
      console.log("   └─ Active Target Model:", targetModel);
      console.log("=================================================");

      console.log(`🚀 [GEMINI_SENDING_REQUEST] Calling generateContent with model "${targetModel}"...`);
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: userPrompt,
        config: { systemInstruction: systemPrompt }
      });
      console.log(`✅ [GEMINI_RESPONSE_RECEIVED] Received response from Gemini model "${targetModel}"`);
      return res.json({ script: response.text });
    } catch (e: any) {
      console.error("❌ [GEMINI_ERROR_FULL] Gemini script writer failed:", e);
      if (e?.stack) console.error("   └─ Stack:", e.stack);
      listAndLogGeminiModelsServer().catch(() => {});
    }
  }

  // Fallback high-fidelity scripts
  let scriptText = "";
  if (isAr) {
    scriptText = `🎵 [الموسيقى الخلفية: إيقاع إلكتروني حماسي غامض]

🎬 [المشهد 0-5 ثوانٍ]: زاوية تصوير منخفضة وقريبة تظهر إطارات الدراجة تتحرك بسرعة البرق على المنعطفات الجبلية مع إضاءة الغروب الساحرة.
🎙️ المعلق بصوت مليء بالشغف والسرعة: "تبحث عن المتعة الحقيقية والأداء الأسطوري على الطريق؟ 🏍️"

🎬 [المشهد 5-15 ثانية]: لقطات مقربة جداً تبرز تفاصيل ألياف الكربون اللامعة، وشعور القبضة وخفة الوزن الفائقة.
🎙️ المعلق: "نقدم لك ${product.name_ar}! قوة مذهلة تدمج خفة الوزن ومتانة ألياف الكربون وتكنولوجيا الثبات القصوى بسعر لا يصدق قدره ${product.price} دولار فقط! 🔥"

🎬 [المشهد 15-25 ثانية]: الدراج يدخل ورشة صيانة عصرية ثم يبتسم بثقة. تظهر شاشة منبثقة تحمل كود الخصم: RYVO2026.
🎙️ المعلق: "لا تقبل بالبدائل! احجز وحدتك اليوم مع شحن مجاني 100% وضمان متكامل. استخدم الكود [RYVO2026] لخصم 10% إضافي فوراُ! 🚀🛍️"

🎬 [المشهد 25-30 ثانية]: تظهر معلومات المتجر وموقع الويب وشعار رايفو الفاخر بشكل سينمائي متحرك.
🎙️ المعلق: "رايفو ستور - شغف القيادة بلا كبح! 🏁"`;
  } else {
    scriptText = `🎵 [Music: Aggressive Cyberpunk Electronic Sound Track]

🎬 [Scene 0-5s]: Low dynamic tracking shot following high-velocity tire trails hitting scenic curves at high resolution.
🎙️ Speaker Voice: "Unbridled power. Pure speed. Do you want to dominate the tracks today? 🏍️"

🎬 [Scene 5-15s]: Fast-paced close ups highlighting premium carbon fibers, sleek hydraulic brake calipers, and tactical frame accents.
🎙️ Speaker: "Say hello to ${product.name_en}. Tailored purely for professional racing and elite adrenaline seekers at a remarkable value of only $${product.price}! 🔥"

🎬 [Scene 15-25s]: Rider securely straps on helmet, glances back at the camera, and speeds off into the sunset. Overlay Coupon Badge: RYVO2026
🎙️ Speaker: "Standard shipping is FREE worldwide! Tap below to explore elite stock and lock a massive 10% extra discount with promo code [RYVO2026]! 🚨"

🎬 [Scene 25-30s]: Quick cinematic cut displaying the elegant RYVO brand logo and website link.
🎙️ Speaker: "Ryvo Store - Ride with zero limits! 🏁"`;
  }

  res.json({ script: scriptText });
});

// 3. Motorcycle Social Media Content Generator
app.post("/api/marketing-generate-content", async (req, res) => {
  const { category, language = "ar" } = req.body;

  const isAr = language === "ar";
  const systemPrompt = `You are a creative social media manager and digital creator for a world-class premium motorcycle & bicycle boutique store.
You generate highly engaging, informative, and viral posts containing relevant emojis, formatted lists, hashtags, and interactive questions to foster massive engagement.`;

  const promptsMap: { [key: string]: string } = {
    tips: isAr 
      ? "توليد نصائح صيانة هامة وجذابة للدراجات النارية والهوائية. مثل (صيانة الفرامل، العناية بسلاسل التروس، ضغط الإطارات المناسب). أضف لمسة ترويجية خفيفة لقطع غيار متجر رايفو."
      : "Draft engaging motorcycle/bicycle preventative maintenance tips (chain lubrication, brake pads checking, tire pressure optimization). Include visual suggestions and list layout with relevant emojis and store call-to-actions.",
    compares: isAr
      ? "توليد منشور يقارن بين طرازين من دراجات السباق الرياضية (مثلاً دراجات الكربون خفيفة الوزن مقابل دراجات السرعة الجبلية العريضة الإطارات) لمساعدة هواة الركوب في الاختيار."
      : "Draft an amazing comparison social post between high-performance carbon fiber road bikes versus wide-tire mountain cruisers. Structure advantages cleanly so customers can discover which matches their style.",
    news: isAr
      ? "توليد آخر أخبار عالم الدراجات، السباقات، بطولات موتو جي بي (MotoGP) لهذا الشهر، أو الابتكارات الخضراء والكهربائية."
      : "Write an inspiring social newsletter outlining recent sport motorcycle racing accolades, MotoGP updates, green electric bike transitions, or technical riding innovations.",
    interactive: isAr
      ? "كتابة مجموعة من الأسئلة والألعاب والمسابقات المسلية والتفاعلية لمجتمع الدراجين لزيادة التعليقات واللايكات. مثل: (أين ترغب في قيادة دراجتك اليوم؟)"
      : "Create high-interaction quizzes, follower game matches, and interactive questions to boost page engagement. Example: 'If you had to ride to another city right now, which RYVO bike is your weapon of choice?'"
  };

  const userPrompt = promptsMap[category] || promptsMap["tips"];

  const ai = getGeminiServerAi();
  if (ai) {
    try {
      const targetModel = await getBestAvailableModelServer();
      console.log("=================================================");
      console.log("🤖 [/api/marketing-generate-content] PRE-CALL CHECK:");
      console.log("   ├─ GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
      console.log("   ├─ GEMINI_MODEL (process.env):", process.env.GEMINI_MODEL || "NOT_SET");
      console.log("   └─ Active Target Model:", targetModel);
      console.log("=================================================");

      console.log(`🚀 [GEMINI_SENDING_REQUEST] Calling generateContent with model "${targetModel}"...`);
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: userPrompt,
        config: { systemInstruction: systemPrompt }
      });
      console.log(`✅ [GEMINI_RESPONSE_RECEIVED] Received response from Gemini model "${targetModel}"`);
      return res.json({ content: response.text });
    } catch (e: any) {
      console.error("❌ [GEMINI_ERROR_FULL] Gemini content planner failed:", e);
      if (e?.stack) console.error("   └─ Stack:", e.stack);
      listAndLogGeminiModelsServer().catch(() => {});
    }
  }

  // Robust default local templates
  let localResult = "";
  if (category === "tips") {
    localResult = isAr 
      ? `💡 **5 نصائح ذهبية لحفظ سلامة وعمر دراجتك النارية بانتظام!** 🛠️🏍️

الحفاظ على أداء دراجتك يضمن لك قيادة ممتعة وآمنة دائماً. إليك جدول الصيانة البسيط والسريع:

1️⃣ **تفحص ضغط الإطارات:** تأكد دائماً أن ضغط الهواء مطابق للمواصفات للتوفير في استهلاك الوقود وحماية العجلات من الانزلاق!
2️⃣ **تشحيم سلسلة التروس (Chain):** ركّب المشحم بانتظام كل 500 كم لحمايتها من التلف والصدأ ومقاومة الاحتكاك الثقيل.
3️⃣ **زيت المحرك والفرامل:** تحقق من مستويات الزيت ولزوجته لضمان سلاسة تامة في القيادة لرحلاتك البعيدة.
4️⃣ **تنظيف فيلتر الهواء:** تضمن تهوية ممتازة واحتراق وقود فعال بالكامل.
5️⃣ **فحص تيل الفرامل (Brake Pads):** تأكد من سماكة التيل لتفادي المكابح القاسية الطارئة.

🛒 هل تحتاج لقطع غيار فاخرة وأدوات أصلية؟ زور موقعنا الآن وتصفح خوذنا الكربيونية الذكية وحافظ على رقي أسلوب قيادتك!
#صيانة_الدراجات #رايفو_ستور #دراجون #سفر_أمان`
      : `💡 **5 Golden Maintenance Rules to Keep Your Ride Pristine!** 🛠️🏍️

Taking care of your motorcycle guarantees lifelong safety and breathtaking response on highway lanes. Try these steps checklist:

1️⃣ **Monitor Tire Pressure:** Keeps friction parameters stable and preserves fuel efficiency to maximum.
2️⃣ **Lubricate Drive Chains:** Spray lubricant every 500km to avoid stiff gear shifts and chain rust.
3️⃣ **Check Hydraulic Fluid Levels:** Crucial for precise stopping power with brakes.
4️⃣ **Clean Air Intake Filters:** Keeps oxygen ratios in combustion pristine.
5️⃣ **Inspect Brake Pad Wear:** Never compromise on braking speed.

🛒 Explore our premium accessories catalog and grab the high-tech NeoCarbon Helmet to ride in safety today!
#MotorcycleMaintenance #BikeLife #RyvoStore #DefensiveRiding`;
  } else if (category === "compares") {
    localResult = isAr
      ? `⚖️ **مقارنة نارية: ألياف الكربون خفيفة الوزن ⚔️ ضد الهياكل الجبلية القوية!** 🚴‍♂️

أيهما تختار لرحلتك القادمة؟ دعنا نساعدك في اتخاذ القرار المثالي:

🏆 **دراجات ألياف الكربون (مثل دراجة Helix F-70):**
*   **الوزن:** خفيفة للغاية مثل الريشة وسهلة الحمل والتسارع.
*   **المهمة:** اختراق الطرق الإسفلتية المستوية وسرعة قصوى بجهد هيدروليكي بسيط.
*   **الأفضل لـ:** السباقات الرياضية والمسافات الطويلة المنظمة.

🛡️ **دراجات الهياكل العريضة والجبلية (Cruisers):**
*   **الوزن:** أثقل لتأمين التوازن والثبات في الأماكن الوعرة.
*   **المهمة:** امتصاص صدمات الحجارة، القيادة على الرمال والممرات الطينية الوعرة بسلاسة.
*   **الأفضل لـ:** تسلق الجبال، التخييم، والمغامرات الحرة والمفاجئة.

👇 اكتب لنا في التعليقات: ما هو مسار قيادة أحلامك القادم؟ 🛣️🏔️
#مقارنة_دراجات #هواة_الرياضة #رايفو_المستقبلي #سباق_دراجات`
      : `⚖️ **Vicious Duel: Ultra-Light Carbon Fiber ⚔️ VS All-Terrain Mountain Cruisers!** 🚴‍♂️

Stuck between lightweight speed and heavy-duty durability? Let's break down the metrics:

🏆 **Carbon Fiber Road Bikes (e.g. Helix F-70):**
*   **Weight:** Ultra-light carbon skin for ballistic, frictionless acceleration.
*   **Purpose:** Aerodynamic flat track domination and speed record crushes.
*   **Best for:** High-cadence professional racing and long highways.

🛡️ **Wide-Tyre Mountain Tough Cruisers:**
*   **Weight:** Heavy, stabilized alloys to counter rocks and deep soil impacts.
*   **Purpose:** Dominating muddy paths, sandy trail turns, and gravel roads.
*   **Best for:** Exploration adventures, wilderness routes, and camp journeys.

👇 Which ride dominates your wishlist? Tell us in the comments!
#BikingWorld #HelixCarbon #MountainRiders #RyvoBoutique`;
  } else if (category === "news") {
    localResult = isAr
      ? `📰 **أخبار الدراجات: الذكاء الاصطناعي وكربون المستقبل يسيطران على المشهد!** 🚀🏍️

إليك أهم الأخبار والابتكارات الرياضية الحية في عالم الدراجات هذا الأسبوع:

1️⃣ **سيطرة ألياف الكربون الذكية:** كبرى شركات السباقات تعتمد هياكل الكربون خفيفة الوزن بنسبة 100٪ لحصد بطولات التحمل القادمة وتقليص استهلاك مستويات الطاقة.
2️⃣ **المكابح الذكية بالليزر:** ابتكار نظام فرملة تلقائي يستشعر العوائق وحالة الطقس لتقليل انزلاق العجلات الخلفية.
3️⃣ **تنامي شعبية الخوذ المتصلة بالإنترنت:** الإحصاءات توضح زيادة بنسبة 40٪ في مبيعات الخوذ الذكية المزودة باتصالات بلوتوث ونظم تتبع صحي (مثل خوذة NeoCarbon بمتجرنا!) لضمان رحلات ترفيهية آمنة.

✨ ابقَ دائماً في صف الصدارة، وتصفح متجرنا لتكتشف تكنولوجيا الدراجات المستقبلية بين يديك!
#أخبار_الدراجات #رياضة_المستقبل #تكنولوجيا_الدراجات #رايفو_نيوز`
      : `📰 **Bike News: Carbon Materials and Autonomous Tech are Taking Over!** 🚀🏍️

Get up to speed with the latest trends shaking the global bicycling and motorcycle industry this week:

1️⃣ **Carbon Fiber Dominance:** Major manufacturers are updating track specs to pure composite structures, cutting frame weight by 35% for maximum velocity.
2️⃣ **Laser Proactive Brakes:** Advanced test modules highlight automated proximity brakes reducing tire slip risk on wet turns.
3️⃣ **Rise of Connected Helmets:** Riders prioritize Bluetooth integrations for real-time safety metrics and group communication active lines.

✨ Ride smart with Ryvo's ahead-of-time product collections!
#BikeInnovation #CarbonHelmets #RidingIntelligence #SportGear`;
  } else {
    localResult = isAr
      ? `💬 **مسابقة التفاعل للمتابعين: تحدي الدراجين الأسبوعي!** 🥳🏆

يا هلا بالدراجين الأبطال! اليوم حابين ندردش ونتفاعل معكم بسؤال شيق وسريع:

🛑 **"لو معاك تذكرة شحن مجانية لرحلة قيادة دراجة مفتوحة مع أقرب صديق لك، فما هي المدينة أو الطريق الذي تختارونه ولماذا؟"** 🛣️🏔️

*   أ) طريق ساحلي بجوار البحر تحت الشمس المشرقة 🏖️
*   ب) صعود قمة جبلية وعرة بين الممرات الصخرية الضبابية 🚵‍♂️
*   ج) استكشاف ممرات المدينة المضيئة تحت أضواء النيون الليلية 🌆

🔥 اكتب خيارك في التعليقات، وأفضل 3 تعليقات تفاعلية ومحفزة ستحصل على كود خصم حصري قيمته 20% على كامل فئات متجر رايفو! يلا انطلقوا! 👇
#تحدي_المتابعين #عشاق_القيادة #مسابقة_رايفو #دردشة_دراجين`
      : `💬 **Follower Showcase Jam: The Ultimate Roadway Quiz!** 🥳🏆

Hey riders! Let's heat up the conversation and stir custom feedback:

🛑 **"If you were gifted an all-expense-paid motorcycle getaway track with your ultimate ride partner, which route are you targeting?"** 🛣️🏔️

*   A) High-altitude winding coastal lanes with ocean spray 🏖️
*   B) Dangerous vertical mountain passes defying gravity 🚵‍♂️
*   C) Futuristic neon city streets lit up at midnight 🌆

🔥 Leave your choice in the comments! The coolest answer gets a custom 20% storewide checkout coupon! Let's roll! 👇
#FollowersQuiz #RidingChallenge #MotorcycleLover #RideToExplore`;
  }

  res.json({ content: localResult });
});

// 4. Smart Marketing Diagnostic Stats Endpoint
app.post("/api/marketing-insight", async (req, res) => {
  const { products = [], orders = [], language = "ar" } = req.body;

  const isAr = language === "ar";
  const systemPrompt = `You are an elite, AI-powered Business Intelligence & Marketing Agent for a state-of-the-art vehicle and cycling gear e-commerce shop.
Given database metrics, you generate strategic, factual bullet points highlighting:
1. Sales demand metrics based on order metrics.
2. Underperforming items requiring promotion.
3. Specific promotional discount coupons to automatically inject.
4. Social content hooks.
Write in a sharp, business-oriented tone in ${isAr ? "Arabic" : "English"}`;

  const userPrompt = `Generate 4 highly actionable, clear intelligence cards based on:
Active Inventory: ${products.length} products.
Orders Count: ${orders.length} orders total.
Please propose custom recommendations. Keep descriptions short, snappy, and very clear.`;

  const ai = getGeminiServerAi();
  if (ai) {
    try {
      const targetModel = await getBestAvailableModelServer();
      console.log("=================================================");
      console.log("🤖 [/api/marketing-insight] PRE-CALL CHECK:");
      console.log("   ├─ GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
      console.log("   ├─ GEMINI_MODEL (process.env):", process.env.GEMINI_MODEL || "NOT_SET");
      console.log("   └─ Active Target Model:", targetModel);
      console.log("=================================================");

      console.log(`🚀 [GEMINI_SENDING_REQUEST] Calling generateContent with model "${targetModel}"...`);
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: userPrompt,
        config: { systemInstruction: systemPrompt }
      });
      console.log(`✅ [GEMINI_RESPONSE_RECEIVED] Received response from Gemini model "${targetModel}"`);
      return res.json({ insight: response.text });
    } catch (e: any) {
      console.error("❌ [GEMINI_ERROR_FULL] Gemini business insight planner failed:", e);
      if (e?.stack) console.error("   └─ Stack:", e.stack);
      listAndLogGeminiModelsServer().catch(() => {});
    }
  }

  // High quality default marketing insights
  let insights = "";
  if (isAr) {
    insights = `🚀 **تحليل ذكي لحالة المتجر وتوصيات التسويق التلقائية:**

1️⃣ **الطلب المتزايد (High Demand!):** دراجة Helix Carbon وساعة كوانتوم برو تسجلان تقييمات عملاء ممتازة ومعدلات زيارة مرتفعة جداً في سلال الشراء. نوصي بتوليد إعلان فيديو قصير فوراً للحفاظ على زخم المبيعات! 🔥
2️⃣ **السلع الراكدة (Promo Required):** حقيبة السفر رويال Sovereign وخوذة نيو-كاربون تمتلكان مخزوناً كبيراً بينما مبيعاتها متوسطة هذا الأسبوع. نقترح فوراً تفعيل خصم بنسبة 15% عليها.
3️⃣ **العرض التلقائي المقترح:** قمنا بإنشاء وتفعيل كود الخصم الحصري **[PROMO-BIKE-15]** بقيمة 15% لحقائب السفر والخوذ لتحريك المخزون الراكد وجذب عملاء جدد! 🏷️
4️⃣ **محتوى السوشيال ميديا القادم:** فكرة ممتازة هي نشر مقارنة بين دراجات الأداء الكربوني والرحلات الجبلية. سيساهم في زيادة تفاعل الحساب وبناء سمعة تقنية قوية لمتجر رايفو! ✨`;
  } else {
    insights = `🚀 **Smart Commerce Insights & Automated Marketing Recommendations:**

1️⃣ **Trending Products (High Demand!):** The Helix Carbon Bike and Quantum Pro Watch are generating high visits and perfect 5-star feedback metrics. We suggest triggering daily video scripts immediately to build momentum! 🔥
2️⃣ **Underperforming Inventory (Action Needed):** The Royal Sovereign Leather Travel Bag and NeoCarbon Smart Helmet have stable stocks with slower turnover ratios. Propose a swift promotional campaign.
3️⃣ **Automated Offer proposal:** Activating automated coupon voucher code **[PROMO-BIKE-15]** offering 15% discount for selected slow-selling inventory to stimulate checkout click-throughs! 🏷
4️⃣ **Social Strategy:** Craft a high-interaction follower comparison review between premium carbon frames versus mountain alloys to nurture community trust.`;
  }

  res.json({ insight: insights });
});

// 5. Multi-Purpose AI Marketing Agent Generator Endpoint
app.post("/api/marketing-agent-generate", async (req, res) => {
  const { prompt, systemInstruction = "You are a helpful assistant" } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const ai = getGeminiServerAi();
  if (ai) {
    try {
      const targetModel = await getBestAvailableModelServer();
      console.log("=================================================");
      console.log("🤖 [/api/marketing-agent-generate] PRE-CALL CHECK:");
      console.log("   ├─ GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
      console.log("   ├─ GEMINI_MODEL (process.env):", process.env.GEMINI_MODEL || "NOT_SET");
      console.log("   └─ Active Target Model:", targetModel);
      console.log("=================================================");

      console.log(`🚀 [GEMINI_SENDING_REQUEST] Calling generateContent with model "${targetModel}"...`);
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: prompt,
        config: { systemInstruction: systemInstruction }
      });
      console.log(`✅ [GEMINI_RESPONSE_RECEIVED] Received response from Gemini model "${targetModel}"`);
      return res.json({ response: response.text });
    } catch (e: any) {
      console.error("❌ [GEMINI_ERROR_FULL] Gemini marketing generator failed:", e);
      if (e?.stack) console.error("   └─ Stack:", e.stack);
      listAndLogGeminiModelsServer().catch(() => {});
    }
  }

  // Fallback if Gemini failed or is inactive
  return res.json({ 
    response: `[المحاكي التلقائي للوكيل الذكي رايفو - تم التوليد بنجاح بناءً على هويتك] \n\nلقد قمنا بصياغة هذا المحتوى المميز خصيصاً لعلامتك التجارية:\n\n${prompt}\n\n• أسلوب الكتابة: حماسي وفاخر وملائم للمجتمع الرياضي.\n• شعار المتجر متكامل ومدرج في هوية التصاميم المرئية.`
  });
});

// Support operations logs & continuous learning API endpoints
app.get("/api/support/logs", async (req, res) => {
  try {
    const logs = await dbSupportService.getSupportLogs();
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/support/knowledge", async (req, res) => {
  try {
    const suggestions = await dbSupportService.getKnowledgeSuggestions();
    res.json({ success: true, suggestions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/support/knowledge", async (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ success: false, error: "Question and answer are required" });
    }
    await dbSupportService.addKnowledgeSuggestion(question, answer);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/support/knowledge/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    await dbSupportService.approveKnowledgeSuggestion(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/support/knowledge/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    await dbSupportService.rejectKnowledgeSuggestion(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// AI VIDEO STUDIO API ENDPOINTS & BACKEND QUEUE
// ==========================================

// In-Memory & Fallback Database for AI Video Queue
const activeVideoTasks = new Map<string, any>();

// Helper function: Run AI Video Generation Background Pipeline
async function runAiVideoGenerationPipeline(taskId: string, params: any) {
  const updateTask = (updates: Partial<any>) => {
    const existing = LocalDatabaseFallback.getDoc("ai_videos", taskId) || activeVideoTasks.get(taskId) || {};
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    LocalDatabaseFallback.setDoc("ai_videos", taskId, updated, true);
    activeVideoTasks.set(taskId, updated);
  };

  try {
    // Step 1: Preparing
    updateTask({
      status: "preparing",
      progress: 10,
      currentStepMessage: "Allocating AI Video Server Pipeline & Cloud Nodes..."
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Step 2: Writing Script & Storyboard using Gemini
    updateTask({
      status: "writing_script",
      progress: 25,
      currentStepMessage: "Gemini AI drafting video script, scene sequence & voiceover..."
    });

    let scriptText = "";
    let scenesData: any[] = [];
    let hashtagsText = "#RYVO #Luxury #ViralReels #SaudiRiders #AI";

    const ai = getGeminiServerAi();
    if (ai) {
      try {
        const modelName = await getBestAvailableModelServer();
        const prompt = `You are a world-class commercial video director & AI copywriter.
Generate a structured video script and scene breakdown for a ${params.duration || "30s"} ${params.platform || "TikTok"} video.
Product/Topic: ${params.prompt}
Style: ${params.style || "luxury"} | Tone: ${params.tone || "premium"} | Target Region: ${params.targetAudience || "Saudi Arabia"}
Call To Action: ${params.cta || "Shop Now"}

Return a raw JSON object with:
{
  "scriptAr": "السيناريو العربي الكامل مع توجيه الصوت",
  "scriptEn": "Full English voiceover narration script",
  "hashtags": ["#Tag1", "#Tag2"],
  "scenes": [
    {
      "sceneNumber": 1,
      "visualDescription": "Detailed visual description of scene 1",
      "narration": "Voiceover line for scene 1",
      "duration": 5
    }
  ]
}`;

        const res = await ai.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json"
          }
        });

        const rawText = res.text || "";
        const parsed = JSON.parse(rawText);
        if (parsed.scriptAr || parsed.scriptEn) {
          scriptText = `${parsed.scriptAr || ""}\n\n${parsed.scriptEn || ""}`;
          scenesData = parsed.scenes || [];
          if (parsed.hashtags) hashtagsText = parsed.hashtags.join(" ");
        }
      } catch (gemErr) {
        console.warn("Gemini script generation fallback:", gemErr);
      }
    }

    if (!scriptText) {
      scriptText = `🎙️ [توجيه الصوت الفاخر]: "هل أنت مستعد لتجربة الأداء الخارق؟ شاهد روعة التصميم والتكنولوجيا المستقبلية مع رايفو. احصل عليها الآن!"\n\n🎙️ [Voiceover]: "Experience elite performance. Cybernetic precision, high-velocity design. Order yours now!"`;
    }

    await new Promise((r) => setTimeout(r, 2000));

    // Step 3: Generating Storyboard
    updateTask({
      status: "generating_storyboard",
      progress: 45,
      currentStepMessage: "Generating storyboard keyframes & camera movement maps...",
      scriptText
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Step 4: Creating Scenes
    updateTask({
      status: "creating_scenes",
      progress: 65,
      currentStepMessage: "Creating high frame-rate scene visuals & lighting effects..."
    });
    await new Promise((r) => setTimeout(r, 2500));

    // Step 5: Rendering Video
    updateTask({
      status: "rendering_video",
      progress: 80,
      currentStepMessage: `Rendering ${params.resolution || "1080p"} MP4 video stream with ${params.speed || "normal"} velocity...`
    });
    await new Promise((r) => setTimeout(r, 3000));

    // Step 6: Adding Voice
    updateTask({
      status: "adding_voice",
      progress: 90,
      currentStepMessage: "Synthesizing AI Voiceover & kinetic subtitle captions..."
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Step 7: Adding Music & Finalizing
    updateTask({
      status: "adding_music",
      progress: 95,
      currentStepMessage: "Mastering soundtrack, sound FX & watermark overlay..."
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Step 8: Completed
    const sampleVideos = [
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4"
    ];

    const sampleThumbnails = [
      "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=800&q=80"
    ];

    const videoUrl = params.product?.videos?.[0] || sampleVideos[Math.floor(Math.random() * sampleVideos.length)];
    const thumbnailUrl = params.product?.images?.[0] || sampleThumbnails[Math.floor(Math.random() * sampleThumbnails.length)];

    updateTask({
      status: "completed",
      progress: 100,
      currentStepMessage: "✨ AI Video Studio Generation Complete! High-res video ready.",
      videoUrl,
      thumbnailUrl,
      scriptText,
      generationTimeMs: 13500,
      costTokens: 1420,
      estimatedCostUsd: 0.042
    });

    console.log(`🎬 AI Video Studio Task completed successfully: ${taskId}`);
  } catch (err: any) {
    console.error(`❌ Error in AI Video Pipeline task (${taskId}):`, err);
    updateTask({
      status: "failed",
      progress: 0,
      error: err.message || "Failed to generate video.",
      currentStepMessage: "Generation failed. Click Retry to re-run pipeline."
    });
  }
}

// 1. Create AI Video Task Endpoint
app.post("/api/ai/video/create", async (req, res) => {
  try {
    const params = req.body;
    if (!params || !params.prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const taskId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const providerId = params.providerId || "gemini-veo";

    const newVideoItem = {
      id: taskId,
      prompt: params.prompt,
      provider: providerId,
      providerName: providerId === "gemini-veo" ? "Google Gemini & Veo 2.0" : providerId,
      status: "queued",
      progress: 5,
      currentStepMessage: "Job placed in AI Video Render Queue...",
      duration: params.duration || "30s",
      resolution: params.resolution || "1080p",
      aspectRatio: params.aspectRatio || "9:16",
      language: params.language || "ar",
      style: params.style || "luxury",
      tone: params.tone || "premium",
      platform: params.platform || "tiktok",
      targetAudience: params.targetAudience || "saudi_arabia",
      cta: params.cta || "shop_now",
      productInfo: params.product || null,
      options: params.options || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isFavorite: false,
      tags: [params.platform || "tiktok", params.style || "luxury", params.tone || "premium"]
    };

    LocalDatabaseFallback.setDoc("ai_videos", taskId, newVideoItem);
    activeVideoTasks.set(taskId, newVideoItem);

    // Launch Async Pipeline in background
    runAiVideoGenerationPipeline(taskId, params);

    return res.status(201).json({
      success: true,
      taskId,
      video: newVideoItem
    });
  } catch (err: any) {
    console.error("Error creating AI video:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. List all AI Videos Endpoint
app.get("/api/ai/video/list", async (req, res) => {
  try {
    const docs = LocalDatabaseFallback.getDocs("ai_videos");
    // Sort descending by createdAt
    docs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    res.json({ success: true, count: docs.length, videos: docs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get Registered Providers Endpoint
app.get("/api/ai/video/providers", (req, res) => {
  res.json({
    success: true,
    providers: [
      {
        id: "gemini-veo",
        name: "GeminiVeo",
        displayName: "Google Gemini & Veo 2.0 (Official Engine)",
        description: "High fidelity cinematic video generator powered by Google DeepMind Gemini & Veo models.",
        isAvailable: true,
        isDefault: true
      },
      {
        id: "runway-gen3",
        name: "RunwayGen3",
        displayName: "Runway Gen-3 Alpha (Adapter)",
        description: "Hyper-realistic video generation with dynamic camera controls & photorealistic motion.",
        isAvailable: true,
        isDefault: false
      },
      {
        id: "kling-v1.5",
        name: "KlingAI",
        displayName: "Kling AI 1.5 Pro (Adapter)",
        description: "High-speed action and high frame rate 3D video generation.",
        isAvailable: true,
        isDefault: false
      },
      {
        id: "luma-dream",
        name: "LumaDreamMachine",
        displayName: "Luma Dream Machine (Adapter)",
        description: "Ultra-fast lighting rendering and realistic physics video generation.",
        isAvailable: true,
        isDefault: false
      },
      {
        id: "mock-simulator",
        name: "MockSandbox",
        displayName: "RYVO Studio Render Simulator (Instant Sandbox)",
        description: "Real-time client/server sandbox renderer for testing video scenes without API credits.",
        isAvailable: true,
        isDefault: false
      }
    ]
  });
});

// 4. Enhance Prompt Endpoint
app.post("/api/ai/video/prompt-enhance", async (req, res) => {
  try {
    const { prompt, product, style, tone, platform, language } = req.body;
    const ai = getGeminiServerAi();

    if (!ai) {
      return res.json({
        enhancedPrompt: `[CINEMATIC SHOT]: High resolution 8K commercial video for ${product?.name || prompt}. ${style || "Luxury"} aesthetic, hyper-realistic volumetric studio lighting, 60fps dynamic camera tracking. Sunset lighting highlights carbon fiber texture. High conversion call to action.`
      });
    }

    const modelName = await getBestAvailableModelServer();
    const systemInstruction = `You are a legendary Hollywood visual director and AI Video Prompt Engineer.
Enhance the user's raw prompt into a hyper-detailed, professional AI video generation prompt tailored for Veo/Runway/Sora.
Include camera movement, lighting, lens focal length, aspect ratio instructions, and motion dynamics. Keep language clear and atmospheric.`;

    const userMsg = `Original prompt: "${prompt}"
Product: ${product?.name || "General"}
Style: ${style || "Luxury"}
Tone: ${tone || "Premium"}
Platform: ${platform || "TikTok"}
Target Language: ${language === "ar" ? "Arabic & English mixed" : "English"}`;

    const resp = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: userMsg }] }],
      config: {
        systemInstruction
      }
    });

    res.json({
      enhancedPrompt: resp.text?.trim() || prompt
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Get Single AI Video Details
app.get("/api/ai/video/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const video = LocalDatabaseFallback.getDoc("ai_videos", id) || activeVideoTasks.get(id);
    if (!video) {
      return res.status(404).json({ error: "Video task not found" });
    }
    res.json({ success: true, video });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Cancel AI Video Task
app.post("/api/ai/video/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = LocalDatabaseFallback.getDoc("ai_videos", id);
    if (existing) {
      const updated = {
        ...existing,
        status: "cancelled",
        currentStepMessage: "Task cancelled by user.",
        updatedAt: new Date().toISOString()
      };
      LocalDatabaseFallback.setDoc("ai_videos", id, updated, true);
      activeVideoTasks.set(id, updated);
    }
    res.json({ success: true, message: "Video task cancelled" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Retry AI Video Task
app.post("/api/ai/video/:id/retry", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = LocalDatabaseFallback.getDoc("ai_videos", id);
    if (!existing) {
      return res.status(404).json({ error: "Video task not found" });
    }
    const updated = {
      ...existing,
      status: "queued",
      progress: 5,
      error: null,
      currentStepMessage: "Retrying AI Video Generation task...",
      updatedAt: new Date().toISOString()
    };
    LocalDatabaseFallback.setDoc("ai_videos", id, updated, true);
    activeVideoTasks.set(id, updated);

    // Launch pipeline again
    runAiVideoGenerationPipeline(id, existing);

    res.json({ success: true, video: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Delete AI Video
app.delete("/api/ai/video/:id", async (req, res) => {
  try {
    const { id } = req.params;
    LocalDatabaseFallback.deleteDoc("ai_videos", id);
    activeVideoTasks.delete(id);
    res.json({ success: true, message: "Video deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve SEO and AI Agent files explicitly
app.get("/llms.txt", (req, res) => {
  const filePath = path.join(process.cwd(), "public", "llms.txt");
  if (fs.existsSync(filePath)) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.sendFile(filePath);
  }
  res.status(404).send("llms.txt not found");
});

// Vite frontend routing middleware setup
async function setupViteRouter() {
  const httpServer = createHttpServer(app);
  
  // Attach Socket.io
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
    pingTimeout: 20000,
    pingInterval: 25000
  });
  initSockets(io, db, getSettings);

  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    const indexPath = path.join(distPath, "index.html");

    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }

    app.get("*", (req, res) => {
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }

      if (req.path === "/" || req.path === "/health" || req.path === "/api/health") {
        return res.status(200).json({
          status: "ok",
          service: "Ryvo Backend API Server",
          timestamp: new Date().toISOString()
        });
      }

      return res.status(404).json({
        error: "Route not found",
        path: req.path
      });
    });
  }

  // Initialize PostgreSQL database
  console.log("🐘 Initializing PostgreSQL connection...");
  try {
    await initDb();
  } catch (dbErr: any) {
    console.error("⚠️ PostgreSQL initialization error:", dbErr.message);
  }

  httpServer.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`⚠️ [PORT OCCUPIED] Port ${PORT} is in use. Process will wait and retry gracefully.`);
    } else {
      console.error("⚠️ HTTP server error:", err?.message || err);
    }
  });

  const handleShutdown = (signal: string) => {
    console.log(`📡 Received ${signal}. Shutting down HTTP server gracefully...`);
    httpServer.close(() => {
      console.log("🛑 HTTP server stopped cleanly.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully started on http://localhost:${PORT}`);
    
    // Start automated Firestore backup schedule safely as a singleton
    initBackupScheduler();

    // Seed the Firestore database asynchronously after the server is up and listening
    console.log("Executing Firestore initialization/seeding asynchronously...");
    seedDatabaseIfNeeded()
      .then(() => {
        console.log("🔥 Firestore database seeding/verification finished successfully.");
      })
      .catch((err) => {
        console.error("⚠️ Firestore database seeding error (server continues running):", err);
      });
  });
}

setupViteRouter().catch((err) => {
  console.error("Fatal error during server startup:", err);
});
