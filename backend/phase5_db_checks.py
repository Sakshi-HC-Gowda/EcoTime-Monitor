
from sqlalchemy import text
from app import create_app
from extensions import db

app = create_app()

with app.app_context():
    print("\n===== FOREIGN KEY CONSTRAINTS =====")
    rows = db.session.execute(text("""
        SELECT tc.table_name, kcu.column_name,
               ccu.table_name AS referenced_table,
               ccu.column_name AS referenced_column,
               rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.constraint_schema = kcu.constraint_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.constraint_schema = tc.constraint_schema
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name
         AND rc.constraint_schema = tc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = current_schema()
        ORDER BY tc.table_name, kcu.column_name
    """)).all()
    for row in rows:
        print(row)

    print("\n===== UNIQUE CONSTRAINTS =====")
    rows = db.session.execute(text("""
        SELECT tc.table_name, tc.constraint_name,
               string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position)
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.constraint_schema = kcu.constraint_schema
        WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_schema = current_schema()
        GROUP BY tc.table_name, tc.constraint_name
        ORDER BY tc.table_name
    """)).all()
    for row in rows:
        print(row)

    print("\n===== RELEVANT INDEXES =====")
    rows = db.session.execute(text("""
        SELECT tablename, indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename IN (
            'users', 'organizations', 'activities',
            'eco_point_transactions', 'badges',
            'sustainability_scores', 'organization_members'
          )
        ORDER BY tablename, indexname
    """)).all()
    for row in rows:
        print(row)

    print("\n===== DATABASE =====")
    print("Dialect:", db.engine.dialect.name)
    print("Database:", db.session.execute(
        text("SELECT current_database()")
    ).scalar())

    print("\n===== REWARD OWNERSHIP VALIDATION =====")
    for table_name in (
        "eco_point_transactions",
        "badges",
        "sustainability_scores",
    ):
        for column_name, parent_table in (
            ("user_id", "users"),
            ("organization_id", "organizations"),
        ):
            result = db.session.execute(text(f"""
                SELECT COUNT(*)
                FROM {table_name} reward
                LEFT JOIN {parent_table} parent
                  ON CAST(reward.{column_name} AS TEXT) = CAST(parent.id AS TEXT)
                WHERE reward.{column_name} IS NOT NULL
                  AND parent.id IS NULL
            """)).scalar_one()
            print(f"{table_name}.{column_name} -> {parent_table}.id orphans: {result}")
            print(
                f"{table_name}.{column_name} remains string-based; "
                "no type conversion or foreign key is proposed"
            )
