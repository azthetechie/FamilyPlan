import { useState, useMemo, useRef, useEffect } from 'react';
import { ShoppingBag, Plus, Trash2, ScanLine, Check, Camera, X, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { shopping as shoppingApi } from '../lib/api';
import { toast } from 'sonner';
import { BrowserMultiFormatReader } from '@zxing/browser';

const SUPERMARKETS = [
  { name: 'Any', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  { name: 'Coles', color: 'bg-red-100 text-red-800 border-red-300' },
  { name: 'Woolworths', color: 'bg-green-100 text-green-800 border-green-300' },
  { name: 'Aldi', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { name: 'IGA', color: 'bg-sky-50 text-sky-900 border-sky-300' },
  { name: 'Foodworks', color: 'bg-orange-100 text-orange-800 border-orange-300' },
];

function getSupermarketColor(name) {
  return SUPERMARKETS.find((s) => s.name === name)?.color || SUPERMARKETS[0].color;
}

export default function ShoppingCard({ items, frequent, onChange }) {
  const [name, setName] = useState('');
  const [supermarket, setSupermarket] = useState('Any');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const groups = useMemo(() => {
    const g = {};
    for (const it of items) {
      const key = it.supermarket || 'Any';
      g[key] = g[key] || [];
      g[key].push(it);
    }
    return g;
  }, [items]);

  // Build common-item markers: frequently added items (count >= 2)
  const commonNames = useMemo(() => {
    const set = new Set();
    for (const f of frequent) {
      if (f.count >= 2) set.add(f.name_lower);
    }
    return set;
  }, [frequent]);

  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return frequent.slice(0, 6);
    return frequent
      .filter((f) => f.name_lower.startsWith(q) || f.name_lower.includes(q))
      .slice(0, 6);
  }, [name, frequent]);

  const addItem = async (override = {}) => {
    const payload = {
      name: (override.name ?? name).trim(),
      supermarket: override.supermarket ?? supermarket,
      barcode: override.barcode ?? '',
      brand: override.brand ?? '',
      category: override.category ?? 'general',
      quantity: '1',
    };
    if (!payload.name) {
      toast.error('Type an item first');
      return;
    }
    try {
      await shoppingApi.add(payload);
      toast.success(`Added ${payload.name}`);
      setName('');
      setSuggestOpen(false);
      onChange();
    } catch {
      toast.error('Failed to add');
    }
  };

  const toggle = async (id) => {
    try {
      await shoppingApi.toggle(id);
      onChange();
    } catch {
      toast.error('Toggle failed');
    }
  };

  const del = async (id) => {
    try {
      await shoppingApi.delete(id);
      onChange();
    } catch {
      toast.error('Delete failed');
    }
  };

  const clearChecked = async () => {
    try {
      const res = await shoppingApi.clearChecked();
      if (res.deleted > 0) toast.success(`Cleared ${res.deleted} items`);
      onChange();
    } catch {
      toast.error('Clear failed');
    }
  };

  const onScanResult = (barcode, product) => {
    setScanOpen(false);
    if (product && product.found) {
      addItem({
        name: product.name,
        barcode,
        brand: product.brand,
        category: product.category,
      });
    } else {
      toast.info('No product info found. Added barcode only.');
      addItem({ name: `Item ${barcode}`, barcode });
    }
  };

  const totalOpen = items.filter((i) => !i.checked).length;

  return (
    <div className="neo-card p-5 h-full" data-testid="shopping-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShoppingBag size={18} strokeWidth={2.5} />
          <div>
            <div className="text-xs uppercase tracking-widest font-bold text-gray-500">Shopping</div>
            <h2 className="font-outfit font-bold text-xl">{totalOpen} to grab</h2>
          </div>
        </div>
        <button
          data-testid="scan-barcode-btn"
          onClick={() => setScanOpen(true)}
          className="neo-btn bg-[#90DBF4] px-2.5 py-1.5 text-xs inline-flex items-center gap-1"
          title="Scan barcode"
        >
          <ScanLine size={14} strokeWidth={3} />
          Scan
        </button>
      </div>

      {/* Quick add */}
      <div className="relative mb-3">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              data-testid="shopping-list-add-input"
              type="text"
              placeholder="Add item... (e.g. Milk)"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              className="w-full px-3 py-2 neo-input text-sm"
            />
            {suggestOpen && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-gray-900 rounded-lg shadow-[4px_4px_0px_0px_rgba(31,41,55,1)] z-20 max-h-52 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s.name_lower}
                    data-testid={`suggest-${s.name_lower}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addItem({ name: s.name, supermarket: s.supermarket || supermarket, category: s.category })}
                    className="w-full text-left px-3 py-2 hover:bg-[#FBF8CC] text-sm flex items-center justify-between border-b border-gray-100 last:border-none"
                  >
                    <span className="flex items-center gap-2">
                      {s.count >= 2 && <Sparkles size={12} className="text-amber-600" />}
                      {s.name}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500">×{s.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            data-testid="shopping-add-btn"
            onClick={() => addItem()}
            className="neo-btn bg-[#B9FBC0] px-3"
          >
            <Plus size={16} strokeWidth={3} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {SUPERMARKETS.map((s) => (
            <button
              key={s.name}
              data-testid={`supermarket-chip-${s.name}`}
              onClick={() => setSupermarket(s.name)}
              className={`px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all ${supermarket === s.name ? `${s.color} shadow-[2px_2px_0px_0px_rgba(31,41,55,0.4)]` : 'bg-white border-gray-200 text-gray-600'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped list */}
      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1" data-testid="shopping-list">
        {items.length === 0 ? (
          <div className="text-sm text-gray-500 py-6 text-center border-2 border-dashed border-gray-300 rounded-lg">
            Your list is empty. Add milk? 🥛
          </div>
        ) : (
          Object.entries(groups).map(([store, list]) => (
            <div key={store}>
              <div className={`inline-block px-2.5 py-1 rounded-full border text-[11px] font-bold mb-1.5 ${getSupermarketColor(store)}`}>
                {store}
              </div>
              <ul className="space-y-1.5">
                {list.map((it) => {
                  const isCommon = commonNames.has(it.name.trim().toLowerCase());
                  return (
                    <li
                      key={it.item_id}
                      data-testid={`shopping-item-${it.item_id}`}
                      className={`flex items-center gap-2 px-2.5 py-2 border-2 border-gray-900 rounded-lg bg-white group ${it.checked ? 'opacity-60' : ''}`}
                    >
                      <button
                        data-testid={`shopping-toggle-${it.item_id}`}
                        onClick={() => toggle(it.item_id)}
                        className={`w-5 h-5 border-2 border-gray-900 rounded flex items-center justify-center flex-shrink-0 ${it.checked ? 'bg-[#B9FBC0]' : 'bg-white'}`}
                      >
                        {it.checked && <Check size={12} strokeWidth={3} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold truncate ${it.checked ? 'line-through text-gray-400' : ''}`}>
                          {it.name}
                          {isCommon && !it.checked && (
                            <span className="ml-1.5 text-[9px] uppercase tracking-widest font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              Common
                            </span>
                          )}
                        </div>
                        {(it.brand || it.barcode) && (
                          <div className="text-[10px] text-gray-500 truncate">
                            {it.brand} {it.barcode && `· ${it.barcode}`}
                          </div>
                        )}
                      </div>
                      <button
                        data-testid={`shopping-delete-${it.item_id}`}
                        onClick={() => del(it.item_id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-600"
                      >
                        <Trash2 size={14} strokeWidth={2.5} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      {items.some((i) => i.checked) && (
        <button
          data-testid="shopping-clear-checked-btn"
          onClick={clearChecked}
          className="mt-3 w-full text-xs font-bold text-gray-700 hover:text-red-600 underline"
        >
          Clear checked items
        </button>
      )}

      {/* Scanner modal */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="bg-[#FDFBF7] border-2 border-gray-900 shadow-[4px_4px_0px_0px_rgba(31,41,55,1)] max-w-md">
          <DialogHeader>
            <DialogTitle className="font-outfit text-2xl flex items-center gap-2">
              <ScanLine size={22} /> Scan barcode
            </DialogTitle>
          </DialogHeader>
          <BarcodeScanner onResult={onScanResult} onClose={() => setScanOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BarcodeScanner({ onResult, onClose }) {
  const [mode, setMode] = useState('camera');
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const readerRef = useRef(null);

  useEffect(() => {
    if (mode !== 'camera') return;
    setScanning(true);
    setCameraError('');
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    let stopped = false;

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const deviceId = devices?.[0]?.deviceId;
        const controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current, async (result, err) => {
          if (stopped) return;
          if (result) {
            stopped = true;
            controls.stop();
            const code = result.getText();
            try {
              const { shopping: shoppingApi } = await import('../lib/api');
              const product = await shoppingApi.barcode(code);
              onResult(code, product);
            } catch {
              onResult(code, { found: false, barcode: code });
            }
          }
        });
        controlsRef.current = controls;
      } catch (e) {
        setCameraError(e.message || 'Camera access denied. Try manual entry.');
        setScanning(false);
      }
    })();

    return () => {
      stopped = true;
      try { controlsRef.current?.stop(); } catch { /* ignore */ }
    };
  }, [mode, onResult]);

  const submitManual = async () => {
    const code = manualCode.trim();
    if (!code) {
      toast.error('Enter a barcode number');
      return;
    }
    try {
      const { shopping: shoppingApi } = await import('../lib/api');
      const product = await shoppingApi.barcode(code);
      onResult(code, product);
    } catch {
      onResult(code, { found: false, barcode: code });
    }
  };

  return (
    <div>
      <Tabs value={mode} onValueChange={setMode}>
        <TabsList className="grid w-full grid-cols-2 border-2 border-gray-900 bg-white p-1">
          <TabsTrigger data-testid="scan-tab-camera" value="camera">
            <Camera size={14} className="mr-1.5" /> Camera
          </TabsTrigger>
          <TabsTrigger data-testid="scan-tab-manual" value="manual">
            <ScanLine size={14} className="mr-1.5" /> Manual
          </TabsTrigger>
        </TabsList>

        <TabsContent value="camera" className="pt-3">
          <div className="relative bg-black border-2 border-gray-900 rounded-lg overflow-hidden aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover" data-testid="scan-video" />
            {scanning && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-[#B9FBC0] animate-pulse" />
              </div>
            )}
            {cameraError && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-4 text-center text-white text-sm">
                {cameraError}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">Point your camera at the barcode</p>
        </TabsContent>

        <TabsContent value="manual" className="pt-3 space-y-3">
          <input
            data-testid="scan-manual-input"
            type="text"
            inputMode="numeric"
            placeholder="Enter barcode number"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="w-full px-3 py-2.5 neo-input"
          />
          <button
            data-testid="scan-manual-submit-btn"
            onClick={submitManual}
            className="neo-btn bg-[#B9FBC0] w-full py-2.5 font-bold"
          >
            Look up & add
          </button>
        </TabsContent>
      </Tabs>

      <button
        data-testid="scan-close-btn"
        onClick={onClose}
        className="mt-3 w-full text-xs text-gray-600 hover:text-gray-900 font-semibold inline-flex items-center justify-center gap-1"
      >
        <X size={12} /> Cancel
      </button>
    </div>
  );
}
