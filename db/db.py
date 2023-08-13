from pymongo import MongoClient
import csv

# Establish a connection to MongoDB
client = MongoClient('mongodb://127.0.0.1:27017/')

# Access the database
db = client['punchline']

# Access the collection
collection = db['questions']

# Define the objects to be inserted. Insert from a csv file and dump everything that was in the db first ?
objects = []
with open("example.csv", "r", encoding='utf-8') as f:
    reader = csv.DictReader(f, quoting=csv.QUOTE_NONE, fieldnames=['question'], delimiter='\n')
    for line in reader:
        objects.append(line)

# Insert the objects into the collection
result = collection.insert_many(objects)
print(f"Inserted {len(result.inserted_ids)} objects")

# Close the MongoDB connection
client.close()
