import { useState, useEffect, useCallback } from 'react';

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

const STORAGE_KEY = 'arrantza_cart';
const LAST_ORDER_KEY = 'arrantza_last_order';

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

function saveLastOrderToStorage(data: LastOrderData) {
  try {
    localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(data));
  } catch { /* noop */ }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => loadCart().items);
  const [customer, setCustomer] = useState<CartCustomerInfo>(() => loadCart().customer);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cartVersion, setCartVersion] = useState(0);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const clearJustAddedTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null };
  const [hasLastOrder, setHasLastOrder] = useState<boolean>(() => readLastOrder() !== null);

  // Mark as loaded after first render to prevent hydration mismatches
  useEffect(() => {
    setIsLoaded(true);
  }, []);

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
        item.productId === productId ? { ...item, kg: Math.max(0.5, Math.round(kg * 2) / 2) } : item,
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
    saveLastOrderToStorage({
      items: items.map(i => ({ ...i })),
      deliveryMethod: customer.deliveryMethod,
    });
    setHasLastOrder(true);
  }, [items, customer.deliveryMethod]);

  const loadLastOrder = useCallback(() => {
    const lastOrder = readLastOrder();
    if (!lastOrder) return;
    setItems(lastOrder.items);
    setCustomer(prev => ({
      ...prev,
      deliveryMethod: lastOrder.deliveryMethod,
    }));
    setCartVersion(v => v + 1);
  }, []);

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
    hasLastOrder,
    saveLastOrder,
    loadLastOrder,
  } as const;
}