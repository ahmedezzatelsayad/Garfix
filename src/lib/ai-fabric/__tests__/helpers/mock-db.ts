// @ts-nocheck
/**
 * mock-db.ts — In-memory Prisma mock for ai-fabric tests.
 *
 * Provides a fully-functional mock `db` object that mimics the Prisma client
 * using in-memory arrays. Supports: create, findMany, findUnique, findFirst,
 * findUniqueOrThrow, update, deleteMany, delete, createMany, count, aggregate,
 * upsert, and relational include.
 *
 * Usage in test files:
 *   import { mock } from "bun:test";
 *   import { createMockDb } from "./helpers/mock-db";
 *   mock.module("@/lib/db", () => ({ db: createMockDb() }));
 */

// ─── Where-clause matching ──────────────────────────────────────────────────

/** Known Prisma operators for detecting filter vs composite-key objects. */
const PRISMA_OPERATORS = ["in", "not", "gte", "gt", "lte", "lt", "contains", "startsWith", "endsWith"];

/** Known Prisma relations: model → { relationName → { foreignKey, targetModel, primaryKey } } */
const RELATIONS: Record<string, Record<string, { foreignKey: string; targetModel: string; primaryKey: string }>> = {
  companyRuntime: {
    company: { foreignKey: "companyId", targetModel: "company", primaryKey: "id" },
  },
};

function matchesField(recordValue: any, clauseValue: any): boolean {
  // Treat null and undefined as equivalent for Prisma compatibility
  if ((recordValue === null || recordValue === undefined) &&
      (clauseValue === null || clauseValue === undefined)) {
    return true;
  }
  if (typeof clauseValue === "object" && !Array.isArray(clauseValue) && !(clauseValue instanceof Date)) {
    // Check if this is a Prisma filter operator object
    const hasOperator = PRISMA_OPERATORS.some(op => clauseValue[op] !== undefined);
    if (hasOperator) {
      // Handle Prisma filter operators
      if (clauseValue.in !== undefined) return clauseValue.in.includes(recordValue);
      if (clauseValue.not !== undefined) return recordValue !== clauseValue.not;
      if (clauseValue.gte !== undefined) {
        const r = typeof recordValue === "Date" ? recordValue.getTime() : recordValue;
        const c = typeof clauseValue.gte === "Date" ? clauseValue.gte.getTime() : clauseValue.gte;
        return r >= c;
      }
      if (clauseValue.gt !== undefined) {
        const r = typeof recordValue === "Date" ? recordValue.getTime() : recordValue;
        const c = typeof clauseValue.gt === "Date" ? clauseValue.gt.getTime() : clauseValue.gt;
        return r > c;
      }
      if (clauseValue.lte !== undefined) {
        const r = typeof recordValue === "Date" ? recordValue.getTime() : recordValue;
        const c = typeof clauseValue.lte === "Date" ? clauseValue.lte.getTime() : clauseValue.lte;
        return r <= c;
      }
      if (clauseValue.lt !== undefined) {
        const r = typeof recordValue === "Date" ? recordValue.getTime() : recordValue;
        const c = typeof clauseValue.lt === "Date" ? clauseValue.lt.getTime() : clauseValue.lt;
        return r < c;
      }
      if (clauseValue.contains !== undefined) {
        return String(recordValue).includes(clauseValue.contains);
      }
      return false;
    }
    // Not a Prisma operator — this is a composite unique key match
    // e.g. where: { companySlug_period: { companySlug, period } }
    // Check if all fields in the clauseValue match the corresponding fields on the record
    if (recordValue === null || recordValue === undefined) return false;
    for (const [subKey, subVal] of Object.entries(clauseValue)) {
      if (recordValue[subKey] !== subVal) return false;
    }
    return true;
  }
  // Direct equality (including Date comparison)
  if (recordValue instanceof Date && clauseValue instanceof Date) {
    return recordValue.getTime() === clauseValue.getTime();
  }
  return recordValue === clauseValue;
}

