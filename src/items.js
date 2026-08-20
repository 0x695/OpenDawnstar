// Mirrors items.py / a.java. itemsin.json's field names already matched
// the reference's Java field letters exactly when cross-checked (typeGroup
// = a.j = ITEM_TYPE, subType = a.c, tier = a.m = ITEM_VAL, value = a.f =
// ITEM_BUY, statBonus = a.a = ITEM_SELL, effect = a.e = ITEM_TYPECAT).
// Confirmed empirically: effect (typecat) is -1 for non-equippable items
// and 0-5 for weapon/armor/boots/gloves/helmet/shield respectively.

let itemsData = null;

export async function loadItems() {
  if (itemsData) return itemsData;
  const res = await fetch('assets/data/itemsin.json');
  itemsData = await res.json();
  return itemsData;
}

export function isEquippable(items, idx) {
  return items.effect[idx] !== -1;
}

export function equipSlot(items, idx) {
  return items.effect[idx];
}

export function itemName(items, idx) {
  return items.names[idx];
}

// field: 'type' | 'subtype' | 'val' | 'buy' | 'sell'
export function itemAttr(items, field, idx) {
  const map = { type: 'typeGroup', subtype: 'subType', val: 'tier', buy: 'value', sell: 'statBonus' };
  return items[map[field]][idx];
}

export const SLOT_NAMES = ['Weapon', 'Armor', 'Boots', 'Gloves', 'Helmet', 'Shield', 'Slot 7'];
