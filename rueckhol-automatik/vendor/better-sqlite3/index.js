const { DatabaseSync } = require('node:sqlite');

function normalizeResult(result) {
  if (!result || typeof result !== 'object') return result;
  return {
    changes: Number(result.changes || 0),
    lastInsertRowid: Number(result.lastInsertRowid || 0),
  };
}

function bind(statement, method, params) {
  if (params === undefined) return statement[method]();
  return statement[method](params);
}

class StatementWrapper {
  constructor(statement) {
    this.statement = statement;
  }

  run(params) {
    return normalizeResult(bind(this.statement, 'run', params));
  }

  get(params) {
    return bind(this.statement, 'get', params);
  }

  all(params) {
    return bind(this.statement, 'all', params);
  }

  iterate(params) {
    return bind(this.statement, 'iterate', params);
  }
}

class Database {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
  }

  pragma(sql) {
    this.db.exec(`PRAGMA ${sql}`);
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  prepare(sql) {
    return new StatementWrapper(this.db.prepare(sql));
  }

  transaction(fn) {
    return (...args) => {
      this.db.exec('BEGIN');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          this.db.exec('ROLLBACK');
        } catch (_) {
          // Ignore rollback failures when the transaction never started.
        }
        throw error;
      }
    };
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;
