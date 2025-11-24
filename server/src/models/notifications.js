import supabase from "../db.js";

export const createNotification = async ({ user_id, type, title, message }) => {
  const created_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .insert([{ user_id, type, title, message, is_read: false, created_at }])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getNotificationsByUser = async (userId) => {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const markNotificationsRead = async (userId, ids) => {
  const query = supabase.from("notifications").update({ is_read: true }).eq("user_id", userId);
  if (ids && ids.length) {
    query.in("id", ids);
  }
  const { error } = await query;
  if (error) throw error;
  return true;
};

export const deleteNotifications = async (userId, ids) => {
  const query = supabase.from("notifications").delete().eq("user_id", userId);
  if (ids && ids.length) {
    query.in("id", ids);
  }
  const { error } = await query;
  if (error) throw error;
  return true;
};
