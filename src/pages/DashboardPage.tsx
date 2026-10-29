import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useFarm } from '../hooks/useFarm';
import { fetchFarmWeather, getWeatherConditionText, getWeatherEmoji } from '../services/weatherService';
import { supabase } from '../lib/supabase';
import { extractEventNotes, type WeatherData, type WeatherAlert, type OperationalEvent, type Asset } from '../types';
import styles from './DashboardPage.module.css';

interface ActivityItem extends OperationalEvent {
  asset_name?: string;
}

export default function DashboardPage() {
  const { farm, zones, loading: farmLoading, error: farmError, updateCoordinates, createZone } = useFarm();
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
          supabase.from('assets').select('id, status').eq('farm_id', farmId),
          supabase
            .from('operational_events')
            .select('*')
            .eq('farm_id', farmId)
            .order('offline_timestamp', { ascending: false })
            .limit(5),
        ]);

        const assets = assetsRes.data || [];
        const activeCount = assets.filter((a) => a.status === 'active').length;

        setStats({
          totalAssets: assets.length,
          activeBatches: activeCount,
        });

        const eventsData = eventsRes.data;
        if (eventsData && eventsData.length > 0) {
          const assetIds = Array.from(new Set(eventsData.map((e) => e.asset_id)));
          const { data: assetNames } = await supabase
            .from('assets')
            .select('id, name')
            .in('id', assetIds);

          const assetMap = new Map<string, string>();
          (assetNames || []).forEach((a: Partial<Asset>) => {
            if (a.id && a.name) assetMap.set(a.id, a.name);
          });

          const enriched = eventsData.map((ev: OperationalEvent) => ({
            ...ev,
            asset_name: assetMap.get(ev.asset_id) || 'Unknown Batch',
          }));

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

  const getEventEmoji = (type: string) => {
    switch (type) {
      case 'planting': return '🌱';
      case 'feeding': return '🌾';
      case 'medication': return '💊';
      case 'harvest': return '🧺';
      case 'attrition': return '📉';
      case 'split': return '✂️';
      case 'sale': return '💰';
      default: return '📋';
    }
  };

  if (farmLoading) {
    return <div className={styles.loading}>Loading farm details...</div>;
  }

  if (farmError) {
    return <div className={styles.error}>{farmError}</div>;
  }

  return (
    <div className={styles.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className={styles.pageTitle} style={{ marginBottom: 4 }}>{farm?.name || 'My Farm'} Dashboard</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
            Location: {farm?.latitude != null ? `${farm.latitude}°, ${farm.longitude}°` : 'Default Region (Transylvania)'}
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
            ➕ Add Farm Zone
          </button>
          <button
            onClick={handleDetectLocation}
            disabled={updatingLocation}
            style={{
              padding: '10px 16px',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              fontSize: '0.9rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            📍 {updatingLocation ? 'Detecting GPS...' : 'Update Farm GPS'}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.green}`}>🌿</div>
          <div className={styles.summaryInfo}>
            <h3>{statsLoading ? '...' : stats.totalAssets}</h3>
            <p>Total Asset Batches</p>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.orange}`}>🚜</div>
          <div className={styles.summaryInfo}>
            <h3>{statsLoading ? '...' : stats.activeBatches}</h3>
            <p>Active Batches</p>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.blue}`}>📍</div>
          <div className={styles.summaryInfo}>
            <h3>{zones.length}</h3>
            <p>Registered Zones</p>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <div className={`${styles.summaryIcon} ${styles.purple}`}>🌤️</div>
          <div className={styles.summaryInfo}>
            <h3>{weather ? `${Math.round(weather.temperature)}°C` : '...'}</h3>
            <p>Current Temperature</p>
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
        <h2>Weather Station & 7-Day Forecast</h2>
        {weatherLoading ? (
          <div className={styles.loading}>Fetching live weather telemetry...</div>
        ) : weatherError ? (
          <div className={styles.error}>{weatherError}</div>
        ) : weather ? (
          <>
            <div className={styles.weatherCurrent}>
              <div className={styles.weatherTemp}>
                {Math.round(weather.temperature)}°C
              </div>
              <div className={styles.weatherDetails}>
                <div><strong>Condition:</strong> {getWeatherConditionText(weather.weatherCode)}</div>
                <div><strong>Humidity:</strong> {weather.humidity}%</div>
                <div><strong>Wind Speed:</strong> {weather.windSpeed} km/h</div>
                <div><strong>Precipitation:</strong> {weather.precipitation} mm</div>
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
        <h2>Recent Field Activity</h2>
        {statsLoading ? (
          <div className={styles.loading}>Loading activities...</div>
        ) : recentActivities.length === 0 ? (
          <div className={styles.emptyState}>No field events recorded yet. Log an event from the Assets tab.</div>
        ) : (
          <div>
            {recentActivities.map((event) => {
              const notes = extractEventNotes(event.details);
              return (
                <div key={event.id} className={styles.eventRow}>
                  <span className={styles.eventIcon}>{getEventEmoji(event.event_type)}</span>
                  <div className={styles.eventInfo}>
                    <strong>{event.asset_name}</strong>: {event.event_type.toUpperCase()} ({event.quantity_affected} affected)
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
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 16 }}>Register Farm Zone</h2>
            <form onSubmit={handleCreateZone}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  Zone Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. North Greenhouse, Barn B"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)' }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Heated polytunnel, 500 sq meters"
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={zoneSubmitting}
                  style={{ padding: '10px 16px', borderRadius: 'var(--radius)', background: 'var(--color-primary)', color: 'white', fontWeight: 600 }}
                >
                  {zoneSubmitting ? 'Saving...' : 'Create Zone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
