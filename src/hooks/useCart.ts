import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { getDeviceId } from '@/lib/deviceId';
import type { Pedido } from '@/types/pedido';

export interface CartItem {
  productId: string;
  kg: number;
  preparation: string;
  note: string;
}

export interface CartCustomerInfo {
  name: string;
  business: string;
  phone: string;
  email: string;
  pickupTime: string;
  notes: string;
  deliveryMethod: 'home' | 'pickup';
  address: string;
  city: string;
  postalCode: string;
  deliveryInstructions: string;
  preferredDate: string;
  preferredTime: string;
}

interface CartState {
  items: CartItem[];
  customer: CartCustomerInfo;
}

interface LastOrderData {
  items: CartItem[];
  deliveryMethod: 'home' | 'pickup';
}

export interface OrderHistoryEntry {
  id: string;
  date: string;
  items: CartItem[];
  deliveryMethod: 'home' | 'pickup';
}

const STORAGE_KEY = 'arrantza_cart';
const LAST_ORDER_KEY = 'arrantza_last_order';
const ORDER_HISTORY_KEY = 'arrantza_order_history';
const MAX_ORDER_HISTORY = 5;

function loadCart(): CartState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        items: Array.isArray(parsed.items)
          ? parsed.items.filter((i: CartItem) => i && typeof i.productId === 'string' && typeof i.kg === 'number').map((i: CartItem) => ({
              ...i,
              preparation: typeof i.preparation === 'string' ? i.preparation : 'whole',
              note: typeof i.note === 'string' ? i.note : '',
            }))
          : [],
        customer: parsed.customer && typeof parsed.customer === 'object'
          ? {
              name: typeof parsed.customer.name === 'string' ? parsed.customer.name : '',
              business: typeof parsed.customer.business === 'string' ? parsed.customer.business : '',
              phone: typeof parsed.customer.phone === 'string' ? parsed.customer.phone : '',
              email: typeof parsed.customer.email === 'string' ? parsed.customer.email : '',
              pickupTime: typeof parsed.customer.pickupTime === 'string' ? parsed.customer.pickupTime : '',
              notes: typeof parsed.customer.notes === 'string' ? parsed.customer.notes : '',
              deliveryMethod: parsed.customer.deliveryMethod === 'home' || parsed.customer.deliveryMethod === 'pickup' ? parsed.customer.deliveryMethod : 'pickup',
              address: typeof parsed.customer.address === 'string' ? parsed.customer.address : '',
              city: typeof parsed.customer.city === 'string' ? parsed.customer.city : '',
              postalCode: typeof parsed.customer.postalCode === 'string' ? parsed.customer.postalCode : '',
              deliveryInstructions: typeof parsed.customer.deliveryInstructions === 'string' ? parsed.customer.deliveryInstructions : '',
              preferredDate: typeof parsed.customer.preferredDate === 'string' ? parsed.customer.preferredDate : '',
              preferredTime: typeof parsed.customer.preferredTime === 'string' ? parsed.customer.preferredTime : '',
            }
          : { name: '', business: '', phone: '', email: '', pickupTime: '', notes: '', deliveryMethod: 'pickup', address: '', city: '', postalCode: '', deliveryInstructions: '', preferredDate: '', preferredTime: '' },
      };
    }
  } catch {
    // corrupted data — reset
  }
  return { items: [], customer: { name: '', business: '', phone: '', email: '', pickupTime: '', notes: '', deliveryMethod: 'pickup', address: '', city: '', postalCode: '', deliveryInstructions: '', preferredDate: '', preferredTime: '' } };
}

function saveCart(state: CartState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

function readLastOrder(): LastOrderData | null {
  try {
    const raw = localStorage.getItem(LAST_ORDER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        return {
          items: parsed.items.filter((i: CartItem) => i && typeof i.productId === 'string' && typeof i.kg === 'number').map((i: CartItem) => ({
            ...i,
            preparation: typeof i.preparation === 'string' ? i.preparation : 'whole',
            note: typeof i.note === 'string' ? i.note : '',
          })),
          deliveryMethod: parsed.deliveryMethod === 'home' ? 'home' : 'pickup',
        };
      }
    }
  } catch { /* noop */ }
  return null;
}

