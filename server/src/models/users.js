import supabase from "../db.js";

export const createUser = async ({ full_name, email, password_hash, city, favorite_artists, favorite_genre }) => {
  const created_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("users")
    .insert([{ full_name, email, password_hash, city, favorite_artists, favorite_genre, created_at }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getUserByEmail = async (email) => {
  const { data, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (error) throw error;
  return data;
};

export const getUserById = async (id) => {
  const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
};

export const updateProfile = async (id, { full_name, city, favorite_artists, favorite_genre }) => {
  const { data, error } = await supabase
    .from("users")
    .update({ full_name, city, favorite_artists, favorite_genre })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getUserStats = async (userId) => {
  const favoriteRes = await supabase.from("favorites").select("*", { count: "exact", head: true }).eq("user_id", userId);
  const journalRes = await supabase.from("journal_entries").select("*", { count: "exact", head: true }).eq("user_id", userId);
  const { data: badgeRows, error: badgeErr } = await supabase
    .from("journal_entries")
    .select("badge_type")
    .eq("user_id", userId)
    .not("badge_type", "is", null);
  if (favoriteRes.error) throw favoriteRes.error;
  if (journalRes.error) throw journalRes.error;
  if (badgeErr) throw badgeErr;
  const badges = new Set((badgeRows || []).map((row) => row.badge_type)).size;
  return {
    favorites: favoriteRes.count || 0,
    journals: journalRes.count || 0,
    badges,
  };
};
