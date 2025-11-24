import supabase from "../db.js";

export const upsertReview = async ({ user_id, concert_id, rating, comment }) => {
  const created_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("reviews")
    .upsert({ user_id, concert_id, rating, comment, created_at }, { onConflict: "user_id,concert_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getReviewsForConcert = async (concertId) => {
  const { data, error } = await supabase
    .from("reviews")
    .select("*, user:users(full_name)")
    .eq("concert_id", concertId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    full_name: row.user?.full_name,
  }));
};

export const getAverageRating = async (concertId) => {
  const { data, error } = await supabase.from("reviews").select("rating").eq("concert_id", concertId);
  if (error) throw error;
  const ratings = data?.map((r) => r.rating).filter((r) => typeof r === "number") || [];
  const count = ratings.length;
  const avgRating = count ? ratings.reduce((sum, r) => sum + r, 0) / count : null;
  return { avgRating, count };
};