function matchesWhere(record: any, where: any, modelName?: string, stores?: Record<string, any[]>): boolean {
  if (!where) return true;
  for (const [key, val] of Object.entries(where)) {
    if (key === "AND") {
      if (!val.every((w: any) => matchesWhere(record, w, modelName, stores))) return false;
    } else if (key === "OR") {
      if (!val.some((w: any) => matchesWhere(record, w, modelName, stores))) return false;
    } else if (key === "NOT") {
      if (matchesWhere(record, val, modelName, stores)) return false;
    } else if (modelName && RELATIONS[modelName] && RELATIONS[modelName][key]) {
      // Relational filter: where: { company: { slug: "xxx" } }
      const relDef = RELATIONS[modelName][key];
      const targetStore = stores ? (stores[relDef.targetModel] || []) : [];
      const foreignKeyVal = record[relDef.foreignKey];
      const related = targetStore.find((r: any) => r[relDef.primaryKey] === foreignKeyVal);
      if (!related) {
        // No related record — only matches if val requires non-existence
        return false;
      }
      if (!matchesWhere(related, val, relDef.targetModel, stores)) return false;
    } else if (record[key] === undefined && typeof val === "object" && val !== null && !Array.isArray(val) && !(val instanceof Date)) {
      // Composite unique key: where: { companySlug_period: { companySlug, period } }
      // The key doesn't exist as a field on the record — treat it as a composite key
      // by matching each sub-field directly on the record
      for (const [subKey, subVal] of Object.entries(val)) {
        if (record[subKey] !== subVal) return false;
      }
    } else {
      if (!matchesField(record[key], val)) return false;
    }
  }
  return true;
}

// ─── Ordering ───────────────────────────────────────────────────────────────

