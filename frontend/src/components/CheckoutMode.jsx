import { useState, useMemo, useRef } from "react";
import { ShoppingCart, Check, ChevronLeft, X, Trophy } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { shopping as shoppingApi } from '../lib/api';
import { toast } from 'sonner';

const SUPERMARKET_ORDER = ['Coles', 'Woolworths', 'Aldi', 'IGA', 'Foodworks', 'Any'];
const SUPERMARKET_COLORS = {
  Coles: '#DC2626',
  Woolworths: '#16A34A',
  Aldi: '#2563EB',
  IGA: '#0284C7',
  Foodworks: '#EA580C',
  Any: '#6B7280',
};

export default function CheckoutMode({ open, onOpenChange, items, onChange }) {
  const [activeStore, setActiveStore] = useState(null);

  const groups = useMemo(() => {
    const g = {};
    for (const it of items) {
      const key = it.supermarket || 'Any';
      g[key] = g[key] || [];
      g[key].push(it);
    }
    // Sort by known order
    const ordered = {};
    for (const s of SUPERMARKET_ORDER) if (g[s]) ordered[s] = g[s];
    for (const k of Object.keys(g)) if (!ordered[k]) ordered[k] = g[k];
    return ordered;
  }, [items]);

  const storeList = Object.keys(groups);

  // Auto-pick first store
  const currentStore = activeStore || storeList[0] || null;
  const currentItems = currentStore ? (groups[currentStore] || []) : [];
  const openCount = currentItems.filter((i) => !i.checked).length;
  const total = currentItems.length;
  const done = total - openCount;
  const progress = total ? Math.round((done / total) * 100) : 0;

  const toggle = async (id) => {
    try {
      await shoppingApi.toggle(id);
      onChange();
    } catch {
      toast.error('Toggle failed');
    }
  };

  const finish = async () => {
    try {
      const res = await shoppingApi.clearChecked();
      if (res.deleted > 0) toast.success(`Shopped! Cleared ${res.deleted} items`);
      onChange();
      onOpenChange(false);
      setActiveStore(null);
    } catch {
      toast.error('Failed to clear');
    }
  };

  const close = () => {
    onOpenChange(false);
    setActiveStore(null);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="bg-[#FDFBF7] border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)] max-w-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Sticky header */}
        <div className="p-4 border-b-2 border-gray-900 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShoppingCart size={20} strokeWidth={2.5} />
              <DialogTitle className="font-outfit font-bold text-lg">Shopping Mode</DialogTitle>
            </div>
            <button
              data-testid="checkout-close-btn"
              onClick={close}
              className="neo-btn bg-white px-2 py-1"
            >
              <X size={16} />
            </button>
          </div>
          <DialogDescription className="sr-only">
            In-store shopping mode grouped by supermarket with progress tracking.
          </DialogDescription>

          {/* Store tabs */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {storeList.map((store) => {
              const g = groups[store] || [];
              const pending = g.filter((x) => !x.checked).length;
              const active = store === currentStore;
              return (
                <button
                  key={store}
                  data-testid={`checkout-store-${store}`}
                  onClick={() => setActiveStore(store)}
                  className={`px-3 py-1.5 border-2 border-gray-900 rounded-full text-xs font-bold transition-all ${active ? 'shadow-[2px_2px_0px_0px_rgba(31,41,55,1)]' : 'opacity-60'}`}
                  style={{ backgroundColor: active ? SUPERMARKET_COLORS[store] + '30' : 'white', color: active ? SUPERMARKET_COLORS[store] : '#374151' }}
                >
                  {store} · {pending}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!currentStore ? (
            <div className="text-center py-12 text-gray-500">Your shopping list is empty. Add items first.</div>
          ) : (
            <>
              {/* Progress */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs uppercase tracking-widest font-bold text-gray-600">
                    {currentStore} · {done}/{total} grabbed
                  </span>
                  <span className="text-xs font-bold" data-testid="checkout-progress">{progress}%</span>
                </div>
                <div className="h-3 bg-white border-2 border-gray-900 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${progress}%`, backgroundColor: SUPERMARKET_COLORS[currentStore] || '#16A34A' }}
                  />
                </div>
              </div>

              {openCount === 0 && total > 0 && (
                <div className="p-4 mb-4 border-2 border-gray-900 rounded-lg bg-[#B9FBC0] text-center">
                  <Trophy size={28} strokeWidth={2.5} className="mx-auto mb-1" />
                  <div className="font-outfit font-bold">All {currentStore} items grabbed!</div>
                  <div className="text-xs text-gray-700 mt-0.5">Great job 🎉</div>
                </div>
              )}

              {/* Big tap-friendly list */}
              <ul className="space-y-2" data-testid="checkout-item-list">
                {currentItems.map((it) => (
                  <li key={it.item_id}>
                    <SwipeRow item={it} onToggle={() => toggle(it.item_id)} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Sticky footer */}
        <div className="p-3 border-t-2 border-gray-900 bg-white flex gap-2 sticky bottom-0">
          <button
            data-testid="checkout-back-btn"
            onClick={close}
            className="neo-btn bg-white px-3 py-2.5 inline-flex items-center gap-1 text-sm"
          >
            <ChevronLeft size={16} /> Back
          </button>
          <button
            data-testid="checkout-finish-btn"
            onClick={finish}
            disabled={!items.some((i) => i.checked)}
            className="neo-btn bg-[#B9FBC0] flex-1 py-2.5 font-bold disabled:opacity-50"
          >
            Finish & clear checked
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SwipeRow({ item, onToggle }) {
  const [dx, setDx] = useState(0);
  const startX = useRef(null);
  const triggered = useRef(false);
  const SWIPE_THRESHOLD = 70;

  const onTouchStart = (e) => {
    triggered.current = false;
    startX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e) => {
    if (startX.current == null) return;
    const delta = e.touches[0].clientX - startX.current;
    // Only allow right-swipe (toggle on); cap at 120 for visual feedback
    setDx(Math.max(0, Math.min(delta, 120)));
    if (delta > SWIPE_THRESHOLD && !triggered.current) {
      triggered.current = true;
      onToggle();
      // Snap back
      setTimeout(() => setDx(0), 180);
      startX.current = null;
    }
  };
  const onTouchEnd = () => {
    startX.current = null;
    setDx(0);
  };
  const onTouchCancel = () => { startX.current = null; setDx(0); };

  return (
    <div className="relative overflow-hidden rounded-lg" data-testid={`checkout-item-wrap-${item.item_id}`}>
      {/* swipe-action background */}
      <div
        className="absolute inset-0 flex items-center justify-start pl-5 pointer-events-none rounded-lg"
        style={{ backgroundColor: '#B9FBC0', opacity: dx / 120 }}
      >
        <Check size={20} strokeWidth={3} />
        <span className="ml-2 text-xs uppercase tracking-widest font-bold">Swipe to check</span>
      </div>
      <button
        data-testid={`checkout-item-${item.item_id}`}
        onClick={onToggle}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform 0.18s ease-out' : 'none' }}
        className={`relative w-full flex items-center gap-3 p-4 border-2 border-gray-900 rounded-lg text-left ${
          item.checked
            ? 'bg-[#B9FBC0]/40 shadow-[1px_1px_0px_0px_rgba(31,41,55,1)]'
            : 'bg-white shadow-[2px_2px_0px_0px_rgba(31,41,55,1)] hover:-translate-y-0.5'
        }`}
      >
        <div className={`w-7 h-7 border-2 border-gray-900 rounded flex items-center justify-center flex-shrink-0 ${item.checked ? 'bg-[#B9FBC0]' : 'bg-white'}`}>
          {item.checked && <Check size={16} strokeWidth={3} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-outfit font-bold text-base ${item.checked ? 'line-through text-gray-400' : ''}`}>
            {item.name}
          </div>
          {(item.brand || item.quantity) && (
            <div className="text-xs text-gray-600">
              {item.quantity && `Qty ${item.quantity}`}
              {item.quantity && item.brand && ' · '}
              {item.brand}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
