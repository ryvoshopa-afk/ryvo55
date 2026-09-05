import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  Firestore,
  CollectionReference,
  DocumentReference,
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
  deleteField as clientDeleteField,
  DocumentSnapshot,
  QuerySnapshot
} from 'firebase/firestore';

// ----------------------------------------------------------------------------
// 1. STRUCTURED FIRESTORE ERROR LOGGING (NO SECRETS EXPOSED)
// ----------------------------------------------------------------------------
export function logFirestoreError(
  operation: string,
  targetPath: string,
  docId?: string,
  err?: any
): void {
  const code = err?.code || 'UNKNOWN_FIRESTORE_ERROR';
  const message = err?.message || String(err || 'Unknown error');
  const stack = err?.stack || '';
  const fullPath = docId ? `${targetPath}/${docId}` : targetPath;

  console.error(`❌ [FIRESTORE ERROR] Op: ${operation} | Path: ${fullPath} | Code: ${code} | Message: ${message}`, {
    operation,
    targetPath,
    docId: docId || null,
    code,
    message,
    stack,
    timestamp: new Date().toISOString()
  });
}

// ----------------------------------------------------------------------------
// 2. DATA SANITIZATION (PREVENT UNDEFINED FIELDS THROWING IN FIRESTORE)
// ----------------------------------------------------------------------------
export function sanitizeFirestoreData(data: any): any {
  if (data === undefined) return null;
  if (data === null) return null;
  if (Array.isArray(data)) {
    return data.map(item => sanitizeFirestoreData(item));
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const cleaned: any = {};
    for (const key of Object.keys(data)) {
      const val = data[key];
      if (val !== undefined) {
        cleaned[key] = sanitizeFirestoreData(val);
      }
    }
    return cleaned;
  }
  return data;
}

// ----------------------------------------------------------------------------
// 3. TYPE GUARDS FOR FIRESTORE OBJECTS
// ----------------------------------------------------------------------------
export function isRawFirestore(obj: any): boolean {
  if (!obj) return false;
  return (
    obj instanceof Firestore ||
    obj?.type === 'firestore' ||
    obj?.type === 'firestore-lite' ||
    (Boolean(obj?.app) && Boolean(obj?._databaseId || obj?.databaseId))
  );
}

export function isRawCollectionRef(obj: any): boolean {
  if (!obj) return false;
  return (
    obj instanceof CollectionReference ||
    obj?.type === 'collection' ||
    (Boolean(obj?._delegate) && Boolean(obj?.id) && typeof obj?.path === 'string' && typeof obj?.data !== 'function' && typeof obj?.set !== 'function')
  );
}

export function isRawDocRef(obj: any): boolean {
  if (!obj) return false;
  return (
    obj instanceof DocumentReference ||
    obj?.type === 'document' ||
    (Boolean(obj?._delegate) && Boolean(obj?.id) && typeof obj?.path === 'string' && typeof obj?.collection !== 'function' && typeof obj?.set !== 'function')
  );
}

export function isClientDbAdapter(obj: any): obj is ClientDbAdapter {
  return obj instanceof ClientDbAdapter || Boolean(obj && obj.rawFirestore);
}

export function isLocalDbAdapter(obj: any): obj is LocalDbAdapter {
  return obj instanceof LocalDbAdapter;
}

export function isClientCollectionWrapper(obj: any): obj is ClientCollectionRefWrapper {
  return obj instanceof ClientCollectionRefWrapper || Boolean(obj && obj.rawRef && obj.rawRef.type === 'collection');
}

export function isLocalCollectionWrapper(obj: any): obj is LocalCollectionRefWrapper {
  return obj instanceof LocalCollectionRefWrapper;
}

export function isClientDocWrapper(obj: any): obj is ClientDocRefWrapper {
  return obj instanceof ClientDocRefWrapper || Boolean(obj && obj.rawRef && obj.rawRef.type === 'document');
}

export function isLocalDocWrapper(obj: any): obj is LocalDocRefWrapper {
  return obj instanceof LocalDocRefWrapper;
}

