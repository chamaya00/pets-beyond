# The Beyond: Implementation Plan for Claude Code

## Overview

This document provides a phased implementation plan for "The Beyond" - a persistent server-side pet simulation. Copy this into Claude Code to guide implementation.

## Deployment Strategy

### MVP Hosting (Month 1 - Test Period)

**Backend & Database: Render (Free Tier)**
- Node.js backend on Render Free Web Service (spins down after 15 min idle)
- PostgreSQL on Render Free Database (**30-day expiration limit**)
- GitHub auto-deploy enabled on push to main branch
- Minimal user data storage during test period

**Frontend: Vercel (Free Tier)**
- Next.js hosted on Vercel
- GitHub auto-deploy on push

**Authentication: Simple MVP**
- Email/password authentication (no OAuth complexity initially)
- Store only essential user data: email, subscription status
- No sensitive PII during test period

### Production Upgrade (Within Month 1)

**Required Upgrades Before Database Expiry:**
- Render PostgreSQL Starter ($7/mo) - persistent database with backups
- Consider Render Web Service Starter ($7/mo) - eliminates sleep behavior

**Total Cost**: $7-14/month for production-ready setup

**Why This Approach:**
- Zero upfront cost to validate the concept
- 30 days to test with real users before committing to paid tier
- Straightforward migration path (same platform, just upgrade tier)
- GitHub auto-deploy works the same on free and paid tiers

-----

## Project Structure

```
beyond/
├── package.json
├── tsconfig.json
├── .env.example
├── docker-compose.yml          # Postgres for local dev
├── src/
│   ├── index.ts                # Entry point
│   ├── config.ts               # Environment config
│   ├── db/
│   │   ├── index.ts            # Database connection
│   │   ├── schema.sql          # SQL schema
│   │   └── migrations/
│   ├── models/
│   │   ├── pet.ts
│   │   ├── user.ts
│   │   ├── journal.ts
│   │   └── friendship.ts
│   ├── simulation/
│   │   ├── tick.ts             # Main tick loop
│   │   ├── actions.ts          # Action resolution
│   │   ├── social.ts           # Friendship processing
│   │   └── death.ts            # Death handling
│   ├── api/
│   │   ├── router.ts           # Express router
│   │   ├── pets.ts             # Pet endpoints
│   │   ├── users.ts            # User endpoints
│   │   └── middleware/
│   │       ├── auth.ts
│   │       └── visibility.ts   # Subscription-based filtering
│   ├── notifications/
│   │   ├── index.ts
│   │   └── templates.ts
│   ├── templates/
│   │   └── journal.ts          # Journal text templates
│   ├── dev/
│   │   └── seed.ts             # Developer tools (test pets, etc.)
│   └── types/
│       └── index.ts            # TypeScript interfaces
├── web/                        # Website (Next.js or similar)
│   ├── pages/
│   │   ├── index.tsx
│   │   ├── pet/[id].tsx
│   │   └── my-pets.tsx
│   └── components/
└── tests/
    ├── simulation.test.ts
    └── api.test.ts
```

-----

## Phase 1: Database & Core Models

### Goal

Set up database schema and basic CRUD operations.

### Tasks

1. **Set up project**

   ```bash
   mkdir beyond && cd beyond
   npm init -y
   npm install typescript ts-node @types/node express pg dotenv bcrypt jsonwebtoken
   npm install -D nodemon @types/bcrypt @types/jsonwebtoken
   npx tsc --init
   ```

2. **Set up Render PostgreSQL (Free - 30 Day Test Period)**

   **IMPORTANT: Free Render databases expire after 30 days. Plan to upgrade to paid tier ($7/mo) within the first month if keeping user data.**

   - Create Render account and link GitHub repository
   - Create new PostgreSQL instance (Free tier: 1 GB, expires in 30 days)
   - Copy `DATABASE_URL` (Internal Database URL) from Render dashboard
   - Add to `.env` file locally and to Render Web Service environment variables

   **Migration to Paid Tier Checklist (Before Day 25):**
   - [ ] Upgrade database to Starter tier ($7/mo)
   - [ ] Verify backups are enabled
   - [ ] Test connection from backend
   - [ ] Update any hardcoded references to database URL

3. **Create database schema** (`src/db/schema.sql`)

   ```sql
   -- Users
   CREATE TABLE users (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       email VARCHAR(255) UNIQUE NOT NULL,
       password_hash VARCHAR(255) NOT NULL,
       subscription_status VARCHAR(50) DEFAULT 'free',
       subscription_expires_at TIMESTAMP,
       created_at TIMESTAMP DEFAULT NOW()
   );

   CREATE INDEX idx_users_email ON users(email);

   -- Pets
   CREATE TABLE pets (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       owner_id UUID REFERENCES users(id),
       name VARCHAR(100) NOT NULL,

       hp INTEGER NOT NULL DEFAULT 100,
       hunger INTEGER NOT NULL DEFAULT 100,

       boldness FLOAT NOT NULL,
       sociability FLOAT NOT NULL,

       region_id VARCHAR(100) NOT NULL DEFAULT 'meadow_commons',

       is_alive BOOLEAN DEFAULT TRUE,
       days_alive INTEGER DEFAULT 0,

       appearance JSONB,

       created_at TIMESTAMP DEFAULT NOW(),
       updated_at TIMESTAMP DEFAULT NOW()
   );

   CREATE INDEX idx_pets_alive ON pets(is_alive) WHERE is_alive = TRUE;
   CREATE INDEX idx_pets_owner ON pets(owner_id);
   CREATE INDEX idx_pets_region ON pets(region_id);

   -- Friendships
   CREATE TABLE friendships (
       pet_a_id UUID REFERENCES pets(id),
       pet_b_id UUID REFERENCES pets(id),
       formed_on_day INTEGER NOT NULL,
       region_id VARCHAR(100) NOT NULL,
       created_at TIMESTAMP DEFAULT NOW(),
       PRIMARY KEY (pet_a_id, pet_b_id)
   );

   CREATE INDEX idx_friendships_a ON friendships(pet_a_id);
   CREATE INDEX idx_friendships_b ON friendships(pet_b_id);

   -- Journal Entries
   CREATE TABLE journal_entries (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       pet_id UUID REFERENCES pets(id),
       day INTEGER NOT NULL,
       region_id VARCHAR(100) NOT NULL,
       text TEXT NOT NULL,
       is_significant BOOLEAN DEFAULT FALSE,
       is_final BOOLEAN DEFAULT FALSE,
       created_at TIMESTAMP DEFAULT NOW()
   );

   CREATE INDEX idx_journal_pet ON journal_entries(pet_id);
   CREATE INDEX idx_journal_pet_region ON journal_entries(pet_id, region_id);

   -- Simulation State
   CREATE TABLE simulation_state (
       key VARCHAR(100) PRIMARY KEY,
       value INTEGER NOT NULL
   );

   INSERT INTO simulation_state (key, value) VALUES ('current_tick', 0);
   ```

