import supabase from "../db.js";
import { ensureConcert } from "./concerts.js";

export const createFavorite = async (userId, concertPayload) => {
  const concert = await ensureConcert(concertPayload);
  const created_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("favorites")
    .upsert({ user_id: userId, concert_id: concert.id, created_at }, { onConflict: "user_id,concert_id" })
    .select()
    .single();
  if (error) throw error;
  return { concert, favorite: data };
};

export const getFavoritesByUser = async (userId) => {
  const { data, error } = await supabase
    .from("favorites")
    .select("id, created_at, concert:concerts(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    favorite_id: row.id,
    favorited_at: row.created_at,
    ...(row.concert || {}),
  }));
};

export const deleteFavorite = async (favoriteId, userId) => {
  const { data, error } = await supabase
    .from("favorites")
    .delete()
    .eq("id", favoriteId)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
};
