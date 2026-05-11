import { MongoClient, ServerApiVersion } from 'mongodb';
import { apiConfig } from './config.js';

let mongoClient: MongoClient | null = null;

export function createMongoClient(uri = apiConfig.MONGODB_URI) {
  if (!uri) {
    throw new Error('MONGODB_URI is required to connect to MongoDB.');
  }

  return new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
}

export async function getMongoClient() {
  if (!mongoClient) {
    mongoClient = createMongoClient();
  }

  await mongoClient.connect();
  return mongoClient;
}

export async function getMongoDatabase() {
  const databaseName = apiConfig.MONGODB_DB_NAME;

  if (!databaseName) {
    throw new Error('MONGODB_DB_NAME is required to select the MongoDB database.');
  }

  return (await getMongoClient()).db(databaseName);
}

export async function closeMongoClient() {
  if (!mongoClient) {
    return;
  }

  await mongoClient.close();
  mongoClient = null;
}
