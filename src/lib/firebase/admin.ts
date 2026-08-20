// =============================================================================
// lib/firebase/admin.ts
// =============================================================================
// Firestore REST API Wrapper — ใช้แทน firebase-admin (StackBlitz compatible)
//
// Upgrades จาก version เดิม:
//   - orderBy()         — เรียงผลลัพธ์ตาม field
//   - >=, <=, >, <, !=  — range query operators
//   - in operator       — query หลาย value พร้อมกัน
//   - update()          — ใช้ updateMask (ไม่เขียนทับ field อื่น)
//   - FieldValue        — serverTimestamp(), increment(), delete()
//   - Timestamp         — compat layer
// =============================================================================

const PROJECT_ID = 'ilpea-hr-system';
const API_KEY = 'AIzaSyC8qkbCONQFowxeS67_3RzTqxKDrzm6LHQ';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// =============================================================================
// FieldValue Sentinel
// =============================================================================

class FieldValueSentinel {
  constructor(private type: string, private payload?: any) {}
  toFirestore(): any {
    if (this.type === 'serverTimestamp')
      return { timestampValue: new Date().toISOString() };
    if (this.type === 'increment') return { doubleValue: this.payload };
    if (this.type === 'arrayUnion')
      return {
        arrayValue: { values: (this.payload || []).map(toFirestoreValue) },
      };
    if (this.type === 'delete') return { nullValue: null };
    return { nullValue: null };
  }
}

export const FieldValue = {
  serverTimestamp: () => new FieldValueSentinel('serverTimestamp'),
  increment: (n: number) => new FieldValueSentinel('increment', n),
  arrayUnion: (...items: any[]) => new FieldValueSentinel('arrayUnion', items),
  arrayRemove: (...items: any[]) =>
    new FieldValueSentinel('arrayRemove', items),
  delete: () => new FieldValueSentinel('delete'),
};

// =============================================================================
// Timestamp (compat)
// =============================================================================

export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number = 0) {}
  static fromDate(date: Date) {
    return new Timestamp(Math.floor(date.getTime() / 1000));
  }
  static now() {
    return Timestamp.fromDate(new Date());
  }
  toDate() {
    return new Date(this.seconds * 1000);
  }
  toMillis() {
    return this.seconds * 1000;
  }
  toISOString() {
    return this.toDate().toISOString();
  }
}

// =============================================================================
// Value Converters
// =============================================================================

function toFirestoreValue(value: any): any {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof FieldValueSentinel) return value.toFirestore();
  if (value instanceof Timestamp)
    return { timestampValue: value.toISOString() };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number')
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function fromFirestoreValue(value: any): any {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return new Date(value.timestampValue);
  if ('arrayValue' in value)
    return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) {
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
      obj[k] = fromFirestoreValue(v as any);
    }
    return obj;
  }
  return null;
}

function fromFirestoreDoc(doc: any): Record<string, any> | null {
  if (!doc?.fields) return null;
  const obj: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc.fields))
    obj[k] = fromFirestoreValue(v as any);
  return obj;
}

// =============================================================================
// Operator Mapping
// =============================================================================

const OP_MAP: Record<string, string> = {
  '==': 'EQUAL',
  '!=': 'NOT_EQUAL',
  '<': 'LESS_THAN',
  '<=': 'LESS_THAN_OR_EQUAL',
  '>': 'GREATER_THAN',
  '>=': 'GREATER_THAN_OR_EQUAL',
  in: 'IN',
  'not-in': 'NOT_IN',
  'array-contains': 'ARRAY_CONTAINS',
  'array-contains-any': 'ARRAY_CONTAINS_ANY',
};

function buildFilter(
  filters: Array<{ field: string; op: string; value: any }>
): any {
  const makeOne = (f: { field: string; op: string; value: any }) => {
    if (f.op === 'in' || f.op === 'not-in' || f.op === 'array-contains-any') {
      return {
        fieldFilter: {
          field: { fieldPath: f.field },
          op: OP_MAP[f.op],
          value: {
            arrayValue: {
              values: (Array.isArray(f.value) ? f.value : [f.value]).map(
                toFirestoreValue
              ),
            },
          },
        },
      };
    }
    return {
      fieldFilter: {
        field: { fieldPath: f.field },
        op: OP_MAP[f.op] ?? 'EQUAL',
        value: toFirestoreValue(f.value),
      },
    };
  };
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return makeOne(filters[0]);
  return { compositeFilter: { op: 'AND', filters: filters.map(makeOne) } };
}

// =============================================================================
// Query Reference
// =============================================================================

interface Filter {
  field: string;
  op: string;
  value: any;
}
interface OrderBy {
  field: string;
  direction: 'ASCENDING' | 'DESCENDING';
}

class QueryRef {
  protected _filters: Filter[] = [];
  protected _orders: OrderBy[] = [];
  protected _limit: number = 500;

  constructor(protected collectionName: string, filters: Filter[] = []) {
    this._filters = [...filters];
  }

