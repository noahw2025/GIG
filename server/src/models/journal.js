import supabase from "../db.js";

export const getJournalEntriesByUser = async (userId) => {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*, concert:concerts(artist, title, location, date, venue)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    artist: row.concert?.artist,
    title: row.concert?.title,
    location: row.concert?.location,
    date: row.concert?.date,
    venue: row.concert?.venue,
  }));
};

export const getJournalCountByUser = async (userId) => {
  const res = await supabase.from("journal_entries").select("*", { count: "exact", head: true }).eq("user_id", userId);
  if (res.error) throw res.error;
  return res.count || 0;
};

export const getArtistEntryCount = async (userId, artist) => {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("id, concert:concerts(artist)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data || []).filter((row) => row.concert?.artist === artist).length;
};

export const createJournalEntry = async ({ user_id, concert_id, entry_text, mood, badge_type, attended_at }) => {
  const created_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("journal_entries")
    .insert([{ user_id, concert_id, entry_text, mood, badge_type, attended_at, created_at }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteJournalEntry = async (id, userId) => {
  const { data, error } = await supabase
    .from("journal_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
};

export const updateJournalEntry = async ({ id, user_id, entry_text, mood, attended_at }) => {
  const patch = {};
  if (entry_text !== undefined) patch.entry_text = entry_text;
  if (mood !== undefined) patch.mood = mood;
  if (attended_at !== undefined) patch.attended_at = attended_at;

  const { data, error } = await supabase
    .from("journal_entries")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user_id)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
};