function sanitizeOrderItems(items: unknown): CartItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i: CartItem) => i && typeof i.productId === 'string' && typeof i.kg === 'number')
    .map((i: CartItem) => ({
      ...i,
      preparation: typeof i.preparation === 'string' ? i.preparation : 'whole',
      note: typeof i.note === 'string' ? i.note : '',
    }));
}

function readOrderHistory(): OrderHistoryEntry[] {
  try {
    const raw = localStorage.getItem(ORDER_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((o: OrderHistoryEntry) => o && typeof o.id === 'string' && typeof o.date === 'string')
          .map((o: OrderHistoryEntry) => ({
            id: o.id,
            date: o.date,
            deliveryMethod: o.deliveryMethod === 'home' ? 'home' as const : 'pickup' as const,
            items: sanitizeOrderItems(o.items),
          }))
          .filter(o => o.items.length > 0)
          .slice(0, MAX_ORDER_HISTORY);
      }
    }
  } catch { /* noop */ }
  return [];
}

function saveOrderHistoryToStorage(history: OrderHistoryEntry[]) {
  try {
    localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(history));
  } catch { /* noop */ }
}

// Migra el antiguo "último pedido" (una sola ranura) al nuevo historial
// la primera vez que se carga, para no perder el pedido ya guardado.
function loadInitialOrderHistory(): OrderHistoryEntry[] {
  const history = readOrderHistory();
  if (history.length > 0) return history;
  const legacy = readLastOrder();
  if (!legacy) return [];
  return [{ id: 'legacy', date: new Date().toISOString(), items: legacy.items, deliveryMethod: legacy.deliveryMethod }];
}

