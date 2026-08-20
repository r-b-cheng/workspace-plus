import { create } from 'zustand';

export type QuickSwitchStoreData = {
  open: boolean;
  query: string;
  selectedIndex: number;
};

export type QuickSwitchStore = QuickSwitchStoreData & {
  openPanel: () => void;
  closePanel: () => void;
  setQuery: (query: string) => void;
  setSelectedIndex: (selectedIndex: number) => void;
  reset: () => void;
};

export const initialQuickSwitchStoreData: QuickSwitchStoreData = {
  open: false,
  query: '',
  selectedIndex: 0,
};

export const useQuickSwitchStore = create<QuickSwitchStore>((set) => ({
  ...initialQuickSwitchStoreData,

  openPanel() {
    set({ open: true, query: '', selectedIndex: 0 });
  },

  closePanel() {
    set({ open: false, query: '', selectedIndex: 0 });
  },

  setQuery(query) {
    set({ query, selectedIndex: 0 });
  },

  setSelectedIndex(selectedIndex) {
    set({ selectedIndex });
  },

  reset() {
    set({ ...initialQuickSwitchStoreData });
  },
}));
