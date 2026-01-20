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