3. **Create TypeScript types** (`src/types/index.ts`)

   ```typescript
   export interface User {
     id: string;
     email: string;
     passwordHash: string; // Never expose in API responses
     subscriptionStatus: 'free' | 'subscribed' | 'lapsed';
     subscriptionExpiresAt: Date | null;
     createdAt: Date;
   }

   export interface UserPublic {
     id: string;
     email: string;
     subscriptionStatus: 'free' | 'subscribed' | 'lapsed';
     subscriptionExpiresAt: Date | null;
     createdAt: Date;
   }

   export interface Pet {
     id: string;
     ownerId: string;
     name: string;
     hp: number;
     hunger: number;
     boldness: number;
     sociability: number;
     regionId: string;
     isAlive: boolean;
     daysAlive: number;
     appearance: PetAppearance | null;
     createdAt: Date;
     updatedAt: Date;
   }

   export interface PetAppearance {
     baseSprite: string;
     colorPalette: string[];
     accessories: string[];
   }

   export interface JournalEntry {
     id: string;
     petId: string;
     day: number;
     regionId: string;
     text: string;
     isSignificant: boolean;
     isFinal: boolean;
     createdAt: Date;
   }

   export interface Friendship {
     petAId: string;
     petBId: string;
     formedOnDay: number;
     regionId: string;
     createdAt: Date;
   }

   export interface Region {
     id: string;
     name: string;
     dangerLevel: number;
     resourceAbundance: number;
     connectedRegions: string[];
   }

   export type Action = 'forage' | 'rest' | 'explore' | 'socialize' | 'migrate';

   export interface ActionOutcome {
     hpChange: number;
     hungerChange: number;
     description: string;
     newRegion?: string;
     deathCause?: string;
   }
   ```

4. **Create database connection** (`src/db/index.ts`)

   ```typescript
   import { Pool } from 'pg';
   import { Pet, User, JournalEntry, Friendship } from '../types';

   const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
   });

   export const db = {
     query: (text: string, params?: any[]) => pool.query(text, params),

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
         const values: any[] = [];
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

   function mapPetRow(row: any): Pet {
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

   function mapJournalRow(row: any): JournalEntry {
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

   function mapFriendshipRow(row: any): Friendship {
     return {
       petAId: row.pet_a_id,
       petBId: row.pet_b_id,
       formedOnDay: row.formed_on_day,
       regionId: row.region_id,
       createdAt: row.created_at,
     };
   }

   function mapUserRow(row: any): User {
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
     return publicUser as UserPublic;
   }

   export default db;
   ```

5. **Create config** (`src/config.ts`)

   ```typescript
   export const CONFIG = {
     TICK_INTERVAL_MS: 4 * 60 * 60 * 1000,  // 4 hours
     HUNGER_DECAY_PER_TICK: 15,
     STARVATION_HP_LOSS: 20,
     MAX_HP: 100,
     MAX_HUNGER: 100,
     DEV_MODE: process.env.NODE_ENV === 'development',
   };

   export const REGIONS: Record<string, import('./types').Region> = {
     meadow_commons: {
       id: 'meadow_commons',
       name: 'Meadow Commons',
       dangerLevel: 2,
       resourceAbundance: 8,
       connectedRegions: ['forest_heart'],
     },
     forest_heart: {
       id: 'forest_heart',
       name: 'Forest Heart',
       dangerLevel: 5,
       resourceAbundance: 6,
       connectedRegions: ['meadow_commons', 'mountain_range', 'ruins_district', 'desert_expanse'],
     },
     mountain_range: {
       id: 'mountain_range',
       name: 'Mountain Range',
       dangerLevel: 8,
       resourceAbundance: 4,
       connectedRegions: ['forest_heart', 'summit'],
     },
     ruins_district: {
       id: 'ruins_district',
       name: 'Ruins District',
       dangerLevel: 6,
       resourceAbundance: 5,
       connectedRegions: ['forest_heart', 'summit'],
     },
     desert_expanse: {
       id: 'desert_expanse',
       name: 'Desert Expanse',
       dangerLevel: 7,
       resourceAbundance: 3,
       connectedRegions: ['forest_heart', 'summit'],
     },
     summit: {
       id: 'summit',
       name: 'The Summit',
       dangerLevel: 10,
       resourceAbundance: 2,
       connectedRegions: ['mountain_range', 'ruins_district', 'desert_expanse'],
     },
   };
   ```

### Deliverables

- [ ] Database running locally (Docker)
- [ ] Schema applied
- [ ] Basic CRUD operations working
- [ ] TypeScript types defined

-----

## Phase 2: Simulation Engine

### Goal

Implement the core tick loop that processes all pets.

### Tasks

