import { Region } from './types';

export const CONFIG = {
  TICK_INTERVAL_MS: 4 * 60 * 60 * 1000,  // 4 hours
  HUNGER_DECAY_PER_TICK: 15,
  STARVATION_HP_LOSS: 20,
  MAX_HP: 100,
  MAX_HUNGER: 100,
  DEV_MODE: process.env.NODE_ENV === 'development',
};

export const REGIONS: Record<string, Region> = {
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
