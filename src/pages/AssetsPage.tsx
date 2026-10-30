import { useEffect, useState, useMemo, useCallback, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useFarm } from '../hooks/useFarm';
import { useLanguage } from '../hooks/useLanguage';
import { supabase } from '../lib/supabase';
import {
  extractEventNotes,
  getEventEmoji,
  getEventLabel,
  type Asset,
  type OperationalEvent,
  type AssetType,
  type AssetStatus,
  type EventType,
  type AssetWithBalance,
  type LedgerAllocation,
  type Sale,
} from '../types';
import styles from './AssetsPage.module.css';

export default function AssetsPage() {
  const { user } = useAuth();
  const { farm, zones, createZone } = useFarm();
  const { t } = useLanguage();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [events, setEvents] = useState<OperationalEvent[]>([]);
  const [allocations, setAllocations] = useState<LedgerAllocation[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'crop' | 'livestock'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'harvested' | 'disposed' | 'split'>('all');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [selectedAssetForEvent, setSelectedAssetForEvent] = useState<Asset | null>(null);
  const [selectedAssetForHistory, setSelectedAssetForHistory] = useState<Asset | null>(null);

  // Form states for Add Zone
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneDesc, setNewZoneDesc] = useState('');

  // Form states for Add Asset
  const [name, setName] = useState('');
  const [type, setType] = useState<AssetType>('crop');
  const [variety, setVariety] = useState('');
  const [initialQty, setInitialQty] = useState('');
  const [uom, setUom] = useState('kg');
  const [zoneId, setZoneId] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Form states for Log Event
  const [eventType, setEventType] = useState<EventType>('feeding');
  const [eventQty, setEventQty] = useState('');
  const [eventNotes, setEventNotes] = useState('');

  // Load assets, events, and financials
  const loadData = useCallback(async () => {
    if (!farm) return;
    try {
      const [assetsRes, eventsRes, allocRes, salesRes] = await Promise.all([
        supabase.from('assets').select('*').eq('farm_id', farm.id).order('created_at', { ascending: false }),
        supabase.from('operational_events').select('*').eq('farm_id', farm.id).order('offline_timestamp', { ascending: false }),
        supabase.from('ledger_allocations').select('*').eq('farm_id', farm.id),
        supabase.from('sales').select('*').eq('farm_id', farm.id),
      ]);

      if (assetsRes.error) throw assetsRes.error;
      if (eventsRes.error) throw eventsRes.error;

      setAssets((assetsRes.data || []) as Asset[]);
      setEvents((eventsRes.data || []) as OperationalEvent[]);
      setAllocations((allocRes.data || []) as LedgerAllocation[]);
      setSales((salesRes.data || []) as Sale[]);
    } catch (err) {
      console.error('Error loading assets data:', err);
    } finally {
      setLoading(false);
    }
  }, [farm]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Compute remaining balances via pure event sourcing
  const enrichedAssets: AssetWithBalance[] = useMemo(() => {
    const reducingTypes = ['attrition', 'harvest', 'split', 'sale'];
    const zoneMap = new Map(zones.map((z) => [z.id, z.name]));

    return assets.map((asset) => {
      const assetEvents = events.filter((e) => e.asset_id === asset.id && reducingTypes.includes(e.event_type));
      const totalReduction = assetEvents.reduce((acc, curr) => acc + Number(curr.quantity_affected), 0);
      const remaining = Math.max(0, Number(asset.initial_quantity) - totalReduction);

      return {
        ...asset,
        remaining_quantity: remaining,
        zone_name: asset.zone_id ? zoneMap.get(asset.zone_id) || t('unassigned') : t('unassigned'),
      };
    });
  }, [assets, events, zones, t]);

  // Filtered list
  const filteredAssets = useMemo(() => {
    return enrichedAssets.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.variety.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'all' || a.type === typeFilter;
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [enrichedAssets, search, typeFilter, statusFilter]);

  const getBatchFinancials = (assetId: string) => {
    const allocatedCost = allocations
      .filter((a) => a.asset_id === assetId)
      .reduce((sum, a) => sum + Number(a.allocated_cost || 0), 0);
    const totalRevenue = sales
      .filter((s) => s.asset_id === assetId)
      .reduce((sum, s) => sum + (Number(s.total_revenue) || Number(s.quantity_sold) * Number(s.unit_price) || 0), 0);
    return {
      allocatedCost,
      totalRevenue,
      profitability: totalRevenue - allocatedCost,
    };
  };

  // Handle Create Zone
  const handleCreateZone = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setFormSubmitting(true);
      await createZone(newZoneName, newZoneDesc);
      setShowZoneModal(false);
      setNewZoneName('');
      setNewZoneDesc('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create zone';
      alert('Error creating zone: ' + msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Add Asset
  const handleCreateAsset = async (e: FormEvent) => {
    e.preventDefault();
    if (!farm || !user) return;

    try {
      setFormSubmitting(true);
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('assets')
        .insert({
          farm_id: farm.id,
          name: name.trim(),
          type,
          variety: variety.trim(),
          initial_quantity: parseFloat(initialQty),
          unit_of_measurement: uom,
          zone_id: zoneId || null,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      const initialNote =
        type === 'livestock' ? 'Initial flock/herd registration' : 'Initial crop planting';

      const { error: eventErr } = await supabase.from('operational_events').insert({
        farm_id: farm.id,
        asset_id: data.id,
        logged_by: user.id,
        event_type: 'planting',
        quantity_affected: parseFloat(initialQty),
        details: { notes: initialNote },
        offline_timestamp: nowIso,
      });

      if (eventErr) throw eventErr;

      setShowAddModal(false);
      resetAddForm();
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert('Error creating asset: ' + msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  const resetAddForm = () => {
    setName('');
    setType('crop');
    setVariety('');
    setInitialQty('');
    setUom('kg');
    setZoneId('');
  };

  // Handle Log Event
  const handleLogEvent = async (e: FormEvent) => {
    e.preventDefault();
    if (!farm || !user || !selectedAssetForEvent) return;

    try {
      setFormSubmitting(true);
      const qty = parseFloat(eventQty) || 0;
      const nowIso = new Date().toISOString();

      const { error } = await supabase.from('operational_events').insert({
        farm_id: farm.id,
        asset_id: selectedAssetForEvent.id,
        logged_by: user.id,
        event_type: eventType,
        quantity_affected: qty,
        details: { notes: eventNotes.trim() },
        offline_timestamp: nowIso,
      });

      if (error) throw error;

      setSelectedAssetForEvent(null);
      setEventQty('');
      setEventNotes('');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert('Error logging event: ' + msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Zone Assignment / Reassignment
  const handleUpdateZone = async (asset: Asset, newZoneId: string | null) => {
    try {
      const { error } = await supabase
        .from('assets')
        .update({ zone_id: newZoneId, updated_at: new Date().toISOString() })
        .eq('id', asset.id);
      if (error) throw error;
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert('Failed to update zone assignment: ' + msg);
    }
  };

  // Handle Status Update
  const handleUpdateStatus = async (asset: Asset, newStatus: AssetStatus) => {
    try {
      const { error } = await supabase
        .from('assets')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', asset.id);
      if (error) throw error;
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert('Failed to update asset status: ' + msg);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('assetBatchesTitle')}</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            {t('assetBatchesSubtitle')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className={styles.actionBtn}
            style={{ padding: '10px 16px', flex: '0 0 auto' }}
            onClick={() => setShowZoneModal(true)}
          >
            📍 {t('newZoneBtn')}
          </button>
          <button className={styles.primaryBtn} onClick={() => setShowAddModal(true)}>
            <span>➕</span> {t('addNewBatchBtn')}
          </button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className={styles.controls}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className={styles.filterSelect}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | 'crop' | 'livestock')}
        >
          <option value="all">{t('allTypes')}</option>
          <option value="crop">🌾 {t('crops')}</option>
          <option value="livestock">🐄 {t('livestock')}</option>
        </select>

        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'harvested' | 'disposed' | 'split')}
        >
          <option value="all">{t('allStatuses')}</option>
          <option value="active">{t('active')}</option>
          <option value="harvested">{t('harvested')}</option>
          <option value="split">{t('split')}</option>
          <option value="disposed">{t('disposed')}</option>
        </select>
      </div>

      {/* Asset Cards Grid */}
      {loading ? (
        <div className={styles.emptyState}>{t('loadingAssets')}</div>
      ) : filteredAssets.length === 0 ? (
        <div className={styles.emptyState}>{t('noAssetsFound')}</div>
      ) : (
        <div className={styles.grid}>
          {filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className={`${styles.card} ${asset.type === 'livestock' ? styles.livestock : ''}`}
            >
              <div>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.assetName}>
                      {asset.type === 'crop' ? '🌾' : '🐄'} {asset.name}
                    </h3>
                    <div className={styles.assetVariety}>{asset.variety}</div>
                  </div>
                  <span className={`${styles.badge} ${styles[asset.status]}`}>
                    {t(asset.status)}
                  </span>
                </div>

                <div className={styles.metaRow} style={{ alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    📍 {t('zone')}:
                    <select
                      aria-label="Assign or change zone"
                      value={asset.zone_id || ''}
                      onChange={(e) => handleUpdateZone(asset, e.target.value || null)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">{t('unassigned')}</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span>{t('unit')}: <strong>{asset.unit_of_measurement}</strong></span>
                </div>

                <div className={styles.metrics}>
                  <div className={styles.metricItem}>
                    <p>{t('currentBalance')}</p>
                    <span style={{ color: asset.remaining_quantity > 0 ? 'var(--color-primary)' : 'var(--color-error)' }}>
                      {asset.remaining_quantity.toLocaleString()} {asset.unit_of_measurement}
                    </span>
                  </div>
                  <div className={styles.metricItem}>
                    <p>{t('initialSize')}</p>
                    <span>
                      {Number(asset.initial_quantity).toLocaleString()} {asset.unit_of_measurement}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.actions}>
                <button
                  className={`${styles.actionBtn} ${styles.primary}`}
                  onClick={() => setSelectedAssetForEvent(asset)}
                >
                  📝 {t('logEventBtn')}
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={() => setSelectedAssetForHistory(asset)}
                >
                  📜 {t('detailsHistoryBtn')}
                </button>
                <select
                  aria-label="Update batch status"
                  className={styles.actionBtn}
                  style={{ flex: '0 0 auto', width: 'auto', padding: '6px 8px' }}
                  value={asset.status}
                  onChange={(e) => handleUpdateStatus(asset, e.target.value as AssetStatus)}
                >
                  <option value="active">{t('active')}</option>
                  <option value="harvested">{t('harvested')}</option>
                  <option value="split">{t('split')}</option>
                  <option value="disposed">{t('disposed')}</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Add Zone Modal ─── */}
      {showZoneModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>{t('registerZoneTitle')}</h2>
            <form onSubmit={handleCreateZone}>
              <div className={styles.formGroup}>
                <label>{t('zoneNameLabel')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('zoneNamePlaceholder')}
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>{t('zoneDescLabel')}</label>
                <input
                  type="text"
                  placeholder={t('zoneDescPlaceholder')}
                  value={newZoneDesc}
                  onChange={(e) => setNewZoneDesc(e.target.value)}
                />
              </div>

              <div className={styles.modalButtons}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowZoneModal(false)}
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={formSubmitting}
                >
                  {formSubmitting ? t('saving') : t('createZoneBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Add Asset Modal ─── */}
      {showAddModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>{t('registerBatchTitle')}</h2>
            <form onSubmit={handleCreateAsset}>
              <div className={styles.formGroup}>
                <label>{t('assetNameLabel')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('assetNamePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className={styles.formGroup}>
                  <label>{t('typeLabel')}</label>
                  <select
                    value={type}
                    onChange={(e) => {
                      const nextType = e.target.value as AssetType;
                      setType(nextType);
                      if (nextType === 'livestock' && uom === 'kg') setUom('heads');
                      if (nextType === 'crop' && uom === 'heads') setUom('kg');
                    }}
                  >
                    <option value="crop">🌾 {t('cropOption')}</option>
                    <option value="livestock">🐄 {t('livestockOption')}</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>{t('varietyLabel')}</label>
                  <input
                    type="text"
                    required
                    placeholder={t('varietyPlaceholder')}
                    value={variety}
                    onChange={(e) => setVariety(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className={styles.formGroup}>
                  <label>{t('initialQtyLabel')}</label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="500"
                    value={initialQty}
                    onChange={(e) => setInitialQty(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>{t('uomLabel')}</label>
                  <select value={uom} onChange={(e) => setUom(e.target.value)}>
                    <option value="kg">kg</option>
                    <option value="pcs">pcs</option>
                    <option value="heads">heads</option>
                    <option value="liters">liters</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>{t('zoneLocationLabel')}</label>
                <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                  <option value="">{t('noZoneAssigned')}</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} {z.description ? `(${z.description})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.modalButtons}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowAddModal(false)}
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={formSubmitting}
                >
                  {formSubmitting ? t('creating') : t('createBatchBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Log Event Modal ─── */}
      {selectedAssetForEvent && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>
              {t('logEventTitle')}: {selectedAssetForEvent.name}
            </h2>
            <form onSubmit={handleLogEvent}>
              <div className={styles.formGroup}>
                <label>{t('eventTypeLabel')}</label>
                <select value={eventType} onChange={(e) => setEventType(e.target.value as EventType)}>
                  <option value="feeding">
                    🌾 {selectedAssetForEvent.type === 'crop' ? t('event_feeding_crop') : t('event_feeding_livestock')}
                  </option>
                  <option value="medication">💊 {t('event_medication')}</option>
                  <option value="harvest">
                    🧺 {selectedAssetForEvent.type === 'livestock' ? t('event_harvest_livestock') : t('event_harvest_crop')}
                  </option>
                  <option value="attrition">📉 {t('event_attrition')}</option>
                  <option value="split">✂️ {t('event_split')}</option>
                  <option value="sale">💰 {t('event_sale')}</option>
                  <option value="planting">
                    {selectedAssetForEvent.type === 'livestock' ? `🐣 ${t('event_planting_livestock')}` : `🌱 ${t('event_planting_crop')}`}
                  </option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>
                  {t('qtyAffectedLabel')} ({selectedAssetForEvent.unit_of_measurement})
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginLeft: 8 }}>
                    {t('qtyAffectedHint')}
                  </span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={eventQty}
                  onChange={(e) => setEventQty(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label>{t('fieldNotesLabel')}</label>
                <textarea
                  rows={3}
                  placeholder={t('fieldNotesPlaceholder')}
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                />
              </div>

              <div className={styles.modalButtons}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setSelectedAssetForEvent(null)}
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={formSubmitting}
                >
                  {formSubmitting ? t('recording') : t('recordEventBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── History & Unit Economics Modal ─── */}
      {selectedAssetForHistory && (() => {
        const fin = getBatchFinancials(selectedAssetForHistory.id);
        const batchEvents = events.filter((e) => e.asset_id === selectedAssetForHistory.id);
        return (
          <div className={styles.modalBackdrop}>
            <div className={styles.modalContent}>
              <h2 className={styles.modalTitle}>
                {selectedAssetForHistory.name} — {t('detailsSuffix')}
              </h2>

              {/* Unit Economics Summary */}
              <div
                style={{
                  background: 'var(--color-primary-subtle)',
                  border: '1px solid var(--color-primary-border)',
                  borderRadius: 'var(--radius)',
                  padding: 14,
                  marginBottom: 16,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8,
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{t('allocatedCost')}</div>
                  <div style={{ fontWeight: 700, color: 'var(--color-secondary)' }}>{fin.allocatedCost.toFixed(2)} RON</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{t('salesRevenue')}</div>
                  <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{fin.totalRevenue.toFixed(2)} RON</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{t('netProfit')}</div>
                  <div style={{ fontWeight: 700, color: fin.profitability >= 0 ? 'var(--color-primary)' : 'var(--color-error)' }}>
                    {fin.profitability >= 0 ? '+' : ''}{fin.profitability.toFixed(2)} RON
                  </div>
                </div>
              </div>

              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 8 }}>{t('eventTimelineTitle')}</h3>
              <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 20 }}>
                {batchEvents.length === 0 ? (
                  <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: 20 }}>
                    {t('noEventsRecorded')}
                  </p>
                ) : (
                  batchEvents.map((ev) => {
                    const notes = extractEventNotes(ev.details);
                    return (
                      <div
                        key={ev.id}
                        style={{
                          padding: '10px 12px',
                          borderBottom: '1px solid var(--color-border)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <strong>
                            {getEventEmoji(ev.event_type, selectedAssetForHistory.type)}{' '}
                            {getEventLabel(ev.event_type, selectedAssetForHistory.type, t)}
                          </strong>
                          {Number(ev.quantity_affected) > 0 && (
                            <span style={{ color: 'var(--color-text-secondary)', marginLeft: 8 }}>
                              ({ev.quantity_affected} {selectedAssetForHistory.unit_of_measurement})
                            </span>
                          )}
                          {notes && <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>{notes}</p>}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                          {new Date(ev.offline_timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className={styles.modalButtons}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setSelectedAssetForHistory(null)}
                >
                  {t('close')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
