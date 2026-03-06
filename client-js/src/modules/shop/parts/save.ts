import type { Wallet, OwnedUpgrades, EquippedCosmetics, ShopSaveData } from "./data";

const SAVE_DEBOUNCE_MS = 5000;
let dirty = false;
let lastSaveTime = 0;

export function markDirty() {
  dirty = true;
}

export function flushSaveIfNeeded(wallet: Wallet, owned: OwnedUpgrades, equipped: EquippedCosmetics) {
  if (!dirty) return;
  const now = Date.now();
  if (now - lastSaveTime < SAVE_DEBOUNCE_MS) return;

  const data: ShopSaveData = { wallet, owned, equipped };
  try {
    window.ysdk_save_data(JSON.stringify(data));
  } catch {
    // SDK not loaded yet — ok
  }
  lastSaveTime = now;
  dirty = false;
}

export function tryLoadCloudSave(): ShopSaveData | null {
  // This is called via SDK inbox processing in main loop
  // The actual load is triggered by ysdk_load_data() from yandex/sdk.ts
  return null;
}

export function parseLoadOkData(dataStr: string): ShopSaveData | null {
  try {
    const parsed = JSON.parse(dataStr);
    if (parsed && parsed.wallet) {
      return parsed as ShopSaveData;
    }
  } catch {
    console.warn("[save] parse error");
  }
  return null;
}
