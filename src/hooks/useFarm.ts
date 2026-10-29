import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import type { Farm, Profile, Zone } from '../types';

export function useFarm() {
  const { user } = useAuth();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFarmData = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      // 1. Fetch user's profile
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileErr) throw profileErr;

      if (!profileData) {
        setError('No farm profile found for this account.');
        setLoading(false);
        return;
      }

      setProfile(profileData as Profile);

      // 2. Fetch farm details & zones in parallel
      const [farmRes, zonesRes] = await Promise.all([
        supabase.from('farms').select('*').eq('id', profileData.farm_id).maybeSingle(),
        supabase.from('zones').select('*').eq('farm_id', profileData.farm_id).order('name'),
      ]);

      if (farmRes.error) throw farmRes.error;
      if (zonesRes.error) throw zonesRes.error;

      setFarm(farmRes.data as Farm);
      setZones((zonesRes.data || []) as Zone[]);
      setError(null);
    } catch (err: unknown) {
      console.error('Failed to load farm data:', err);
      const message = err instanceof Error ? err.message : 'Failed to load farm data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const updateCoordinates = async (latitude: number, longitude: number) => {
    if (!farm) return;
    const { error } = await supabase
      .from('farms')
      .update({ latitude, longitude })
      .eq('id', farm.id);

    if (error) throw error;
    setFarm((prev) => (prev ? { ...prev, latitude, longitude } : null));
  };

  const createZone = async (name: string, description: string) => {
    if (!farm) return;
    const { data, error } = await supabase
      .from('zones')
      .insert({
        farm_id: farm.id,
        name: name.trim(),
        description: description.trim() || null,
        shield_metadata: {},
      })
      .select()
      .single();

    if (error) throw error;
    if (data) {
      setZones((prev) => [...prev, data as Zone].sort((a, b) => a.name.localeCompare(b.name)));
    }
  };

  useEffect(() => {
    void loadFarmData();
  }, [loadFarmData]);

  return {
    farm,
    profile,
    zones,
    loading,
    error,
    refreshFarm: loadFarmData,
    updateCoordinates,
    createZone,
  };
}
