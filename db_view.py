import pandas as pd
from services.database import get_conn, json

def view_with_pandas():
    conn = get_conn()
    # Read directly from the DB
    df = pd.read_sql_query("SELECT id, title, keywords, created_at FROM saved_jds", conn)
    conn.close()
    
    # Optional: Clean up the JSON string columns so they display nicely in pandas
    df['keywords'] = df['keywords'].apply(lambda x: ", ".join(json.loads(x)))
    
    print(df)

view_with_pandas()