function applyOrderBy(records: any[], orderBy: any): any[] {
  if (!orderBy) return records;
  const keys = Object.entries(orderBy);
  return records.sort((a, b) => {
    for (const [field, direction] of keys) {
      const aVal = a[field];
      const bVal = b[field];
      if (aVal === bVal) continue;
      const cmp = aVal < bVal ? -1 : 1;
      return direction === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

// ─── Select ─────────────────────────────────────────────────────────────────

function selectFields(record: any, select: any): any {
  if (!select) return record;
  const result: any = {};
  for (const key of Object.keys(select)) {
    if (select[key] === true) {
      result[key] = record[key];
    } else if (typeof select[key] === "object" && select[key] !== null) {
      // Nested select (for includes)
      result[key] = record[key];
    }
  }
  return result;
}

// ─── Include (relational) ───────────────────────────────────────────────────

// Reuse the RELATIONS constant defined above (line 22)

function resolveIncludes(record: any, modelName: string, include: any, stores: Record<string, any[]>): any {
  if (!include) return record;
  const result = { ...record };
  const modelRelations = RELATIONS[modelName] || {};

  for (const [relName, relSelect] of Object.entries(include)) {
    const relDef = modelRelations[relName];
    if (relDef) {
      // Find related record
      const targetStore = stores[relDef.targetModel] || [];
      const related = targetStore.find((r: any) => r[relDef.primaryKey] === record[relDef.foreignKey]);
      if (related) {
        result[relName] = relSelect && relSelect.select ? selectFields(related, relSelect.select) : { ...related };
      } else {
        result[relName] = null;
      }
    }
  }
  return result;
}

// ─── Aggregate ──────────────────────────────────────────────────────────────

function computeAggregate(records: any[], opts: any): any {
  const result: any = {};
  if (opts._sum) {
    result._sum = {};
    for (const field of Object.keys(opts._sum)) {
      if (opts._sum[field] === true) {
        result._sum[field] = records.reduce((sum: number, r: any) => sum + (Number(r[field]) || 0), 0);
      }
    }
  }
  if (opts._count === true) {
    result._count = records.length;
  } else if (opts._count && typeof opts._count === "object") {
    result._count = {};
    for (const field of Object.keys(opts._count)) {
      if (opts._count[field] === true) {
        result._count[field] = records.filter((r: any) => r[field] !== null).length;
      }
    }
  }
  if (opts._avg) {
    result._avg = {};
    for (const field of Object.keys(opts._avg)) {
      if (opts._avg[field] === true) {
        const values = records.map((r: any) => Number(r[field]) || 0);
        result._avg[field] = values.length > 0
          ? values.reduce((a: number, b: number) => a + b, 0) / values.length
          : 0;
      }
    }
  }
  return result;
}

// ─── Deep clone helper ─────────────────────────────────────────────────────

function deepClone(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(deepClone);
  const result: any = {};
  for (const key of Object.keys(obj)) {
    result[key] = deepClone(obj[key]);
  }
  return result;
}

// ─── Mock DB factory ────────────────────────────────────────────────────────

export function createMockDb(): any {
  const stores: Record<string, any[]> = {};
  let nextId = 1;

  function getStore(name: string): any[] {
    if (!stores[name]) stores[name] = [];
    return stores[name];
  }

  /** Reset all stores — for test isolation. */
  function _resetAll() {
    for (const key of Object.keys(stores)) {
      stores[key] = [];
    }
    nextId = 1;
  }

  /** Create model handlers for a given model name. */
  /** Apply Prisma-like defaults for common timestamp fields. */
  const TIMESTAMP_DEFAULTS = ["createdAt", "updatedAt", "lastAccessedAt", "scheduledAt", "startedAt", "expiresAt"];

  function applyTimestampDefaults(data: any): any {
    const now = new Date();
    const result = { ...data };
    for (const field of TIMESTAMP_DEFAULTS) {
      if (result[field] === undefined) {
        result[field] = now;
      }
    }
    return result;
  }

  function createModel(name: string): any {
    return {
      create: async ({ data }: { data: any }): Promise<any> => {
        const id = nextId++;
        const record = { id, ...deepClone(applyTimestampDefaults(data)) };
        getStore(name).push(record);
        return deepClone(record);
      },

      createMany: async ({ data }: { data: any[] }): Promise<{ count: number }> => {
        if (Array.isArray(data)) {
          for (const item of data) {
            const id = nextId++;
            const record = { id, ...deepClone(applyTimestampDefaults(item)) };
            getStore(name).push(record);
          }
          return { count: data.length };
        }
        return { count: 0 };
      },

      findMany: async (opts: any = {}): Promise<any[]> => {
        let records = [...getStore(name)];
        if (opts.where) records = records.filter((r: any) => matchesWhere(r, opts.where, name, stores));
        if (opts.orderBy) records = applyOrderBy(records, opts.orderBy);
        if (opts.take) records = records.slice(0, opts.take);
        if (opts.select) records = records.map((r: any) => selectFields(r, opts.select));
        // Resolve includes
        if (opts.include) {
          records = records.map((r: any) => resolveIncludes(r, name, opts.include, stores));
        }
        return records.map(deepClone);
      },

      findUnique: async ({ where }: { where: any }): Promise<any | null> => {
        const records = getStore(name);
        const found = records.find((r: any) => matchesWhere(r, where, name, stores));
        return found ? deepClone(found) : null;
      },

      findFirst: async (opts: any = {}): Promise<any | null> => {
        let records = [...getStore(name)];
        if (opts.where) records = records.filter((r: any) => matchesWhere(r, opts.where, name, stores));
        if (opts.orderBy) records = applyOrderBy(records, opts.orderBy);
        const found = records[0];
        return found ? deepClone(found) : null;
      },

      findUniqueOrThrow: async ({ where }: { where: any }): Promise<any> => {
        const records = getStore(name);
        const found = records.find((r: any) => matchesWhere(r, where, name, stores));
        if (!found) throw new Error(`Record not found in ${name} with where=${JSON.stringify(where)}`);
        return deepClone(found);
      },

      update: async ({ where, data }: { where: any; data: any }): Promise<any> => {
        const store = getStore(name);
        const idx = store.findIndex((r: any) => matchesWhere(r, where, name, stores));
        if (idx === -1) throw new Error(`Record not found in ${name} for update`);
        // Handle Prisma atomic operations like { increment: val }
        const resolvedData: any = {};
        for (const [key, val] of Object.entries(data)) {
          if (typeof val === "object" && val !== null && !Array.isArray(val) && !(val instanceof Date)) {
            if (val.increment !== undefined) {
              resolvedData[key] = (store[idx][key] || 0) + val.increment;
            } else if (val.decrement !== undefined) {
              resolvedData[key] = (store[idx][key] || 0) - val.decrement;
            } else if (val.set !== undefined) {
              resolvedData[key] = val.set;
            } else {
              resolvedData[key] = val;
            }
          } else {
            resolvedData[key] = val;
          }
        }
        Object.assign(store[idx], deepClone(resolvedData));
        return deepClone(store[idx]);
      },

      updateMany: async ({ where, data }: { where?: any; data: any }): Promise<{ count: number }> => {
        const store = getStore(name);
        let targets = [...store];
        if (where) targets = targets.filter((r: any) => matchesWhere(r, where, name, stores));
        for (const t of targets) {
          const idx = store.indexOf(t);
          if (idx !== -1) {
            const resolvedData: any = {};
            for (const [key, val] of Object.entries(data)) {
              if (typeof val === "object" && val !== null && val.increment !== undefined) {
                resolvedData[key] = (store[idx][key] || 0) + val.increment;
              } else {
                resolvedData[key] = val;
              }
            }
            Object.assign(store[idx], deepClone(resolvedData));
          }
        }
        return { count: targets.length };
      },

      deleteMany: async (opts: any = {}): Promise<{ count: number }> => {
        const store = getStore(name);
        if (!opts || !opts.where) {
          const count = store.length;
          store.length = 0;
          return { count };
        }
        const before = store.length;
        for (let i = store.length - 1; i >= 0; i--) {
          if (matchesWhere(store[i], opts.where, name, stores)) {
            store.splice(i, 1);
          }
        }
        return { count: before - store.length };
      },

      delete: async ({ where }: { where: any }): Promise<any> => {
        const store = getStore(name);
        const idx = store.findIndex((r: any) => matchesWhere(r, where, name, stores));
        if (idx === -1) throw new Error(`Record not found in ${name} for delete`);
        const record = store.splice(idx, 1)[0];
        return deepClone(record);
      },

      count: async (opts: any = {}): Promise<number> => {
        let records = getStore(name);
        if (opts.where) records = records.filter((r: any) => matchesWhere(r, opts.where, name, stores));
        return records.length;
      },

      aggregate: async (opts: any = {}): Promise<any> => {
        let records = [...getStore(name)];
        if (opts.where) records = records.filter((r: any) => matchesWhere(r, opts.where, name, stores));
        return computeAggregate(records, opts);
      },

      upsert: async ({ where, create, update }: { where: any; create: any; update: any }): Promise<any> => {
        const store = getStore(name);
        const existing = store.find((r: any) => matchesWhere(r, where, name, stores));
        if (existing) {
          const resolvedUpdate: any = {};
          for (const [key, val] of Object.entries(update)) {
            if (typeof val === "object" && val !== null && val.increment !== undefined) {
              resolvedUpdate[key] = (existing[key] || 0) + val.increment;
            } else {
              resolvedUpdate[key] = val;
            }
          }
          Object.assign(existing, deepClone(resolvedUpdate));
          return deepClone(existing);
        } else {
          const id = nextId++;
          const record = { id, ...deepClone(applyTimestampDefaults(create)) };
          store.push(record);
          return deepClone(record);
        }
      },

      groupBy: async (opts: any = {}): Promise<any[]> => {
        let records = [...getStore(name)];
        if (opts.where) records = records.filter((r: any) => matchesWhere(r, opts.where, name, stores));
        const byFields: string[] = opts.by || [];
        // Group records by the specified fields
        const groups = new Map<string, { key: any; records: any[] }>();
        for (const r of records) {
          const keyObj: any = {};
          for (const f of byFields) keyObj[f] = r[f];
          const keyStr = JSON.stringify(keyObj);
          if (!groups.has(keyStr)) groups.set(keyStr, { key: keyObj, records: [] });
          groups.get(keyStr)!.records.push(r);
        }
        // Build result with _count and _sum
        const result: any[] = [];
        for (const { key, records: groupRecords } of groups.values()) {
          const entry: any = { ...key };
          if (opts._count === true) {
            entry._count = groupRecords.length;
          }
          if (opts._sum) {
            entry._sum = {};
            for (const field of Object.keys(opts._sum)) {
              if (opts._sum[field] === true) {
                entry._sum[field] = groupRecords.reduce((sum: number, r: any) => sum + (Number(r[field]) || 0), 0);
              }
            }
          }
          if (opts._avg) {
            entry._avg = {};
            for (const field of Object.keys(opts._avg)) {
              if (opts._avg[field] === true) {
                entry._avg[field] = groupRecords.length > 0
                  ? groupRecords.reduce((sum: number, r: any) => sum + (Number(r[field]) || 0), 0) / groupRecords.length
                  : 0;
              }
            }
          }
          result.push(entry);
        }
        // Sort by _count descending if orderBy._count is specified
        if (opts.orderBy && opts.orderBy._count) {
          const dir = opts.orderBy._count[byFields[0]] || "desc";
          result.sort((a, b) => {
            const cmp = (a._count || 0) - (b._count || 0);
            return dir === "desc" ? -cmp : cmp;
          });
        }
        return result;
      },
    };
  }

  // Build the db object with all models used across the 5 test files
  const db = {
    company: createModel("company"),
    companyRuntime: createModel("companyRuntime"),
    budgetConfig: createModel("budgetConfig"),
    jobQueue: createModel("jobQueue"),
    aIRequestLog: createModel("aIRequestLog"),
    notification: createModel("notification"),
    cacheEntry: createModel("cacheEntry"),
    aIMemoryEntry: createModel("aIMemoryEntry"),
    providerConfig: createModel("providerConfig"),
    ruleCandidate: createModel("ruleCandidate"),
    globalPattern: createModel("globalPattern"),
    aIScoreSnapshot: createModel("aIScoreSnapshot"),
    compiledRule: createModel("compiledRule"),
    invoice: createModel("invoice"),
    profitSnapshot: createModel("profitSnapshot"),
    client: createModel("client"),
    inventoryItem: createModel("inventoryItem"),
    warehouse: createModel("warehouse"),
    productCatalog: createModel("productCatalog"),

    // Utility for test reset
    _resetAll,
    _getStore: getStore,
    _nextId: () => nextId,
  };

  return db;
}

// ─── Shared singleton mock db ──────────────────────────────────────────────
/**
 * All test files that mock @/lib/db should use this shared singleton
 * to avoid cross-file mock.module conflicts. Since mock.module in bun:test
 * is global (applies to ALL files), each file's mock.module("@/lib/db", ...)
 * call needs to point to the same instance, otherwise test data created in
 * one file's local mock db won't be visible to source modules that use the
 * "winning" mock.module's instance.
 *
 * Usage:
 *   import { sharedMockDb } from "./helpers/mock-db";
 *   mock.module("@/lib/db", () => ({ db: sharedMockDb }));
 *   const db = sharedMockDb;  // use in test code too
 */

let _sharedDb: any = null;

export function getSharedMockDb(): any {
  if (!_sharedDb) _sharedDb = createMockDb();
  return _sharedDb;
}

/** Convenience alias — returns the shared singleton mock db. */
export const sharedMockDb = getSharedMockDb();