1. **Create journal templates** (`src/templates/journal.ts`)

   ```typescript
   const TEMPLATES: Record<string, string[]> = {
     arrival: [
       `{name} arrived at the Meadow Commons. A new journey begins.`,
     ],
     forage_success: [
       `{name} had a successful foraging day.`,
       `{name} found plenty to eat in {region}.`,
       `{name} sniffed out some tasty treats.`,
     ],
     forage_hurt: [
       `{name} searched for food but got injured.`,
       `{name} found some food, but not without a few scratches.`,
     ],
     rest: [
       `{name} found a safe spot and rested.`,
       `{name} took it easy today.`,
       `{name} curled up and napped.`,
     ],
     explore_success: [
       `{name} explored new areas of {region}.`,
       `{name} ventured further than usual.`,
       `{name} discovered a hidden corner of {region}.`,
     ],
     explore_bonus: [
       `{name} discovered a hidden cache while exploring!`,
       `{name} stumbled upon some forgotten supplies!`,
     ],
     explore_hurt: [
       `{name} ventured into unknown territory and ran into trouble.`,
       `{name} explored too far and paid the price.`,
     ],
     migrate_success: [
       `{name} made the journey to {destination}.`,
       `{name} arrived safely at {destination}.`,
     ],
     migrate_fail: [
       `{name} attempted to reach {destination} but had to turn back.`,
       `The path to {destination} was too dangerous. {name} retreated.`,
     ],
     socialize_alone: [
       `{name} looked for company but found none.`,
       `{name} wandered around hoping to meet someone.`,
     ],
     socialize_friend: [
       `{name} spent the day with {other}.`,
       `{name} and {other} hung out together.`,
     ],
     socialize_new_friend: [
       `{name} made a new friend: {other}!`,
       `{name} and {other} really hit it off!`,
     ],
     socialize_stranger: [
       `{name} met a stranger named {other}.`,
       `{name} crossed paths with {other}.`,
     ],
     death_starvation: [
       `{name} couldn't find enough food. The hunger became too much.`,
       `After days of searching, {name}'s strength finally gave out.`,
     ],
     death_injury: [
       `{name}'s injuries were too severe to recover from.`,
       `The dangers of {region} proved too great for {name}.`,
     ],
   };

   export function getTemplate(
     key: string,
     vars: Record<string, string>
   ): string {
     const templates = TEMPLATES[key];
     if (!templates || templates.length === 0) {
       return `{name} did something.`.replace('{name}', vars.name || 'Pet');
     }

     let text = templates[Math.floor(Math.random() * templates.length)];

     for (const [varName, value] of Object.entries(vars)) {
       text = text.replace(new RegExp(`\\{${varName}\\}`, 'g'), value);
     }

     return text;
   }
   ```

2. **Create action system** (`src/simulation/actions.ts`)

   ```typescript
   import { Pet, Action, ActionOutcome } from '../types';
   import { REGIONS, CONFIG } from '../config';
   import { getTemplate } from '../templates/journal';

   export function chooseAction(pet: Pet): Action {
     // Survival priorities
     if (pet.hunger < 30) return 'forage';
     if (pet.hp < 40) return 'rest';

     // Personality-driven
     const roll = Math.random();

     if (pet.sociability > 0.6 && roll < 0.3) return 'socialize';
     if (pet.boldness > 0.6 && roll < 0.5) return 'explore';
     if (pet.boldness > 0.8 && roll < 0.2) return 'migrate';

     return 'forage';
   }

   export function resolveAction(pet: Pet, action: Action): ActionOutcome {
     const region = REGIONS[pet.regionId];
     const dangerRoll = Math.random() * 10;
     const gotHurt = dangerRoll < region.dangerLevel;

     switch (action) {
       case 'forage': {
         const foodFound = Math.random() < (region.resourceAbundance / 10);
         if (gotHurt) {
           return {
             hungerChange: foodFound ? 10 : 5,
             hpChange: -15,
             description: getTemplate('forage_hurt', { name: pet.name, region: region.name }),
           };
         }
         return {
           hungerChange: foodFound ? 25 : 10,
           hpChange: 0,
           description: getTemplate('forage_success', { name: pet.name, region: region.name }),
         };
       }

       case 'rest': {
         return {
           hungerChange: -5,
           hpChange: 15,
           description: getTemplate('rest', { name: pet.name }),
         };
       }

       case 'explore': {
         const foundBonus = Math.random() < 0.2;
         if (gotHurt) {
           return {
             hungerChange: -10,
             hpChange: -20,
             description: getTemplate('explore_hurt', { name: pet.name, region: region.name }),
           };
         }
         return {
           hungerChange: foundBonus ? 15 : -10,
           hpChange: 0,
           description: foundBonus
               ? getTemplate('explore_bonus', { name: pet.name })
               : getTemplate('explore_success', { name: pet.name, region: region.name }),
         };
       }

       case 'migrate': {
         const connected = region.connectedRegions;
         if (connected.length === 0) {
           return {
             hungerChange: -5,
             hpChange: 0,
             description: `${pet.name} looked for new lands but found nowhere to go.`,
           };
         }

         const destination = connected[Math.floor(Math.random() * connected.length)];
         const destRegion = REGIONS[destination];
         const failed = gotHurt || Math.random() < 0.3;

         if (failed) {
           return {
             hungerChange: -15,
             hpChange: -10,
             description: getTemplate('migrate_fail', { name: pet.name, destination: destRegion.name }),
           };
         }

         return {
           hungerChange: -20,
           hpChange: 0,
           description: getTemplate('migrate_success', { name: pet.name, destination: destRegion.name }),
           newRegion: destination,
         };
       }

       case 'socialize': {
         // Placeholder - actual social processing happens in social.ts
         return {
           hungerChange: -5,
           hpChange: 0,
           description: '', // Will be set by social processing
         };
       }

       default:
         return {
           hungerChange: 0,
           hpChange: 0,
           description: `${pet.name} did nothing.`,
         };
     }
   }

   export function clampStats(pet: Pet): void {
     pet.hp = Math.max(0, Math.min(CONFIG.MAX_HP, pet.hp));
     pet.hunger = Math.max(0, Math.min(CONFIG.MAX_HUNGER, pet.hunger));
   }
   ```

3. **Create social system** (`src/simulation/social.ts`)

   ```typescript
   import { Pet } from '../types';
   import { db } from '../db';
   import { getTemplate } from '../templates/journal';

   export async function processSocializations(
     socializers: Map<string, Pet[]>,
     tickDay: number
   ): Promise<void> {
     for (const [regionId, pets] of socializers) {
       if (pets.length < 2) {
         // No one to meet
         for (const pet of pets) {
           await db.journal.create({
             petId: pet.id,
             day: tickDay,
             regionId,
             text: getTemplate('socialize_alone', { name: pet.name }),
             isSignificant: false,
             isFinal: false,
           });
         }
         continue;
       }

       // Shuffle pets
       const shuffled = [...pets].sort(() => Math.random() - 0.5);

       // Pair up
       for (let i = 0; i < shuffled.length - 1; i += 2) {
         const a = shuffled[i];
         const b = shuffled[i + 1];

         const alreadyFriends = await db.friendships.exists(a.id, b.id);

         if (alreadyFriends) {
           // Hang out
           await db.journal.create({
             petId: a.id,
             day: tickDay,
             regionId,
             text: getTemplate('socialize_friend', { name: a.name, other: b.name }),
             isSignificant: false,
             isFinal: false,
           });
           await db.journal.create({
             petId: b.id,
             day: tickDay,
             regionId,
             text: getTemplate('socialize_friend', { name: b.name, other: a.name }),
             isSignificant: false,
             isFinal: false,
           });
         } else {
           // Chance to become friends
           const friendChance = (a.sociability + b.sociability) / 4;

           if (Math.random() < friendChance) {
             // New friends!
             await db.friendships.create({
               petAId: a.id,
               petBId: b.id,
               formedOnDay: tickDay,
               regionId,
             });

             await db.journal.create({
               petId: a.id,
               day: tickDay,
               regionId,
               text: getTemplate('socialize_new_friend', { name: a.name, other: b.name }),
               isSignificant: true,
               isFinal: false,
             });
             await db.journal.create({
               petId: b.id,
               day: tickDay,
               regionId,
               text: getTemplate('socialize_new_friend', { name: b.name, other: a.name }),
               isSignificant: true,
               isFinal: false,
             });

             // TODO: Send notifications to both owners
           } else {
             // Just met, no click
             await db.journal.create({
               petId: a.id,
               day: tickDay,
               regionId,
               text: getTemplate('socialize_stranger', { name: a.name, other: b.name }),
               isSignificant: false,
               isFinal: false,
             });
             await db.journal.create({
               petId: b.id,
               day: tickDay,
               regionId,
               text: getTemplate('socialize_stranger', { name: b.name, other: a.name }),
               isSignificant: false,
               isFinal: false,
             });
           }
         }
       }

       // Handle odd pet out
       if (shuffled.length % 2 === 1) {
         const loner = shuffled[shuffled.length - 1];
         await db.journal.create({
           petId: loner.id,
           day: tickDay,
           regionId,
           text: getTemplate('socialize_alone', { name: loner.name }),
           isSignificant: false,
           isFinal: false,
         });
       }
     }
   }
   ```

4. **Create death handling** (`src/simulation/death.ts`)

   ```typescript
   import { Pet } from '../types';
   import { db } from '../db';
   import { REGIONS } from '../config';
   import { getTemplate } from '../templates/journal';

   export async function processDeath(
     pet: Pet,
     tickDay: number
   ): Promise<void> {
     const cause = pet.hunger <= 0 ? 'starvation' : 'injury';
     const region = REGIONS[pet.regionId];

     // Create final journal entry
     await db.journal.create({
       petId: pet.id,
       day: tickDay,
       regionId: pet.regionId,
       text: getTemplate(`death_${cause}`, { name: pet.name, region: region.name }),
       isSignificant: true,
       isFinal: true,
     });

     // Update pet
     await db.pets.update(pet.id, {
       isAlive: false,
       hp: 0,
     });

     // Send notification based on subscription status and location
     const user = await db.users.getById(pet.ownerId);
     if (!user) return;

     const diedInMeadow = pet.regionId === 'meadow_commons';

     if (user.subscriptionStatus === 'subscribed' || diedInMeadow) {
       // TODO: Send death notification
       console.log(`[NOTIFY] ${pet.name} died. Owner: ${user.email}, Cause: ${cause}`);
     }
     // If free user and died outside Meadow: silence
   }
   ```

5. **Create main tick loop** (`src/simulation/tick.ts`)

   ```typescript
   import { Pet } from '../types';
   import { db } from '../db';
   import { CONFIG } from '../config';
   import { chooseAction, resolveAction, clampStats } from './actions';
   import { processSocializations } from './social';
   import { processDeath } from './death';

   export interface TickResult {
     tickDay: number;
     processed: number;
     deaths: number;
     newFriendships: number;
   }

   export async function runTick(): Promise<TickResult> {
     const tickDay = await db.simulation.incrementTick();
     console.log(`[TICK] Starting tick ${tickDay}`);

     const pets = await db.pets.getAlive();
     console.log(`[TICK] Processing ${pets.length} alive pets`);

     const deaths: Pet[] = [];
     const socializers: Map<string, Pet[]> = new Map();

     // PHASE 1: Individual pet processing
     for (const pet of pets) {
       // Hunger decay
       pet.hunger -= CONFIG.HUNGER_DECAY_PER_TICK;

       // Starvation damage
       if (pet.hunger <= 0) {
         pet.hunger = 0;
         pet.hp -= CONFIG.STARVATION_HP_LOSS;
       }

       // Choose and execute action
       const action = chooseAction(pet);

       if (action === 'socialize') {
         // Defer to phase 2
         const regionPets = socializers.get(pet.regionId) || [];
         regionPets.push(pet);
         socializers.set(pet.regionId, regionPets);
         pet.hunger -= 5; // Small cost for socializing
       } else {
         const outcome = resolveAction(pet, action);

         pet.hp += outcome.hpChange;
         pet.hunger += outcome.hungerChange;

         if (outcome.newRegion) {
           pet.regionId = outcome.newRegion;
         }

         clampStats(pet);

         // Create journal entry
         await db.journal.create({
           petId: pet.id,
           day: tickDay,
           regionId: pet.regionId,
           text: outcome.description,
           isSignificant: false,
           isFinal: false,
         });
       }

       // Check for death
       if (pet.hp <= 0) {
         deaths.push(pet);
       } else {
         pet.daysAlive += 1;
         await db.pets.update(pet.id, {
           hp: pet.hp,
           hunger: pet.hunger,
           regionId: pet.regionId,
           daysAlive: pet.daysAlive,
         });
       }
     }

     // PHASE 2: Process socializations
     await processSocializations(socializers, tickDay);

     // PHASE 3: Process deaths
     for (const pet of deaths) {
       await processDeath(pet, tickDay);
     }

     const result: TickResult = {
       tickDay,
       processed: pets.length,
       deaths: deaths.length,
       newFriendships: 0, // TODO: track this
     };

     console.log(`[TICK] Completed:`, result);
     return result;
   }

   // Scheduler
   let tickInterval: NodeJS.Timeout | null = null;

   export function startSimulation(): void {
     if (tickInterval) {
       console.log('[SIM] Already running');
       return;
     }

     console.log(`[SIM] Starting simulation. Tick interval: ${CONFIG.TICK_INTERVAL_MS / 1000 / 60} minutes`);

     // Run immediately
     runTick().catch(err => console.error('[SIM] Tick failed:', err));

     // Then on interval
     tickInterval = setInterval(() => {
       runTick().catch(err => console.error('[SIM] Tick failed:', err));
     }, CONFIG.TICK_INTERVAL_MS);
   }

   export function stopSimulation(): void {
     if (tickInterval) {
       clearInterval(tickInterval);
       tickInterval = null;
       console.log('[SIM] Stopped');
     }
   }
   ```

### Deliverables

- [ ] Action selection working
- [ ] Action resolution working
- [ ] Social system working
- [ ] Death handling working
- [ ] Tick loop running on schedule

-----

## Phase 3: Developer Tools

### Goal

Create developer-only endpoints for testing, including generating Level 10 pets.

### Tasks

1. **Create dev seed tools** (`src/dev/seed.ts`)

   ```typescript
   import { db } from '../db';
   import { Pet, User } from '../types';
   import { getTemplate } from '../templates/journal';

   // Random name generator
   const NAMES = [
     'Mochi', 'Biscuit', 'Pepper', 'Luna', 'Pip', 'Patches', 'Whiskers',
     'Buttons', 'Nugget', 'Peanut', 'Cookie', 'Maple', 'Cinnamon', 'Ginger',
     'Hazel', 'Olive', 'Bean', 'Noodle', 'Pickles', 'Waffles', 'Tofu',
   ];

   function randomName(): string {
     return NAMES[Math.floor(Math.random() * NAMES.length)];
   }

   function randomPersonality(): { boldness: number; sociability: number } {
     return {
       boldness: Math.random(),
       sociability: Math.random(),
     };
   }

   /**
    * Create a test user
    */
   export async function createTestUser(
     email?: string,
     password?: string
   ): Promise<{ user: User; password: string }> {
     const testEmail = email || `test-${Date.now()}@example.com`;
     const testPassword = password || 'testpass123';

     // Import hashPassword from auth
     const bcrypt = require('bcrypt');
     const passwordHash = await bcrypt.hash(testPassword, 10);

     const user = await db.users.create(testEmail, passwordHash);

     return { user, password: testPassword };
   }

   /**
    * Generate a Level 10 pet ready for upload to The Beyond
    * This simulates a pet that has beaten the roguelike
    */
   export async function generateLevel10Pet(
     ownerId: string,
     options?: {
       name?: string;
       boldness?: number;
       sociability?: number;
     }
   ): Promise<Pet> {
     const name = options?.name || randomName();
     const personality = randomPersonality();

     const pet = await db.pets.create({
       ownerId,
       name,
       hp: 100,
       hunger: 100,
       boldness: options?.boldness ?? personality.boldness,
       sociability: options?.sociability ?? personality.sociability,
       regionId: 'meadow_commons',
       isAlive: true,
       daysAlive: 0,
       appearance: {
         baseSprite: 'default',
         colorPalette: ['#FFB6C1', '#FFA07A', '#98FB98'],
         accessories: [],
       },
     });

     // Create arrival journal entry
     await db.journal.create({
       petId: pet.id,
       day: 0,
       regionId: 'meadow_commons',
       text: getTemplate('arrival', { name: pet.name }),
       isSignificant: true,
       isFinal: false,
     });

     console.log(`[DEV] Created Level 10 pet: ${pet.name} (${pet.id})`);
     return pet;
   }

   /**
    * Generate multiple test pets for simulation testing
    */
   export async function generateTestPopulation(
     ownerId: string,
     count: number
   ): Promise<Pet[]> {
     const pets: Pet[] = [];

     for (let i = 0; i < count; i++) {
       const pet = await generateLevel10Pet(ownerId);
       pets.push(pet);
     }

     console.log(`[DEV] Generated ${count} test pets`);
     return pets;
   }

   /**
    * Create a pet with specific personality for testing behaviors
    */
   export async function generatePetWithPersonality(
     ownerId: string,
     personality: 'bold' | 'cautious' | 'social' | 'loner' | 'balanced'
   ): Promise<Pet> {
     const presets: Record<string, { boldness: number; sociability: number }> = {
       bold: { boldness: 0.9, sociability: 0.5 },
       cautious: { boldness: 0.1, sociability: 0.5 },
       social: { boldness: 0.5, sociability: 0.9 },
       loner: { boldness: 0.5, sociability: 0.1 },
       balanced: { boldness: 0.5, sociability: 0.5 },
     };

     const preset = presets[personality];
     return generateLevel10Pet(ownerId, preset);
   }

   /**
    * Fast-forward a pet's state (for testing)
    */
   export async function fastForwardPet(
     petId: string,
     days: number
   ): Promise<void> {
     const pet = await db.pets.getById(petId);
     if (!pet) throw new Error('Pet not found');

     await db.pets.update(petId, {
       daysAlive: pet.daysAlive + days,
     });

     console.log(`[DEV] Fast-forwarded ${pet.name} by ${days} days`);
   }

   /**
    * Set pet stats directly (for testing edge cases)
    */
   export async function setPetStats(
     petId: string,
     stats: { hp?: number; hunger?: number; regionId?: string }
   ): Promise<Pet> {
     const updated = await db.pets.update(petId, stats);
     console.log(`[DEV] Updated ${updated.name} stats:`, stats);
     return updated;
   }

   /**
    * Trigger an immediate tick (for testing)
    */
   export { runTick } from '../simulation/tick';

   /**
    * Reset simulation state (dangerous!)
    */
   export async function resetSimulation(): Promise<void> {
     await db.query('DELETE FROM journal_entries');
     await db.query('DELETE FROM friendships');
     await db.query('DELETE FROM pets');
     await db.query("UPDATE simulation_state SET value = 0 WHERE key = 'current_tick'");
     console.log('[DEV] Simulation reset');
   }
   ```

2. **Create dev API routes** (`src/api/dev.ts`)

   ```typescript
   import { Router } from 'express';
   import { CONFIG } from '../config';
   import * as dev from '../dev/seed';

   const router = Router();

   // Middleware to block in production
   router.use((req, res, next) => {
     if (!CONFIG.DEV_MODE) {
       return res.status(403).json({ error: 'Dev endpoints disabled in production' });
     }
     next();
   });

   /**
    * POST /dev/users
    * Create a test user
    */
   router.post('/users', async (req, res) => {
     try {
       const { email, password } = req.body;
       const result = await dev.createTestUser(email, password);
       res.json({
         user: {
           id: result.user.id,
           email: result.user.email,
         },
         password: result.password,
         note: 'Use these credentials to login via POST /api/auth/login',
       });
     } catch (err) {
       res.status(500).json({ error: (err as Error).message });
     }
   });

   /**
    * POST /dev/pets/level10
    * Generate a Level 10 pet ready for The Beyond
    */
   router.post('/pets/level10', async (req, res) => {
     try {
       const { ownerId, name, boldness, sociability } = req.body;

       if (!ownerId) {
         return res.status(400).json({ error: 'ownerId required' });
       }

       const pet = await dev.generateLevel10Pet(ownerId, {
         name,
         boldness,
         sociability,
       });

       res.json({
         pet,
         viewUrl: `http://localhost:3000/pet/${pet.id}`,
       });
     } catch (err) {
       res.status(500).json({ error: (err as Error).message });
     }
   });

   /**
    * POST /dev/pets/population
    * Generate multiple test pets
    */
   router.post('/pets/population', async (req, res) => {
     try {
       const { ownerId, count = 10 } = req.body;

       if (!ownerId) {
         return res.status(400).json({ error: 'ownerId required' });
       }

       const pets = await dev.generateTestPopulation(ownerId, count);
       res.json({ pets, count: pets.length });
     } catch (err) {
       res.status(500).json({ error: (err as Error).message });
     }
   });

   /**
    * POST /dev/pets/:id/stats
    * Set pet stats directly
    */
   router.post('/pets/:id/stats', async (req, res) => {
     try {
       const { hp, hunger, regionId } = req.body;
       const pet = await dev.setPetStats(req.params.id, { hp, hunger, regionId });
       res.json({ pet });
     } catch (err) {
       res.status(500).json({ error: (err as Error).message });
     }
   });

   /**
    * POST /dev/tick
    * Trigger an immediate simulation tick
    */
   router.post('/tick', async (req, res) => {
     try {
       const result = await dev.runTick();
       res.json({ result });
     } catch (err) {
       res.status(500).json({ error: (err as Error).message });
     }
   });

   /**
    * POST /dev/reset
    * Reset entire simulation (dangerous!)
    */
   router.post('/reset', async (req, res) => {
     try {
       if (req.body.confirm !== 'RESET') {
         return res.status(400).json({ error: 'Send { confirm: "RESET" } to confirm' });
       }

       await dev.resetSimulation();
       res.json({ success: true });
     } catch (err) {
       res.status(500).json({ error: (err as Error).message });
     }
   });

   export default router;
   ```

3. **Example test workflow**

   ```bash
   # 1. Create a test user
   curl -X POST http://localhost:3000/dev/users \
     -H "Content-Type: application/json" \
     -d '{"email": "homer@test.com"}'
   # Returns: { "user": { "id": "abc-123", ... } }

   # 2. Generate a Level 10 pet
   curl -X POST http://localhost:3000/dev/pets/level10 \
     -H "Content-Type: application/json" \
     -d '{"ownerId": "abc-123", "name": "Mochi"}'
   # Returns: { "pet": { "id": "def-456", ... }, "viewUrl": "..." }

   # 3. Generate a population for testing
   curl -X POST http://localhost:3000/dev/pets/population \
     -H "Content-Type: application/json" \
     -d '{"ownerId": "abc-123", "count": 20}'

   # 4. Trigger a tick manually
   curl -X POST http://localhost:3000/dev/tick
   # Returns: { "result": { "tickDay": 1, "processed": 21, "deaths": 0 } }

   # 5. Set pet stats to test edge cases
   curl -X POST http://localhost:3000/dev/pets/def-456/stats \
     -H "Content-Type: application/json" \
     -d '{"hp": 10, "hunger": 5}'

   # 6. Trigger another tick (pet might die)
   curl -X POST http://localhost:3000/dev/tick

   # 7. Reset everything
   curl -X POST http://localhost:3000/dev/reset \
     -H "Content-Type: application/json" \
     -d '{"confirm": "RESET"}'
   ```

### Deliverables

- [ ] Test user creation
- [ ] Level 10 pet generation
- [ ] Population generation
- [ ] Manual tick trigger
- [ ] Stat manipulation
- [ ] Simulation reset

-----

## Phase 4: Authentication (Simple MVP)

### Goal

Implement basic email/password authentication for the MVP test period. Keep it simple - no OAuth, no complex features.

### Tasks

1. **Create authentication utilities** (`src/api/middleware/auth.ts`)

   ```typescript
   import { Request, Response, NextFunction } from 'express';
   import jwt from 'jsonwebtoken';
   import bcrypt from 'bcrypt';
   import { db } from '../../db';

   const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
   const SALT_ROUNDS = 10;

   export interface AuthRequest extends Request {
     userId?: string;
   }

   /**
    * Hash a password
    */
   export async function hashPassword(password: string): Promise<string> {
     return bcrypt.hash(password, SALT_ROUNDS);
   }

   /**
    * Verify a password against a hash
    */
   export async function verifyPassword(password: string, hash: string): Promise<boolean> {
     return bcrypt.compare(password, hash);
   }

   /**
    * Generate a JWT token
    */
   export function generateToken(userId: string): string {
     return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
   }

   /**
    * Verify a JWT token
    */
   export function verifyToken(token: string): { userId: string } | null {
     try {
       return jwt.verify(token, JWT_SECRET) as { userId: string };
     } catch {
       return null;
     }
   }

   /**
    * Middleware: Require authentication
    */
   export async function requireAuth(
     req: AuthRequest,
     res: Response,
     next: NextFunction
   ): Promise<void> {
     const authHeader = req.headers.authorization;

     if (!authHeader || !authHeader.startsWith('Bearer ')) {
       res.status(401).json({ error: 'Authentication required' });
       return;
     }

     const token = authHeader.substring(7);
     const payload = verifyToken(token);

     if (!payload) {
       res.status(401).json({ error: 'Invalid or expired token' });
       return;
     }

     req.userId = payload.userId;
     next();
   }

   /**
    * Middleware: Optional authentication (doesn't fail if not authenticated)
    */
   export async function optionalAuth(
     req: AuthRequest,
     res: Response,
     next: NextFunction
   ): Promise<void> {
     const authHeader = req.headers.authorization;

     if (authHeader && authHeader.startsWith('Bearer ')) {
       const token = authHeader.substring(7);
       const payload = verifyToken(token);

       if (payload) {
         req.userId = payload.userId;
       }
     }

     next();
   }
   ```

2. **Create authentication routes** (`src/api/auth.ts`)

   ```typescript
   import { Router } from 'express';
   import { db, sanitizeUser } from '../db';
   import { hashPassword, verifyPassword, generateToken, requireAuth, AuthRequest } from './middleware/auth';

   const router = Router();

   /**
    * POST /api/auth/register
    * Register a new user
    */
   router.post('/register', async (req, res) => {
     try {
       const { email, password } = req.body;

       // Validation
       if (!email || !password) {
         return res.status(400).json({ error: 'Email and password required' });
       }

       if (password.length < 8) {
         return res.status(400).json({ error: 'Password must be at least 8 characters' });
       }

       // Check if user already exists
       const existing = await db.users.getByEmail(email);
       if (existing) {
         return res.status(400).json({ error: 'Email already registered' });
       }

       // Create user
       const passwordHash = await hashPassword(password);
       const user = await db.users.create(email, passwordHash);

       // Generate token
       const token = generateToken(user.id);

       res.json({
         user: sanitizeUser(user),
         token,
       });
     } catch (err) {
       console.error('[AUTH] Register error:', err);
       res.status(500).json({ error: 'Registration failed' });
     }
   });

   /**
    * POST /api/auth/login
    * Login with email/password
    */
   router.post('/login', async (req, res) => {
     try {
       const { email, password } = req.body;

       if (!email || !password) {
         return res.status(400).json({ error: 'Email and password required' });
       }

       // Get user
       const user = await db.users.getByEmail(email);
       if (!user) {
         return res.status(401).json({ error: 'Invalid credentials' });
       }

       // Verify password
       const valid = await verifyPassword(password, user.passwordHash);
       if (!valid) {
         return res.status(401).json({ error: 'Invalid credentials' });
       }

       // Generate token
       const token = generateToken(user.id);

       res.json({
         user: sanitizeUser(user),
         token,
       });
     } catch (err) {
       console.error('[AUTH] Login error:', err);
       res.status(500).json({ error: 'Login failed' });
     }
   });

   /**
    * GET /api/auth/me
    * Get current user info
    */
   router.get('/me', requireAuth, async (req: AuthRequest, res) => {
     try {
       const user = await db.users.getById(req.userId!);

       if (!user) {
         return res.status(404).json({ error: 'User not found' });
       }

       res.json({ user: sanitizeUser(user) });
     } catch (err) {
       console.error('[AUTH] Get me error:', err);
       res.status(500).json({ error: 'Failed to get user' });
     }
   });

   export default router;
   ```

3. **Update environment variables** (`.env.example`)

   ```
   DATABASE_URL=postgres://localhost:5432/beyond
   PORT=3000
   NODE_ENV=development
   BASE_URL=http://localhost:3000
   START_SIMULATION=true
   JWT_SECRET=change-this-to-a-random-secret-in-production
   ```

### Deliverables

- [ ] User registration endpoint
- [ ] User login endpoint
- [ ] JWT token generation and validation
- [ ] Password hashing with bcrypt
- [ ] Auth middleware for protected routes

### Security Notes for MVP

**Acceptable for Test Period:**
- Simple JWT tokens (no refresh tokens)
- Basic password requirements (8+ characters)
- No email verification
- No password reset flow
- No rate limiting

**Must Add Before Production:**
- Email verification
- Password reset via email
- Rate limiting on auth endpoints
- Refresh token rotation
- Consider adding OAuth (Google, Apple) for better UX

-----

## Phase 5: API & Visibility

### Goal

Create public API with subscription-based visibility rules and integrate authentication.

### Tasks

1. **Create visibility middleware** (`src/api/middleware/visibility.ts`)

   ```typescript
   import { Pet, User, JournalEntry, Friendship } from '../../types';
   import { db } from '../../db';
   import { REGIONS } from '../../config';

   export interface VisiblePetData {
     id: string;
     name: string;
     status: 'alive' | 'dead' | 'unknown';
     region: string | null;
     regionName: string | null;
     hp: number | null;
     hunger: number | null;
     daysAlive: number | null;
     lastSeenDay: number | null;
     journal: JournalEntry[];
     friends: FriendInfo[];
     paywall: PaywallInfo | null;
     appearance: any;
   }

   export interface FriendInfo {
     petId: string;
     petName: string;
     isAlive: boolean;
     formedOnDay: number;
   }

   export interface PaywallInfo {
     message: string;
     leftMeadowOnDay: number;
   }

   export async function getVisiblePetData(
     pet: Pet,
     user: User | null
   ): Promise<VisiblePetData> {
     const isSubscribed = user?.subscriptionStatus === 'subscribed';
     const isInMeadow = pet.regionId === 'meadow_commons';

     // Get friendships
     const friendships = await db.friendships.getByPet(pet.id);

     if (isSubscribed) {
       // Full visibility
       const journal = await db.journal.getByPet(pet.id);
       const friends = await resolveFriends(pet.id, friendships);

       return {
         id: pet.id,
         name: pet.name,
         status: pet.isAlive ? 'alive' : 'dead',
         region: pet.regionId,
         regionName: REGIONS[pet.regionId]?.name || pet.regionId,
         hp: pet.hp,
         hunger: pet.hunger,
         daysAlive: pet.daysAlive,
         lastSeenDay: null,
         journal,
         friends,
         paywall: null,
         appearance: pet.appearance,
       };
     }

     // Free/lapsed user
     if (isInMeadow) {
       // Meadow is visible
       const journal = await db.journal.getByPetAndRegion(pet.id, 'meadow_commons');
       const meadowFriendships = await db.friendships.getByPetAndRegion(pet.id, 'meadow_commons');
       const friends = await resolveFriends(pet.id, meadowFriendships);

       return {
         id: pet.id,
         name: pet.name,
         status: pet.isAlive ? 'alive' : 'dead',
         region: 'meadow_commons',
         regionName: 'Meadow Commons',
         hp: pet.hp,
         hunger: pet.hunger,
         daysAlive: pet.daysAlive,
         lastSeenDay: null,
         journal,
         friends,
         paywall: null,
         appearance: pet.appearance,
       };
     }

     // Pet is outside Meadow, user is free/lapsed
     const meadowJournal = await db.journal.getByPetAndRegion(pet.id, 'meadow_commons');
     const lastMeadowEntry = meadowJournal[0];
     const lastMeadowDay = lastMeadowEntry?.day || 0;

     const meadowFriendships = await db.friendships.getByPetAndRegion(pet.id, 'meadow_commons');
     const friends = await resolveFriends(pet.id, meadowFriendships);

     return {
       id: pet.id,
       name: pet.name,
       status: 'unknown',
       region: null,
       regionName: 'Beyond the Meadow',
       hp: null,
       hunger: null,
       daysAlive: null,
       lastSeenDay: lastMeadowDay,
       journal: meadowJournal,
       friends,
       paywall: {
         message: 'Subscribe to follow their journey',
         leftMeadowOnDay: lastMeadowDay,
       },
       appearance: pet.appearance,
     };
   }

   async function resolveFriends(
     petId: string,
     friendships: Friendship[]
   ): Promise<FriendInfo[]> {
     const friends: FriendInfo[] = [];

     for (const f of friendships) {
       const friendPetId = f.petAId === petId ? f.petBId : f.petAId;
       const friendPet = await db.pets.getById(friendPetId);

       if (friendPet) {
         friends.push({
           petId: friendPet.id,
           petName: friendPet.name,
           isAlive: friendPet.isAlive,
           formedOnDay: f.formedOnDay,
         });
       }
     }

     return friends;
   }
   ```

2. **Create pet API routes** (`src/api/pets.ts`)

   ```typescript
   import { Router } from 'express';
   import { db } from '../db';
   import { getVisiblePetData } from './middleware/visibility';
   import { getTemplate } from '../templates/journal';
   import { requireAuth, optionalAuth, AuthRequest } from './middleware/auth';

   const router = Router();

   /**
    * POST /api/pets/upload
    * Upload a pet to The Beyond (from mobile app)
    */
   router.post('/upload', requireAuth, async (req: AuthRequest, res) => {
     try {
       const { name, personality, appearance } = req.body;

       if (!name || !personality) {
         return res.status(400).json({ error: 'Missing required fields' });
       }

       const userId = req.userId!; // From auth middleware

       // Map 6-axis personality to 2-axis
       const boldness = (
         (personality.curious || 0.5) +
         (personality.brave || 0.5) +
         (1 - (personality.cautious || 0.5))
       ) / 3;

       const sociability = (
         (personality.friendly || 0.5) +
         (personality.loyal || 0.5) +
         (personality.playful || 0.5)
       ) / 3;

       // Create pet
       const pet = await db.pets.create({
         ownerId: userId,
         name,
         hp: 100,
         hunger: 100,
         boldness,
         sociability,
         regionId: 'meadow_commons',
         isAlive: true,
         daysAlive: 0,
         appearance: appearance || null,
       });

       // Create arrival journal entry
       await db.journal.create({
         petId: pet.id,
         day: 0,
         regionId: 'meadow_commons',
         text: getTemplate('arrival', { name: pet.name }),
         isSignificant: true,
         isFinal: false,
       });

       res.json({
         success: true,
         pet: {
           id: pet.id,
           name: pet.name,
           viewUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/pet/${pet.id}`,
         },
       });
     } catch (err) {
       console.error('[API] Upload error:', err);
       res.status(500).json({ error: 'Upload failed' });
     }
   });

   /**
    * GET /api/pets/:id
    * Get pet status (with visibility rules)
    */
   router.get('/:id', optionalAuth, async (req: AuthRequest, res) => {
     try {
       const pet = await db.pets.getById(req.params.id);

       if (!pet) {
         return res.status(404).json({ error: 'Pet not found' });
       }

       // Get user if authenticated
       const user = req.userId ? await db.users.getById(req.userId) : null;

       // Check if user owns this pet or is just viewing
       const isOwner = user && pet.ownerId === user.id;

       const visibleData = await getVisiblePetData(pet, isOwner ? user : null);

       res.json({ pet: visibleData });
     } catch (err) {
       console.error('[API] Get pet error:', err);
       res.status(500).json({ error: 'Failed to get pet' });
     }
   });

   /**
    * GET /api/pets/:id/journal
    * Get pet journal (with visibility rules)
    */
   router.get('/:id/journal', optionalAuth, async (req: AuthRequest, res) => {
     try {
       const pet = await db.pets.getById(req.params.id);

       if (!pet) {
         return res.status(404).json({ error: 'Pet not found' });
       }

       const user = req.userId ? await db.users.getById(req.userId) : null;
       const isOwner = user && pet.ownerId === user.id;
       const isSubscribed = isOwner && user.subscriptionStatus === 'subscribed';

       let journal;
       if (isSubscribed) {
         journal = await db.journal.getByPet(pet.id);
       } else {
         journal = await db.journal.getByPetAndRegion(pet.id, 'meadow_commons');
       }

       res.json({ journal });
     } catch (err) {
       console.error('[API] Get journal error:', err);
       res.status(500).json({ error: 'Failed to get journal' });
     }
   });

   export default router;
   ```

3. **Create user API routes** (`src/api/users.ts`)

   ```typescript
   import { Router } from 'express';
   import { db, sanitizeUser } from '../db';
   import { getVisiblePetData } from './middleware/visibility';
   import { requireAuth, AuthRequest } from './middleware/auth';

   const router = Router();

   /**
    * GET /api/me/pets
    * Get current user's pets
    */
   router.get('/me/pets', requireAuth, async (req: AuthRequest, res) => {
     try {
       const userId = req.userId!;

       const user = await db.users.getById(userId);
       if (!user) {
         return res.status(404).json({ error: 'User not found' });
       }

       const pets = await db.pets.getByOwner(userId);

       const visiblePets = await Promise.all(
         pets.map(pet => getVisiblePetData(pet, user))
       );

       res.json({ pets: visiblePets });
     } catch (err) {
       console.error('[API] Get my pets error:', err);
       res.status(500).json({ error: 'Failed to get pets' });
     }
   });

   /**
    * PUT /api/me/subscription
    * Update subscription status (simplified - real implementation would validate with App Store)
    */
   router.put('/me/subscription', requireAuth, async (req: AuthRequest, res) => {
     try {
       const userId = req.userId!;
       const { status, expiresAt } = req.body;

       const user = await db.users.updateSubscription(
         userId,
         status,
         expiresAt ? new Date(expiresAt) : null
       );

       res.json({ user: sanitizeUser(user) });
     } catch (err) {
       console.error('[API] Update subscription error:', err);
       res.status(500).json({ error: 'Failed to update subscription' });
     }
   });

   export default router;
   ```

4. **Create main router** (`src/api/router.ts`)

   ```typescript
   import { Router } from 'express';
   import authRouter from './auth';
   import petsRouter from './pets';
   import usersRouter from './users';
   import devRouter from './dev';

   const router = Router();

   router.use('/api/auth', authRouter);
   router.use('/api/pets', petsRouter);
   router.use('/api', usersRouter);
   router.use('/dev', devRouter);

   // Health check
   router.get('/health', (req, res) => {
     res.json({ status: 'ok', timestamp: new Date().toISOString() });
   });

   export default router;
   ```

### Deliverables

- [ ] Upload endpoint working with authentication
- [ ] Pet status endpoint with visibility rules and optional auth
- [ ] Journal endpoint with visibility rules and optional auth
- [ ] User pets endpoint with required auth
- [ ] Subscription update endpoint with required auth
- [ ] Auth routes integrated into main router

-----

## Phase 6: Entry Point & Server

### Goal

Wire everything together into a running server and prepare for Render deployment.

### Tasks

1. **Create main entry point** (`src/index.ts`)

   ```typescript
   import 'dotenv/config';
   import express from 'express';
   import cors from 'cors';
   import router from './api/router';
   import { startSimulation, stopSimulation } from './simulation/tick';
   import { CONFIG } from './config';

   const app = express();
   const PORT = process.env.PORT || 3000;

   // Middleware
   app.use(cors());
   app.use(express.json());

   // Routes
   app.use(router);

   // Error handling
   app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
     console.error('[ERROR]', err);
     res.status(500).json({ error: 'Internal server error' });
   });

   // Start server
   const server = app.listen(PORT, () => {
     console.log(`[SERVER] Running on port ${PORT}`);
     console.log(`[SERVER] Dev mode: ${CONFIG.DEV_MODE}`);

     // Start simulation
     if (process.env.START_SIMULATION !== 'false') {
       startSimulation();
     }
   });

   // Graceful shutdown
   process.on('SIGTERM', () => {
     console.log('[SERVER] Shutting down...');
     stopSimulation();
     server.close(() => {
       console.log('[SERVER] Closed');
       process.exit(0);
     });
   });

   export default app;
   ```

2. **Create package.json scripts**

   ```json
   {
     "scripts": {
       "dev": "NODE_ENV=development nodemon src/index.ts",
       "build": "tsc",
       "start": "NODE_ENV=production node dist/index.js",
       "db:migrate": "psql $DATABASE_URL -f src/db/schema.sql",
       "test": "jest"
     }
   }
   ```

3. **Create .env.example**

   ```
   # Database
   DATABASE_URL=postgres://localhost:5432/beyond

   # Server
   PORT=3000
   NODE_ENV=development
   BASE_URL=http://localhost:3000
   START_SIMULATION=true

   # Authentication
   JWT_SECRET=change-this-to-a-random-secret-in-production

   # For Render deployment, these will be set via environment variables:
   # - DATABASE_URL: Provided by Render PostgreSQL
   # - PORT: Automatically set by Render
   # - JWT_SECRET: Add this manually in Render dashboard
   ```

4. **Create docker-compose.yml (for local development)**

   ```yaml
   version: '3.8'
   services:
     db:
       image: postgres:15
       environment:
         POSTGRES_DB: beyond
         POSTGRES_USER: beyond
         POSTGRES_PASSWORD: beyond
       ports:
         - "5432:5432"
       volumes:
         - pgdata:/var/lib/postgresql/data

   volumes:
     pgdata:
   ```

5. **Create render.yaml (for Render deployment)**

   ```yaml
   services:
     # Backend API
     - type: web
       name: beyond-api
       runtime: node
       plan: free  # Upgrade to 'starter' ($7/mo) for no-sleep behavior
       repo: https://github.com/YOUR_USERNAME/pets-beyond
       branch: main
       buildCommand: npm install && npm run build
       startCommand: npm start
       envVars:
         - key: NODE_ENV
           value: production
         - key: START_SIMULATION
           value: true
         - key: BASE_URL
           sync: false  # Set in Render dashboard
         - key: DATABASE_URL
           fromDatabase:
             name: beyond-db
             property: connectionString
         - key: JWT_SECRET
           generateValue: true
       healthCheckPath: /health
       autoDeploy: true

   databases:
     # PostgreSQL Database
     - name: beyond-db
       plan: free  # IMPORTANT: Upgrade to 'starter' ($7/mo) within 30 days
       databaseName: beyond
       user: beyond
   ```

6. **Create .gitignore**

   ```
   node_modules/
   dist/
   .env
   .env.local
   *.log
   .DS_Store
   ```

### Render Deployment Steps

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/pets-beyond.git
   git push -u origin main
   ```

2. **Create Render Account**
   - Sign up at https://render.com
   - Connect your GitHub account

3. **Deploy from Dashboard** (if not using render.yaml)
   - Create New PostgreSQL database (Free tier)
   - Note the Internal Database URL
   - Create New Web Service
   - Connect to your GitHub repo
   - Configure:
     - Build Command: `npm install && npm run build`
     - Start Command: `npm start`
     - Add environment variables (DATABASE_URL, JWT_SECRET, etc.)
   - Deploy

4. **Run Database Migration**
   ```bash
   # Connect to Render PostgreSQL and run schema
   psql <RENDER_DATABASE_URL> -f src/db/schema.sql
   ```

5. **Set Upgrade Reminder**
   - Add calendar reminder for Day 25 to upgrade database
   - Database will expire on Day 30

### Deliverables

- [ ] Server starts and runs locally
- [ ] Simulation auto-starts
- [ ] Graceful shutdown works
- [ ] Docker Compose for local DB
- [ ] render.yaml configuration complete
- [ ] Deployed to Render (free tier)
- [ ] Database migration run on Render PostgreSQL
- [ ] Calendar reminder set for database upgrade (Day 25)

-----

## Phase 7: Website (Basic)

### Goal

Create a minimal Next.js website to view pets.

### Tasks

1. Set up Next.js in `web/` directory
2. Create pet status page (`web/pages/pet/[id].tsx`)
3. Create my-pets page (`web/pages/my-pets.tsx`)
4. Implement paywall UI for non-subscribed users
5. Add basic styling

*Detailed implementation for website phase to be added based on your frontend preferences.*

-----

## Testing Workflow

### Quick Start

```bash
# 1. Start database
docker-compose up -d

# 2. Run migrations
npm run db:migrate

# 3. Start server in dev mode
npm run dev

# 4. Register a user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "testpass123"}'
# Returns: { "user": { "id": "...", ... }, "token": "..." }

# Save the token for authenticated requests
export TOKEN="<JWT_TOKEN_FROM_RESPONSE>"

# 5. Generate Level 10 pet (using dev endpoint)
curl -X POST http://localhost:3000/dev/pets/level10 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"ownerId": "<USER_ID>", "name": "TestPet"}'

# OR upload via the API (requires auth)
curl -X POST http://localhost:3000/api/pets/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "TestPet", "personality": {"curious": 0.7, "brave": 0.8, "cautious": 0.3, "friendly": 0.9, "loyal": 0.8, "playful": 0.6}}'

# 6. Trigger ticks manually
curl -X POST http://localhost:3000/dev/tick

# 7. Check pet status (authenticated - full visibility if owner)
curl http://localhost:3000/api/pets/<PET_ID> \
  -H "Authorization: Bearer $TOKEN"

# 8. Check pet status (unauthenticated - limited visibility)
curl http://localhost:3000/api/pets/<PET_ID>

# 9. Get all my pets
curl http://localhost:3000/api/me/pets \
  -H "Authorization: Bearer $TOKEN"
```

### Testing Scenarios

1. **Pet stays in Meadow**: Generate cautious pet (low boldness), run ticks
2. **Pet migrates**: Generate bold pet (high boldness), run ticks until migration
3. **Friendship formation**: Generate multiple social pets, run ticks
4. **Death by starvation**: Set hunger low, run ticks
5. **Death by injury**: Set HP low, place in dangerous region, run ticks
6. **Visibility rules**: Compare responses for free vs subscribed users

-----

## Summary

|Phase|Goal                    |Key Tasks|
|-----|------------------------|---------|
|1    |Database & Models       |PostgreSQL setup on Render (free, 30-day limit), schema, CRUD operations|
|2    |Simulation Engine       |Tick loop, actions, social system, death handling|
|3    |Developer Tools         |Test pet generation, manual tick triggers, stat manipulation|
|4    |Authentication (MVP)    |Simple email/password, JWT tokens, bcrypt hashing|
|5    |API & Visibility        |Upload endpoint, visibility rules, subscription gating|
|6    |Server Setup & Deploy   |Express server, Render deployment, auto-deploy from GitHub|
|7    |Basic Website           |Next.js on Vercel, pet pages, paywall UI|

**MVP Timeline: Test Period**
- **Days 1-7**: Build core backend (Phases 1-3)
- **Days 8-14**: Add auth and API (Phases 4-5)
- **Days 15-21**: Deploy and build website (Phases 6-7)
- **Days 22-30**: Test with real users, gather feedback
- **Day 25**: **CRITICAL - Upgrade Render PostgreSQL to paid tier ($7/mo) to avoid data loss**

**Post-MVP: Production Hardening**
- Email verification
- Password reset flow
- OAuth (Google, Apple)
- Rate limiting
- Monitoring and alerting
- Consider upgrading Render Web Service to eliminate sleep ($7/mo)

-----

## Deployment Verification Checklist

After deploying to Render, verify the following:

- [ ] Backend health check responds: `curl https://your-app.onrender.com/health`
- [ ] Database connection works (check logs)
- [ ] Can register a new user via API
- [ ] Can login and receive JWT token
- [ ] Can upload a pet (authenticated)
- [ ] Simulation tick runs every 4 hours (check logs)
- [ ] Pet status endpoint returns data
- [ ] Paywall works for free users viewing pets outside Meadow
- [ ] GitHub auto-deploy triggers on push to main

## Critical Upgrade Path

**Before Day 30:**

1. **Day 25**: Upgrade Render PostgreSQL
   - Go to Render dashboard → PostgreSQL → Upgrade to Starter ($7/mo)
   - Verify connection still works
   - Test backups are enabled

2. **Optional**: Upgrade Render Web Service
   - If cold starts are annoying users (25-30 seconds)
   - Upgrade to Starter ($7/mo) to eliminate sleep behavior
   - Or set up UptimeRobot to ping `/health` every 10 minutes (free workaround)

## Next Steps After MVP

### Month 2-3: Production Hardening

1. **Authentication Improvements**
   - Email verification
   - Password reset via email
   - OAuth (Google, Apple) for easier login
   - Rate limiting on auth endpoints

2. **Notifications**
   - Email notifications for deaths
   - Email notifications for new friendships (subscribed users)
   - Daily digest emails

3. **Monitoring & Reliability**
   - Error tracking (Sentry)
   - Uptime monitoring
   - Database backups verification
   - Performance monitoring

### Month 4-6: Mobile Integration

4. **Mobile App Integration**
   - Upload flow in main roguelike app
   - Deep linking to Beyond website
   - Share pet links

5. **Subscription Integration**
   - App Store IAP validation
   - Subscription management
   - Free trial handling

### Future: Expand The Beyond

6. **Beyond App**
   - Standalone app for watching pets
   - Push notifications
   - Interactive features (naming friendships, etc.)

7. **Analytics & Balancing**
   - Track pet survival rates by personality
   - Track friendship formation rates
   - Adjust danger levels and resource abundance
   - Add new regions based on data