function mapPedidoToHistoryEntry(pedido: Pedido): OrderHistoryEntry {
  return {
    id: pedido.id,
    date: pedido.created_at,
    deliveryMethod: pedido.metodo_entrega,
    items: sanitizeOrderItems(
      (pedido.items ?? []).map((i) => ({
        productId: i.productoId,
        kg: i.kg,
        preparation: i.preparacion,
        note: i.nota,
      })),
    ),
  };
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => loadCart().items);
  const [customer, setCustomer] = useState<CartCustomerInfo>(() => loadCart().customer);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cartVersion, setCartVersion] = useState(0);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const clearJustAddedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orderHistory, setOrderHistory] = useState<OrderHistoryEntry[]>(loadInitialOrderHistory);

  // Mark as loaded after first render to prevent hydration mismatches
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  // Recupera el historial real desde Supabase (por device_id, sin login) para
  // que sobreviva más allá del array local de MAX_ORDER_HISTORY entradas. Si
  // falla (sin red, RPC aún no desplegada) se mantiene el historial local.
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_pedidos_by_device', {
          p_device_id: getDeviceId(),
        });
        if (error || cancelled || !data) return;
        const fromServer = (data as Pedido[])
          .map(mapPedidoToHistoryEntry)
          .filter((o) => o.items.length > 0)
          .slice(0, MAX_ORDER_HISTORY);
        if (fromServer.length > 0) {
          setOrderHistory(fromServer);
          saveOrderHistoryToStorage(fromServer);
        }
      } catch {
        // sin red o RPC no disponible: nos quedamos con el historial local
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded]);

  // Persist to localStorage whenever state changes
  useEffect(() => {
    if (isLoaded) {
      saveCart({ items, customer });
    }
  }, [items, customer, isLoaded]);

  const addItem = useCallback((productId: string) => {
    setItems(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing) {
        return prev.map(item =>
          item.productId === productId ? { ...item, kg: item.kg + 0.5 } : item,
        );
      }
      // New item added — flash it
      setJustAddedId(productId);
      if (clearJustAddedTimeoutRef.current) clearTimeout(clearJustAddedTimeoutRef.current);
      clearJustAddedTimeoutRef.current = setTimeout(() => setJustAddedId(null), 750);
      return [...prev, { productId, kg: 0.5, preparation: 'whole', note: '' }];
    });
    setCartVersion(v => v + 1);
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems(prev => prev.filter(item => item.productId !== productId));
    setCartVersion(v => v + 1);
  }, []);

  const setKg = useCallback((productId: string, kg: number) => {
    setItems(prev =>
      prev.map(item =>
        item.productId === productId ? { ...item, kg: Math.max(0.5, Math.round(kg * 100) / 100) } : item,
      ),
    );
  }, []);

  const increaseKg = useCallback((productId: string) => {
    setItems(prev =>
      prev.map(item =>
        item.productId === productId ? { ...item, kg: item.kg + 0.5 } : item,
      ),
    );
    setCartVersion(v => v + 1);
  }, []);

  const decreaseKg = useCallback((productId: string) => {
    setItems(prev => {
      const item = prev.find(i => i.productId === productId);
      if (!item || item.kg <= 0.5) return prev;
      return prev.map(i =>
        i.productId === productId ? { ...i, kg: i.kg - 0.5 } : i,
      );
    });
    setCartVersion(v => v + 1);
  }, []);

  const setPreparation = useCallback((productId: string, preparation: string) => {
    setItems(prev =>
      prev.map(item =>
        item.productId === productId ? { ...item, preparation } : item,
      ),
    );
  }, []);

  const setItemNote = useCallback((productId: string, note: string) => {
    setItems(prev =>
      prev.map(item =>
        item.productId === productId ? { ...item, note } : item,
      ),
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setCustomer({ name: '', business: '', phone: '', email: '', pickupTime: '', notes: '', deliveryMethod: 'pickup', address: '', city: '', postalCode: '', deliveryInstructions: '', preferredDate: '', preferredTime: '' });
  }, []);

  const saveLastOrder = useCallback(() => {
    if (items.length === 0) return;
    const entry: OrderHistoryEntry = {
      id: `${Date.now()}`,
      date: new Date().toISOString(),
      items: items.map(i => ({ ...i })),
      deliveryMethod: customer.deliveryMethod,
    };
    setOrderHistory(prev => {
      const next = [entry, ...prev].slice(0, MAX_ORDER_HISTORY);
      saveOrderHistoryToStorage(next);
      return next;
    });
  }, [items, customer.deliveryMethod]);

  const loadOrder = useCallback((orderId: string) => {
    const order = orderHistory.find(o => o.id === orderId);
    if (!order) return;
    setItems(order.items.map(i => ({ ...i })));
    setCustomer(prev => ({
      ...prev,
      deliveryMethod: order.deliveryMethod,
    }));
    setCartVersion(v => v + 1);
  }, [orderHistory]);

  const updateCustomer = useCallback(<K extends keyof CartCustomerInfo>(field: K, value: CartCustomerInfo[K]) => {
    setCustomer(prev => ({ ...prev, [field]: value }));
  }, []);

  const isInCart = useCallback(
    (productId: string) => items.some(item => item.productId === productId),
    [items],
  );

  const getItem = useCallback(
    (productId: string) => items.find(item => item.productId === productId),
    [items],
  );

  const totalProducts = items.length;
  const totalWeight = items.reduce((sum, item) => sum + item.kg, 0);

  return {
    items,
    customer,
    isLoaded,
    addItem,
    removeItem,
    setKg,
    clearCart,
    updateCustomer,
    isInCart,
    getItem,
    totalProducts,
    totalWeight,
    increaseKg,
    decreaseKg,
    setPreparation,
    setItemNote,
    cartVersion,
    justAddedId,
    orderHistory,
    saveLastOrder,
    loadOrder,
  } as const;
}