  where(field: string, op: string, value: any): QueryRef {
    const q = this._clone();
    q._filters = [...this._filters, { field, op, value }];
    return q;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryRef {
    const q = this._clone();
    q._orders = [
      ...this._orders,
      { field, direction: direction === 'asc' ? 'ASCENDING' : 'DESCENDING' },
    ];
    return q;
  }

  limit(n: number): QueryRef {
    const q = this._clone();
    q._limit = n;
    return q;
  }

  protected _clone(): QueryRef {
    const q = new QueryRef(this.collectionName, [...this._filters]);
    q._orders = [...this._orders];
    q._limit = this._limit;
    return q;
  }

  async get() {
    const structuredQuery: any = {
      from: [{ collectionId: this.collectionName }],
      limit: this._limit,
    };
    const where = buildFilter(this._filters);
    if (where) structuredQuery.where = where;
    if (this._orders.length > 0) {
      structuredQuery.orderBy = this._orders.map((o) => ({
        field: { fieldPath: o.field },
        direction: o.direction,
      }));
    }

    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery }),
      }
    );
    const results = await res.json();
    if (!res.ok)
      throw new Error(`Firestore query failed: ${JSON.stringify(results)}`);

    const docs = (Array.isArray(results) ? results : [])
      .filter((r: any) => r.document)
      .map((r: any) => ({
        id: r.document.name.split('/').pop() as string,
        data: () => fromFirestoreDoc(r.document) as Record<string, any>,
      }));

    return { empty: docs.length === 0, docs, size: docs.length };
  }
}

// =============================================================================
// Doc Reference
// =============================================================================

export class DocRef {
  constructor(public collectionName: string, public docId: string) {}

  get id() {
    return this.docId;
  }

  collection(sub: string) {
    return new CollectionRef(`${this.collectionName}/${this.docId}/${sub}`);
  }

  async get() {
    const res = await fetch(
      `${FIRESTORE_URL}/${this.collectionName}/${this.docId}?key=${API_KEY}`
    );
    if (res.status === 404)
      return { exists: false, id: this.docId, data: () => null };
    const result = await res.json();
    if (!res.ok)
      throw new Error(`Firestore get failed: ${JSON.stringify(result)}`);
    const data = fromFirestoreDoc(result);
    return { exists: !!data, id: this.docId, data: () => data };
  }

  async set(data: Record<string, any>, _options?: { merge?: boolean }) {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(data))
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    const res = await fetch(
      `${FIRESTORE_URL}/${this.collectionName}/${this.docId}?key=${API_KEY}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      }
    );
    const result = await res.json();
    if (!res.ok)
      throw new Error(`Firestore set failed: ${JSON.stringify(result)}`);
    return result;
  }

  async update(data: Record<string, any>) {
    // ใช้ updateMask — เฉพาะ fields ที่ส่งมา ไม่ลบ field อื่น
    const fields: Record<string, any> = {};
    const mask: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
        mask.push(k);
      }
    }
    const maskQuery = mask
      .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
      .join('&');
    const res = await fetch(
      `${FIRESTORE_URL}/${this.collectionName}/${this.docId}?key=${API_KEY}&${maskQuery}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      }
    );
    const result = await res.json();
    if (!res.ok)
      throw new Error(`Firestore update failed: ${JSON.stringify(result)}`);
    return result;
  }

  async delete() {
    const res = await fetch(
      `${FIRESTORE_URL}/${this.collectionName}/${this.docId}?key=${API_KEY}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(`Firestore delete failed: ${res.status}`);
  }

  // internal alias
  async _set(data: Record<string, any>) {
    return this.set(data);
  }
  async _delete() {
    return this.delete();
  }
}

// =============================================================================
// Collection Reference
// =============================================================================

export class CollectionRef {
  constructor(public collectionName: string) {}

  doc(docId: string) {
    return new DocRef(this.collectionName, docId);
  }

  async add(data: Record<string, any>) {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(data))
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    const res = await fetch(
      `${FIRESTORE_URL}/${this.collectionName}?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      }
    );
    const result = await res.json();
    if (!res.ok)
      throw new Error(`Firestore add failed: ${JSON.stringify(result)}`);
    return { id: result.name.split('/').pop() as string };
  }

  where(field: string, op: string, value: any) {
    return new QueryRef(this.collectionName, [{ field, op, value }]);
  }
  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    return new QueryRef(this.collectionName).orderBy(field, dir);
  }
  limit(n: number) {
    return new QueryRef(this.collectionName).limit(n);
  }
}

// =============================================================================
// Batch Writer
// =============================================================================

class BatchWriter {
  private ops: Array<() => Promise<any>> = [];

  set(ref: DocRef, data: Record<string, any>, opts?: { merge?: boolean }) {
    this.ops.push(() => ref.set(data, opts));
    return this;
  }
  update(ref: DocRef, data: Record<string, any>) {
    this.ops.push(() => ref.update(data));
    return this;
  }
  delete(ref: DocRef) {
    this.ops.push(() => ref.delete());
    return this;
  }
  async commit() {
    for (const op of this.ops) await op();
  }
}

// =============================================================================
// Exports
// =============================================================================

export const adminDb = {
  collection: (name: string) => new CollectionRef(name),
  batch: () => new BatchWriter(),
  doc: (path: string) => {
    const parts = path.split('/');
    const docId = parts.pop()!;
    return new DocRef(parts.join('/'), docId);
  },
};

export const adminAuth = {
  createCustomToken: async (uid: string) => `dev-token-${uid}`,
};

export default adminDb;