// ----------------------------------------------------------------------------
// 4. LOCAL DATABASE FALLBACK ENGINE
// ----------------------------------------------------------------------------
export class LocalDatabaseFallback {
  private static filePath = path.join(process.cwd(), "local_firestore_fallback.json");

  private static readData(): Record<string, Record<string, any>> {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      }
    } catch (e: any) {
      logFirestoreError("LocalDatabaseFallback.readData", this.filePath, undefined, e);
    }
    return {};
  }

  private static writeData(data: Record<string, Record<string, any>>) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (e: any) {
      logFirestoreError("LocalDatabaseFallback.writeData", this.filePath, undefined, e);
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

// ----------------------------------------------------------------------------
// 5. LOCAL SNAPSHOT & WRAPPERS
// ----------------------------------------------------------------------------
export class LocalDocSnapshotWrapper {
  constructor(public id: string, private docData: any, public ref: any) {}

  exists(): boolean {
    return this.docData !== null && this.docData !== undefined;
  }

  data(): any {
    return this.docData || undefined;
  }
}

export class LocalDocRefWrapper {
  constructor(public colPath: string, public id: string) {}

  get path(): string {
    return `${this.colPath}/${this.id}`;
  }

  async get(): Promise<LocalDocSnapshotWrapper> {
    const localData = LocalDatabaseFallback.getDoc(this.colPath, this.id);
    return new LocalDocSnapshotWrapper(this.id, localData, this);
  }

  async set(data: any, options?: { merge?: boolean }): Promise<{ success: boolean }> {
    LocalDatabaseFallback.setDoc(this.colPath, this.id, data, options?.merge);
    return { success: true };
  }

  async update(data: any): Promise<{ success: boolean }> {
    LocalDatabaseFallback.updateDoc(this.colPath, this.id, data);
    return { success: true };
  }

  async delete(): Promise<{ success: boolean }> {
    LocalDatabaseFallback.deleteDoc(this.colPath, this.id);
    return { success: true };
  }
}

export class LocalCollectionRefWrapper {
  constructor(public path: string) {}

  doc(id: string): LocalDocRefWrapper {
    return new LocalDocRefWrapper(this.path, id);
  }

  async add(data: any): Promise<LocalDocRefWrapper> {
    const id = crypto.randomUUID();
    LocalDatabaseFallback.setDoc(this.path, id, data);
    return new LocalDocRefWrapper(this.path, id);
  }

  orderBy(_field: string, _direction: "asc" | "desc" = "asc"): this {
    return this;
  }

  limit(_n: number): this {
    return this;
  }

  async get(): Promise<{ size: number; empty: boolean; docs: LocalDocSnapshotWrapper[] }> {
    const items = LocalDatabaseFallback.getDocs(this.path);
    return {
      size: items.length,
      empty: items.length === 0,
      docs: items.map(item => {
        const { id, ...rest } = item;
        return new LocalDocSnapshotWrapper(id, rest, new LocalDocRefWrapper(this.path, id));
      })
    };
  }
}

export class LocalDbAdapter {
  collection(colName: string): LocalCollectionRefWrapper {
    return new LocalCollectionRefWrapper(colName);
  }

  doc(pathOrCol: string, docId?: string): LocalDocRefWrapper {
    if (docId) {
      return new LocalDocRefWrapper(pathOrCol, docId);
    }
    const parts = pathOrCol.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return new LocalDocRefWrapper(parts[0], parts.slice(1).join("/"));
    }
    return new LocalDocRefWrapper(pathOrCol, "default");
  }
}

// ----------------------------------------------------------------------------
// 6. CLIENT SDK FIRESTORE SNAPSHOT & WRAPPERS
// ----------------------------------------------------------------------------
export class ClientDocSnapshotWrapper {
  constructor(public rawSnap: any) {}

  get id(): string {
    return this.rawSnap.id;
  }

  exists(): boolean {
    return typeof this.rawSnap.exists === "function" ? this.rawSnap.exists() : true;
  }

