import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { supabase } from "./supabase";

const tokenStorageKey = "medibridge.push-token";

export function nativePushAvailable() {
  return Capacitor.isNativePlatform();
}

export async function enableNativePush(): Promise<void> {
  if (!nativePushAvailable()) throw new Error("NATIVE_PUSH_UNAVAILABLE");
  const user = (await supabase.auth.getUser()).data.user;
  if (!user || user.is_anonymous) throw new Error("AUTH_REQUIRED");

  let permission = await FirebaseMessaging.checkPermissions();
  if (permission.receive === "prompt") permission = await FirebaseMessaging.requestPermissions();
  if (permission.receive !== "granted") throw new Error("PUSH_PERMISSION_DENIED");

  const persistToken = async (token: string) => {
    const platform = Capacitor.getPlatform();
    const result = await supabase.from("candidate_device_tokens").upsert({
      candidate_id: user.id,
      token,
      platform,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "token" });
    if (result.error) throw result.error;
    localStorage.setItem(tokenStorageKey, token);
  };
  await FirebaseMessaging.removeAllListeners();
  await FirebaseMessaging.addListener("tokenReceived", event => void persistToken(event.token));
  const { token } = await FirebaseMessaging.getToken();
  await persistToken(token);
}

export async function disableNativePush(): Promise<void> {
  const token = localStorage.getItem(tokenStorageKey);
  if (token) {
    const result = await supabase.from("candidate_device_tokens").update({ enabled: false }).eq("token", token);
    if (result.error) throw result.error;
    localStorage.removeItem(tokenStorageKey);
  }
  if (nativePushAvailable()) {
    await FirebaseMessaging.deleteToken();
    await FirebaseMessaging.removeAllListeners();
  }
}
