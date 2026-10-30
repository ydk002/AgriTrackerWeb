import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useFarm } from '../hooks/useFarm';
import { useLanguage } from '../hooks/useLanguage';
import { fetchFarmWeather, getWeatherConditionText, getWeatherEmoji } from '../services/weatherService';
import { supabase } from '../lib/supabase';
import {
  extractEventNotes,
  getEventEmoji,
  getEventLabel,
  type WeatherData,
  type WeatherAlert,
  type OperationalEvent,
  type Asset,
  type AssetType,
} from '../types';
import styles from './DashboardPage.module.css';

interface ActivityItem extends OperationalEvent {
  asset_name?: string;
  asset_type?: AssetType;
}

export default function DashboardPage() {
  const { farm, zones, loading: farmLoading, error: farmError, updateCoordinates, createZone } = useFarm();
  const { t } = useLanguage();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [updatingLocation, setUpdatingLocation] = useState(false);

  // Add Zone Modal State
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [zoneDescription, setZoneDescription] = useState('');
  const [zoneSubmitting, setZoneSubmitting] = useState(false);

  const [stats, setStats] = useState({
    totalAssets: 0,
    activeBatches: 0,
  });
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadWeather = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetchFarmWeather(lat, lon);
      setWeather(res.data);
      setAlerts(res.alerts);
      setWeatherError(null);
    } catch (err: unknown) {
      console.error('Weather error:', err);
      setWeatherError('Failed to fetch weather forecast.');
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!farm) return;
    const lat = farm.latitude ?? 46.7712;
    const lon = farm.longitude ?? 23.6236;
    void loadWeather(lat, lon);
  }, [farm, loadWeather]);

  useEffect(() => {
    if (!farm) return;
    const farmId = farm.id;

    async function loadStatsAndActivity() {
      try {
        const [assetsRes, eventsRes] = await Promise.all([
          supabase.from('assets').select('id, name, type, status').eq('farm_id', farmId),
          supabase
            .from('operational_events')
            .select('*')
            .eq('farm_id', farmId)
            .order('offline_timestamp', { ascending: false })
            .limit(5),
        ]);

        const assets = (assetsRes.data || []) as Pick<Asset, 'id' | 'name' | 'type' | 'status'>[];
        const activeCount = assets.filter((a) => a.status === 'active').length;

        setStats({
          totalAssets: assets.length,
          activeBatches: activeCount,
        });

        const eventsData = eventsRes.data;
        if (eventsData && eventsData.length > 0) {
          const assetMap = new Map<string, { name: string; type: AssetType }>();
          assets.forEach((a) => {
            assetMap.set(a.id, { name: a.name, type: a.type });
          });

          const enriched = eventsData.map((ev: OperationalEvent) => {
            const meta = assetMap.get(ev.asset_id);
            return {
              ...ev,
              asset_name: meta?.name || 'Unknown Batch',
              asset_type: meta?.type,
            };
          });

          setRecentActivities(enriched);
        } else {
          setRecentActivities([]);
        }
      } catch (err) {
        console.error('Error loading dashboard stats:', err);
      } finally {
        setStatsLoading(false);
      }
    }

    void loadStatsAndActivity();
  }, [farm]);

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setUpdatingLocation(true);
    setWeatherLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = parseFloat(pos.coords.latitude.toFixed(4));
          const lon = parseFloat(pos.coords.longitude.toFixed(4));
          await updateCoordinates(lat, lon);
          await loadWeather(lat, lon);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          alert('Failed to update coordinates: ' + msg);
          setWeatherLoading(false);
        } finally {
          setUpdatingLocation(false);
        }
      },
      (err) => {
        alert('Could not get GPS location: ' + err.message);
        setUpdatingLocation(false);
        setWeatherLoading(false);
      },
      { timeout: 10000 }
    );
  };

  const handleCreateZone = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setZoneSubmitting(true);
      await createZone(zoneName, zoneDescription);
      setShowZoneModal(false);
      setZoneName('');
      setZoneDescription('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create zone';
      alert('Error creating zone: ' + msg);
    } finally {
      setZoneSubmitting(false);
    }
  };

  if (farmLoading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (farmError) {
    return <div className={styles.error}>{farmError}</div>;
  }

  return (
    <div className={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className={styles.pageTitle} style={{ marginBottom: 4 }}>
            {farm?.name || 'My Farm'} — {t('dashboardTitle')}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            {t('location')}: {farm?.latitude != null ? `${farm.latitude}°, ${farm.longitude}°` : t('defaultRegion')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowZoneModal(true)}
            style={{
              padding: '10px 16px',
              backgroundColor: 'var(--color-primary)',
              color: 'white',
              borderRadius: 'var(--radius)',
              fontSize: '0.9rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            ➕ {t('addFarmZone')}
          </button>
          <button
            onClick={handleDetectLocation}
            disabled={updatingLocation}
            style={{
              padding: '10px 16px',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              fontSize: '0.9rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            📍 {updatingLocation ? t('detectingGps') : t('updateGps')}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.green}`}>🌿</div>
          <div className={styles.summaryInfo}>
            <h3>{statsLoading ? '...' : stats.totalAssets}</h3>
            <p>{t('totalAssetBatches')}</p>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.orange}`}>🚜</div>
          <div className={styles.summaryInfo}>
            <h3>{statsLoading ? '...' : stats.activeBatches}</h3>
            <p>{t('activeBatches')}</p>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.blue}`}>📍</div>
          <div className={styles.summaryInfo}>
            <h3>{zones.length}</h3>
            <p>{t('registeredZones')}</p>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.purple}`}>🌤️</div>
          <div className={styles.summaryInfo}>
            <h3>{weather ? `${Math.round(weather.temperature)}°C` : '...'}</h3>
            <p>{t('currentTemp')}</p>
          </div>
        </div>
      </div>

      {/* Weather Alerts if any */}
      {alerts.map((alert, idx) => (
        <div key={idx} className={`${styles.alertBanner} ${styles[alert.severity]}`}>
          ⚠️ {alert.message}
        </div>
      ))}

      {/* Weather Station Section */}
      <div className={styles.weatherSection}>
        <h2>{t('weatherStationTitle')}</h2>
        {weatherLoading ? (
          <div className={styles.loading}>{t('fetchingWeather')}</div>
        ) : weatherError ? (
          <div className={styles.error}>{weatherError}</div>
        ) : weather ? (
          <>
            <div className={styles.weatherCurrent}>
              <div className={styles.weatherTemp}>
                {Math.round(weather.temperature)}°C
              </div>
              <div className={styles.weatherDetails}>
                <div><strong>{t('condition')}:</strong> {getWeatherConditionText(weather.weatherCode)}</div>
                <div><strong>{t('humidity')}:</strong> {weather.humidity}%</div>
                <div><strong>{t('windSpeed')}:</strong> {weather.windSpeed} km/h</div>
                <div><strong>{t('precipitation')}:</strong> {weather.precipitation} mm</div>
              </div>
            </div>

            {weather.daily && weather.daily.length > 0 && (
              <div className={styles.weatherForecast}>
                {weather.daily.slice(0, 7).map((d) => (
                  <div key={d.date} className={styles.forecastDay}>
                    <div className={styles.day}>
                      {new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })}
                    </div>
                    <div className={styles.icon}>{getWeatherEmoji(d.weatherCode)}</div>
                    <div className={styles.temp}>
                      {Math.round(d.tempMax)}° / {Math.round(d.tempMin)}°
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#1976d2', marginTop: 4 }}>
                      🌧️ {d.precipProbability}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Recent Operational Events Activity */}
      <div className={styles.recentSection}>
        <h2>{t('recentActivityTitle')}</h2>
        {statsLoading ? (
          <div className={styles.loading}>{t('loadingActivities')}</div>
        ) : recentActivities.length === 0 ? (
          <div className={styles.emptyState}>{t('noRecentActivity')}</div>
        ) : (
          <div>
            {recentActivities.map((event) => {
              const notes = extractEventNotes(event.details);
              return (
                <div key={event.id} className={styles.eventRow}>
                  <span className={styles.eventIcon}>{getEventEmoji(event.event_type, event.asset_type)}</span>
                  <div className={styles.eventInfo}>
                    <strong>{event.asset_name}</strong>: {getEventLabel(event.event_type, event.asset_type, t).toUpperCase()} ({event.quantity_affected} {t('affected')})
                    {notes && (
                      <span style={{ color: 'var(--color-text-secondary)', marginLeft: 8 }}>
                        — &ldquo;{notes}&rdquo;
                      </span>
                    )}
                  </div>
                  <div className={styles.eventDate}>
                    {new Date(event.offline_timestamp).toLocaleDateString()}{' '}
                    {new Date(event.offline_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Zone Modal */}
      {showZoneModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: 440,
              width: '100%',
              padding: 24,
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 16 }}>{t('registerZoneTitle')}</h2>
            <form onSubmit={handleCreateZone}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  {t('zoneNameLabel')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('zoneNamePlaceholder')}
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  {t('zoneDescLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('zoneDescPlaceholder')}
                  value={zoneDescription}
                  onChange={(e) => setZoneDescription(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowZoneModal(false)}
                  style={{ padding: '10px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', background: 'transparent', fontWeight: 600, color: 'var(--color-text-secondary)' }}
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={zoneSubmitting}
                  style={{ padding: '10px 16px', borderRadius: 'var(--radius)', background: 'var(--color-primary)', color: 'white', fontWeight: 600 }}
                >
                  {zoneSubmitting ? t('saving') : t('createZoneBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