  data(): any {
    return typeof this.rawSnap.data === "function" ? this.rawSnap.data() : undefined;
  }

  get ref(): ClientDocRefWrapper {
    return new ClientDocRefWrapper(this.rawSnap.ref);
  }
}

export class ClientDocRefWrapper {
  constructor(public rawRef: any) {}

  get id(): string {
    return this.rawRef.id;
  }

  get path(): string {
    return this.rawRef.path;
  }

  async get(): Promise<ClientDocSnapshotWrapper | LocalDocSnapshotWrapper> {
    try {
      const snap = await clientGetDoc(this.rawRef);
      return new ClientDocSnapshotWrapper(snap);
    } catch (error: any) {
      logFirestoreError("ClientDocRefWrapper.get", this.rawRef.path, undefined, error);
      const parts = this.rawRef.path.split('/');
      const docId = parts[parts.length - 1];
      const colPath = parts.slice(0, parts.length - 1).join('/');
      const localData = LocalDatabaseFallback.getDoc(colPath, docId);
      return new LocalDocSnapshotWrapper(docId, localData, this);
    }
  }

  async set(data: any, options?: { merge?: boolean }): Promise<{ success: boolean }> {
    const cleanData = sanitizeFirestoreData(data);
    try {
      if (options && options.merge) {
        await clientSetDoc(this.rawRef, cleanData, { merge: true });
      } else {
        await clientSetDoc(this.rawRef, cleanData);
      }
      return { success: true };
    } catch (error: any) {
      logFirestoreError("ClientDocRefWrapper.set", this.rawRef.path, undefined, error);
      const parts = this.rawRef.path.split('/');
      const docId = parts[parts.length - 1];
      const colPath = parts.slice(0, parts.length - 1).join('/');
      LocalDatabaseFallback.setDoc(colPath, docId, cleanData, options?.merge);
      return { success: true };
    }
  }

  async update(data: any): Promise<{ success: boolean }> {
    const cleanData = sanitizeFirestoreData(data);
    try {
      await clientUpdateDoc(this.rawRef, cleanData);
      return { success: true };
    } catch (error: any) {
      logFirestoreError("ClientDocRefWrapper.update", this.rawRef.path, undefined, error);
      const parts = this.rawRef.path.split('/');
      const docId = parts[parts.length - 1];
      const colPath = parts.slice(0, parts.length - 1).join('/');
      LocalDatabaseFallback.updateDoc(colPath, docId, cleanData);
      return { success: true };
    }
  }

  async delete(): Promise<{ success: boolean }> {
    try {
      await clientDeleteDoc(this.rawRef);
      return { success: true };
    } catch (error: any) {
      logFirestoreError("ClientDocRefWrapper.delete", this.rawRef.path, undefined, error);
      const parts = this.rawRef.path.split('/');
      const docId = parts[parts.length - 1];
      const colPath = parts.slice(0, parts.length - 1).join('/');
      LocalDatabaseFallback.deleteDoc(colPath, docId);
      return { success: true };
    }
  }
}

export class ClientCollectionRefWrapper {
  private queryConstraints: any[] = [];

  constructor(public rawRef: any, public firestoreInstance: any) {}

  get id(): string {
    return this.rawRef.id;
  }

  get path(): string {
    return this.rawRef.path;
  }

  doc(id: string): ClientDocRefWrapper {
    const dRef = clientDoc(this.rawRef, id);
    return new ClientDocRefWrapper(dRef);
  }

  async add(data: any): Promise<ClientDocRefWrapper> {
    const cleanData = sanitizeFirestoreData(data);
    try {
      const dRef = await clientAddDoc(this.rawRef, cleanData);
      return new ClientDocRefWrapper(dRef);
    } catch (error: any) {
      logFirestoreError("ClientCollectionRefWrapper.add", this.rawRef.path, undefined, error);
      const id = crypto.randomUUID();
      LocalDatabaseFallback.setDoc(this.rawRef.path, id, cleanData);
      const dRef = clientDoc(this.firestoreInstance, this.rawRef.path, id);
      return new ClientDocRefWrapper(dRef);
    }
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc"): this {
    this.queryConstraints.push(clientOrderBy(field, direction));
    return this;
  }

