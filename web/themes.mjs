export const themeKey = 'kairos.web.theme.v1';
export const themes = [
  { id: 'trail', title: '沿途', caption: '暖纸、森林绿与柔和卡片' },
  { id: 'rhythm', title: '节奏', caption: '深色仪表与鲜明运动刻度' },
  { id: 'journal', title: '路书', caption: '蓝色墨迹与路书排版' },
  { id: 'pocket', title: '口袋补给', caption: '明亮色块与补给物件' },
  { id: 'precision', title: '精密刻度', caption: '浅色仪器与精确对齐' },
];

export function loadTheme(storage) {
  try {
    const id = storage.getItem(themeKey);
    return themes.some(theme => theme.id === id) ? id : 'rhythm';
  } catch { return 'rhythm'; }
}

export function storeTheme(storage, id) {
  if (!themes.some(theme => theme.id === id)) return '无法识别这套皮肤。';
  try { storage.setItem(themeKey, id); return ''; }
  catch { return '皮肤已切换，但未能保存到本机。'; }
}
