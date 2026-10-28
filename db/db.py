"""Seed the Punchline `questions` collection from a semicolon-separated CSV file.

Usage (from anywhere):
    python db/db.py [path/to/questions.csv]

The CSV has no header row; each line is:
    question;reponse_1;reponse_2;reponse_3;explicit
`explicit` must be "true" or "false" (non-premium games only use questions
where explicit == "false"). If the column is missing, "false" is assumed.

The MongoDB URL is read from MONGO_URL, then from `databaseUrl` in
../config.properties, and falls back to mongodb://127.0.0.1:27017/punchline.
Existing documents are kept: running the script twice inserts duplicates.
"""
import csv
import os
import sys

from pymongo import MongoClient

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_URL = "mongodb://127.0.0.1:27017/punchline"
FIELDS = ["question", "reponse_1", "reponse_2", "reponse_3", "explicit"]


def read_database_url():
    if os.environ.get("MONGO_URL"):
        return os.environ["MONGO_URL"]
    config_path = os.path.join(HERE, "..", "config.properties")
    try:
        with open(config_path, encoding="utf-8") as f:
            for line in f:
                key, sep, value = line.partition("=")
                if sep and key.strip() == "databaseUrl":
                    return value.strip()
    except OSError:
        pass
    return DEFAULT_URL


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "example.csv")

    objects = []
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, quoting=csv.QUOTE_NONE, fieldnames=FIELDS, delimiter=";")
        for line in reader:
            if not line.get("question"):
                continue  # skip blank lines
            line.pop(None, None)  # drop extra columns, if any
            line["explicit"] = (line.get("explicit") or "false").strip().lower()
            objects.append(line)

    if not objects:
        print(f"No questions found in {csv_path}, nothing inserted")
        return

    client = MongoClient(read_database_url())
    try:
        # Use the database named in the URL, or "punchline" if none is given
        db = client.get_default_database(default="punchline")
        result = db["questions"].insert_many(objects)
        print(f"Inserted {len(result.inserted_ids)} objects")
    finally:
        client.close()


if __name__ == "__main__":
    main()
