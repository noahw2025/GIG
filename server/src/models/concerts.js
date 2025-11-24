import supabase from "../db.js";

export const findConcertByExternalId = async (external_id) => {
  const { data, error } = await supabase.from("concerts").select("*").eq("external_id", external_id).maybeSingle();
  if (error) throw error;
  return data;
};

export const createConcert = async (concert) => {
  const created_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("concerts")
    .insert([{ ...concert, created_at }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getConcertById = async (id) => {
  const { data, error } = await supabase.from("concerts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
};

export const ensureConcert = async (concert) => {
  const existing = await findConcertByExternalId(concert.external_id);
  if (existing) return existing;
  return createConcert(concert);
};
