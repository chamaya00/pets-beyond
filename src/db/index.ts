import { Pool } from 'pg';
import { Pet, User, JournalEntry, Friendship, UserPublic, PetAppearance } from '../types';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),

  pets: {
    async getAlive(): Promise<Pet[]> {
      const result = await pool.query(
        'SELECT * FROM pets WHERE is_alive = true'
      );
      return result.rows.map(mapPetRow);
    },

    async getById(id: string): Promise<Pet | null> {
      const result = await pool.query(
        'SELECT * FROM pets WHERE id = $1',
        [id]
      );
      return result.rows[0] ? mapPetRow(result.rows[0]) : null;
    },

    async getByOwner(ownerId: string): Promise<Pet[]> {
      const result = await pool.query(
        'SELECT * FROM pets WHERE owner_id = $1 ORDER BY created_at DESC',
        [ownerId]
      );
      return result.rows.map(mapPetRow);
    },

    async create(pet: Omit<Pet, 'id' | 'createdAt' | 'updatedAt'>): Promise<Pet> {
      const result = await pool.query(
        `INSERT INTO pets (owner_id, name, hp, hunger, boldness, sociability, region_id, is_alive, days_alive, appearance)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [pet.ownerId, pet.name, pet.hp, pet.hunger, pet.boldness, pet.sociability, pet.regionId, pet.isAlive, pet.daysAlive, pet.appearance]
      );
      return mapPetRow(result.rows[0]);
    },

    async update(id: string, updates: Partial<Pet>): Promise<Pet> {
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          fields.push(`${toSnakeCase(key)} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      fields.push(`updated_at = NOW()`);
      values.push(id);

      const result = await pool.query(
        `UPDATE pets SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      return mapPetRow(result.rows[0]);
    },

    async countByOwner(ownerId: string): Promise<number> {
      const result = await pool.query(
        'SELECT COUNT(*) FROM pets WHERE owner_id = $1',
        [ownerId]
      );
      return parseInt(result.rows[0].count, 10);
    },
  },

  journal: {
    async create(entry: Omit<JournalEntry, 'id' | 'createdAt'>): Promise<JournalEntry> {
      const result = await pool.query(
        `INSERT INTO journal_entries (pet_id, day, region_id, text, is_significant, is_final)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [entry.petId, entry.day, entry.regionId, entry.text, entry.isSignificant, entry.isFinal]
      );
      return mapJournalRow(result.rows[0]);
    },

    async getByPet(petId: string): Promise<JournalEntry[]> {
      const result = await pool.query(
        'SELECT * FROM journal_entries WHERE pet_id = $1 ORDER BY day DESC',
        [petId]
      );
      return result.rows.map(mapJournalRow);
    },

    async getByPetAndRegion(petId: string, regionId: string): Promise<JournalEntry[]> {
      const result = await pool.query(
        'SELECT * FROM journal_entries WHERE pet_id = $1 AND region_id = $2 ORDER BY day DESC',
        [petId, regionId]
      );
      return result.rows.map(mapJournalRow);
    },
  },

  friendships: {
    async create(friendship: Omit<Friendship, 'createdAt'>): Promise<Friendship> {
      const result = await pool.query(
        `INSERT INTO friendships (pet_a_id, pet_b_id, formed_on_day, region_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [friendship.petAId, friendship.petBId, friendship.formedOnDay, friendship.regionId]
      );
      return mapFriendshipRow(result.rows[0]);
    },

    async exists(petAId: string, petBId: string): Promise<boolean> {
      const result = await pool.query(
        `SELECT 1 FROM friendships
         WHERE (pet_a_id = $1 AND pet_b_id = $2) OR (pet_a_id = $2 AND pet_b_id = $1)`,
        [petAId, petBId]
      );
      return result.rows.length > 0;
    },

    async getByPet(petId: string): Promise<Friendship[]> {
      const result = await pool.query(
        `SELECT * FROM friendships
         WHERE pet_a_id = $1 OR pet_b_id = $1`,
        [petId]
      );
      return result.rows.map(mapFriendshipRow);
    },

    async getByPetAndRegion(petId: string, regionId: string): Promise<Friendship[]> {
      const result = await pool.query(
        `SELECT * FROM friendships
         WHERE (pet_a_id = $1 OR pet_b_id = $1) AND region_id = $2`,
        [petId, regionId]
      );
      return result.rows.map(mapFriendshipRow);
    },
  },

  users: {
    async getById(id: string): Promise<User | null> {
      const result = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );
      return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    },

    async getByEmail(email: string): Promise<User | null> {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      return result.rows[0] ? mapUserRow(result.rows[0]) : null;
    },

    async create(email: string, passwordHash: string): Promise<User> {
      const result = await pool.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
        [email, passwordHash]
      );
      return mapUserRow(result.rows[0]);
    },

    async updateSubscription(id: string, status: string, expiresAt: Date | null): Promise<User> {
      const result = await pool.query(
        'UPDATE users SET subscription_status = $1, subscription_expires_at = $2 WHERE id = $3 RETURNING *',
        [status, expiresAt, id]
      );
      return mapUserRow(result.rows[0]);
    },
  },

  simulation: {
    async getCurrentTick(): Promise<number> {
      const result = await pool.query(
        "SELECT value FROM simulation_state WHERE key = 'current_tick'"
      );
      return result.rows[0]?.value || 0;
    },

    async incrementTick(): Promise<number> {
      const result = await pool.query(
        "UPDATE simulation_state SET value = value + 1 WHERE key = 'current_tick' RETURNING value"
      );
      return result.rows[0].value;
    },
  },
};

// Helper functions
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

interface PetRow {
  id: string;
  owner_id: string;
  name: string;
  hp: number;
  hunger: number;
  boldness: number;
  sociability: number;
  region_id: string;
  is_alive: boolean;
  days_alive: number;
  appearance: PetAppearance | null;
  created_at: Date;
  updated_at: Date;
}

function mapPetRow(row: PetRow): Pet {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    hp: row.hp,
    hunger: row.hunger,
    boldness: row.boldness,
    sociability: row.sociability,
    regionId: row.region_id,
    isAlive: row.is_alive,
    daysAlive: row.days_alive,
    appearance: row.appearance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface JournalRow {
  id: string;
  pet_id: string;
  day: number;
  region_id: string;
  text: string;
  is_significant: boolean;
  is_final: boolean;
  created_at: Date;
}

function mapJournalRow(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    petId: row.pet_id,
    day: row.day,
    regionId: row.region_id,
    text: row.text,
    isSignificant: row.is_significant,
    isFinal: row.is_final,
    createdAt: row.created_at,
  };
}

interface FriendshipRow {
  pet_a_id: string;
  pet_b_id: string;
  formed_on_day: number;
  region_id: string;
  created_at: Date;
}

function mapFriendshipRow(row: FriendshipRow): Friendship {
  return {
    petAId: row.pet_a_id,
    petBId: row.pet_b_id,
    formedOnDay: row.formed_on_day,
    regionId: row.region_id,
    createdAt: row.created_at,
  };
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  subscription_status: 'free' | 'subscribed' | 'lapsed';
  subscription_expires_at: Date | null;
  created_at: Date;
}

function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    subscriptionStatus: row.subscription_status,
    subscriptionExpiresAt: row.subscription_expires_at,
    createdAt: row.created_at,
  };
}

// Helper to strip sensitive fields from User for API responses
export function sanitizeUser(user: User): UserPublic {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

export default db;
