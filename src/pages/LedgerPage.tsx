import { useEffect, useState, useMemo, useCallback, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useFarm } from '../hooks/useFarm';
import { supabase } from '../lib/supabase';
import type { VaultItem, LedgerAllocation, Sale, SpoilageLog, Asset, SpoilageReason } from '../types';
import styles from './LedgerPage.module.css';

type LedgerTab = 'vault' | 'allocations' | 'sales' | 'spoilage';

export default function LedgerPage() {
  const { user } = useAuth();
  const { farm } = useFarm();
  const [activeTab, setActiveTab] = useState<LedgerTab>('vault');
  const [loading, setLoading] = useState(true);

  // Data sets
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [allocations, setAllocations] = useState<LedgerAllocation[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [spoilageLogs, setSpoilageLogs] = useState<SpoilageLog[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

  // Modals
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showSpoilageModal, setShowSpoilageModal] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Form: Purchase
  const [purchaseName, setPurchaseName] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseUom, setPurchaseUom] = useState('kg');
  const [purchaseTotalCost, setPurchaseTotalCost] = useState('');

  // Form: Allocate
  const [allocVaultId, setAllocVaultId] = useState('');
  const [allocAssetId, setAllocAssetId] = useState('');
  const [allocQty, setAllocQty] = useState('');

  // Form: Sale
  const [saleAssetId, setSaleAssetId] = useState('');
  const [saleQty, setSaleQty] = useState('');
  const [saleUnitPrice, setSaleUnitPrice] = useState('');

  // Form: Spoilage
  const [spoilVaultId, setSpoilVaultId] = useState('');
  const [spoilQty, setSpoilQty] = useState('');
  const [spoilReason, setSpoilReason] = useState<SpoilageReason>('expired');

  // Load all ledger tables
  const loadLedgerData = useCallback(async () => {
    if (!farm) return;
    try {
      const [vaultRes, allocRes, salesRes, spoilRes, assetsRes] = await Promise.all([
        supabase.from('ledger_vault').select('*').eq('farm_id', farm.id).order('created_at', { ascending: false }),
        supabase.from('ledger_allocations').select('*').eq('farm_id', farm.id).order('allocated_at', { ascending: false }),
        supabase.from('sales').select('*').eq('farm_id', farm.id).order('sold_at', { ascending: false }),
        supabase.from('spoilage_logs').select('*').eq('farm_id', farm.id).order('logged_at', { ascending: false }),
        supabase.from('assets').select('*').eq('farm_id', farm.id),
      ]);

      if (vaultRes.data) setVaultItems(vaultRes.data as VaultItem[]);
      if (allocRes.data) setAllocations(allocRes.data as LedgerAllocation[]);
      if (salesRes.data) setSales(salesRes.data as Sale[]);
      if (spoilRes.data) setSpoilageLogs(spoilRes.data as SpoilageLog[]);
      if (assetsRes.data) setAssets(assetsRes.data as Asset[]);
    } catch (err) {
      console.error('Error fetching ledger data:', err);
    } finally {
      setLoading(false);
    }
  }, [farm]);

  useEffect(() => {
    void loadLedgerData();
  }, [loadLedgerData]);

  // Lookup maps
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a.name])), [assets]);
  const vaultMap = useMemo(() => new Map(vaultItems.map((v) => [v.id, v.item_name])), [vaultItems]);

  // Financial KPI calculations
  const totalSupplyPurchases = useMemo(
    () => vaultItems.reduce((sum, item) => sum + Number(item.total_cost || 0), 0),
    [vaultItems]
  );

  const inventoryVaultValue = useMemo(
    () => vaultItems.reduce((sum, item) => sum + Number(item.remaining_quantity || 0) * Number(item.unit_cost || 0), 0),
    [vaultItems]
  );

  const totalSalesRevenue = useMemo(
    () => sales.reduce((sum, item) => sum + (Number(item.total_revenue) || (Number(item.quantity_sold) * Number(item.unit_price)) || 0), 0),
    [sales]
  );

  const totalSpoilageLoss = useMemo(
    () => spoilageLogs.reduce((sum, item) => sum + Number(item.financial_loss || 0), 0),
    [spoilageLogs]
  );

  const netFarmMargin = totalSalesRevenue - totalSupplyPurchases;

  // 1. Handle Supply Purchase
  const handlePurchase = async (e: FormEvent) => {
    e.preventDefault();
    if (!farm) return;

    try {
      setFormSubmitting(true);
      const qty = parseFloat(purchaseQty);
      const cost = parseFloat(purchaseTotalCost);

      const { error } = await supabase.from('ledger_vault').insert({
        farm_id: farm.id,
        item_name: purchaseName.trim(),
        total_purchased_quantity: qty,
        remaining_quantity: qty,
        unit_of_measurement: purchaseUom,
        total_cost: cost,
      });

      if (error) throw error;

      setShowPurchaseModal(false);
      setPurchaseName('');
      setPurchaseQty('');
      setPurchaseTotalCost('');
      await loadLedgerData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert('Error recording purchase: ' + msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  // 2. Handle Allocation (PostgreSQL trigger trg_calculate_ledger_allocation computes cost & deducts vault stock)
  const handleAllocate = async (e: FormEvent) => {
    e.preventDefault();
    if (!farm || !user) return;

    const vaultItem = vaultItems.find((v) => v.id === allocVaultId);
    if (!vaultItem) return;

    const qty = parseFloat(allocQty);
    if (qty > Number(vaultItem.remaining_quantity)) {
      alert(`Cannot allocate more than remaining stock (${vaultItem.remaining_quantity} ${vaultItem.unit_of_measurement})`);
      return;
    }

    try {
      setFormSubmitting(true);
      const nowIso = new Date().toISOString();
      const calculatedCost = qty * Number(vaultItem.unit_cost);

      const { error: allocErr } = await supabase.from('ledger_allocations').insert({
        farm_id: farm.id,
        vault_item_id: vaultItem.id,
        asset_id: allocAssetId,
        allocated_quantity: qty,
        allocated_cost: calculatedCost,
        allocated_by: user.id,
        allocated_at: nowIso,
      });

      if (allocErr) throw allocErr;

      setShowAllocateModal(false);
      setAllocVaultId('');
      setAllocAssetId('');
      setAllocQty('');
      await loadLedgerData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert('Error recording allocation: ' + msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  // 3. Handle Sale
  const handleSale = async (e: FormEvent) => {
    e.preventDefault();
    if (!farm || !user) return;

    try {
      setFormSubmitting(true);
      const nowIso = new Date().toISOString();
      const qty = parseFloat(saleQty);
      const price = parseFloat(saleUnitPrice);
      const total = qty * price;

      const { error: saleErr } = await supabase.from('sales').insert({
        farm_id: farm.id,
        asset_id: saleAssetId,
        quantity_sold: qty,
        unit_price: price,
        currency: 'RON',
        sold_at: nowIso,
        logged_by: user.id,
      });

      if (saleErr) throw saleErr;

      // Also record operational event with logged_by to reduce asset remaining quantity
      const { error: eventErr } = await supabase.from('operational_events').insert({
        farm_id: farm.id,
        asset_id: saleAssetId,
        logged_by: user.id,
        event_type: 'sale',
        quantity_affected: qty,
        details: { notes: `Commercial sale (${total.toFixed(2)} RON)` },
        offline_timestamp: nowIso,
      });

      if (eventErr) throw eventErr;

      setShowSaleModal(false);
      setSaleAssetId('');
      setSaleQty('');
      setSaleUnitPrice('');
      await loadLedgerData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert('Error recording sale: ' + msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  // 4. Handle Spoilage (PostgreSQL trigger trg_calculate_spoilage computes loss & deducts vault stock)
  const handleSpoilage = async (e: FormEvent) => {
    e.preventDefault();
    if (!farm || !user) return;

    const vaultItem = vaultItems.find((v) => v.id === spoilVaultId);
    if (!vaultItem) return;

    const qty = parseFloat(spoilQty);
    if (qty > Number(vaultItem.remaining_quantity)) {
      alert(`Cannot spoil more than remaining in stock (${vaultItem.remaining_quantity})`);
      return;
    }

    try {
      setFormSubmitting(true);
      const nowIso = new Date().toISOString();
      const loss = qty * Number(vaultItem.unit_cost);

      const { error: spoilErr } = await supabase.from('spoilage_logs').insert({
        farm_id: farm.id,
        vault_item_id: vaultItem.id,
        spoiled_quantity: qty,
        financial_loss: loss,
        reason: spoilReason,
        logged_by: user.id,
        logged_at: nowIso,
      });

      if (spoilErr) throw spoilErr;

      setShowSpoilageModal(false);
      setSpoilVaultId('');
      setSpoilQty('');
      await loadLedgerData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert('Error recording spoilage: ' + msg);
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Financial Ledger</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            Vault inventory, batch cost allocations, sales, and profit analytics
          </p>
        </div>

        <div className={styles.headerActions}>
          <button className={styles.primaryBtn} onClick={() => setShowPurchaseModal(true)}>
            <span>🛒</span> Purchase Supply
          </button>
          <button className={styles.secondaryBtn} onClick={() => setShowAllocateModal(true)}>
            <span>⚖️</span> Allocate to Batch
          </button>
          <button className={styles.secondaryBtn} onClick={() => setShowSaleModal(true)}>
            <span>💰</span> Record Sale
          </button>
          <button className={styles.secondaryBtn} onClick={() => setShowSpoilageModal(true)}>
            <span>⚠️</span> Log Spoilage
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <p>Total Supply Purchases</p>
          <h2 style={{ color: '#d32f2f' }}>{totalSupplyPurchases.toFixed(2)} RON</h2>
        </div>

        <div className={styles.kpiCard}>
          <p>Vault Inventory On-Hand</p>
          <h2 style={{ color: '#1976d2' }}>{inventoryVaultValue.toFixed(2)} RON</h2>
        </div>

        <div className={styles.kpiCard}>
          <p>Total Sales Revenue</p>
          <h2 style={{ color: '#388e3c' }}>{totalSalesRevenue.toFixed(2)} RON</h2>
        </div>

        <div className={styles.kpiCard}>
          <p>Total Spoilage Losses</p>
          <h2 style={{ color: '#c62828' }}>-{totalSpoilageLoss.toFixed(2)} RON</h2>
        </div>

        <div className={styles.kpiCard}>
          <p>Net Farm Margin</p>
          <h2 style={{ color: netFarmMargin >= 0 ? 'var(--color-primary)' : 'var(--color-error)' }}>
            {netFarmMargin >= 0 ? '+' : ''}{netFarmMargin.toFixed(2)} RON
          </h2>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'vault' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('vault')}
        >
          📦 Vault Inventory ({vaultItems.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'allocations' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('allocations')}
        >
          ⚖️ Cost Allocations ({allocations.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'sales' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('sales')}
        >
          💰 Sales Records ({sales.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'spoilage' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('spoilage')}
        >
          🗑️ Spoilage ({spoilageLogs.length})
        </button>
      </div>

      {/* Tab 1: Vault Inventory */}
      {activeTab === 'vault' && (
        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.emptyState}>Loading vault inventory...</div>
          ) : vaultItems.length === 0 ? (
            <div className={styles.emptyState}>No bulk supplies registered. Click &ldquo;Purchase Supply&rdquo; above.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Stock Remaining</th>
                  <th>Purchased Qty</th>
                  <th>Unit Cost</th>
                  <th>Total Cost</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {vaultItems.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.item_name}</strong></td>
                    <td>
                      <span style={{ fontWeight: 600, color: Number(item.remaining_quantity) > 0 ? 'inherit' : 'var(--color-error)' }}>
                        {Number(item.remaining_quantity).toLocaleString()} {item.unit_of_measurement}
                      </span>
                    </td>
                    <td>{Number(item.total_purchased_quantity).toLocaleString()} {item.unit_of_measurement}</td>
                    <td>{Number(item.unit_cost || (item.total_cost / item.total_purchased_quantity)).toFixed(2)} RON / {item.unit_of_measurement}</td>
                    <td>{Number(item.total_cost).toFixed(2)} RON</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(item.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 2: Allocations */}
      {activeTab === 'allocations' && (
        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.emptyState}>Loading allocations...</div>
          ) : allocations.length === 0 ? (
            <div className={styles.emptyState}>No cost allocations recorded yet.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Supply Item</th>
                  <th>Allocated To Batch</th>
                  <th>Quantity Allocated</th>
                  <th>Allocated Cost</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{vaultMap.get(a.vault_item_id) || 'Unknown Supply'}</strong></td>
                    <td>{assetMap.get(a.asset_id) || 'Unknown Batch'}</td>
                    <td>{Number(a.allocated_quantity).toLocaleString()}</td>
                    <td style={{ fontWeight: 600, color: '#e65100' }}>{Number(a.allocated_cost).toFixed(2)} RON</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(a.allocated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Sales */}
      {activeTab === 'sales' && (
        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.emptyState}>Loading sales records...</div>
          ) : sales.length === 0 ? (
            <div className={styles.emptyState}>No sales recorded yet. Click &ldquo;Record Sale&rdquo; to register revenue.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Asset Sold</th>
                  <th>Quantity Sold</th>
                  <th>Unit Price</th>
                  <th>Total Revenue</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const rev = Number(s.total_revenue) || (Number(s.quantity_sold) * Number(s.unit_price));
                  return (
                    <tr key={s.id}>
                      <td><strong>{assetMap.get(s.asset_id) || 'Unknown Asset'}</strong></td>
                      <td>{Number(s.quantity_sold).toLocaleString()}</td>
                      <td>{Number(s.unit_price).toFixed(2)} RON</td>
                      <td style={{ fontWeight: 700, color: 'var(--color-primary)' }}>+{rev.toFixed(2)} RON</td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(s.sold_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 4: Spoilage */}
      {activeTab === 'spoilage' && (
        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.emptyState}>Loading spoilage logs...</div>
          ) : spoilageLogs.length === 0 ? (
            <div className={styles.emptyState}>No spoilage or wasted supply reported.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Supply Item</th>
                  <th>Quantity Spoiled</th>
                  <th>Reason</th>
                  <th>Financial Loss</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {spoilageLogs.map((sp) => (
                  <tr key={sp.id}>
                    <td><strong>{vaultMap.get(sp.vault_item_id) || 'Unknown Supply'}</strong></td>
                    <td>{Number(sp.spoiled_quantity).toLocaleString()}</td>
                    <td><span style={{ textTransform: 'uppercase', fontSize: '0.8rem', background: '#ffebee', padding: '2px 8px', borderRadius: 4, color: '#c62828' }}>{sp.reason}</span></td>
                    <td style={{ fontWeight: 600, color: '#c62828' }}>-{Number(sp.financial_loss).toFixed(2)} RON</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(sp.logged_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── Modal 1: Purchase Supply ─── */}
      {showPurchaseModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Purchase Bulk Supply (Vault)</h2>
            <form onSubmit={handlePurchase}>
              <div className={styles.formGroup}>
                <label>Supply Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Broiler Grower Feed, Organic Fertilizer"
                  value={purchaseName}
                  onChange={(e) => setPurchaseName(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className={styles.formGroup}>
                  <label>Total Quantity</label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="e.g. 500"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Unit of Measure</label>
                  <select value={purchaseUom} onChange={(e) => setPurchaseUom(e.target.value)}>
                    <option value="kg">kg</option>
                    <option value="liters">liters</option>
                    <option value="bags">bags</option>
                    <option value="pcs">pcs</option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Total Invoice Cost (RON)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="e.g. 1250.00"
                  value={purchaseTotalCost}
                  onChange={(e) => setPurchaseTotalCost(e.target.value)}
                />
              </div>

              <div className={styles.modalButtons}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowPurchaseModal(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={formSubmitting}>
                  {formSubmitting ? 'Saving...' : 'Add to Vault'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Allocate to Batch ─── */}
      {showAllocateModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Allocate Supply to Batch</h2>
            <form onSubmit={handleAllocate}>
              <div className={styles.formGroup}>
                <label>Select Vault Item</label>
                <select required value={allocVaultId} onChange={(e) => setAllocVaultId(e.target.value)}>
                  <option value="">-- Choose Vault Supply --</option>
                  {vaultItems.filter((v) => Number(v.remaining_quantity) > 0).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.item_name} ({v.remaining_quantity} {v.unit_of_measurement} remaining)
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Target Asset Batch</label>
                <select required value={allocAssetId} onChange={(e) => setAllocAssetId(e.target.value)}>
                  <option value="">-- Choose Batch --</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.variety})
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Quantity to Allocate</label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder="e.g. 25"
                  value={allocQty}
                  onChange={(e) => setAllocQty(e.target.value)}
                />
              </div>

              <div className={styles.modalButtons}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowAllocateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={formSubmitting}>
                  {formSubmitting ? 'Allocating...' : 'Confirm Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 3: Record Sale ─── */}
      {showSaleModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Record Commercial Sale</h2>
            <form onSubmit={handleSale}>
              <div className={styles.formGroup}>
                <label>Select Asset Batch</label>
                <select required value={saleAssetId} onChange={(e) => setSaleAssetId(e.target.value)}>
                  <option value="">-- Choose Asset --</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.variety})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className={styles.formGroup}>
                  <label>Quantity Sold</label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="e.g. 50"
                    value={saleQty}
                    onChange={(e) => setSaleQty(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Unit Price (RON)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 15.50"
                    value={saleUnitPrice}
                    onChange={(e) => setSaleUnitPrice(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.modalButtons}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowSaleModal(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={formSubmitting}>
                  {formSubmitting ? 'Saving...' : 'Record Revenue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal 4: Log Spoilage ─── */}
      {showSpoilageModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Record Supply Spoilage</h2>
            <form onSubmit={handleSpoilage}>
              <div className={styles.formGroup}>
                <label>Select Vault Item</label>
                <select required value={spoilVaultId} onChange={(e) => setSpoilVaultId(e.target.value)}>
                  <option value="">-- Choose Vault Item --</option>
                  {vaultItems.filter((v) => Number(v.remaining_quantity) > 0).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.item_name} ({v.remaining_quantity} {v.unit_of_measurement} remaining)
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className={styles.formGroup}>
                  <label>Quantity Spoiled</label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="e.g. 5"
                    value={spoilQty}
                    onChange={(e) => setSpoilQty(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Reason</label>
                  <select value={spoilReason} onChange={(e) => setSpoilReason(e.target.value as SpoilageReason)}>
                    <option value="expired">Expired</option>
                    <option value="spill">Spill / Damage</option>
                    <option value="pest">Pest Infestation</option>
                    <option value="disease">Disease / Mold</option>
                  </select>
                </div>
              </div>

              <div className={styles.modalButtons}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowSpoilageModal(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={formSubmitting}>
                  {formSubmitting ? 'Saving...' : 'Log Loss'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
