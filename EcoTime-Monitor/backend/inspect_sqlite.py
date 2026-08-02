import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "ecotime.db")
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [r[0] for r in cur.fetchall() if not r[0].startswith("sqlite_")]
    for t in tables:
        cols = [c[1] for c in cur.execute(f'PRAGMA table_info("{t}")').fetchall()]
        count = cur.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0]
        print(f"Table '{t}' ({count} rows):")
        print(f"  Columns: {cols}")
        if count > 0:
            rows = cur.execute(f'SELECT * FROM "{t}"').fetchall()
            print(f"  Sample row: {rows[0]}")
    conn.close()
