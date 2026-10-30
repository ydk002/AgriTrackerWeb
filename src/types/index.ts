/* ─── Enums ─── */

export type AssetType = 'crop' | 'livestock';
export type AssetStatus = 'active' | 'harvested' | 'disposed' | 'split';
export type EventType = 'planting' | 'feeding' | 'medication' | 'attrition' | 'harvest' | 'split' | 'sale';
export type SpoilageReason = 'expired' | 'spill' | 'pest' | 'disease';

/* ─── Database Models (matching Supabase snake_case) ─── */

export interface Farm {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface Profile {
  id: string;
  farm_id: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface Zone {
  id: string;
  farm_id: string;
  name: string;
  description: string | null;
  shield_metadata: Record<string, unknown> | string;
  created_at: string;
}

export interface Asset {
  id: string;
  farm_id: string;
  parent_id: string | null;
  zone_id: string | null;
  name: string;
  type: AssetType;
  variety: string;
  initial_quantity: number;
  unit_of_measurement: string;
  status: AssetStatus;
  created_at: string;
  updated_at: string;
}

export interface OperationalEvent {
  id: string;
  farm_id: string;
  asset_id: string;
  logged_by: string | null;
  event_type: EventType;
  quantity_affected: number;
  details: Record<string, unknown> | string;
  offline_timestamp: string;
  server_timestamp: string | null;
}

export interface VaultItem {
  id: string;
  farm_id: string;
  item_name: string;
  total_purchased_quantity: number;
  remaining_quantity: number;
  unit_of_measurement: string;
  total_cost: number;
  unit_cost: number;
  created_at: string;
}

export interface LedgerAllocation {
  id: string;
  farm_id: string;
  vault_item_id: string;
  asset_id: string;
  allocated_quantity: number;
  allocated_cost: number;
  allocated_by: string | null;
  allocated_at: string;
}

export interface SpoilageLog {
  id: string;
  farm_id: string;
  vault_item_id: string;
  spoiled_quantity: number;
  financial_loss: number;
  reason: SpoilageReason;
  logged_by: string | null;
  logged_at: string;
}

export interface Sale {
  id: string;
  farm_id: string;
  asset_id: string;
  quantity_sold: number;
  unit_price: number;
  total_revenue: number;
  currency: string;
  sold_at: string;
  logged_by: string | null;
}

/* ─── Computed Types ─── */

export interface AssetWithBalance extends Asset {
  remaining_quantity: number;
  zone_name?: string;
}

export interface AssetFinancials {
  allocated_cost: number;
  total_revenue: number;
  profitability: number;
}

/* ─── Weather ─── */

export interface WeatherData {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  humidity: number;
  precipitation: number;
  daily?: {
    date: string;
    tempMax: number;
    tempMin: number;
    weatherCode: number;
    precipProbability: number;
  }[];
}

export interface WeatherAlert {
  type: 'frost' | 'heat' | 'storm' | 'rain';
  message: string;
  severity: 'warning' | 'danger';
}

/* ─── Helpers ─── */

export function extractEventNotes(details: unknown): string {
  if (!details) return '';
  if (typeof details === 'object' && details !== null && 'notes' in details) {
    const notes = (details as { notes?: unknown }).notes;
    return typeof notes === 'string' ? notes : '';
  }
  if (typeof details === 'string') {
    try {
      const parsed = JSON.parse(details);
      return typeof parsed?.notes === 'string' ? parsed.notes : '';
    } catch {
      return '';
    }
  }
  return '';
}

export function getEventEmoji(eventType: string, assetType?: AssetType): string {
  switch (eventType) {
    case 'planting':
      return assetType === 'livestock' ? '🐣' : '🌱';
    case 'feeding':
      return '🌾';
    case 'medication':
      return '💊';
    case 'harvest':
      return '🧺';
    case 'attrition':
      return '📉';
    case 'split':
      return '✂️';
    case 'sale':
      return '💰';
    default:
      return '📋';
  }
}

export function getEventLabel(
  eventType: string,
  assetType?: AssetType,
  t?: (key: string) => string
): string {
  if (t) {
    switch (eventType) {
      case 'planting':
        return assetType === 'livestock' ? t('event_planting_livestock') : t('event_planting_crop');
      case 'feeding':
        return assetType === 'crop' ? t('event_feeding_crop') : t('event_feeding_livestock');
      case 'medication':
        return t('event_medication');
      case 'harvest':
        return assetType === 'livestock' ? t('event_harvest_livestock') : t('event_harvest_crop');
      case 'attrition':
        return t('event_attrition');
      case 'split':
        return t('event_split');
      case 'sale':
        return t('event_sale');
      default:
        return eventType;
    }
  }

  switch (eventType) {
    case 'planting':
      return assetType === 'livestock' ? 'Birth / Restock' : 'Planting';
    case 'feeding':
      return assetType === 'crop' ? 'Fertilize / Care' : 'Feeding';
    case 'medication':
      return 'Medication';
    case 'harvest':
      return assetType === 'livestock' ? 'Collection / Yield' : 'Harvest';
    case 'attrition':
      return 'Loss / Attrition';
    case 'split':
      return 'Split Batch';
    case 'sale':
      return 'Sale';
    default:
      return eventType;
  }
}
