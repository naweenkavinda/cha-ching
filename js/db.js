const DB = (() => {
  'use strict';
  const NAME = 'receipt-snap';
  const STORE = 'expenses';
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }).createIndex('date', 'date');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbp = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database is blocked by another tab'));
    }).catch((e) => { dbp = null; throw e; });
    return dbp;
  }

  function run(mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let result;
      const req = fn(tx.objectStore(STORE));
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    }));
  }

  return {
    all: () => run('readonly', (s) => s.getAll()).then((r) => r || []),
    get: (id) => run('readonly', (s) => s.get(id)),
    put: (rec) => run('readwrite', (s) => s.put(rec)),
    remove: (id) => run('readwrite', (s) => s.delete(id)),
    clear: () => run('readwrite', (s) => s.clear()),
    addMany: (recs) => run('readwrite', (s) => { recs.forEach((r) => s.add(r)); })
  };
})();