  limit(n: number): this {
    this.queryConstraints.push(clientLimit(n));
    return this;
  }

  async get(): Promise<{ size: number; empty: boolean; docs: (ClientDocSnapshotWrapper | LocalDocSnapshotWrapper)[] }> {
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
    } catch (error: any) {
      logFirestoreError("ClientCollectionRefWrapper.get", this.rawRef.path, undefined, error);
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

export class ClientDbAdapter {
  constructor(public rawFirestore: any) {}

  collection(colName: string): ClientCollectionRefWrapper {
    const cRef = clientCollection(this.rawFirestore, colName);
    return new ClientCollectionRefWrapper(cRef, this.rawFirestore);
  }

  doc(pathOrCol: string, docId?: string): ClientDocRefWrapper {
    if (docId) {
      const dRef = clientDoc(this.rawFirestore, pathOrCol, docId);
      return new ClientDocRefWrapper(dRef);
    }
    const parts = pathOrCol.split("/").filter(Boolean);
    if (parts.length >= 2) {
      const dRef = clientDoc(this.rawFirestore, parts[0], parts.slice(1).join("/"));
      return new ClientDocRefWrapper(dRef);
    }
    const dRef = clientDoc(this.rawFirestore, pathOrCol);
    return new ClientDocRefWrapper(dRef);
  }
}

// ----------------------------------------------------------------------------
// 7. UNIFIED doc() FUNCTION — ZERO GUESSWORK, STRICT TYPE-BASED DISPATCH
// ----------------------------------------------------------------------------
/**
 * Resolves a document reference cleanly from:
 * 1. doc(db, "collectionName", "docId")
 * 2. doc(collectionRef, "docId")
 * 3. doc(db, "collectionName/docId")
 * 
 * NEVER assumes or calls `.doc()` directly on any raw Modular Firestore or Collection reference!
 */
export function doc(
  target: any,
  pathOrCol: string,
  docId?: string
): ClientDocRefWrapper | LocalDocRefWrapper {
  if (!target) {
    throw new Error("[FIRESTORE doc()] Database or Collection reference is null or undefined");
  }
  if (!pathOrCol) {
    throw new Error("[FIRESTORE doc()] Collection name or Document path is required");
  }

  // -------------------------------------------------------------
  // Branch A: 3 arguments provided -> doc(target, "colName", "docId")
  // -------------------------------------------------------------
  if (docId !== undefined && docId !== null && docId !== "") {
    // 1. ClientDbAdapter or object wrapping rawFirestore
    if (isClientDbAdapter(target)) {
      const dRef = clientDoc(target.rawFirestore, pathOrCol, docId);
      return new ClientDocRefWrapper(dRef);
    }
    // 2. Raw Firebase Modular Firestore instance
    if (isRawFirestore(target)) {
      const dRef = clientDoc(target, pathOrCol, docId);
      return new ClientDocRefWrapper(dRef);
    }
    // 3. LocalDbAdapter
    if (isLocalDbAdapter(target)) {
      return new LocalDocRefWrapper(pathOrCol, docId);
    }
    // 4. Any object with rawFirestore property
    if (target.rawFirestore) {
      const dRef = clientDoc(target.rawFirestore, pathOrCol, docId);
      return new ClientDocRefWrapper(dRef);
    }
    // Fallback: Local fallback
    return new LocalDocRefWrapper(pathOrCol, docId);
  }

  // Check if 3 arguments were intended but docId is empty/null/undefined
  if (arguments.length >= 3 && (docId === undefined || docId === null || docId === "")) {
    throw new Error(`[FIRESTORE doc()] Document ID is missing or empty for collection [${pathOrCol}]`);
  }

  // -------------------------------------------------------------
  // Branch B: 2 arguments provided
  // -------------------------------------------------------------

  // Case B1: target is a Collection Reference (raw or wrapped)
  if (isClientCollectionWrapper(target)) {
    const dRef = clientDoc(target.rawRef, pathOrCol);
    return new ClientDocRefWrapper(dRef);
  }
  if (isRawCollectionRef(target)) {
    const dRef = clientDoc(target, pathOrCol);
    return new ClientDocRefWrapper(dRef);
  }
  if (isLocalCollectionWrapper(target)) {
    return new LocalDocRefWrapper(target.path, pathOrCol);
  }

  // Case B2: target is a Database instance/adapter with a full path (e.g. "users/abc")
  const parts = pathOrCol.split("/").filter(Boolean);
  const colName = parts[0] || "default";
  const docName = parts.length >= 2 ? parts.slice(1).join("/") : "default";

  if (isClientDbAdapter(target)) {
    const dRef = parts.length >= 2
      ? clientDoc(target.rawFirestore, colName, docName)
      : clientDoc(target.rawFirestore, pathOrCol);
    return new ClientDocRefWrapper(dRef);
  }

  if (isRawFirestore(target)) {
    const dRef = parts.length >= 2
      ? clientDoc(target, colName, docName)
      : clientDoc(target, pathOrCol);
    return new ClientDocRefWrapper(dRef);
  }

  if (isLocalDbAdapter(target)) {
    return new LocalDocRefWrapper(colName, docName);
  }

  if (target.rawFirestore) {
    const dRef = parts.length >= 2
      ? clientDoc(target.rawFirestore, colName, docName)
      : clientDoc(target.rawFirestore, pathOrCol);
    return new ClientDocRefWrapper(dRef);
  }

  return new LocalDocRefWrapper(colName, docName);
}

// ----------------------------------------------------------------------------
// 8. UNIFIED collection() FUNCTION
// ----------------------------------------------------------------------------
export function collection(
  target: any,
  path: string
): ClientCollectionRefWrapper | LocalCollectionRefWrapper {
  if (!target) {
    throw new Error("[FIRESTORE collection()] Database reference is null or undefined");
  }
  if (!path) {
    throw new Error("[FIRESTORE collection()] Collection path is required");
  }

  if (isClientDbAdapter(target)) {
    const cRef = clientCollection(target.rawFirestore, path);
    return new ClientCollectionRefWrapper(cRef, target.rawFirestore);
  }

  if (isRawFirestore(target)) {
    const cRef = clientCollection(target, path);
    return new ClientCollectionRefWrapper(cRef, target);
  }

  if (isLocalDbAdapter(target)) {
    return new LocalCollectionRefWrapper(path);
  }

  if (target.rawFirestore) {
    const cRef = clientCollection(target.rawFirestore, path);
    return new ClientCollectionRefWrapper(cRef, target.rawFirestore);
  }

  return new LocalCollectionRefWrapper(path);
}

// ----------------------------------------------------------------------------
// 9. UNIFIED CRUD HELPER FUNCTIONS
// ----------------------------------------------------------------------------
export async function getDoc(docRef: any): Promise<ClientDocSnapshotWrapper | LocalDocSnapshotWrapper> {
  if (!docRef) {
    throw new Error("[FIRESTORE getDoc()] Document reference is null or undefined");
  }
  if (docRef instanceof ClientDocRefWrapper || docRef instanceof LocalDocRefWrapper) {
    return await docRef.get();
  }
  if (isRawDocRef(docRef)) {
    const snap = await clientGetDoc(docRef);
    return new ClientDocSnapshotWrapper(snap);
  }
  if (typeof docRef.get === "function") {
    return await docRef.get();
  }
  throw new Error(`[FIRESTORE getDoc()] Unsupported document reference type: ${typeof docRef}`);
}

export async function setDoc(docRef: any, data: any, options?: { merge?: boolean }): Promise<{ success: boolean }> {
  if (!docRef) {
    throw new Error("[FIRESTORE setDoc()] Document reference is null or undefined");
  }
  const cleanData = sanitizeFirestoreData(data);
  if (docRef instanceof ClientDocRefWrapper || docRef instanceof LocalDocRefWrapper) {
    return await docRef.set(cleanData, options);
  }
  if (isRawDocRef(docRef)) {
    if (options && options.merge) {
      await clientSetDoc(docRef, cleanData, { merge: true });
    } else {
      await clientSetDoc(docRef, cleanData);
    }
    return { success: true };
  }
  if (typeof docRef.set === "function") {
    return await docRef.set(cleanData, options);
  }
  throw new Error(`[FIRESTORE setDoc()] Unsupported document reference type: ${typeof docRef}`);
}

export async function updateDoc(docRef: any, data: any): Promise<{ success: boolean }> {
  if (!docRef) {
    throw new Error("[FIRESTORE updateDoc()] Document reference is null or undefined");
  }
  const cleanData = sanitizeFirestoreData(data);
  if (docRef instanceof ClientDocRefWrapper || docRef instanceof LocalDocRefWrapper) {
    return await docRef.update(cleanData);
  }
  if (isRawDocRef(docRef)) {
    await clientUpdateDoc(docRef, cleanData);
    return { success: true };
  }
  if (typeof docRef.update === "function") {
    return await docRef.update(cleanData);
  }
  throw new Error(`[FIRESTORE updateDoc()] Unsupported document reference type: ${typeof docRef}`);
}

export async function deleteDoc(docRef: any): Promise<{ success: boolean }> {
  if (!docRef) {
    throw new Error("[FIRESTORE deleteDoc()] Document reference is null or undefined");
  }
  if (docRef instanceof ClientDocRefWrapper || docRef instanceof LocalDocRefWrapper) {
    return await docRef.delete();
  }
  if (isRawDocRef(docRef)) {
    await clientDeleteDoc(docRef);
    return { success: true };
  }
  if (typeof docRef.delete === "function") {
    return await docRef.delete();
  }
  throw new Error(`[FIRESTORE deleteDoc()] Unsupported document reference type: ${typeof docRef}`);
}

export async function getDocs(colRef: any): Promise<{ size: number; empty: boolean; docs: any[] }> {
  if (!colRef) {
    throw new Error("[FIRESTORE getDocs()] Collection reference is null or undefined");
  }
  if (colRef instanceof ClientCollectionRefWrapper || colRef instanceof LocalCollectionRefWrapper) {
    return await colRef.get();
  }
  if (isRawCollectionRef(colRef) || colRef?._delegate) {
    const snap = await clientGetDocs(colRef.rawRef || colRef);
    return {
      size: snap.size,
      empty: snap.empty,
      docs: snap.docs.map((d: any) => new ClientDocSnapshotWrapper(d))
    };
  }
  if (typeof colRef.get === "function") {
    return await colRef.get();
  }
  throw new Error(`[FIRESTORE getDocs()] Unsupported collection reference type: ${typeof colRef}`);
}

export async function addDoc(colRef: any, data: any): Promise<ClientDocRefWrapper | LocalDocRefWrapper> {
  if (!colRef) {
    throw new Error("[FIRESTORE addDoc()] Collection reference is null or undefined");
  }
  const cleanData = sanitizeFirestoreData(data);
  if (typeof colRef.add === "function") {
    return await colRef.add(cleanData);
  }
  if (isClientCollectionWrapper(colRef) || isRawCollectionRef(colRef)) {
    const raw = colRef.rawRef || colRef;
    const dRef = await clientAddDoc(raw, cleanData);
    return new ClientDocRefWrapper(dRef);
  }
  const id = crypto.randomUUID();
  LocalDatabaseFallback.setDoc(colRef.path || "default", id, cleanData);
  return new LocalDocRefWrapper(colRef.path || "default", id);
}

export function query(colRef: any, ...args: any[]) {
  return colRef;
}

export function where(field: string, op: string, value: any) {
  return { field, op, value };
}
